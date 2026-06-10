/**
 * Visa Photo Processor — Frontend client for Python API.
 *
 * Sends the image to the Python FastAPI backend which uses:
 *  - rembg (U2Net) for proper AI background removal
 *  - OpenCV for accurate face detection
 *  - Pillow for high-quality resize & composite
 */

const API_BASE = import.meta.env.PROD 
  ? 'https://photo-tool.fastapicloud.dev' 
  : '';

/**
 * Compress and downscale an image file on the client-side.
 * Limits max dimension to 1200px and returns a compressed JPEG File object.
 */
function compressImageBeforeUpload(file, maxDim = 1200) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          0.9
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Process a photo via the Python backend API.
 */
export async function processPhoto(file, spec, onProgress) {
  onProgress?.({ step: 'removing', message: 'Preparing photo...' });

  // Compress/resize on the client side before upload to prevent slow transfers and server timeouts
  let uploadFile = file;
  if (file.size > 200 * 1024) {
    try {
      uploadFile = await compressImageBeforeUpload(file, 1200);
      console.log(`Compressed: ${(file.size/1024).toFixed(1)}KB -> ${(uploadFile.size/1024).toFixed(1)}KB`);
    } catch (err) {
      console.error('Client compression failed, using raw file:', err);
    }
  }

  onProgress?.({ step: 'removing', message: 'Uploading & detecting face...' });

  const formData = new FormData();
  formData.append('file', uploadFile);
  formData.append('width_px', spec.widthPx.toString());
  formData.append('height_px', spec.heightPx.toString());

  onProgress?.({ step: 'removing', message: 'Removing background & cropping...' });

  const response = await fetch(`${API_BASE}/api/process`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let detail = 'Unknown error';
    try {
      const errorData = await response.json();
      detail = errorData.detail || response.statusText;
    } catch {
      detail = await response.text() || response.statusText;
    }
    throw new Error(`Processing failed: ${detail}`);
  }

  onProgress?.({ step: 'compositing', message: 'Finalizing visa photo...' });

  // Read metadata from response headers
  const actualWidth = parseInt(response.headers.get('X-Image-Width') || spec.widthPx, 10);
  const actualHeight = parseInt(response.headers.get('X-Image-Height') || spec.heightPx, 10);
  const faceDetected = response.headers.get('X-Face-Detected') === 'true';

  const finalBlob = await response.blob();

  onProgress?.({ step: 'done', message: 'Done!' });

  return {
    finalBlob,
    transparentBlob: finalBlob,
    previewUrl: URL.createObjectURL(finalBlob),
    transparentPreviewUrl: URL.createObjectURL(finalBlob),
    actualWidth,
    actualHeight,
    faceDetected,
    spec,
  };
}

/**
 * Generate a preview URL from a Blob.
 */
export function createPreviewUrl(blob) {
  return URL.createObjectURL(blob);
}

/**
 * Trigger a download from a Blob.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
