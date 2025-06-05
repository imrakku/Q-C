import { GeoJsonPolygon, Sector, LatLngTuple } from '../types';

// Chandigarh Capital Region (CCR) GeoJSON Polygon
// Simplified bounding box for CCR as in the original script.
// A more detailed CCR polygon would be ideal but this is an approximation.
export const ccrGeoJsonPolygon: GeoJsonPolygon = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [[
      [76.6500, 30.8500], [76.9000, 30.8500],
      [76.9000, 30.6000], [76.6500, 30.6000],
      [76.6500, 30.8500]
    ]]
  }
};

// Original Chandigarh polygon (for reference or if needed separately)
export const chandigarhGeoJsonPolygon_Original: GeoJsonPolygon = {
    type: "Feature",
    properties: {},
    geometry: {
        type: "Polygon",
        coordinates: [[
            [76.7077,30.7858],[76.7277,30.7908],[76.7477,30.7878],[76.7702,30.7905],
            [76.7928,30.7737],[76.8204,30.7664],[76.8371,30.7404],[76.8343,30.7193],
            [76.8061,30.7002],[76.7796,30.6986],[76.7524,30.7070],[76.7187,30.7317],
            [76.7042,30.7541],[76.7077,30.7858]
        ]]
    }
};


// CCR Sector Coordinates (including Chandigarh, Mohali, Panchkula, Zirakpur)
export const ccrSectors: Sector[] = [
  // Chandigarh
  { name: "Sector 1", coords: [30.7497, 76.7939] },
  { name: "Sector 7", coords: [30.7452, 76.7852] },
  { name: "Sector 8", coords: [30.742, 76.7805] },
  { name: "Sector 9", coords: [30.7387, 76.7758] },
  { name: "Sector 10", coords: [30.7355, 76.7711] },
  { name: "Sector 11", coords: [30.7322, 76.7664] },
  { name: "Sector 17 (City Center)", coords: [30.74, 76.778] },
  { name: "Sector 22 (ISBT)", coords: [30.735, 76.77] },
  { name: "Sector 26 (Grain Mkt)", coords: [30.737, 76.8] },
  { name: "Sector 32 (GMCH)", coords: [30.715, 76.775] },
  { name: "Sector 34 (Comp. Mkt)", coords: [30.729, 76.781] },
  { name: "Sector 35", coords: [30.736, 76.784] },
  { name: "Sector 43 (ISBT)", coords: [30.725, 76.76] },
  { name: "Industrial Area Ph 1", coords: [30.715, 76.815] },
  { name: "Manimajra", coords: [30.73, 76.83] },
  // Mohali
  { name: "Mohali Phase 3B2", coords: [30.708, 76.720] },
  { name: "Mohali Phase 7", coords: [30.705, 76.715] },
  { name: "Mohali Sector 70", coords: [30.702, 76.730] },
  { name: "Mohali IT Park (Sec 66/82)", coords: [30.685, 76.735] },
  // Panchkula
  { name: "Panchkula Sector 5", coords: [30.692, 76.855] },
  { name: "Panchkula Sector 11", coords: [30.705, 76.850] },
  { name: "Panchkula Ind. Area Ph 1", coords: [30.715, 76.860] },
  // Zirakpur
  { name: "Zirakpur VIP Road", coords: [30.647, 76.825] },
  { name: "Zirakpur Patiala Chowk", coords: [30.630, 76.815] },
  // New Chandigarh
  { name: "New Chandigarh/Mullanpur", coords: [30.790, 76.700] } // Simplified name
];

// Default Dark Store Location for Simulation (Central Chandigarh)
export const defaultDarkStoreLocationSim: LatLngTuple = [30.7333, 76.7794];

// Default Map Zoom Level for CCR
export const DEFAULT_MAP_ZOOM_CCR = 11;
export const DEFAULT_MAP_CENTER_CCR: LatLngTuple = [30.7333, 76.7794]; // Chandigarh city center approx.

// Simulation Constants
export const SIMULATION_STEP_INTERVAL_MS = 800;
export const MINUTES_PER_SIMULATION_STEP = 5;
export const DYNAMIC_TRAFFIC_UPDATE_INTERVAL_STEPS = 12; // Number of steps, not minutes

// Storage Keys
export const SCENARIO_STORAGE_KEY = 'qcomSimScenarios_v3_ccr1_react';
// CUSTOM_DEMAND_PROFILE_STORAGE_KEY is managed in AppContext

// Workforce Optimization Constants
export const MIN_DELIVERY_COMPLETION_RATE_TARGET = 0.90;
export const TARGET_SLA_PERCENTAGE_TARGET = 0.85; // % of orders meeting delivery time target
export const IDEAL_AGENT_UTILIZATION_MIN_PERCENT = 0.65 * 100;
export const IDEAL_AGENT_UTILIZATION_MAX_PERCENT = 0.85 * 100;
export const BASE_HANDLING_TIME_MIN_OPT = 5; // Minutes for pickup/dropoff in opt. sim
export const AGENT_COST_PER_HOUR = 150; // INR
export const COST_PER_KM_TRAVEL = 5; // INR

// Default Hotspot Centers for Clustering (can be expanded)
export const ccrHotspotCenters: LatLngTuple[] = [
    [30.7400, 76.7780], // Sector 17, Chd
    [30.705, 76.715],   // Mohali Phase 7
    [30.692, 76.855],   // Panchkula Sector 5
    [30.647, 76.825],   // Zirakpur VIP Road
    [30.715, 76.815]    // Chd Ind. Area
];

// Tailwind Colors (if needed in JS/TS, though usually accessed via classes)
// This is more for direct JS manipulation if necessary (e.g., dynamic chart colors not from classes)
export const twColors = {
  slate: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
  neutral: { 800: '#262626', 900: '#171717'},
  blue: { 500: '#3b82f6', 700: '#1d4ed8'}, // For agent icons
  orange: { 500: '#f97316', 700: '#c2410c'}, // For busy agent icons
  purple: { 500: '#a855f7', 700: '#7e22ce'}, // For order icons
  green: {600: '#16a34a', 700: '#15803d', 400: '#4ade80'},
  yellow: {500: '#eab308', 600: '#ca8a04', 300: '#fde047'},
  red: { 400: '#f87171', 500: '#ef4444' }, // For errors or critical logs
  sky: { 400: '#38bdf8' }, // For order logs
  amber: { 400: '#facc15' }, // For assign logs
  teal: {400: '#2dd4bf'} // For AI logs
};
