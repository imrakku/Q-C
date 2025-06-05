import React from 'react';

type SectionId = 'home' | 'clustering' | 'demand-profiles' | 'simulation' | 'workforce-opt' | 'scenario-analysis';

interface HeaderProps {
  activeSection: SectionId;
  setActiveSection: (sectionId: SectionId) => void;
}

const navItems: { id: SectionId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'clustering', label: 'Clustering' },
  { id: 'demand-profiles', label: 'Demand Profiles' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'workforce-opt', label: 'Workforce Opt.' },
  { id: 'scenario-analysis', label: 'Scenario Analysis' },
];

const Header: React.FC<HeaderProps> = ({ activeSection, setActiveSection }) => {
  const handleNavClick = (sectionId: SectionId) => {
    setActiveSection(sectionId);
    window.location.hash = sectionId; // Update URL hash for direct navigation
  };

  return (
    <header className="bg-slate-900 text-white shadow-xl sticky top-0 z-[60]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Q-Commerce Ops Simulator (CCR)
        </h1>
        <nav className="mt-3 sm:mt-0">
          <ul className="flex flex-wrap justify-center space-x-1.5 sm:space-x-2.5">
            {navItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => handleNavClick(item.id)}
                  className={`nav-link px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors ${
                    activeSection === item.id ? 'active' : ''
                  }`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;
