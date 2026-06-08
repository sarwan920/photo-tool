"""
Visa Photo Processor — Python FastAPI Backend

Pipeline:
  1. Remove background using rembg (U2Net AI model)
  2. Detect face using OpenCV Haar Cascade
  3. Smart-crop so face fills ~70% of the frame (visa standard)
  4. Composite onto white background at EXACT visa dimensions
"""

import io
import logging
from contextlib import asynccontextmanager

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image
from rembg import remove, new_session

logger = logging.getLogger("visa-photo")
logging.basicConfig(level=logging.INFO)

# ─── Global model session (loaded once at startup) ────────────

rembg_session = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global rembg_session
    logger.info("Loading rembg model (one-time)...")
    rembg_session = new_session("u2net")
    logger.info("rembg model loaded successfully.")
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
    Returns { x, y, w, h } or None.
    """
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)

    for scale in [1.1, 1.05, 1.2, 1.3]:
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=scale,
            minNeighbors=5,
            minSize=(30, 30),
            flags=cv2.CASCADE_SCALE_IMAGE,
        )
        if len(faces) > 0:
            faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
            x, y, w, h = faces[0]
            logger.info(f"Face detected: x={x}, y={y}, w={w}, h={h}")
            return {"x": int(x), "y": int(y), "w": int(w), "h": int(h)}

    logger.warning("No face detected")
    return None


# ─── Smart Visa Crop ─────────────────────────────────────────

def calculate_visa_crop(
    img_w: int, img_h: int,
    face: dict | None,
    target_w: int, target_h: int,
) -> tuple[int, int, int, int]:
    """
    Calculate the crop region so the face fills ~65-70% of the frame height.

    Visa photo standards:
      - Head (chin to crown + hair) ≈ 65-70% of photo height
      - ~8% margin above head
      - Shoulders visible below
      - Face horizontally centered

    Returns (x, y, w, h) of the crop region in the original image.
    """
    target_aspect = target_w / target_h

    if face is None:
        return _center_crop(img_w, img_h, target_aspect)

    fx, fy, fw, fh = face["x"], face["y"], face["w"], face["h"]
    face_cx = fx + fw / 2

    # Haar cascade detects forehead-to-chin.
    # Full head (with hair) ≈ face_h * 1.3
    # Head should fill ~65% of the frame height.
    head_height = fh * 1.3
    ideal_crop_h = head_height / 0.65
    ideal_crop_w = ideal_crop_h * target_aspect

    # Top of head is approximately fy - fh * 0.15
    head_top = fy - fh * 0.15
    # Head should start at ~8% from the top of the crop
    ideal_crop_y = head_top - ideal_crop_h * 0.08
    # Center horizontally on face
    ideal_crop_x = face_cx - ideal_crop_w / 2

    # ── Constrain to image bounds while preserving aspect ratio ──

    crop_w = min(ideal_crop_w, float(img_w))
    crop_h = crop_w / target_aspect

    if crop_h > img_h:
        crop_h = float(img_h)
        crop_w = crop_h * target_aspect

    # Recompute position after constraining size
    crop_x = face_cx - crop_w / 2
    # Keep vertical position based on head, but adjust for new size
    head_margin_ratio = 0.08
    if ideal_crop_h > 0:
        # How far down the head was in the ideal crop
        head_rel_y = (head_top - ideal_crop_y) / ideal_crop_h
    else:
        head_rel_y = head_margin_ratio
    crop_y = head_top - crop_h * head_rel_y

    # Clamp position to image bounds
    crop_x = max(0.0, min(crop_x, img_w - crop_w))
    crop_y = max(0.0, min(crop_y, img_h - crop_h))

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


# ─── API Endpoint ─────────────────────────────────────────────

@app.post("/api/process")
async def process_photo(
    file: UploadFile = File(...),
    width_px: int = Form(...),
    height_px: int = Form(...),
):
    """
    Process a photo for visa use.
    Returns a PNG with EXACT target dimensions.
    """
    # Read and validate image
    contents = await file.read()
    try:
        pil_img = Image.open(io.BytesIO(contents)).convert("RGBA")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    orig_w, orig_h = pil_img.width, pil_img.height
    img_array = np.array(pil_img.convert("RGB"))
    logger.info(f"Input: {orig_w}x{orig_h}")

    # Step 1: Detect face on original image (before bg removal)
    face = detect_face(img_array)

    # Step 2: Remove background
    logger.info("Removing background...")
    nobg_bytes = remove(
        contents,
        session=rembg_session,
        bgcolor=None,
    )
    nobg_img = Image.open(io.BytesIO(nobg_bytes)).convert("RGBA")
    logger.info(f"Background removed. Size: {nobg_img.width}x{nobg_img.height}")

    # Step 3: Smart crop
    crop_x, crop_y, crop_w, crop_h = calculate_visa_crop(
        nobg_img.width, nobg_img.height, face, width_px, height_px
    )

    # Clamp crop to image bounds (safety)
    crop_x = max(0, min(crop_x, nobg_img.width - 1))
    crop_y = max(0, min(crop_y, nobg_img.height - 1))
    crop_w = min(crop_w, nobg_img.width - crop_x)
    crop_h = min(crop_h, nobg_img.height - crop_y)

    logger.info(f"Crop: x={crop_x}, y={crop_y}, w={crop_w}, h={crop_h}")

    cropped = nobg_img.crop((crop_x, crop_y, crop_x + crop_w, crop_y + crop_h))

    # Step 4: Resize to EXACT target dimensions using high-quality LANCZOS
    cropped_resized = cropped.resize((width_px, height_px), Image.Resampling.LANCZOS)

    # Step 5: Composite onto white background
    final = Image.new("RGB", (width_px, height_px), (255, 255, 255))
    # Paste using alpha channel as mask
    final.paste(cropped_resized, (0, 0), cropped_resized)

    # Verify exact dimensions
    assert final.size == (width_px, height_px), \
        f"Output size mismatch: got {final.size}, expected ({width_px}, {height_px})"

    # ── Output optimized PNG with 300 DPI metadata for print-readiness ──
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


@app.get("/api/health")
async def health():
    return {"status": "ok", "model_loaded": rembg_session is not None}
