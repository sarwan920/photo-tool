import { useState, useRef, useCallback } from 'react';
import MaterialIcon from './MaterialIcon';

function UploadZone({ onFileSelect, currentFile, previewUrl }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleInputChange = useCallback(
    (e) => {
      const file = e.target.files[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  return (
    <div
      id="upload-zone"
      className={`upload-zone ${isDragging ? 'upload-zone--active' : ''} ${
        currentFile ? 'upload-zone--has-file' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleInputChange}
        style={{ display: 'none' }}
        id="file-input"
      />

      {currentFile && previewUrl ? (
        <div className="upload-zone__preview-container">
          <div className="upload-zone__preview-media">
            <img
              src={previewUrl}
              alt="Uploaded source"
              className="upload-zone__preview-img"
            />
            <div className="upload-zone__preview-glow" />
          </div>
          <div className="upload-zone__preview-details">
            <div className="upload-zone__preview-meta">
              <span className="upload-zone__file-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <MaterialIcon name="image" size={12} />
                Source Image
              </span>
              <span className="upload-zone__size-pill">
                {formatSize(currentFile.size)}
              </span>
            </div>
            <div className="upload-zone__filename" title={currentFile.name}>
              {currentFile.name}
            </div>
            <button
              className="upload-zone__replace-btn"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <MaterialIcon name="cached" size={12} />
              Replace Photo
            </button>
          </div>
        </div>
      ) : (
        <div className="upload-zone__prompt">
          <div className="upload-zone__graphics">
            <div className="upload-zone__circle-glow" />
            <div className="upload-zone__icon-box">
              <MaterialIcon name="cloud_upload" size={24} className="upload-zone__icon" />
            </div>
          </div>
          <div className="upload-zone__heading">
            Drag & drop your portrait here
          </div>
          <div className="upload-zone__subheading">
            or <span className="upload-zone__link-text">browse files</span>
          </div>
          <div className="upload-zone__info">
            <span className="upload-zone__info-item">PNG, JPEG, WebP</span>
            <span className="upload-zone__bullet">•</span>
            <span className="upload-zone__info-item">Up to 20MB</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default UploadZone;
