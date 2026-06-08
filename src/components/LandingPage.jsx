import React from 'react';
import MaterialIcon from './MaterialIcon';

export default function LandingPage({ onStart }) {
  // Common passport/visa specs to show in gallery
  const featuredSpecs = [
    { country: 'United States', flag: '🇺🇸', size: '2 x 2 inches', desc: '600x600 px, 50-69% head height' },
    { country: 'Schengen / EU', flag: '🇪🇺', size: '35 x 45 mm', desc: 'Close up of head & shoulders, 70-80% head' },
    { country: 'United Kingdom', flag: '🇬🇧', size: '35 x 45 mm', desc: 'Standard passport, cream/light gray BG' },
    { country: 'Canada', flag: '🇨🇦', size: '50 x 70 mm', desc: 'Passport size, crown to chin 31-36mm' },
    { country: 'China', flag: '🇨🇳', size: '33 x 48 mm', desc: 'Visa standard, white BG, head width 15-22mm' },
    { country: 'India', flag: '🇮🇳', size: '2 x 2 inches', desc: '51x51 mm, white/off-white background' },
    { country: 'Japan', flag: '🇯🇵', size: '35 x 45 mm', desc: 'Visa standard, solid off-white background' },
    { country: 'Australia', flag: '🇦🇺', size: '35 x 45 mm', desc: 'Passport size, high resolution print' },
  ];

  return (
    <div className="landing-container fade-in-up">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero__badge-container">
          <div className="hero__badge">
            <MaterialIcon name="auto_awesome" size={13} style={{ marginRight: '4px' }} />
            AI-Powered Processing
          </div>
          <div className="hero__badge hero__badge--success">
            <MaterialIcon name="verified_user" size={13} style={{ marginRight: '4px' }} />
            100% Free & Unlimited
          </div>
        </div>
        
        <h1 className="hero__title">
          Your Official Visa Photos, <span className="text-gradient">Instantly Compliant</span>.
        </h1>
        
        <p className="hero__subtitle">
          Crop, resize, and remove backgrounds automatically. Match exact specifications for US, Schengen, UK, and 15+ countries.
        </p>

        <div className="hero__ctas">
          <button className="hero__cta-primary" onClick={onStart}>
            Process Your Photo Now
            <MaterialIcon name="arrow_forward" size={16} style={{ marginLeft: '4px' }} />
          </button>
          <a href="#supported-countries" className="hero__cta-secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Supported Specs
          </a>
        </div>

        <div className="hero__trust-strip">
          <div className="hero__trust-item">
            <MaterialIcon name="check" size={14} className="hero__trust-icon" style={{ color: 'var(--color-success)', marginRight: '2px' }} />
            <span>100% Free</span>
          </div>
          <div className="hero__trust-item">
            <MaterialIcon name="check" size={14} className="hero__trust-icon" style={{ color: 'var(--color-success)', marginRight: '2px' }} />
            <span>Zero Server Storage</span>
          </div>
          <div className="hero__trust-item">
            <MaterialIcon name="check" size={14} className="hero__trust-icon" style={{ color: 'var(--color-success)', marginRight: '2px' }} />
            <span>ICAO Compliant</span>
          </div>
        </div>

        {/* Hero Showcase Mockup */}
        <div className="hero-showcase">
          <div className="hero-showcase__bar">
            <div className="hero-showcase__dot" style={{ backgroundColor: '#f87171' }} />
            <div className="hero-showcase__dot" style={{ backgroundColor: '#fbbf24' }} />
            <div className="hero-showcase__dot" style={{ backgroundColor: '#34d399' }} />
          </div>
          <div className="hero-showcase__content">
            <div className="visual-pipeline">
              {/* Left Side: Before */}
              <div className="pipeline-card">
                <span className="pipeline-card__label">Original Upload</span>
                <div className="pipeline-card__media">
                  {/* Styled avatar silhouette with busy room background representation */}
                  <div style={{
                    width: '100%',
                    height: '100%',
                    background: 'radial-gradient(circle at 50% 120%, #cbd5e1 0%, #94a3b8 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}>
                    {/* Busy Background elements */}
                    <div style={{ position: 'absolute', top: '20px', left: '20px', width: '30px', height: '40px', background: '#e2e8f0', borderRadius: '4px', opacity: 0.6 }} />
                    <div style={{ position: 'absolute', top: '40px', right: '15px', width: '20px', height: '50px', background: '#cbd5e1', borderRadius: '2px', opacity: 0.5 }} />
                    
                    {/* Head & shoulders silhouette */}
                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#64748b', marginBottom: '8px', border: '2px solid white', zIndex: 1 }} />
                    <div style={{ width: '100px', height: '50px', borderRadius: '30px 30px 0 0', background: '#475569', zIndex: 1 }} />
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="pipeline-arrow">
                <MaterialIcon name="arrow_forward" size={24} />
              </div>

              {/* Right Side: After */}
              <div className="pipeline-card">
                <span className="pipeline-card__label">Processed Result</span>
                <div className="pipeline-card__media" style={{ backgroundColor: '#ffffff' }}>
                  {/* Styled avatar silhouette with pure white background and face box */}
                  <div style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}>
                    {/* compliance face guidelines */}
                    <div style={{
                      position: 'absolute',
                      top: '25px',
                      width: '74px',
                      height: '74px',
                      border: '1px dashed #16a34a',
                      borderRadius: '50%'
                    }} />
                    {/* crop boundary box */}
                    <div style={{
                      position: 'absolute',
                      inset: '10px',
                      border: '1px solid #2563eb',
                      opacity: 0.3
                    }} />
                    
                    {/* Head & shoulders silhouette */}
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#0f172a', marginBottom: '8px', zIndex: 1 }} />
                    <div style={{ width: '90px', height: '45px', borderRadius: '25px 25px 0 0', background: '#1e293b', zIndex: 1 }} />
                    
                    {/* success badge */}
                    <div style={{
                      position: 'absolute',
                      bottom: '12px',
                      right: '12px',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: '#16a34a',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '9px',
                      fontWeight: 'bold'
                    }}>✓</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust & Privacy Features Grid */}
      <section className="landing-section">
        <div className="landing-section__header">
          <span className="landing-section__badge">Privacy First</span>
          <h2 className="landing-section__title">100% Free. Completely Private.</h2>
          <p className="landing-section__subtitle">
            Most online tools charge or save your photos. We do neither.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-item">
            <div className="feature-item__icon-box">
              <MaterialIcon name="lock" size={18} />
            </div>
            <h3 className="feature-item__title">Zero Server Storage</h3>
            <p className="feature-item__desc">
              Your photos are processed temporarily to remove backgrounds and crop. We do not store, save, or track your images. They are deleted instantly after processing.
            </p>
          </div>

          <div className="feature-item">
            <div className="feature-item__icon-box" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>
              <MaterialIcon name="auto_awesome" size={18} />
            </div>
            <h3 className="feature-item__title">100% Free</h3>
            <p className="feature-item__desc">
              No hidden fees, no subscriptions, and no paywalls to download your print-ready files. Unlimited processing for all document specifications.
            </p>
          </div>

          <div className="feature-item">
            <div className="feature-item__icon-box" style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>
              <MaterialIcon name="memory" size={18} />
            </div>
            <h3 className="feature-item__title">AI-Powered BG Removal</h3>
            <p className="feature-item__desc">
              Runs state-of-the-art segmentation models (U2Net) to separate hair details and clothing seamlessly, leaving a crisp white background.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="landing-section">
        <div className="landing-section__header">
          <span className="landing-section__badge">Workflow</span>
          <h2 className="landing-section__title">How It Works</h2>
          <p className="landing-section__subtitle">
            Get your visa photo in under 10 seconds.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-item" style={{ borderStyle: 'dashed' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--color-text-light)' }}>01</span>
            <h3 className="feature-item__title">Upload Portrait</h3>
            <p className="feature-item__desc">
              Drag and drop any front-facing portrait. Make sure your face is clearly lit and visible.
            </p>
          </div>

          <div className="feature-item" style={{ borderStyle: 'dashed' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--color-text-light)' }}>02</span>
            <h3 className="feature-item__title">Select Country Spec</h3>
            <p className="feature-item__desc">
              Select your destination country. We automatically fetch the exact crop dimensions and head-size guidelines.
            </p>
          </div>

          <div className="feature-item" style={{ borderStyle: 'dashed' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--color-text-light)' }}>03</span>
            <h3 className="feature-item__title">Download Print Ready</h3>
            <p className="feature-item__desc">
              Download your high-resolution 300 DPI PNG or JPEG. Completely formatted and ready for printing or online uploads.
            </p>
          </div>
        </div>
      </section>

      {/* Interactive Supported Countries Specs Grid */}
      <section className="landing-section" id="supported-countries">
        <div className="landing-section__header">
          <span className="landing-section__badge">Global Standards</span>
          <h2 className="landing-section__title">Supported Specifications</h2>
          <p className="landing-section__subtitle">
            We support standard formats covering visas, passports, and identity cards.
          </p>
        </div>

        <div className="specs-gallery">
          {featuredSpecs.map((spec, idx) => (
            <div key={idx} className="spec-gallery-card">
              <div className="spec-gallery-card__header">
                <span className="spec-gallery-card__country">{spec.country}</span>
                <span className="spec-gallery-card__flag">{spec.flag}</span>
              </div>
              <span className="spec-gallery-card__size">{spec.size}</span>
              <div className="spec-gallery-card__list">
                <div className="spec-gallery-card__list-item">
                  <div className="spec-gallery-card__bullet" />
                  <span>{spec.desc}</span>
                </div>
                <div className="spec-gallery-card__list-item">
                  <div className="spec-gallery-card__bullet" />
                  <span>300 DPI Print Meta</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SaaS-Style Pricing Section */}
      <section className="landing-section">
        <div className="pricing-strip">
          <div className="pricing-strip__info">
            <span className="pricing-strip__badge">Personal & Commercial</span>
            <h3 className="pricing-strip__title">Free for Everyone</h3>
            <p className="pricing-strip__desc">
              No watermark, no registrations, no subscriptions. Just load your portrait and get your official visa photo immediately.
            </p>
          </div>
          <div className="pricing-strip__cta">
            <button className="pricing-strip__btn" onClick={onStart}>
              Get Started
            </button>
            <span className="pricing-strip__subtext">No credit card required</span>
          </div>
        </div>
      </section>
    </div>
  );
}
