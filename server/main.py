"""
Visa Photo Processor — Python FastAPI Backend

Pipeline:
  1. Remove background using rembg (U2-Net / ISNet — deep learning, high quality edges)
  2. Detect face using OpenCV Haar Cascade
  3. Smart-crop so face fills the visa-standard proportion of the frame
  4. Composite onto white background at EXACT visa dimensions
"""

import io
import os
# Disable CPU affinity mapping in ONNX Runtime to avoid segfaults in virtualized/container CPU limits
os.environ["ORT_DISABLE_CPU_AFFINITY"] = "1"

import logging
from contextlib import asynccontextmanager

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image, ImageFilter
from rembg import remove, new_session

logger = logging.getLogger("visa-photo")
logging.basicConfig(level=logging.INFO)

# ─── Globals ──────────────────────────────────────────────────

# Loaded once at startup so requests are fast.
# "isnet-general-use" gives the cleanest edges for portraits/hair.
# Alternatives: "u2net_human_seg" (faster, slightly less precise on hair),
# "u2net" (general purpose default).
REMBG_MODEL_NAME = os.environ.get("REMBG_MODEL", "isnet-general-use")
rembg_session = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global rembg_session
    logger.info(f"Loading rembg model '{REMBG_MODEL_NAME}'...")
    try:
        rembg_session = new_session(REMBG_MODEL_NAME)
        logger.info(f"rembg model '{REMBG_MODEL_NAME}' loaded successfully.")
    except Exception as e:
        logger.error(f"Failed to load rembg model '{REMBG_MODEL_NAME}': {e}. Falling back to 'u2netp'...")
        try:
            rembg_session = new_session("u2netp")
            logger.info("Fallback rembg model 'u2netp' loaded successfully.")
        except Exception as e2:
            logger.critical(f"Failed to load fallback rembg model 'u2netp': {e2}")
            rembg_session = None
    yield


app = FastAPI(title="Visa Photo API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Face Detection ──────────────────────────────────────────

face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


def detect_face(img_array: np.ndarray) -> dict | None:
    """
    Detect the largest face in the image using OpenCV Haar Cascade.
    Runs on a downscaled image for speed, then scales coordinates back.
    """
    orig_h, orig_w = img_array.shape[:2]

    max_dim = 1000
    scale = 1.0
    if max(orig_w, orig_h) > max_dim:
        scale = max_dim / max(orig_w, orig_h)
        w_scaled = int(orig_w * scale)
        h_scaled = int(orig_h * scale)
        img_small = cv2.resize(img_array, (w_scaled, h_scaled), interpolation=cv2.INTER_AREA)
    else:
        img_small = img_array

    gray = cv2.cvtColor(img_small, cv2.COLOR_RGB2GRAY)
    gray = cv2.equalizeHist(gray)

    for scale_factor in [1.05, 1.1, 1.2, 1.3]:
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=scale_factor,
            minNeighbors=5,
            minSize=(60, 60),
            flags=cv2.CASCADE_SCALE_IMAGE,
        )
        if len(faces) > 0:
            faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
            x, y, w, h = faces[0]

            if scale != 1.0:
                x = int(round(x / scale))
                y = int(round(y / scale))
                w = int(round(w / scale))
                h = int(round(h / scale))

            logger.info(f"Face detected: x={x}, y={y}, w={w}, h={h}")
            return {"x": x, "y": y, "w": w, "h": h}

    logger.warning("No face detected")
    return None


# ─── AI Background Removal (rembg) ─────────────────────────────

def remove_background_ai(pil_img: Image.Image) -> Image.Image:
    """
    Remove background using rembg (deep learning segmentation).
    Produces clean, accurate edges including hair detail.
    Returns an RGBA image with transparent background.
    """
    global rembg_session
    if rembg_session is None:
        logger.warning("rembg session was not initialized. Loading fallback model 'u2netp' lazily...")
        try:
            rembg_session = new_session("u2netp")
        except Exception as e:
            logger.critical(f"Failed to load rembg model 'u2netp' lazily: {e}")
            raise HTTPException(status_code=500, detail="Background removal model could not be loaded")

    rgb_img = pil_img.convert("RGB")

    result = remove(
        rgb_img,
        session=rembg_session,
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=15,
        alpha_matting_erode_size=5,
    )

    # `remove()` returns RGBA already
    if result.mode != "RGBA":
        result = result.convert("RGBA")

    # Light edge smoothing on the alpha channel to remove jagged/noisy
    # pixels left over from matting, without softening the silhouette much.
    r, g, b, a = result.split()
    a = a.filter(ImageFilter.SMOOTH_MORE)
    result = Image.merge("RGBA", (r, g, b, a))

    return result


