import { removeBackground as removeBg } from '@imgly/background-removal';

/**
 * Remove the background from an image file using AI (runs in-browser).
 * Returns a Blob with transparent background.
 */
export async function removeBackground(file, onProgress) {
  const config = {
    progress: (key, current, total) => {
      if (onProgress) {
        onProgress({ key, current, total });
      }
    },
    output: {
      format: 'image/png',
      quality: 1,
    },
  };

  const blob = await removeBg(file, config);
  return blob;
}

/**
 * Load an image from a Blob/File and return an HTMLImageElement.
 */
function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Composite a transparent image onto a white background and resize
 * to the target dimensions using high-quality Canvas rendering.
 */
export async function compositeAndResize(transparentBlob, targetWidth, targetHeight) {
  const img = await loadImage(transparentBlob);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');

  // Fill white background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // Calculate scaling to fit and center the subject
  const srcAspect = img.width / img.height;
  const dstAspect = targetWidth / targetHeight;

  let drawWidth, drawHeight, offsetX, offsetY;

  if (srcAspect > dstAspect) {
    // Source is wider — fit by width, might need to crop height
    drawWidth = targetWidth;
    drawHeight = targetWidth / srcAspect;
    offsetX = 0;
    offsetY = (targetHeight - drawHeight) / 2;
  } else {
    // Source is taller — fit by height
    drawHeight = targetHeight;
    drawWidth = targetHeight * srcAspect;
    offsetX = (targetWidth - drawWidth) / 2;
    offsetY = 0;
  }

  // Use high-quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      'image/png',
      1.0
    );
  });
}

/**
 * Generate a preview URL from a Blob.
 */
export function createPreviewUrl(blob) {
  return URL.createObjectURL(blob);
}

/**
 * Full processing pipeline:
 * 1. Remove background
 * 2. Add white background + resize to visa spec
 */
export async function processPhoto(file, spec, onProgress) {
  // Step 1: Remove background
  onProgress?.({ step: 'removing', message: 'Removing background...' });
  const transparentBlob = await removeBackground(file, (p) => {
    onProgress?.({
      step: 'removing',
      message: 'Removing background...',
      detail: p,
    });
  });

  // Step 2: Composite and resize
  onProgress?.({ step: 'compositing', message: 'Adding white background & resizing...' });
  const finalBlob = await compositeAndResize(
    transparentBlob,
    spec.widthPx,
    spec.heightPx
  );

  onProgress?.({ step: 'done', message: 'Processing complete!' });

  return {
    transparentBlob,
    finalBlob,
    previewUrl: createPreviewUrl(finalBlob),
    transparentPreviewUrl: createPreviewUrl(transparentBlob),
    spec,
  };
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
