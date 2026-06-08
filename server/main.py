"""
Visa Photo Processor — Python FastAPI Backend

Pipeline:
  1. Remove background using rembg (U2Net AI model)
  2. Detect face using OpenCV Haar Cascade
  3. Smart-crop so face fills ~70% of the frame (visa standard)
  4. Composite onto white background at exact visa dimensions
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

# Load OpenCV's pre-trained face detector
face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


def detect_face(img_array: np.ndarray) -> dict | None:
    """
    Detect the largest face in the image using OpenCV Haar Cascade.
    Returns { x, y, w, h } or None.
    """
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)

    # Try multiple scale factors for robustness
    for scale in [1.1, 1.05, 1.2]:
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=scale,
            minNeighbors=5,
            minSize=(30, 30),
            flags=cv2.CASCADE_SCALE_IMAGE,
        )
        if len(faces) > 0:
            # Return the largest face
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
    Calculate the crop region so the face fills ~65-70% of the frame.

    Visa photo standards:
      - Face (chin to crown) ≈ 70% of photo height
      - ~8% margin above head
      - Shoulders visible below
      - Face horizontally centered

    Returns (x, y, w, h) of the crop region in the original image.
    """
    target_aspect = target_w / target_h

    if face is None:
        # Fallback: center crop with bias upward
        return _center_crop(img_w, img_h, target_aspect)

    fx, fy, fw, fh = face["x"], face["y"], face["w"], face["h"]
    face_cx = fx + fw / 2
    face_cy = fy + fh / 2

    # The OpenCV Haar cascade returns the face bounding box which is
    # roughly forehead-to-chin. For visa photos, the head (including hair)
    # should occupy ~65% of the frame height.
    # Estimated head height ≈ face height * 1.35 (adding hair/forehead)
    head_height = fh * 1.35
    crop_h = head_height / 0.65
    crop_w = crop_h * target_aspect

    # Position: top of head should be ~8% from the top of the frame
    head_top = fy - fh * 0.15  # Approximate top of head (above forehead)
    top_margin = crop_h * 0.08
    crop_y = head_top - top_margin

    # Center horizontally on face
    crop_x = face_cx - crop_w / 2

    # Clamp to image bounds
    crop_x = max(0, min(crop_x, img_w - crop_w))
    crop_y = max(0, min(crop_y, img_h - crop_h))

    # If crop is larger than image, scale down to fit
    if crop_w > img_w:
        scale = img_w / crop_w
        crop_w = img_w
        crop_h *= scale
        crop_y = max(0, min(crop_y, img_h - crop_h))

    if crop_h > img_h:
        scale = img_h / crop_h
        crop_h = img_h
        crop_w *= scale
        crop_x = max(0, min(face_cx - crop_w / 2, img_w - crop_w))

    # Re-enforce aspect ratio
    current_aspect = crop_w / crop_h
    if current_aspect > target_aspect:
        crop_w = crop_h * target_aspect
        crop_x = max(0, min(face_cx - crop_w / 2, img_w - crop_w))
    elif current_aspect < target_aspect:
        crop_h = crop_w / target_aspect
        crop_y = max(0, min(crop_y, img_h - crop_h))

    return (
        int(max(0, crop_x)),
        int(max(0, crop_y)),
        int(min(crop_w, img_w)),
        int(min(crop_h, img_h)),
    )


def _center_crop(img_w: int, img_h: int, target_aspect: float):
    """Fallback center crop."""
    img_aspect = img_w / img_h
    if img_aspect > target_aspect:
        crop_h = img_h
        crop_w = int(img_h * target_aspect)
    else:
        crop_w = img_w
        crop_h = int(img_w / target_aspect)

    x = (img_w - crop_w) // 2
    y = int((img_h - crop_h) * 0.3)  # Bias upward
    return (x, y, crop_w, crop_h)


# ─── API Endpoint ─────────────────────────────────────────────

@app.post("/api/process")
async def process_photo(
    file: UploadFile = File(...),
    width_px: int = Form(...),
    height_px: int = Form(...),
):
    """
    Process a photo for visa use:
      1. Remove background (rembg)
      2. Detect face (OpenCV)
      3. Smart crop for visa framing
      4. Composite on white background at target dimensions
    """
    # Read and validate image
    contents = await file.read()
    try:
        pil_img = Image.open(io.BytesIO(contents)).convert("RGBA")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    img_array = np.array(pil_img.convert("RGB"))
    logger.info(f"Input image: {img_array.shape[1]}x{img_array.shape[0]}")

    # Step 1: Detect face BEFORE removing background (better detection on original)
    face = detect_face(img_array)

    # Step 2: Remove background using rembg
    logger.info("Removing background...")
    nobg_bytes = remove(
        contents,
        session=rembg_session,
        bgcolor=None,
    )
    nobg_img = Image.open(io.BytesIO(nobg_bytes)).convert("RGBA")
    logger.info("Background removed.")

    # Step 3: Smart crop
    crop_x, crop_y, crop_w, crop_h = calculate_visa_crop(
        nobg_img.width, nobg_img.height, face, width_px, height_px
    )
    logger.info(f"Crop: x={crop_x}, y={crop_y}, w={crop_w}, h={crop_h}")

    cropped = nobg_img.crop((crop_x, crop_y, crop_x + crop_w, crop_y + crop_h))

    # Step 4: Resize to target dimensions
    cropped_resized = cropped.resize((width_px, height_px), Image.Resampling.LANCZOS)

    # Step 5: Composite on white background
    white_bg = Image.new("RGBA", (width_px, height_px), (255, 255, 255, 255))
    white_bg.paste(cropped_resized, (0, 0), cropped_resized)
    final = white_bg.convert("RGB")

    # Return as PNG
    output = io.BytesIO()
    final.save(output, format="PNG", quality=100)
    output.seek(0)

    logger.info(f"Output: {width_px}x{height_px}")
    return StreamingResponse(
        output,
        media_type="image/png",
        headers={
            "Content-Disposition": f"inline; filename=visa-photo-{width_px}x{height_px}.png"
        },
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "model_loaded": rembg_session is not None}