# ─── Smart Visa Crop ─────────────────────────────────────────

def calculate_visa_crop(
    nobg_img: Image.Image,
    face: dict | None,
    target_w: int, target_h: int,
) -> tuple[int, int, int, int]:
    """
    Calculate the crop region so the face fills the visa-standard proportion
    of the frame.

    Visa photo standards (typical):
      - Head (chin to crown including hair) ≈ 70-80% of photo height
      - Small margin above the head
      - Shoulders visible below
      - Face horizontally centered

    Returns (x, y, w, h) of the crop region in the original image.
    """
    img_w, img_h = nobg_img.width, nobg_img.height
    target_aspect = target_w / target_h

    if face is None:
        return _center_crop(img_w, img_h, target_aspect)

    fx, fy, fw, fh = face["x"], face["y"], face["w"], face["h"]
    face_cx = fx + fw / 2

    # Get actual top of hair/head from non-transparent bbox of the
    # rembg-cut subject (much more accurate than estimating from face box).
    bbox = nobg_img.getbbox()
    actual_hair_top = bbox[1] if bbox else fy

    # Chin is approximately at the bottom of the detected face box.
    chin_y = fy + fh

    # Real head height = hair top to chin.
    head_height = max(1.0, chin_y - actual_hair_top)

    # Head should occupy ~62% of the crop height (good middle ground for
    # most visa specs that require head height 50-80% of photo height).
    HEAD_RATIO = 0.62
    ideal_crop_h = head_height / HEAD_RATIO
    ideal_crop_w = ideal_crop_h * target_aspect

    # Top margin above the head ≈ 8% of crop height
    TOP_MARGIN_RATIO = 0.08
    ideal_crop_y = actual_hair_top - ideal_crop_h * TOP_MARGIN_RATIO

    # Center horizontally on the face
    ideal_crop_x = face_cx - ideal_crop_w / 2

    # ── Constrain size to image bounds while preserving aspect ratio ──
    crop_w = min(ideal_crop_w, float(img_w))
    crop_h = crop_w / target_aspect

    if crop_h > img_h:
        crop_h = float(img_h)
        crop_w = crop_h * target_aspect

    # Recompute x position centered on face after constraining size
    crop_x = face_cx - crop_w / 2

    # Recompute y, preserving the head's relative position within the crop
    if ideal_crop_h > 0:
        head_rel_y = (actual_hair_top - ideal_crop_y) / ideal_crop_h
    else:
        head_rel_y = TOP_MARGIN_RATIO
    crop_y = actual_hair_top - crop_h * head_rel_y

    # Allow slight overflow padding (transparent areas filled with white later)
    max_pad_w = crop_w * 0.15
    max_pad_h = crop_h * 0.15
    crop_x = max(-max_pad_w, min(crop_x, img_w - crop_w + max_pad_w))
    crop_y = max(-max_pad_h, min(crop_y, img_h - crop_h + max_pad_h))

    return (
        int(round(crop_x)),
        int(round(crop_y)),
        int(round(crop_w)),
        int(round(crop_h)),
    )


def _center_crop(img_w: int, img_h: int, target_aspect: float):
    """Fallback center crop maintaining exact target aspect ratio."""
    img_aspect = img_w / img_h
    if img_aspect > target_aspect:
        crop_h = img_h
        crop_w = round(img_h * target_aspect)
    else:
        crop_w = img_w
        crop_h = round(img_w / target_aspect)

    x = (img_w - crop_w) // 2
    y = int((img_h - crop_h) * 0.3)  # Bias upward
    y = max(0, min(y, img_h - crop_h))
    return (x, y, crop_w, crop_h)


