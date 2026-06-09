"""
Visa Photo Processor — Python FastAPI Backend

Pipeline:
  1. Remove background using rembg (U2Net AI model)
  2. Detect face using OpenCV Haar Cascade
  3. Smart-crop so face fills ~70% of the frame (visa standard)
  4. Composite onto white background at EXACT visa dimensions
"""

import io
import os
# Disable CPU affinity in ONNX Runtime BEFORE importing rembg (which loads onnxruntime)
# to prevent thread affinity segmentation faults in virtualized/container environments.
os.environ["ORT_DISABLE_CPU_AFFINITY"] = "1"
# Configure U2NET_HOME to point to the pre-packaged models directory inside the server package
os.environ["U2NET_HOME"] = os.path.join(os.path.dirname(__file__), "models")
# Configure Numba environment variables to avoid crash in serverless/read-only container environments
os.environ["NUMBA_CACHE_DIR"] = "/tmp/numba_cache"
os.environ["NUMBA_NUM_THREADS"] = "1"
# Force single-threaded execution in ONNX Runtime/OpenMP to prevent serverless container crashes
os.environ["OMP_NUM_THREADS"] = "1"
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

def get_rembg_session():
    global rembg_session
    if rembg_session is None:
        # Check if the cached model file is corrupted/incomplete (from an interrupted download)
        u2net_dir = os.environ.get("U2NET_HOME", os.path.join(os.path.expanduser("~"), ".u2net"))
        model_path = os.path.join(u2net_dir, "u2netp.onnx")
        if os.path.exists(model_path):
            file_size = os.path.getsize(model_path)
            logger.info(f"Model cache check: found {model_path} ({file_size} bytes)")
            # u2netp.onnx is ~4.7MB. If it's less than 4.5MB, it's corrupted/incomplete
            if file_size < 4500000:
                logger.warning(f"Cached model {model_path} is incomplete or corrupted. Deleting to force redownload...")
                try:
                    os.remove(model_path)
                except Exception as e:
                    logger.error(f"Failed to delete corrupted model: {e}")
        
        logger.info("Loading rembg model (lazy-load)...")
        rembg_session = new_session("u2netp", providers=["CPUExecutionProvider"])
        logger.info("rembg model loaded successfully.")
    return rembg_session

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

    # Head should start at ~3.6% from the top of the crop (reduced from 8% to make the space less)
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
    # We allow padding up to 15% of the crop size on the sides and top/bottom.
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
    nobg_bytes = remove(
        contents,
        session=get_rembg_session(),
        bgcolor=None,
    )
    nobg_img = Image.open(io.BytesIO(nobg_bytes)).convert("RGBA")
    logger.info(f"Background removed. Size: {nobg_img.width}x{nobg_img.height}")

    # Step 3: Smart crop
    crop_x, crop_y, crop_w, crop_h = calculate_visa_crop(
        nobg_img, face, width_px, height_px
    )

    logger.info(f"Crop: x={crop_x}, y={crop_y}, w={crop_w}, h={crop_h}")

    cropped = nobg_img.crop((crop_x, crop_y, crop_x + crop_w, crop_y + crop_h))

    # Step 4: Resize to EXACT target dimensions using high-quality LANCZOS
    cropped_resized = cropped.resize((width_px, height_px), Image.Resampling.LANCZOS)



    # Step 6: Composite onto white background
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


@app.get("/api/diag")
async def diag():
    import sys
    import numpy as np
    import onnxruntime as ort
    
    # Check write permissions in model directory
    home = os.path.expanduser("~")
    u2net_dir = os.environ.get("U2NET_HOME", os.path.join(home, ".u2net"))
    u2net_writable = False
    u2net_exists = os.path.exists(os.path.join(u2net_dir, "u2netp.onnx"))
    try:
        os.makedirs(u2net_dir, exist_ok=True)
        test_file = os.path.join(u2net_dir, "test.txt")
        with open(test_file, "w") as f:
            f.write("test")
        os.remove(test_file)
        u2net_writable = True
    except Exception as e:
        u2net_writable = str(e)

    # Gather package versions
    import platform
    packages = {
        "python": sys.version,
        "numpy": np.__version__,
        "onnxruntime": ort.__version__,
        "ort_providers": ort.get_available_providers(),
        "u2net_dir": u2net_dir,
        "u2net_exists": u2net_exists,
        "u2net_writable": u2net_writable,
        "platform": platform.platform(),
        "machine": platform.machine(),
        "processor": platform.processor(),
    }
    return packages


@app.get("/api/test_ort_load")
async def test_ort_load():
    import onnxruntime as ort
    import os
    
    home = os.path.expanduser("~")
    u2net_dir = os.environ.get("U2NET_HOME", os.path.join(home, ".u2net"))
    model_path = os.path.join(u2net_dir, "u2netp.onnx")
    
    try:
        logger.info(f"Initializing InferenceSession directly for {model_path}...")
        sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        logger.info("InferenceSession initialized successfully!")
        return {"status": "ok", "message": "InferenceSession initialized successfully!"}
    except Exception as e:
        logger.error(f"InferenceSession failed: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/api/test_ort_run")
async def test_ort_run():
    import onnxruntime as ort
    import os
    import numpy as np
    
    home = os.path.expanduser("~")
    u2net_dir = os.environ.get("U2NET_HOME", os.path.join(home, ".u2net"))
    model_path = os.path.join(u2net_dir, "u2netp.onnx")
    
    try:
        logger.info(f"Initializing InferenceSession directly for {model_path}...")
        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = 1
        sess_options.inter_op_num_threads = 1
        sess = ort.InferenceSession(model_path, sess_options, providers=["CPUExecutionProvider"])
        
        # Get input name and shape
        input_name = sess.get_inputs()[0].name
        # Input shape for u2netp is [1, 3, 320, 320]
        logger.info(f"Input name: {input_name}")
        
        # Create a dummy input array
        dummy_input = np.random.randn(1, 3, 320, 320).astype(np.float32)
        
        logger.info("Running inference directly...")
        res = sess.run(None, {input_name: dummy_input})
        logger.info("Inference completed successfully!")
        return {"status": "ok", "outputs_count": len(res), "output_shape": res[0].shape}
    except Exception as e:
        logger.error(f"test_ort_run failed: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/api/test_numba")
async def test_numba():
    try:
        from numba import jit
        @jit(nopython=True)
        def add(a, b):
            return a + b
        
        # Trigger JIT compilation
        res = add(1, 2)
        return {"status": "ok", "result": int(res)}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.get("/api/test_rembg")
async def test_rembg():
    try:
        from PIL import Image
        import io
        from rembg import remove
        
        # Create a tiny 50x50 RGB image
        img = Image.new("RGB", (50, 50), (255, 0, 0))
        img_bytes = io.BytesIO()
        img.save(img_bytes, format="PNG")
        img_data = img_bytes.getvalue()
        
        logger.info("Calling rembg.remove on dummy image...")
        out_data = remove(img_data, session=get_rembg_session())
        logger.info("rembg.remove completed successfully!")
        return {"status": "ok", "output_length": len(out_data)}
    except Exception as e:
        logger.error(f"test_rembg failed: {e}")
        return {"status": "error", "message": str(e)}


# Serve static files from Vite build directory in production
if os.path.exists("dist"):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory="dist", html=True), name="static")

