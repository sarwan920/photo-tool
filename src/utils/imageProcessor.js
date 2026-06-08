/**
 * Visa Photo Processor — Fast, Canvas-based, zero dependencies.
 *
 * Pipeline:
 *  1. Detect face using browser FaceDetector API (or skin-tone fallback).
 *  2. Smart-crop so face fills ~70-80% of the frame per visa standards.
 *  3. Replace background with white (edge-flood-fill).
 *  4. Resize to exact visa pixel dimensions.
 *
 * All processing is INSTANT — no model downloads, no WASM, no waiting.
 */

// ─── Helpers ──────────────────────────────────────────────────

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    img.onload = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

function getImageData(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return { canvas, ctx, imageData: ctx.getImageData(0, 0, img.width, img.height) };
}

function colorDistance(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// ─── Face Detection ──────────────────────────────────────────

/**
 * Detect face using browser's built-in FaceDetector API.
 * Returns { x, y, width, height } of the face bounding box or null.
 */
async function detectFaceBrowser(img) {
  if (typeof window.FaceDetector === 'undefined') {
    return null;
  }
  try {
    const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    const faces = await detector.detect(img);
    if (faces.length > 0) {
      const box = faces[0].boundingBox;
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }
  } catch (e) {
    console.warn('[FaceDetector] Browser API failed:', e.message);
  }
  return null;
}

/**
 * Fallback face detection using skin-tone pixel clustering.
 * Scans the image for skin-colored regions and returns the bounding box
 * of the largest cluster.
 */
function detectFaceSkinTone(imageData, width, height) {
  const data = imageData.data;

  // Build a binary map of skin-tone pixels
  const skinMap = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const pi = i * 4;
    const r = data[pi], g = data[pi + 1], b = data[pi + 2];

    // Skin tone detection using RGB rules (works across skin tones)
    const isSkin =
      r > 60 && g > 40 && b > 20 &&
      r > g && r > b &&
      (r - g) > 10 &&
      Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
      Math.abs(r - g) < 150;

    if (isSkin) skinMap[i] = 1;
  }

  // Find bounding box of skin pixels in the top 75% of the image (head area)
  const searchHeight = Math.floor(height * 0.75);
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let skinCount = 0;

  for (let y = 0; y < searchHeight; y++) {
    for (let x = 0; x < width; x++) {
      if (skinMap[y * width + x]) {
        skinCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Need a minimum amount of skin pixels to be confident
  if (skinCount < (width * height * 0.005)) {
    return null;
  }

  // Add padding to approximate face bounding box
  const faceW = maxX - minX;
  const faceH = maxY - minY;
  const padX = faceW * 0.1;
  const padY = faceH * 0.1;

  return {
    x: Math.max(0, minX - padX),
    y: Math.max(0, minY - padY),
    width: Math.min(width - minX + padX, faceW + padX * 2),
    height: Math.min(height - minY + padY, faceH + padY * 2),
  };
}

/**
 * Detect face — tries browser API first, then falls back to skin-tone detection.
 */
async function detectFace(img, imageData) {
  // Try browser's built-in face detector first (Chrome/Edge)
  let face = await detectFaceBrowser(img);
  if (face) {
    console.log('[FaceDetect] Browser API detected face:', face);
    return face;
  }

  // Fallback: skin-tone based detection
  face = detectFaceSkinTone(imageData, img.width, img.height);
  if (face) {
    console.log('[FaceDetect] Skin-tone detection found face:', face);
    return face;
  }

  console.log('[FaceDetect] No face detected, using center crop');
  return null;
}

// ─── Smart Visa Crop ─────────────────────────────────────────

/**
 * Calculate the crop region for a visa photo based on face position.
 *
 * Visa photo standards:
 *  - Face (chin to crown) should occupy ~70-80% of the photo height
 *  - Small margin above the head (~5-8% of photo height)
 *  - Shoulders visible at bottom
 *  - Face horizontally centered
 */
function calculateVisaCrop(imgWidth, imgHeight, face, targetAspect) {
  if (!face) {
    // No face detected — do a center crop with the target aspect ratio
    return centerCrop(imgWidth, imgHeight, targetAspect);
  }

  const faceCenterX = face.x + face.width / 2;
  const faceCenterY = face.y + face.height / 2;
  const faceHeight = face.height;

  // The face should occupy ~65% of the final photo height.
  // So the total crop height = faceHeight / 0.65
  // This leaves ~8% above the head and ~27% for shoulders/chest.
  const cropHeight = faceHeight / 0.65;
  const cropWidth = cropHeight * targetAspect;

  // Position: head should start ~8% from top
  const headTop = face.y;
  const topMargin = cropHeight * 0.08;
  const cropY = headTop - topMargin;

  // Center horizontally on face
  const cropX = faceCenterX - cropWidth / 2;

  // Clamp to image bounds
  let cx = Math.max(0, Math.min(cropX, imgWidth - cropWidth));
  let cy = Math.max(0, Math.min(cropY, imgHeight - cropHeight));
  let cw = Math.min(cropWidth, imgWidth);
  let ch = Math.min(cropHeight, imgHeight);

  // If the crop is larger than the image, scale down
  if (cw > imgWidth) {
    const scale = imgWidth / cw;
    cw = imgWidth;
    ch = ch * scale;
  }
  if (ch > imgHeight) {
    const scale = imgHeight / ch;
    ch = imgHeight;
    cw = cw * scale;
    cx = Math.max(0, faceCenterX - cw / 2);
  }

  // Re-enforce aspect ratio
  const currentAspect = cw / ch;
  if (currentAspect > targetAspect) {
    // Too wide — narrow it
    cw = ch * targetAspect;
    cx = Math.max(0, Math.min(faceCenterX - cw / 2, imgWidth - cw));
  } else if (currentAspect < targetAspect) {
    // Too tall — shorten it
    ch = cw / targetAspect;
    cy = Math.max(0, Math.min(cropY, imgHeight - ch));
  }

  return {
    x: Math.round(Math.max(0, cx)),
    y: Math.round(Math.max(0, cy)),
    width: Math.round(Math.min(cw, imgWidth)),
    height: Math.round(Math.min(ch, imgHeight)),
  };
}

/**
 * Simple center crop maintaining the target aspect ratio.
 */
function centerCrop(imgWidth, imgHeight, targetAspect) {
  const imgAspect = imgWidth / imgHeight;
  let cropW, cropH;

  if (imgAspect > targetAspect) {
    cropH = imgHeight;
    cropW = imgHeight * targetAspect;
  } else {
    cropW = imgWidth;
    cropH = imgWidth / targetAspect;
  }

  return {
    x: Math.round((imgWidth - cropW) / 2),
    y: Math.round((imgHeight - cropH) * 0.3), // Bias upward (head is usually in upper portion)
    width: Math.round(cropW),
    height: Math.round(cropH),
  };
}

// ─── Background Detection & Replacement ──────────────────────

function detectBackgroundColor(imageData, width, height) {
  const data = imageData.data;
  const samples = [];
  const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 80));

  for (let x = 0; x < width; x += sampleStep) {
    for (let row = 0; row < Math.min(3, height); row++) {
      const i = (row * width + x) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  for (let x = 0; x < width; x += sampleStep) {
    for (let row = height - 1; row >= Math.max(0, height - 3); row--) {
      const i = (row * width + x) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  for (let y = 0; y < height; y += sampleStep) {
    for (let col = 0; col < Math.min(3, width); col++) {
      const i = (y * width + col) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  for (let y = 0; y < height; y += sampleStep) {
    for (let col = width - 1; col >= Math.max(0, width - 3); col--) {
      const i = (y * width + col) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }

  const buckets = {};
  for (const [r, g, b] of samples) {
    const key = `${Math.round(r / 16)},${Math.round(g / 16)},${Math.round(b / 16)}`;
    if (!buckets[key]) buckets[key] = { count: 0, r: 0, g: 0, b: 0 };
    buckets[key].count++;
    buckets[key].r += r;
    buckets[key].g += g;
    buckets[key].b += b;
  }

  let bestBucket = null;
  let bestCount = 0;
  for (const key in buckets) {
    if (buckets[key].count > bestCount) {
      bestCount = buckets[key].count;
      bestBucket = buckets[key];
    }
  }

  return {
    r: Math.round(bestBucket.r / bestBucket.count),
    g: Math.round(bestBucket.g / bestBucket.count),
    b: Math.round(bestBucket.b / bestBucket.count),
  };
}

function replaceBackgroundWithWhite(imageData, width, height, bgColor, tolerance = 35) {
  const data = imageData.data;
  const total = width * height;

  const isBackground = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const pi = i * 4;
    const dist = colorDistance(
      data[pi], data[pi + 1], data[pi + 2],
      bgColor.r, bgColor.g, bgColor.b
    );
    if (dist < tolerance) {
      isBackground[i] = 1;
    }
  }

  const visited = new Uint8Array(total);
  const queue = [];

  for (let x = 0; x < width; x++) {
    if (isBackground[x]) queue.push(x);
    const bottom = (height - 1) * width + x;
    if (isBackground[bottom]) queue.push(bottom);
  }
  for (let y = 0; y < height; y++) {
    const left = y * width;
    if (isBackground[left]) queue.push(left);
    const right = y * width + (width - 1);
    if (isBackground[right]) queue.push(right);
  }

  while (queue.length > 0) {
    const idx = queue.pop();
    if (visited[idx]) continue;
    visited[idx] = 1;
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0 && isBackground[idx - 1] && !visited[idx - 1]) queue.push(idx - 1);
    if (x < width - 1 && isBackground[idx + 1] && !visited[idx + 1]) queue.push(idx + 1);
    if (y > 0 && isBackground[idx - width] && !visited[idx - width]) queue.push(idx - width);
    if (y < height - 1 && isBackground[idx + width] && !visited[idx + width]) queue.push(idx + width);
  }

  for (let i = 0; i < total; i++) {
    const pi = i * 4;
    if (visited[i]) {
      data[pi] = 255;
      data[pi + 1] = 255;
      data[pi + 2] = 255;
      data[pi + 3] = 255;
    } else {
      const x = i % width;
      const y = (i - x) / width;
      let nearBg = false;
      for (let dy = -1; dy <= 1 && !nearBg; dy++) {
        for (let dx = -1; dx <= 1 && !nearBg; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            if (visited[ny * width + nx]) nearBg = true;
          }
        }
      }
      if (nearBg) {
        data[pi] = Math.round(data[pi] * 0.7 + 255 * 0.3);
        data[pi + 1] = Math.round(data[pi + 1] * 0.7 + 255 * 0.3);
        data[pi + 2] = Math.round(data[pi + 2] * 0.7 + 255 * 0.3);
      }
    }
  }

  return imageData;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Full pipeline:
 *  1. Detect face
 *  2. Smart crop (face = ~70% of frame, proper head margin, shoulders visible)
 *  3. Replace background with white
 *  4. Resize to exact visa dimensions
 */
export async function processPhoto(file, spec, onProgress) {
  onProgress?.({ step: 'removing', message: 'Detecting face...' });

  const img = await loadImage(file);
  const { canvas: srcCanvas, ctx: srcCtx, imageData } = getImageData(img);

  // Step 1: Detect face
  const face = await detectFace(img, imageData);
  const targetAspect = spec.widthPx / spec.heightPx;

  onProgress?.({ step: 'removing', message: 'Smart-cropping for visa format...' });

  // Step 2: Calculate visa-compliant crop region
  const crop = calculateVisaCrop(img.width, img.height, face, targetAspect);
  console.log('[Processor] Crop region:', crop);

  // Step 3: Extract cropped region
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = crop.width;
  cropCanvas.height = crop.height;
  const cropCtx = cropCanvas.getContext('2d');
  cropCtx.drawImage(
    srcCanvas,
    crop.x, crop.y, crop.width, crop.height,
    0, 0, crop.width, crop.height
  );

  // Step 4: Replace background with white on the cropped image
  onProgress?.({ step: 'removing', message: 'Replacing background with white...' });
  const cropImageData = cropCtx.getImageData(0, 0, crop.width, crop.height);
  const bgColor = detectBackgroundColor(cropImageData, crop.width, crop.height);
  const processed = replaceBackgroundWithWhite(cropImageData, crop.width, crop.height, bgColor);
  cropCtx.putImageData(processed, 0, 0);

  // Step 5: Resize to exact visa dimensions
  onProgress?.({ step: 'compositing', message: 'Resizing to visa dimensions...' });
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = spec.widthPx;
  finalCanvas.height = spec.heightPx;
  const fctx = finalCanvas.getContext('2d');

  fctx.fillStyle = '#FFFFFF';
  fctx.fillRect(0, 0, spec.widthPx, spec.heightPx);

  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(cropCanvas, 0, 0, spec.widthPx, spec.heightPx);

  onProgress?.({ step: 'done', message: 'Done!' });

  // Export
  const finalBlob = await new Promise((r) => finalCanvas.toBlob(r, 'image/png', 1.0));
  const croppedBlob = await new Promise((r) => cropCanvas.toBlob(r, 'image/png', 1.0));

  return {
    finalBlob,
    transparentBlob: croppedBlob,
    previewUrl: URL.createObjectURL(finalBlob),
    transparentPreviewUrl: URL.createObjectURL(croppedBlob),
    spec,
  };
}

export function createPreviewUrl(blob) {
  return URL.createObjectURL(blob);
}

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