# ─── Helper: safe crop with transparent padding for out-of-bounds ──────

def crop_with_padding(img: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    """
    Crop `img` to `box` (x, y, w, h). If the box extends beyond the image
    bounds, pad with transparent pixels instead of erroring or clamping.
    """
    x, y, w, h = box
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    src_x1 = max(0, x)
    src_y1 = max(0, y)
    src_x2 = min(img.width, x + w)
    src_y2 = min(img.height, y + h)

    if src_x2 <= src_x1 or src_y2 <= src_y1:
        return canvas

    region = img.crop((src_x1, src_y1, src_x2, src_y2))
    paste_x = src_x1 - x
    paste_y = src_y1 - y
    canvas.paste(region, (paste_x, paste_y))
    return canvas


# ─── API Endpoint ─────────────────────────────────────────────

@app.post("/api/process")
async def process_photo(
    file: UploadFile = File(...),
    width_px: int = Form(...),
    height_px: int = Form(...),
):
    """
    Process a photo for visa use.
    Returns a PNG with EXACT target dimensions, white background.
    """
    contents = await file.read()
    try:
        pil_img = Image.open(io.BytesIO(contents))
        pil_img = ImageOps_exif_transpose(pil_img).convert("RGBA")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    if width_px <= 0 or height_px <= 0:
        raise HTTPException(status_code=400, detail="width_px and height_px must be positive")

    orig_w, orig_h = pil_img.width, pil_img.height
    img_array = np.array(pil_img.convert("RGB"))
    logger.info(f"Input: {orig_w}x{orig_h}")

    # Step 1: Detect face on original image (before bg removal)
    face = detect_face(img_array)

    # Step 2: Remove background with AI model
    logger.info("Removing background (rembg)...")
    nobg_img = remove_background_ai(pil_img)
    logger.info(f"Background removed. Size: {nobg_img.width}x{nobg_img.height}")

    # Step 3: Smart crop based on face position
    crop_box = calculate_visa_crop(nobg_img, face, width_px, height_px)
    logger.info(f"Crop: x={crop_box[0]}, y={crop_box[1]}, w={crop_box[2]}, h={crop_box[3]}")

    cropped = crop_with_padding(nobg_img, crop_box)

    # Step 4: Resize to EXACT target dimensions using high-quality LANCZOS
    cropped_resized = cropped.resize((width_px, height_px), Image.Resampling.LANCZOS)

    # Step 5: Composite onto solid white background
    final = Image.new("RGB", (width_px, height_px), (255, 255, 255))
    final.paste(cropped_resized, (0, 0), cropped_resized)

    assert final.size == (width_px, height_px), \
        f"Output size mismatch: got {final.size}, expected ({width_px}, {height_px})"

    output = io.BytesIO()
    final.save(output, format="PNG", optimize=True, dpi=(300, 300))
    output.seek(0)
    file_size = output.getbuffer().nbytes

    logger.info(f"Output: {width_px}x{height_px}, {file_size/1024:.1f} KB")

    return StreamingResponse(
        output,
        media_type="image/png",
        headers={
            "Content-Disposition": f'inline; filename="visa-photo-{width_px}x{height_px}.png"',
            "X-Image-Width": str(width_px),
            "X-Image-Height": str(height_px),
            "X-Image-Size-Bytes": str(file_size),
            "X-Face-Detected": "true" if face else "false",
        },
    )


def ImageOps_exif_transpose(img: Image.Image) -> Image.Image:
    """Apply EXIF orientation so phone photos aren't rotated/mirrored."""
    from PIL import ImageOps
    return ImageOps.exif_transpose(img)


@app.get("/api/health")
async def health():
    return {"status": "ok", "model": REMBG_MODEL_NAME}


@app.get("/api/diag")
async def diag():
    import sys
    import platform

    return {
        "python": sys.version,
        "numpy": np.__version__,
        "platform": platform.platform(),
        "machine": platform.machine(),
        "rembg_model": REMBG_MODEL_NAME,
    }


# Serve static files from Vite build directory in production
if os.path.exists("dist"):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory="dist", html=True), name="static")