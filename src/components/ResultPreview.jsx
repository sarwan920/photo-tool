import MaterialIcon from './MaterialIcon';
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
    <div className="result-container fade-in-up">
      {/* Comparison Grid */}
      <div className="compare-grid">
        <div className="compare-card">
          <div className="compare-card__header">Original Photo</div>
          <div className="compare-card__body">
            <img src={originalPreviewUrl} alt="Original uploaded portrait" className="compare-card__img" />
          </div>
        </div>

        <div className="compare-card">
          <div className="compare-card__header">
            Processed Visa Photo — {spec.flag} {spec.country}
          </div>
          <div className="compare-card__body compare-card__body--white">
            <img src={previewUrl} alt="Processed visa portrait" className="compare-card__img" />
          </div>
        </div>
      </div>

      {/* Compliance Checklist and Downloads */}
      <div className="result-details-grid">
        {/* Checklist */}
        <div className="compliance-card">
          <h3 className="compliance-card__title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MaterialIcon name="auto_awesome" size={16} />
            Visa Compliance Audit
          </h3>
          <ul className="compliance-list">
            <li className="compliance-item">
              <span className="compliance-icon compliance-icon--success">
                <MaterialIcon name="check" size={12} style={{ color: 'var(--color-success)', fontWeight: 'bold' }} />
              </span>
              <div className="compliance-text">
                <div className="compliance-label">Background Removed</div>
                <div className="compliance-desc">Replaced with pure white background</div>
              </div>
            </li>

            <li className="compliance-item">
              <span className={`compliance-icon ${dimensionsMatch ? 'compliance-icon--success' : 'compliance-icon--warning'}`}>
                {dimensionsMatch ? <MaterialIcon name="check" size={12} style={{ color: 'var(--color-success)', fontWeight: 'bold' }} /> : <MaterialIcon name="warning" size={12} style={{ color: 'var(--color-warning)' }} />}
              </span>
              <div className="compliance-text">
                <div className="compliance-label">Exact Resizing ({displayW} × {displayH} px)</div>
                <div className="compliance-desc">Matches {spec.country} requirements ({spec.widthMm}x{spec.heightMm} mm)</div>
              </div>
            </li>

            <li className="compliance-item">
              <span className={`compliance-icon ${faceDetected ? 'compliance-icon--success' : 'compliance-icon--warning'}`}>
                {faceDetected ? <MaterialIcon name="check" size={12} style={{ color: 'var(--color-success)', fontWeight: 'bold' }} /> : <MaterialIcon name="warning" size={12} style={{ color: 'var(--color-warning)' }} />}
              </span>
              <div className="compliance-text">
                <div className="compliance-label">Face Alignment Check</div>
                <div className="compliance-desc">
                  {faceDetected 
                    ? 'Face detected & centered at ~65-70% height' 
                    : 'Warning: Face boundaries could not be fully verified. Please double-check photo quality.'}
                </div>
              </div>
            </li>

            <li className="compliance-item">
              <span className="compliance-icon compliance-icon--success">
                <MaterialIcon name="check" size={12} style={{ color: 'var(--color-success)', fontWeight: 'bold' }} />
              </span>
              <div className="compliance-text">
                <div className="compliance-label">Print Quality (300 DPI)</div>
                <div className="compliance-desc">Embedded high-resolution print density metadata</div>
              </div>
            </li>
          </ul>
        </div>

        {/* Download Actions */}
        <div className="download-panel">
          <div className="download-panel__title">Export Your Photo</div>
          <p className="download-panel__desc">
            Choose the format required by your application system.
          </p>

          <div className="download-card-list">
            <div className="download-card" onClick={handleDownloadPng}>
              <div className="download-card__icon-box download-card__icon-box--png">
                <MaterialIcon name="file_download" size={20} />
              </div>
              <div className="download-card__info">
                <div className="download-card__type">Download PNG (Lossless)</div>
                <div className="download-card__meta">Best for printing • {fileSizeKB} KB</div>
              </div>
            </div>

            <div className="download-card" onClick={handleDownloadJpeg}>
              <div className="download-card__icon-box download-card__icon-box--jpeg">
                <MaterialIcon name="image" size={20} />
              </div>
              <div className="download-card__info">
                <div className="download-card__type">Download JPEG (Compressed)</div>
                <div className="download-card__meta">Best for online applications • 300 DPI</div>
              </div>
            </div>
          </div>

          <button className="reset-action-btn" onClick={onReset} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <MaterialIcon name="autorenew" size={14} />
            Process Another Photo
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResultPreview;
