import { useState, useCallback } from 'react';
import UploadZone from './components/UploadZone';
import CountrySelector from './components/CountrySelector';
import ProgressSteps from './components/ProgressSteps';
import ResultPreview from './components/ResultPreview';
import LandingPage from './components/LandingPage';
import MaterialIcon from './components/MaterialIcon';
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
  const [currentView, setCurrentView] = useState('landing');

  const handleFileSelect = useCallback((selectedFile) => {
    if (selectedFile.size > 20 * 1024 * 1024) {
      setError('File size exceeds 20 MB limit.');
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
        'Processing failed. Make sure your portrait shows a clear face with even lighting.'
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Global Navbar */}
      <nav className="navbar">
        <div className="navbar-container">
          <button className="navbar__brand" onClick={() => setCurrentView('landing')}>
            <div className="navbar__logo">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {/* Outer aperture circle */}
                <circle cx="12" cy="12" r="10" stroke="var(--color-accent)" strokeWidth="1.5" opacity="0.3" />
                {/* Aperture blades */}
                <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-accent)" strokeWidth="1.5" />
                <path d="M22 12a10 10 0 0 1-10 10" stroke="var(--color-accent)" strokeWidth="1.5" />
                <path d="M12 22A10 10 0 0 1 2 12" stroke="var(--color-accent)" strokeWidth="1.5" />
                <path d="M2 12A10 10 0 0 1 12 2" stroke="var(--color-accent)" strokeWidth="1.5" />
                {/* Center lens circle */}
                <circle cx="12" cy="12" r="4.5" fill="var(--color-accent-subtle)" stroke="var(--color-accent)" strokeWidth="1.5" />
                {/* Visa checkmark overlapping lens */}
                <path d="m9.5 12 1.5 1.5 3.5-3.5" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="navbar__title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              VisaPhoto <span style={{ fontWeight: '500', color: 'var(--color-accent)', background: 'var(--color-accent-subtle)', padding: '1px 5px', borderRadius: '4px', fontSize: '0.65rem' }}>FREE</span>
            </span>
          </button>
          
          <div className="navbar__links">
            <button className="navbar__link-btn" onClick={() => setCurrentView('landing')}>
              Product
            </button>
            <button 
              className="navbar__cta-btn" 
              onClick={() => setCurrentView(currentView === 'app' ? 'landing' : 'app')}
            >
              {currentView === 'app' ? 'View Specs' : 'Open Photo Editor'}
            </button>
          </div>
        </div>
      </nav>

      {currentView === 'landing' ? (
        <LandingPage onStart={() => setCurrentView('app')} />
      ) : (
        <div className="app-container fade-in-up">
          {/* Header */}
          <header className="header">
            <div className="header__badge">
              <MaterialIcon name="photo_camera" size={12} style={{ marginRight: '4px' }} />
              Official Visa Photo Utility
            </div>
            <h1 className="header__title">Visa Photo Processor</h1>
            <p className="header__subtitle">
              Crop and resize photos to official international standards. Automatically removes backgrounds and prepares print-ready files.
            </p>
          </header>

          {/* Main Grid */}
          <main className="dashboard-grid">
            {/* Left Column: Input Panel */}
            <div className="control-panel">
              {/* Step 1: Upload */}
              <div className="panel-card panel-section fade-in-up">
                <div className="panel-section__header">
                  <span className="panel-section__title">1. Upload Portrait</span>
                </div>
                <UploadZone
                  onFileSelect={handleFileSelect}
                  currentFile={file}
                  previewUrl={filePreviewUrl}
                />
              </div>

              {/* Step 2: Country Selection */}
              <div className="panel-card panel-section fade-in-up">
                <div className="panel-section__header">
                  <span className="panel-section__title">2. Select Destination</span>
                </div>
                <CountrySelector
                  selectedSpec={selectedSpec}
                  onSelect={handleSpecSelect}
                />
              </div>

              {/* Step 3: Action Button */}
              <div className="fade-in-up">
                {processing ? (
                  <div className="panel-card processing-card">
                    <ProgressSteps currentStep={processingStep} />
                    <div className="processing-status">
                      <div className="processing-status__spinner" />
                      <div className="processing-status__text">{processingMessage}</div>
                      <div className="processing-status__detail">Running segmentations...</div>
                    </div>
                  </div>
                ) : (
                  <button
                    className={`process-action-btn ${canProcess ? 'process-action-btn--active' : ''}`}
                    disabled={!canProcess}
                    onClick={handleProcess}
                    id="process-btn"
                  >
                    <MaterialIcon name="bolt" size={14} style={{ marginRight: '4px' }} />
                    {canProcess
                      ? 'Process Photo'
                      : !file
                      ? 'Please upload a photo first'
                      : 'Please select a destination'}
                  </button>
                )}
              </div>

              {/* Errors */}
              {error && (
                <div className="error-card fade-in-up">
                  <MaterialIcon name="error" size={14} style={{ marginRight: '4px' }} />
                  <div>
                    <div className="error-card__title">Error Processing Image</div>
                    <div className="error-card__desc">{error}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Output / Preview Screen */}
            <div className="preview-panel">
              {!result ? (
                <div className="panel-card preview-sandbox-card fade-in-up">
                  <div className="preview-sandbox-card__header">
                    <div className="preview-sandbox-card__title">
                      <MaterialIcon name="description" size={13} style={{ marginRight: '4px' }} />
                      Live Preview
                    </div>
                    {file && (
                      <span className="live-badge">
                        <span className="live-badge__dot" />
                        Ready
                      </span>
                    )}
                  </div>

                  <div className="preview-sandbox-card__body">
                    {filePreviewUrl ? (
                      <div className="viewfinder-view">
                        <img src={filePreviewUrl} alt="Source Preview" className="viewfinder-view__img" />
                        <div className="viewfinder-overlay" />
                      </div>
                    ) : (
                      <div className="empty-sandbox">
                        <div className="empty-sandbox__graphic">
                          <MaterialIcon name="photo" size={18} />
                        </div>
                        <div className="empty-sandbox__title">No Image Selected</div>
                        <p className="empty-sandbox__desc">
                          Upload a photo to see the original preview here before processing.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Basic compliance hints */}
                  {!file && (
                    <div className="specs-checklist-panel">
                      <div className="specs-checklist-panel__title">Requirements Guide</div>
                      <div className="specs-checklist-grid">
                        <div className="specs-checklist-item">
                          <div className="specs-checklist-item__bullet" />
                          <div>Neutral expression, head straight</div>
                        </div>
                        <div className="specs-checklist-item">
                          <div className="specs-checklist-item__bullet" />
                          <div>Front-facing, eyes open and visible</div>
                        </div>
                        <div className="specs-checklist-item">
                          <div className="specs-checklist-item__bullet" />
                          <div>Even lighting with no harsh shadows</div>
                        </div>
                        <div className="specs-checklist-item">
                          <div className="specs-checklist-item__bullet" />
                          <div>No glasses, headbands, or hats</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Result Dashboard */
                <div className="panel-card fade-in-up">
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
              <MaterialIcon name="shield" size={12} style={{ marginRight: '4px' }} />
              <span>Secure: All operations are automatic. Files are processed locally.</span>
            </div>
            <div className="footer-strip__item">
              <MaterialIcon name="language" size={12} style={{ marginRight: '4px' }} />
              <span>Compliant: Sized to ICAO international visa specifications.</span>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}

export default App;
