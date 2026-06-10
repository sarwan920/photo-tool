"""
Visa Photo Processor — Python FastAPI Backend

Pipeline:
  1. Remove background using OpenCV GrabCut (stable, fast, CPU-friendly)
  2. Detect face using OpenCV Haar Cascade
  3. Smart-crop so face fills ~70% of the frame (visa standard)
  4. Composite onto white background at EXACT visa dimensions
"""

import io
import os
import logging
from contextlib import asynccontextmanager

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image

logger = logging.getLogger("visa-photo")
logging.basicConfig(level=logging.INFO)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("FastAPI backend starting up...")
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
    Optimized to run on a downscaled image for speed, then scale coordinates back.
    """
    orig_h, orig_w = img_array.shape[:2]
    
    # Downscale for fast face detection
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

    for scale_factor in [1.1, 1.05, 1.2, 1.3]:
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=scale_factor,
            minNeighbors=5,
            minSize=(30, 30),
            flags=cv2.CASCADE_SCALE_IMAGE,
        )
        if len(faces) > 0:
            # Sort by area (descending) to get the largest face
            faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
            x, y, w, h = faces[0]
            
            # Scale coordinates back to original size
            if scale != 1.0:
                x = int(round(x / scale))
                y = int(round(y / scale))
                w = int(round(w / scale))
                h = int(round(h / scale))
                
            logger.info(f"Face detected (scaled back): x={x}, y={y}, w={w}, h={h}")
            return {"x": x, "y": y, "w": w, "h": h}

    logger.warning("No face detected")
    return None


# ─── GrabCut Background Removal ────────────────────────────────

def remove_background_grabcut(pil_img: Image.Image) -> Image.Image:
    """
    Remove background using OpenCV GrabCut algorithm.
    Optimized for speed, high resolution, and clothing/shoulder preservation.
    """
    orig_w, orig_h = pil_img.width, pil_img.height
    img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGBA2BGR)

    # 1. Downscale for fast segmentation if too large
    # Reduced max_dim to 400 for 4x speedup on serverless CPU
    max_dim = 400
    scale = 1.0
    if max(orig_w, orig_h) > max_dim:
        scale = max_dim / max(orig_w, orig_h)
        w_scaled = int(orig_w * scale)
        h_scaled = int(orig_h * scale)
        img_small = cv2.resize(img, (w_scaled, h_scaled), interpolation=cv2.INTER_AREA)
    else:
        img_small = img
        w_scaled, h_scaled = orig_w, orig_h

    # 2. Initialize GrabCut mask
    mask = np.full((h_scaled, w_scaled), cv2.GC_PR_BGD, dtype=np.uint8)

    # 3. Detect face on the scaled image for boundary anchoring
    gray = cv2.cvtColor(img_small, cv2.COLOR_BGR2GRAY)
    
    # Run face detection
    faces = []
    for sf in [1.1, 1.05, 1.2, 1.3]:
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=sf,
            minNeighbors=5,
            minSize=(30, 30),
            flags=cv2.CASCADE_SCALE_IMAGE,
        )
        if len(faces) > 0:
            break

    # Determine y-cutoff (shoulder line) below which we NEVER mark borders as background
    if len(faces) > 0:
        # Sort by size to get largest face
        faces_sorted = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
        fx, fy, fw, fh = faces_sorted[0]
        logger.info(f"GrabCut face detected: x={fx}, y={fy}, w={fw}, h={fh}")
        
        # Face core is definitely foreground
        shrink_w = int(fw * 0.15)
        shrink_h = int(fh * 0.15)
        mask[fy+shrink_h:fy+fh-shrink_h, fx+shrink_w:fx+fw-shrink_w] = cv2.GC_FGD
        
        # Neck and center torso column as probably foreground
        tx1 = max(0, fx - int(fw * 0.2))
        tx2 = min(w_scaled, fx + fw + int(fw * 0.2))
        ty1 = fy + fh
        ty2 = h_scaled
        mask[ty1:ty2, tx1:tx2] = cv2.GC_PR_FGD
        
        # Head/torso region is probably foreground
        px1 = max(0, fx - int(fw * 1.5))
        py1 = max(0, fy - int(fh * 0.7))
        px2 = min(w_scaled, fx + fw + int(fw * 1.5))
        py2 = h_scaled
        
        # Update probably foreground where it is not definitely background
        pr_fg_mask = (mask != cv2.GC_BGD) & (mask != cv2.GC_FGD)
        mask[py1:py2, px1:px2] = np.where(pr_fg_mask[py1:py2, px1:px2], cv2.GC_PR_FGD, mask[py1:py2, px1:px2])
    else:
        # Fallback: central oval is probably foreground
        logger.warning("GrabCut face detection failed; using fallback central oval")
        cv2.ellipse(mask, (w_scaled//2, h_scaled//2), (int(w_scaled*0.35), int(h_scaled*0.45)), 0, 0, 360, cv2.GC_PR_FGD, -1)

    # 4. Set outer borders to definitely background
    # Top border (5% height) is definitely background
    # Left and right side borders (very thin 2% width) are definitely background to provide seeds without clipping shoulders
    border_w = max(1, int(w_scaled * 0.02))
    border_h = max(1, int(h_scaled * 0.05))
    
    mask[0:border_h, :] = cv2.GC_BGD
    mask[:, 0:border_w] = cv2.GC_BGD
    mask[:, w_scaled-border_w:w_scaled] = cv2.GC_BGD

    # 5. Run GrabCut (Reduced iterations to 3 for speedup)
    bgdModel = np.zeros((1, 65), np.float64)
    fgdModel = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(img_small, mask, None, bgdModel, fgdModel, 3, cv2.GC_INIT_WITH_MASK)
    except Exception as e:
        logger.error(f"GrabCut execution failed: {e}")
        # Fallback to simple mask if GrabCut fails
        mask = np.where((mask == cv2.GC_PR_FGD) | (mask == cv2.GC_FGD), cv2.GC_PR_FGD, cv2.GC_BGD).astype(np.uint8)

    # Get binary mask
    bin_mask_small = np.where((mask == cv2.GC_PR_FGD) | (mask == cv2.GC_FGD), 255, 0).astype(np.uint8)

    # 6. Upscale mask to original size if downscaled
    if scale != 1.0:
        bin_mask = cv2.resize(bin_mask_small, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
    else:
        bin_mask = bin_mask_small

    # 7. Post-processing: Fill internal holes and apply soft anti-aliased feathering
    # Find contours to identify foreground region and fill any internal holes (e.g. dark shirt details)
    contours, _ = cv2.findContours(bin_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if contours:
        clean_mask = np.zeros_like(bin_mask)
        cv2.drawContours(clean_mask, contours, -1, 255, thickness=cv2.FILLED)
        bin_mask = clean_mask

    # Soft anti-aliased feathering using Gaussian Blur + contrast adjustment
    blur_size = int(max(orig_w, orig_h) * 0.01) | 1  # 1% of image size, must be odd
    blurred = cv2.GaussianBlur(bin_mask, (blur_size, blur_size), 0)
    
    contrast = 3.5
    feathered = np.clip((blurred.astype(np.float32) / 255.0 - 0.5) * contrast + 0.5, 0.0, 1.0) * 255.0
    feathered_mask = feathered.astype(np.uint8)

    # 8. Apply mask to create transparent image
    mask_pil = Image.fromarray(feathered_mask).convert("L")
    transparent = Image.new("RGBA", (orig_w, orig_h))
    transparent.paste(pil_img, (0, 0), mask=mask_pil)

    return transparent


# ─── Smart Visa Crop ─────────────────────────────────────────

def calculate_visa_crop(
    nobg_img: Image.Image,
    face: dict | None,
    target_w: int, target_h: int,
) -> tuple[int, int, int, int]:
    """
    Calculate the crop region so the face fills ~75-85% of the frame height.

    Visa photo standards:
      - Head (chin to crown + hair) ≈ 75-85% of photo height
      - ~8% margin above head
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

    # Get actual top of hair/head from non-transparent bbox
    bbox = nobg_img.getbbox()
    actual_hair_top = bbox[1] if bbox else 0

    # Bounding box upper bound is the actual top of the hair.
    # The bottom of the face box is approx the chin: fy + fh.
    calculated_head_height = (fy + fh) - actual_hair_top
    
    # Add safety clamps (head height should be between 1.15x and 1.6x face height)
    head_height = max(fh * 1.15, min(fh * 1.6, calculated_head_height))
    
    # The top of head
    head_top = (fy + fh) - head_height

    # Head should occupy ~65% of the crop height.
    ideal_crop_h = head_height / 0.65
    ideal_crop_w = ideal_crop_h * target_aspect

    # Head should start at ~3.6% from the top of the crop
    ideal_crop_y = head_top - ideal_crop_h * 0.036
    
    # Center horizontally on face
    ideal_crop_x = face_cx - ideal_crop_w / 2

    # ── Constrain size to image bounds while preserving aspect ratio ──
    crop_w = min(ideal_crop_w, float(img_w))
    crop_h = crop_w / target_aspect

    if crop_h > img_h:
        crop_h = float(img_h)
        crop_w = crop_h * target_aspect

    # Recompute position after constraining size
    crop_x = face_cx - crop_w / 2
    
    # Keep vertical position based on head, but adjust for new size
    head_margin_ratio = 0.036
    if ideal_crop_h > 0:
        head_rel_y = (head_top - ideal_crop_y) / ideal_crop_h
    else:
        head_rel_y = head_margin_ratio
    crop_y = head_top - crop_h * head_rel_y

    # Allow crop to extend outside image bounds (Pillow will pad with transparency)
    # but keep it constrained so it doesn't shift completely off-screen.
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
    nobg_img = remove_background_grabcut(pil_img)
    logger.info(f"Background removed. Size: {nobg_img.width}x{nobg_img.height}")

    # Step 3: Smart crop
    crop_x, crop_y, crop_w, crop_h = calculate_visa_crop(
        nobg_img, face, width_px, height_px
    )

    logger.info(f"Crop: x={crop_x}, y={crop_y}, w={crop_w}, h={crop_h}")

    cropped = nobg_img.crop((crop_x, crop_y, crop_x + crop_w, crop_y + crop_h))

    # Step 4: Resize to EXACT target dimensions using high-quality LANCZOS
    cropped_resized = cropped.resize((width_px, height_px), Image.Resampling.LANCZOS)

    # Step 5: Composite onto white background
    final = Image.new("RGB", (width_px, height_px), (255, 255, 255))
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
    return {"status": "ok"}


@app.get("/api/diag")
async def diag():
    import sys
    import numpy as np
    import platform
    
    packages = {
        "python": sys.version,
        "numpy": np.__version__,
        "platform": platform.platform(),
        "machine": platform.machine(),
    }
    return packages


# Serve static files from Vite build directory in production
if os.path.exists("dist"):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory="dist", html=True), name="static")
