import React, { createContext, useState, useContext, ReactNode, Dispatch, SetStateAction } from 'react';
import { DarkStore, CustomDemandProfile } from '../types'; // We'll define these types soon

interface AppContextType {
  // --- Clustering Data ---
  clusteredDarkStores: DarkStore[];
  setClusteredDarkStores: Dispatch<SetStateAction<DarkStore[]>>;

  // --- Demand Profiles Data ---
  customDemandProfiles: CustomDemandProfile[];
  setCustomDemandProfiles: Dispatch<SetStateAction<CustomDemandProfile[]>>;
  addCustomDemandProfile: (profile: CustomDemandProfile) => void;
  deleteCustomDemandProfile: (profileId: string) => void;
  loadDemandProfilesFromSession: () => void; // To replace sessionStorage logic

  // --- Scenario Analysis Data ---
  // You might want to manage saved scenarios here as well if not using localStorage directly in the component
  // savedScenarios: Scenario[];
  // setSavedScenarios: Dispatch<SetStateAction<Scenario[]>>;

  // --- Potentially other global settings or states ---
  geminiApiKey: string; // Storing the API key here
  setGeminiApiKey: Dispatch<SetStateAction<string>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Define your initial API key here or load from an environment variable if preferred
const INITIAL_GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE"; // IMPORTANT: Replace with your actual key or use env vars

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [clusteredDarkStores, setClusteredDarkStores] = useState<DarkStore[]>([]);
  const [customDemandProfiles, setCustomDemandProfiles] = useState<CustomDemandProfile[]>([]);
  const [geminiApiKey, setGeminiApiKey] = useState<string>(INITIAL_GEMINI_API_KEY);

  const CUSTOM_DEMAND_PROFILE_STORAGE_KEY = 'qcomCustomDemandProfiles_v3_ccr1_react';

  const loadDemandProfilesFromSession = () => {
    const storedProfiles = sessionStorage.getItem(CUSTOM_DEMAND_PROFILE_STORAGE_KEY);
    if (storedProfiles) {
      try {
        setCustomDemandProfiles(JSON.parse(storedProfiles));
      } catch (e) {
        console.error("Error parsing demand profiles from session storage", e);
        setCustomDemandProfiles([]);
      }
    }
  };

  const saveDemandProfilesToSession = (profiles: CustomDemandProfile[]) => {
    sessionStorage.setItem(CUSTOM_DEMAND_PROFILE_STORAGE_KEY, JSON.stringify(profiles));
  };

  const addCustomDemandProfile = (profile: CustomDemandProfile) => {
    setCustomDemandProfiles(prevProfiles => {
      const updatedProfiles = [...prevProfiles, profile];
      saveDemandProfilesToSession(updatedProfiles);
      return updatedProfiles;
    });
  };

  const deleteCustomDemandProfile = (profileId: string) => {
    setCustomDemandProfiles(prevProfiles => {
      const updatedProfiles = prevProfiles.filter(p => p.id !== profileId);
      saveDemandProfilesToSession(updatedProfiles);
      return updatedProfiles;
    });
  };


  return (
    <AppContext.Provider value={{
      clusteredDarkStores,
      setClusteredDarkStores,
      customDemandProfiles,
      setCustomDemandProfiles,
      addCustomDemandProfile,
      deleteCustomDemandProfile,
      loadDemandProfilesFromSession,
      geminiApiKey,
      setGeminiApiKey,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
