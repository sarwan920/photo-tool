/**
 * Visa Photo Processor — Fast, Canvas-based, zero dependencies.
 *
 * Strategy:
 *  1. Sample edge pixels to detect the dominant background color.
 *  2. Flood-fill-like replacement: any pixel "close" to that color → white.
 *  3. Resize + center onto a white canvas at the visa spec dimensions.
 *
 * All processing is INSTANT — no model downloads, no WASM, no waiting.
 */

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Load an image from a Blob/File and return an HTMLImageElement.
 */
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

/**
 * Get pixel data from an image.
 */
function getImageData(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return { canvas, ctx, imageData: ctx.getImageData(0, 0, img.width, img.height) };
}

/**
 * Calculate color distance (Euclidean in RGB space).
 */
function colorDistance(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// ─── Background Detection ────────────────────────────────────

/**
 * Sample pixels from the edges of the image to detect the dominant background color.
 * Returns { r, g, b } of the most common edge color.
 */
function detectBackgroundColor(imageData, width, height) {
  const data = imageData.data;
  const samples = [];
  const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 80));

  // Top edge
  for (let x = 0; x < width; x += sampleStep) {
    for (let row = 0; row < Math.min(3, height); row++) {
      const i = (row * width + x) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  // Bottom edge
  for (let x = 0; x < width; x += sampleStep) {
    for (let row = height - 1; row >= Math.max(0, height - 3); row--) {
      const i = (row * width + x) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  // Left edge
  for (let y = 0; y < height; y += sampleStep) {
    for (let col = 0; col < Math.min(3, width); col++) {
      const i = (y * width + col) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  // Right edge
  for (let y = 0; y < height; y += sampleStep) {
    for (let col = width - 1; col >= Math.max(0, width - 3); col--) {
      const i = (y * width + col) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }

  // Cluster samples to find the most common color (simple averaging of majority)
  // Use a bucketing approach — quantize colors to reduce noise
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

// ─── Background Replacement ──────────────────────────────────

/**
 * Replace the detected background color with white.
 * Uses edge-based flood fill detection + color distance tolerance.
 */
function replaceBackgroundWithWhite(imageData, width, height, bgColor, tolerance = 35) {
  const data = imageData.data;
  const total = width * height;

  // Pass 1: Mark pixels that match the background color
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

  // Pass 2: Flood fill from edges — only mark background pixels that are
  // connected to the image borders (avoids whiting out clothing/eyes that
  // happen to match the background color).
  const visited = new Uint8Array(total);
  const queue = [];

  // Seed from all 4 edges
  for (let x = 0; x < width; x++) {
    if (isBackground[x]) queue.push(x);                            // top
    const bottom = (height - 1) * width + x;
    if (isBackground[bottom]) queue.push(bottom);                  // bottom
  }
  for (let y = 0; y < height; y++) {
    const left = y * width;
    if (isBackground[left]) queue.push(left);                      // left
    const right = y * width + (width - 1);
    if (isBackground[right]) queue.push(right);                    // right
  }

  // BFS flood fill
  while (queue.length > 0) {
    const idx = queue.pop();
    if (visited[idx]) continue;
    visited[idx] = 1;

    const x = idx % width;
    const y = (idx - x) / width;

    // 4-connected neighbors
    if (x > 0 && isBackground[idx - 1] && !visited[idx - 1]) queue.push(idx - 1);
    if (x < width - 1 && isBackground[idx + 1] && !visited[idx + 1]) queue.push(idx + 1);
    if (y > 0 && isBackground[idx - width] && !visited[idx - width]) queue.push(idx - width);
    if (y < height - 1 && isBackground[idx + width] && !visited[idx + width]) queue.push(idx + width);
  }

  // Pass 3: Replace visited background pixels with white + smooth edges
  for (let i = 0; i < total; i++) {
    const pi = i * 4;
    if (visited[i]) {
      data[pi] = 255;
      data[pi + 1] = 255;
      data[pi + 2] = 255;
      data[pi + 3] = 255;
    } else {
      // For pixels near the boundary, blend towards white for smoother edges
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
        // Blend 30% towards white for anti-aliasing
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
 * Process a photo for visa use:
 *  1. Detect & replace background with white
 *  2. Resize to target dimensions, centered on white canvas
 *
 * Returns results INSTANTLY — no network, no model download.
 */
export async function processPhoto(file, spec, onProgress) {
  onProgress?.({ step: 'removing', message: 'Detecting background...' });

  const img = await loadImage(file);
  const { canvas, ctx, imageData } = getImageData(img);

  // Step 1: Detect background color from edges
  const bgColor = detectBackgroundColor(imageData, img.width, img.height);

  onProgress?.({ step: 'removing', message: 'Replacing background with white...' });

  // Step 2: Replace background with white
  const processedData = replaceBackgroundWithWhite(
    imageData, img.width, img.height, bgColor
  );
  ctx.putImageData(processedData, 0, 0);

  onProgress?.({ step: 'compositing', message: 'Resizing to visa dimensions...' });

  // Step 3: Resize onto final white canvas at visa spec dimensions
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = spec.widthPx;
  finalCanvas.height = spec.heightPx;
  const fctx = finalCanvas.getContext('2d');

  // White background
  fctx.fillStyle = '#FFFFFF';
  fctx.fillRect(0, 0, spec.widthPx, spec.heightPx);

  // Fit & center
  const srcAspect = img.width / img.height;
  const dstAspect = spec.widthPx / spec.heightPx;
  let drawW, drawH, offX, offY;

  if (srcAspect > dstAspect) {
    drawW = spec.widthPx;
    drawH = spec.widthPx / srcAspect;
    offX = 0;
    offY = (spec.heightPx - drawH) / 2;
  } else {
    drawH = spec.heightPx;
    drawW = spec.heightPx * srcAspect;
    offX = (spec.widthPx - drawW) / 2;
    offY = 0;
  }

  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(canvas, offX, offY, drawW, drawH);

  onProgress?.({ step: 'done', message: 'Done!' });

  // Export
  const finalBlob = await new Promise((r) => finalCanvas.toBlob(r, 'image/png', 1.0));
  const transparentBlob = await new Promise((r) => canvas.toBlob(r, 'image/png', 1.0));

  return {
    finalBlob,
    transparentBlob,
    previewUrl: URL.createObjectURL(finalBlob),
    transparentPreviewUrl: URL.createObjectURL(transparentBlob),
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
