import React, { useState, useEffect } from 'react';
import { ccrSectors } from '../../data/ccrData'; // CCR Sector data

const Footer: React.FC = () => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [showSectorCoords, setShowSectorCoords] = useState(false);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="bg-slate-900 text-slate-400 text-center p-10 mt-12">
      <div className="container mx-auto">
        <p className="mb-1.5 text-slate-300">
          &copy; {currentYear} Quick Commerce Optimization Simulator (CCR Ver.).
        </p>
        <p className="text-xs mb-3">
          Project by Rakshit Monga, Indian Institute of Management Sirmaur. Mentor: Prof. Bhavin Shaha
        </p>
        <div className="mt-4">
          <button
            id="toggleSectorCoords"
            onClick={() => setShowSectorCoords(!showSectorCoords)}
            className="text-slate-400 hover:text-slate-200 text-sm underline hover:no-underline transition-colors"
          >
            {showSectorCoords ? 'Hide' : 'Show'} CCR Sector Coordinates
          </button>
          {showSectorCoords && (
            <div
              id="sectorCoordinatesList"
              className="mt-4 text-xs bg-slate-800 p-4 rounded-lg max-h-36 overflow-y-auto text-left max-w-md mx-auto styled-scrollbar shadow-inner"
            >
              {ccrSectors.length > 0 ? (
                ccrSectors.map((sector) => (
                  <div key={sector.name} className="py-0.5 text-slate-300">
                    {`${sector.name}: ${sector.coords[0].toFixed(4)}, ${sector.coords[1].toFixed(4)}`}
                  </div>
                ))
              ) : (
                <p className="text-slate-500">Loading CCR sector data...</p>
              )}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
