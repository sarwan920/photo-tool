import { Download, FileImage, RotateCcw, Maximize2, HardDrive, CheckCircle2 } from 'lucide-react';
import { downloadBlob } from '../utils/imageProcessor';

function ResultPreview({ result, originalPreviewUrl, onReset }) {
  const { finalBlob, previewUrl, spec, faceDetected, actualWidth, actualHeight } = result;

  const handleDownloadPng = () => {
    const filename = `visa-photo-${spec.country.toLowerCase().replace(/\s+/g, '-')}-${spec.widthPx}x${spec.heightPx}.png`;
    downloadBlob(finalBlob, filename);
  };

  const handleDownloadJpeg = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Use actual image dimensions (should match spec)
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          const filename = `visa-photo-${spec.country.toLowerCase().replace(/\s+/g, '-')}-${spec.widthPx}x${spec.heightPx}.jpg`;
          downloadBlob(blob, filename);
        },
        'image/jpeg',
        0.95
      );
    };
    img.src = previewUrl;
  };

  const fileSizeKB = (finalBlob.size / 1024).toFixed(1);
  const displayW = actualWidth || spec.widthPx;
  const displayH = actualHeight || spec.heightPx;
  const dimensionsMatch = displayW === spec.widthPx && displayH === spec.heightPx;

  return (
    <div className="fade-in-up">
      <div className="result">
        <div className="result__column">
          <div className="result__label">Original</div>
          <div className="result__image-wrapper">
            <img src={originalPreviewUrl} alt="Original photo" className="result__image" />
          </div>
        </div>

        <div className="result__column">
          <div className="result__label">
            Processed — {spec.flag} {spec.country}
          </div>
          <div className="result__image-wrapper result__image-wrapper--white">
            <img src={previewUrl} alt="Processed visa photo" className="result__image" />
          </div>
          <div className="result__meta">
            <div className="result__meta-item" style={dimensionsMatch ? { color: 'var(--color-success)' } : {}}>
              {dimensionsMatch ? <CheckCircle2 size={12} /> : <Maximize2 size={12} />}
              {displayW} × {displayH} px
            </div>
            <div className="result__meta-item">
              <Maximize2 size={12} />
              {spec.widthMm} × {spec.heightMm} mm
            </div>
            <div className="result__meta-item">
              <HardDrive size={12} />
              {fileSizeKB} KB
            </div>
            {faceDetected && (
              <div className="result__meta-item" style={{ color: 'var(--color-success)' }}>
                <CheckCircle2 size={12} />
                Face detected
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="download-actions" style={{ justifyContent: 'center', maxWidth: '500px', margin: '24px auto 0' }}>
        <button
          className="download-btn download-btn--primary"
          onClick={handleDownloadPng}
          id="download-png-btn"
        >
          <Download size={18} />
          Download PNG
        </button>
        <button
          className="download-btn download-btn--secondary"
          onClick={handleDownloadJpeg}
          id="download-jpeg-btn"
        >
          <FileImage size={18} />
          Download JPEG
        </button>
      </div>

      <button className="reset-btn" onClick={onReset} id="reset-btn">
        <RotateCcw size={16} />
        Process Another Photo
      </button>
    </div>
  );
}

export default ResultPreview;
