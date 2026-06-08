import { useState, useRef, useCallback } from 'react';
import { Upload, ImagePlus, RefreshCw } from 'lucide-react';

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
      className={`upload-zone ${isDragging ? 'upload-zone--active' : ''}`}
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
        <div className="upload-zone__preview">
          <img
            src={previewUrl}
            alt="Uploaded preview"
            className="upload-zone__preview-img"
          />
          <div className="upload-zone__preview-info">
            <div className="upload-zone__preview-name">{currentFile.name}</div>
            <div className="upload-zone__preview-size">
              {formatSize(currentFile.size)}
            </div>
            <button
              className="upload-zone__change-btn"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              <RefreshCw size={14} />
              Change Photo
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="upload-zone__icon">
            {isDragging ? (
              <ImagePlus size={48} />
            ) : (
              <Upload size={48} />
            )}
          </div>
          <div className="upload-zone__text">
            {isDragging ? 'Drop your photo here' : 'Click or drag a photo to upload'}
          </div>
          <div className="upload-zone__hint">
            Supports JPEG, PNG, WebP • Max 20 MB
          </div>
        </>
      )}
    </div>
  );
}

export default UploadZone;
