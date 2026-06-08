/**
 * Visa Photo Processor — Frontend client for Python API.
 *
 * Sends the image to the Python FastAPI backend which uses:
 *  - rembg (U2Net) for proper AI background removal
 *  - OpenCV for accurate face detection
 *  - Pillow for high-quality resize & composite
 */

/**
 * Process a photo via the Python backend API.
 */
export async function processPhoto(file, spec, onProgress) {
  onProgress?.({ step: 'removing', message: 'Uploading & detecting face...' });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('width_px', spec.widthPx.toString());
  formData.append('height_px', spec.heightPx.toString());

  onProgress?.({ step: 'removing', message: 'Removing background & cropping...' });

  const response = await fetch('/api/process', {
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
