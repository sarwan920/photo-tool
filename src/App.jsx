import { useState, useCallback, useRef } from 'react';
import { Camera, Shield, Zap, Globe } from 'lucide-react';
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
        'Processing failed. Please try a different photo or check the console for details.'
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
      {/* Header */}
      <header className="header">
        <div className="header__badge">
          <Camera size={14} />
          Visa Photo Tool
        </div>
        <h1 className="header__title">
          Perfect Visa Photos,
          <br />
          In Seconds
        </h1>
        <p className="header__subtitle">
          Upload your photo, choose a country, and get a print-ready visa photo
          with a white background — all processed in your browser.
        </p>
      </header>

      {/* Features Strip */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 'var(--space-xl)',
          marginBottom: 'var(--space-2xl)',
          flexWrap: 'wrap',
        }}
      >
        {[
          { icon: Shield, text: '100% Private' },
          { icon: Zap, text: 'Instant Processing' },
          { icon: Globe, text: '15+ Countries' },
        ].map(({ icon: Icon, text }) => (
          <div
            key={text}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            <Icon size={16} style={{ color: 'var(--color-accent-light)' }} />
            {text}
          </div>
        ))}
      </div>

      {/* Main Workflow */}
      {!result ? (
        <div className="workflow">
          {/* Step 1: Upload */}
          <section className="workflow__step glass-card fade-in-up">
            <div className="workflow__step-header">
              <div
                className={`workflow__step-number ${
                  file ? 'workflow__step-number--completed' : ''
                }`}
              >
                {file ? '✓' : '1'}
              </div>
              <div>
                <h2 className="workflow__step-title">Upload Your Photo</h2>
                <p className="workflow__step-desc">
                  Choose a clear, front-facing photo with good lighting
                </p>
              </div>
            </div>
            <UploadZone
              onFileSelect={handleFileSelect}
              currentFile={file}
              previewUrl={filePreviewUrl}
            />
          </section>

          {/* Step 2: Select Country */}
          <section className="workflow__step glass-card fade-in-up fade-in-up--delay-1">
            <div className="workflow__step-header">
              <div
                className={`workflow__step-number ${
                  selectedSpec ? 'workflow__step-number--completed' : ''
                }`}
              >
                {selectedSpec ? '✓' : '2'}
              </div>
              <div>
                <h2 className="workflow__step-title">Choose Visa Type</h2>
                <p className="workflow__step-desc">
                  Select your destination country for the correct photo
                  dimensions
                </p>
              </div>
            </div>
            <CountrySelector
              selectedSpec={selectedSpec}
              onSelect={handleSpecSelect}
            />
          </section>

          {/* Step 3: Process */}
          <section className="workflow__step fade-in-up fade-in-up--delay-2">
            {processing ? (
              <div className="glass-card">
                <ProgressSteps currentStep={processingStep} />
                <div className="processing-status">
                  <div className="processing-status__spinner" />
                  <div className="processing-status__text">
                    {processingMessage}
                  </div>
                  <div className="processing-status__detail">
                    Our server is processing your photo with AI...
                  </div>
                </div>
              </div>
            ) : (
              <button
                className="process-btn"
                disabled={!canProcess}
                onClick={handleProcess}
                id="process-btn"
              >
                <Zap size={20} />
                {canProcess
                  ? 'Process Photo'
                  : !file
                  ? 'Upload a photo first'
                  : 'Select a country first'}
              </button>
            )}
          </section>

          {/* Error */}
          {error && (
            <div
              className="glass-card fade-in-up"
              style={{
                borderColor: 'var(--color-error)',
                textAlign: 'center',
                color: 'var(--color-error)',
              }}
            >
              {error}
            </div>
          )}
        </div>
      ) : (
        /* Result */
        <div className="glass-card">
          <div className="workflow__step-header" style={{ marginBottom: 'var(--space-xl)' }}>
            <div className="workflow__step-number workflow__step-number--completed">
              ✓
            </div>
            <div>
              <h2 className="workflow__step-title">Your Visa Photo is Ready</h2>
              <p className="workflow__step-desc">
                Download in PNG or JPEG format — print-ready at 300 DPI
              </p>
            </div>
          </div>
          <ResultPreview
            result={result}
            originalPreviewUrl={filePreviewUrl}
            onReset={handleReset}
          />
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <p>
          Built with <span className="footer__highlight">♥</span> — All
          processing happens locally in your browser.
          <br />
          Your photos <span className="footer__highlight">never leave your device</span>.
        </p>
      </footer>
    </div>
  );
}

export default App;
