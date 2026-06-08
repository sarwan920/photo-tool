import { useState, useCallback } from 'react';
import { Camera, Shield, Zap, Globe, Sparkles, Image as ImageIcon, AlertCircle } from 'lucide-react';
import UploadZone from './components/UploadZone';
import CountrySelector from './components/CountrySelector';
import ProgressSteps from './components/ProgressSteps';
import ResultPreview from './components/ResultPreview';
import { processPhoto, createPreviewUrl } from './utils/imageProcessor';

function App() {
  const [file, setFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [selectedSpec, setSelectedSpec] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(null);
  const [processingMessage, setProcessingMessage] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileSelect = useCallback((selectedFile) => {
    if (selectedFile.size > 20 * 1024 * 1024) {
      setError('File is too large. Maximum size is 20 MB.');
      return;
    }
    setFile(selectedFile);
    setFilePreviewUrl(createPreviewUrl(selectedFile));
    setResult(null);
    setError(null);
  }, []);

  const handleSpecSelect = useCallback((spec) => {
    setSelectedSpec(spec);
    setResult(null);
  }, []);

  const handleProcess = useCallback(async () => {
    if (!file || !selectedSpec) return;

    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const result = await processPhoto(file, selectedSpec, (progress) => {
        setProcessingStep(progress.step);
        setProcessingMessage(progress.message);
      });
      setResult(result);
    } catch (err) {
      console.error('Processing failed:', err);
      setError(
        'Processing failed. Please ensure the photo has a clear face in good lighting.'
      );
    } finally {
      setProcessing(false);
      setProcessingStep(null);
    }
  }, [file, selectedSpec]);

  const handleReset = useCallback(() => {
    setFile(null);
    setFilePreviewUrl(null);
    setSelectedSpec(null);
    setResult(null);
    setError(null);
    setProcessing(false);
    setProcessingStep(null);
  }, []);

  const canProcess = file && selectedSpec && !processing;

  return (
    <div className="app-container">
      {/* Background Ambient Glows */}
      <div className="ambient-glow ambient-glow--1" />
      <div className="ambient-glow ambient-glow--2" />

      {/* Brand Header */}
      <header className="header">
        <div className="header__badge">
          <Sparkles size={12} />
          AI Visa Passport Studio
        </div>
        <h1 className="header__title">
          Professional Visa Photos
          <span className="header__title-gradient"> In Seconds</span>
        </h1>
        <p className="header__subtitle">
          An automated compliance processor that removes backgrounds, crops faces to exact international regulations, and writes print-ready 300 DPI metadata.
        </p>
      </header>

      {/* Dashboard Layout */}
      <main className="dashboard-grid">
        {/* Left Column: Controls */}
        <div className="control-panel">
          {/* Section 1: Upload */}
          <div className="glass-card panel-section fade-in-up">
            <div className="panel-section__header">
              <span className="panel-section__number">1</span>
              <div>
                <h2 className="panel-section__title">Upload Portrait</h2>
                <p className="panel-section__desc">Select a front-facing headshot</p>
              </div>
            </div>
            <UploadZone
              onFileSelect={handleFileSelect}
              currentFile={file}
              previewUrl={filePreviewUrl}
            />
          </div>

          {/* Section 2: Visa Specification */}
          <div className="glass-card panel-section fade-in-up fade-in-up--delay-1">
            <div className="panel-section__header">
              <span className="panel-section__number">2</span>
              <div>
                <h2 className="panel-section__title">Select Visa Specs</h2>
                <p className="panel-section__desc">Choose destination photo size</p>
              </div>
            </div>
            <CountrySelector
              selectedSpec={selectedSpec}
              onSelect={handleSpecSelect}
            />
          </div>

          {/* Section 3: Process CTA */}
          <div className="fade-in-up fade-in-up--delay-2">
            {processing ? (
              <div className="glass-card processing-card">
                <ProgressSteps currentStep={processingStep} />
                <div className="processing-status">
                  <div className="processing-status__spinner" />
                  <div className="processing-status__text">{processingMessage}</div>
                  <div className="processing-status__detail">Running facial segmentation models...</div>
                </div>
              </div>
            ) : (
              <button
                className={`process-action-btn ${canProcess ? 'process-action-btn--active' : ''}`}
                disabled={!canProcess}
                onClick={handleProcess}
                id="process-btn"
              >
                <Zap size={18} />
                {canProcess
                  ? 'Process Photo'
                  : !file
                  ? 'Upload a photo to start'
                  : 'Select a destination spec'}
              </button>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="glass-card error-card fade-in-up">
              <AlertCircle size={16} />
              <div>
                <div className="error-card__title">Processing Failed</div>
                <div className="error-card__desc">{error}</div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Sandbox / Live Output */}
        <div className="preview-panel">
          {!result ? (
            <div className="glass-card preview-sandbox-card fade-in-up">
              <div className="preview-sandbox-card__header">
                <div className="preview-sandbox-card__title">
                  <Camera size={14} />
                  Live Sandbox Preview
                </div>
                {file && (
                  <span className="live-badge">
                    <span className="live-badge__dot" />
                    Source Loaded
                  </span>
                )}
              </div>

              <div className="preview-sandbox-card__body">
                {filePreviewUrl ? (
                  <div className="viewfinder-view">
                    <img src={filePreviewUrl} alt="Source Preview" className="viewfinder-view__img" />
                    <div className="viewfinder-overlay">
                      <div className="viewfinder-overlay__grid" />
                      <div className="viewfinder-overlay__guide-circle" />
                      <div className="viewfinder-overlay__guide-shoulders" />
                      <div className="viewfinder-overlay__corner viewfinder-overlay__corner--tl" />
                      <div className="viewfinder-overlay__corner viewfinder-overlay__corner--tr" />
                      <div className="viewfinder-overlay__corner viewfinder-overlay__corner--bl" />
                      <div className="viewfinder-overlay__corner viewfinder-overlay__corner--br" />
                    </div>
                  </div>
                ) : (
                  <div className="empty-sandbox">
                    <div className="empty-sandbox__graphic">
                      <div className="empty-sandbox__circle" />
                      <ImageIcon className="empty-sandbox__icon" size={36} />
                    </div>
                    <div className="empty-sandbox__title">No Image Uploaded</div>
                    <p className="empty-sandbox__desc">
                      Upload a photo in the control panel to see the crop preview and guidelines here.
                    </p>
                  </div>
                )}
              </div>

              {/* Specs Audit Checklist (Only shown in empty/initial state) */}
              {!file && (
                <div className="specs-checklist-panel">
                  <div className="specs-checklist-panel__title">Photo Quality Checklist</div>
                  <div className="specs-checklist-grid">
                    <div className="specs-checklist-item">
                      <div className="specs-checklist-item__bullet" />
                      <div>Neutral expression, eyes open</div>
                    </div>
                    <div className="specs-checklist-item">
                      <div className="specs-checklist-item__bullet" />
                      <div>Even lighting, no shadows</div>
                    </div>
                    <div className="specs-checklist-item">
                      <div className="specs-checklist-item__bullet" />
                      <div>Full face visible, head straight</div>
                    </div>
                    <div className="specs-checklist-item">
                      <div className="specs-checklist-item__bullet" />
                      <div>No glasses, hats, or headwear</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Result Panel */
            <div className="glass-card result-panel-card fade-in-up">
              <ResultPreview
                result={result}
                originalPreviewUrl={filePreviewUrl}
                onReset={handleReset}
              />
            </div>
          )}
        </div>
      </main>

      {/* Footer Info Strip */}
      <footer className="footer-strip">
        <div className="footer-strip__item">
          <Shield size={14} />
          <span>**Privacy Safe**: Processing is secure & automated. No images are permanently stored.</span>
        </div>
        <div className="footer-strip__item">
          <Globe size={14} />
          <span>**Compliance Standard**: Built according to ICAO photo guidelines.</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
