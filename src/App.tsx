import React, { useState, useEffect } from 'react';
import Header from './components/common/Header';
import Footer from './components/common/Footer';
import HomeSection from './components/sections/HomeSection';
import ClusteringSection from './components/sections/ClusteringSection';
import DemandProfilesSection from './components/sections/DemandProfilesSection';
import SimulationSection from './components/sections/SimulationSection';
import WorkforceOptimizationSection from './components/sections/WorkforceOptimizationSection';
import ScenarioAnalysisSection from './components/sections/ScenarioAnalysisSection';
import Modal from './components/common/Modal'; // Assuming you have a Modal component
import { useModal } from './contexts/ModalContext'; // You'll need to create this context

// Define the available sections/pages
type SectionId = 'home' | 'clustering' | 'demand-profiles' | 'simulation' | 'workforce-opt' | 'scenario-analysis';

const App: React.FC = () => {
  const [activeSection, setActiveSection] = useState<SectionId>('home');
  const { modalConfig } = useModal(); // Use the modal context

  // Handle hash changes for navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as SectionId;
      if (hash) {
        setActiveSection(hash);
      } else {
        setActiveSection('home'); // Default to home if no hash
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Initial check

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const renderSection = () => {
    switch (activeSection) {
      case 'home':
        return <HomeSection />;
      case 'clustering':
        return <ClusteringSection />;
      case 'demand-profiles':
        return <DemandProfilesSection />;
      case 'simulation':
        return <SimulationSection />;
      case 'workforce-opt':
        return <WorkforceOptimizationSection />;
      case 'scenario-analysis':
        return <ScenarioAnalysisSection />;
      default:
        return <HomeSection />;
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header activeSection={activeSection} setActiveSection={setActiveSection} />
      <main className="container mx-auto p-4 sm:p-6 lg:p-8 mt-6 flex-grow">
        {renderSection()}
      </main>
      <Footer />
      {modalConfig.isOpen && (
        <Modal
          title={modalConfig.title}
          message={modalConfig.message}
          onOk={modalConfig.onOk}
          onClose={modalConfig.onClose} // Ensure Modal component can handle onClose directly or via onOk
        />
      )}
    </div>
  );
};

export default App;
