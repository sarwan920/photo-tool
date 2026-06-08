import { useState, useMemo } from 'react';
import visaSpecs from '../data/visaSpecs';
import MaterialIcon from './MaterialIcon';

function CountrySelector({ selectedSpec, onSelect }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('All');

  const tabs = ['All', 'Americas', 'Europe', 'Asia', 'Other'];

  const filteredSpecs = useMemo(() => {
    let specs = visaSpecs;

    // Filter by Tab
    if (activeTab !== 'All') {
      if (activeTab === 'Other') {
        specs = visaSpecs.filter(
          (s) => !['Americas', 'Europe', 'Asia'].includes(s.region)
        );
      } else {
        specs = visaSpecs.filter((s) => s.region === activeTab);
      }
    }

    // Filter by Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      specs = specs.filter(
        (s) =>
          s.country.toLowerCase().includes(q) ||
          s.region.toLowerCase().includes(q) ||
          s.type.toLowerCase().includes(q)
      );
    }

    return specs;
  }, [searchQuery, activeTab]);

  return (
    <div className="country-selector">
      {/* Search Input */}
      <div className="country-selector__search">
        <MaterialIcon name="search" size={16} className="country-selector__search-icon" />
        <input
          type="text"
          className="country-selector__search-input"
          placeholder="Search visa destination..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          id="country-search-input"
        />
        {searchQuery && (
          <button
            className="country-selector__search-clear"
            onClick={() => setSearchQuery('')}
          >
            <MaterialIcon name="close" size={14} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="country-selector__tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`country-selector__tab-btn ${
              activeTab === tab ? 'country-selector__tab-btn--active' : ''
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="country-selector__grid">
        {filteredSpecs.length > 0 ? (
          filteredSpecs.map((spec) => {
            const isSelected = selectedSpec?.id === spec.id;
            return (
              <div
                key={spec.id}
                className={`country-card ${
                  isSelected ? 'country-card--selected' : ''
                }`}
                onClick={() => onSelect(spec)}
                id={`country-${spec.id}`}
              >
                <div className="country-card__header">
                  <span className="country-card__flag">{spec.flag}</span>
                  {isSelected && (
                    <span className="country-card__check">
                      <MaterialIcon name="check" size={8} style={{ color: 'white', fontWeight: 'bold' }} />
                    </span>
                  )}
                </div>
                <div className="country-card__name">{spec.country}</div>
                <div className="country-card__details">
                  {spec.widthMm} × {spec.heightMm} mm
                </div>
              </div>
            );
          })
        ) : (
          <div className="country-selector__no-results">
            No specifications found matching "{searchQuery}"
          </div>
        )}
      </div>
    </div>
  );
}

export default CountrySelector;
