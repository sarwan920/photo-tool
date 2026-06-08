import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import visaSpecs, { regions } from '../data/visaSpecs';

function CountrySelector({ selectedSpec, onSelect }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSpecs = useMemo(() => {
    if (!searchQuery.trim()) return visaSpecs;
    const q = searchQuery.toLowerCase();
    return visaSpecs.filter(
      (s) =>
        s.country.toLowerCase().includes(q) ||
        s.region.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const groupedSpecs = useMemo(() => {
    const groups = {};
    filteredSpecs.forEach((spec) => {
      if (!groups[spec.region]) groups[spec.region] = [];
      groups[spec.region].push(spec);
    });
    return groups;
  }, [filteredSpecs]);

  return (
    <div className="country-selector" id="country-selector">
      <div className="country-selector__search">
        <Search size={18} className="country-selector__search-icon" />
        <input
          type="text"
          className="country-selector__search-input"
          placeholder="Search country or region..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          id="country-search-input"
        />
      </div>

      <div className="country-selector__grid">
        {Object.entries(groupedSpecs).map(([region, specs]) =>
          specs.map((spec) => (
            <div
              key={spec.id}
              className={`country-card ${
                selectedSpec?.id === spec.id ? 'country-card--selected' : ''
              }`}
              onClick={() => onSelect(spec)}
              id={`country-${spec.id}`}
            >
              <span className="country-card__flag">{spec.flag}</span>
              <div className="country-card__info">
                <div className="country-card__name">{spec.country}</div>
                <div className="country-card__size">
                  {spec.widthMm}×{spec.heightMm} mm • {spec.type}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedSpec && (
        <div className="spec-badge fade-in-up">
          <div>
            <div className="spec-badge__label">Selected Format</div>
            <div className="spec-badge__value">
              {selectedSpec.flag} {selectedSpec.country} — {selectedSpec.type}
            </div>
          </div>
          <div>
            <div className="spec-badge__label">Dimensions</div>
            <div className="spec-badge__value">
              {selectedSpec.widthMm}×{selectedSpec.heightMm} mm ({selectedSpec.widthPx}×{selectedSpec.heightPx} px)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CountrySelector;
