// --- General Types ---
export interface LatLng {
  lat: number;
  lng: number;
}

export type LngLat = [number, number]; // For d3-delaunay which often uses [lng, lat]

export interface GeoJsonPolygon {
  type: "Feature";
  properties: object;
  geometry: {
    type: "Polygon";
    coordinates: LngLat[][]; // Array of LinearRings, first is exterior, others are holes
  };
}

export interface Sector {
  name: string;
  coords: LatLngTuple; // [lat, lng]
}

export type LatLngTuple = [number, number];


// --- Clustering Types ---
export interface DemandPoint extends LatLng {}

export interface DarkStore {
  name: string;
  coords: LatLngTuple; // [lat, lng] for Leaflet
  assignedOrders: number;
  points: DemandPoint[]; // The demand points assigned to this dark store
  // For Voronoi display with d3, you might convert coords to [lng, lat]
}


// --- Demand Profile Types ---
export type ZoneType = 'uniform_ccr' | 'hotspot' | 'sector' | 'route';

export interface BaseDemandZone {
  id: string; // Unique ID for the zone within the profile
  type: ZoneType;
  description: string; // For AI suggestions
  minOrders: number; // Min orders per hour
  maxOrders: number; // Max orders per hour
  startTime: number; // 0-23 hr
  endTime: number;   // 0-23 hr
}

export interface UniformDemandZone extends BaseDemandZone {
  type: 'uniform_ccr';
}

export interface HotspotDemandZone extends BaseDemandZone {
  type: 'hotspot';
  center: LatLngTuple;
  radius: number; // in km
}

export interface SectorDemandZone extends BaseDemandZone {
  type: 'sector';
  sectors: string[]; // Names of selected CCR sectors
}

export interface RouteDemandZone extends BaseDemandZone {
  type: 'route';
  routePath: LatLngTuple[]; // Array of [lat, lng] points
  buffer: number; // in km
}

export type DemandZone = UniformDemandZone | HotspotDemandZone | SectorDemandZone | RouteDemandZone;

export interface CustomDemandProfile {
  id: string; // Unique ID for the profile (e.g., custom_timestamp)
  name: string;
  zones: DemandZone[];
}


// --- Simulation Types ---
export type AgentStatus = 'available' | 'to_store' | 'at_store' | 'to_customer' | 'busy'; // 'busy' for opt. sim
export type OrderStatus = 'pending' | 'assigned' | 'picked_up' | 'delivered' | 'cancelled';

export interface Agent {
  id: string;
  lat: number;
  lng: number;
  status: AgentStatus;
  currentOrder: string | null; // Order ID
  routePath: LatLng[]; // For Leaflet LatLng objects or similar structure
  legProgress: number; // 0 to 1 for current leg
  currentLegIndex: number;
  fatigueFactor: number; // 0.5 to 1.0
  consecutiveDeliveriesSinceRest: number;
  timeContinuouslyActive: number; // in simulation minutes
  totalDistance: number; // km
  deliveriesCompleted: number;
  timeSpentIdle: number;
  timeSpentDelivering: number;
  timeSpentAtStore: number;
  marker?: L.Marker | L.DivIcon; // Leaflet marker instance (optional, managed by map util)
  availableAtTime?: number; // For simplified optimization simulation
  totalActiveTimeThisRun?: number; // For simplified optimization simulation
  distanceThisRun?: number; // For simplified optimization simulation
}

export interface Order {
  id: string;
  lat: number;
  lng: number;
  timePlaced: number; // Simulation minutes
  status: OrderStatus;
  assignedAgentId: string | null;
  storeArrivalTime: number | null;
  customerArrivalTime: number | null;
  deliveryTime: number | null; // in simulation minutes
  marker?: L.Marker | L.DivIcon; // Leaflet marker instance (optional)
}

export interface SimulationState {
  isRunning: boolean;
  agents: Agent[];
  orders: Order[];
  orderIdCounter: number;
  agentIdCounter: number;
  currentOrderGenerationProbability: number; // Example, might be more complex
  uniformOrderRadiusKm: number;
  baseTrafficFactor: number;
  currentDynamicTrafficFactor: number;
  enableDynamicTraffic: boolean;
  enableHeatmap: boolean;
  totalOrdersGenerated: number;
  totalOrdersDelivered: number;
  totalDeliveryTime: number; // Sum of all delivery times
  totalAgentTravelDistance: number;
  totalAgentActiveTime: number; // Sum of agent active times for utilization
  lastAiAnalysisRequestTime: number;
  aiAnalysisCooldownMs: number;
  lastDynamicEventSuggestionTime: number;
  dynamicEventCooldownMs: number;
  // Potentially dark store location(s) for the current simulation
  darkStoreLocations?: LatLngTuple[];
}

export interface SimulationParams {
  numAgents: number;
  agentSpeed: number;
  orderGenerationProfile: string; // ID or name
  baseTrafficFactor: number;
  enableDynamicTraffic: boolean;
  simulationDurationRun: number; // For scenario comparison
  // Add other relevant parameters
}

export interface SimulationStats {
  totalOrdersGenerated: number;
  totalOrdersDelivered: number;
  averageDeliveryTimeMin: number;
  totalAgentTravelDistanceKm: number;
  averageAgentUtilizationPercent: number;
  // Add other relevant stats
}

export interface HeatmapDataPoint {
    lat: number;
    lng: number;
    count: number; // Or value
}

export interface HeatmapDataset {
    max: number;
    data: HeatmapDataPoint[];
}


// --- Workforce Optimization Types ---
export interface OptimizationIterationResult {
  numAgents: number;
  avgDeliveredOrders: number;
  avgDeliveryTime: number;
  avgAgentUtilization: number;
  avgTravelDistanceKm: number;
  percentageMeetingSLA: number;
  completionRate: number;
  avgCostPerOrder: number;
}

export interface SimplifiedSimRunStats {
  deliveredOrders: number;
  totalDeliveryTime: number;
  avgUtilization: number;
  ordersMeetingSLA: number;
  generatedOrders: number;
  totalDistanceKm: number;
}


// --- Scenario Analysis Types ---
export interface Scenario {
  id: string;
  name: string;
  timestamp: string; // Date().toLocaleString()
  parameters: SimulationParams;
  statistics: SimulationStats;
}

// --- Chart.js related types (basic examples) ---
export interface ChartDataset {
  label: string;
  data: number[];
  borderColor?: string | string[];
  backgroundColor?: string | string[];
  tension?: number;
  fill?: boolean;
  pointRadius?: number;
  pointHoverRadius?: number;
  barThickness?: number;
  spanGaps?: boolean;
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}


// --- API Response Types ---
// For Gemini API (Text Generation)
export interface GeminiTextPart {
  text: string;
}
export interface GeminiContent {
  parts: GeminiTextPart[];
  role: string;
}
export interface GeminiCandidate {
  content: GeminiContent;
  // other fields like finishReason, safetyRatings, etc.
}
export interface GeminiTextResponse {
  candidates?: GeminiCandidate[];
  // promptFeedback might also be present
}

// For structured JSON response from Gemini
export interface GeminiJsonSchema {
    type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN";
    properties?: Record<string, GeminiJsonSchema>;
    items?: GeminiJsonSchema;
    required?: string[];
    description?: string;
    format?: string;
    enum?: any[];
    // Add other schema properties as needed
}

export interface GeminiGenerationConfig {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
    responseMimeType?: "text/plain" | "application/json";
    responseSchema?: GeminiJsonSchema;
}

export interface GeminiRequestPayload {
    contents: GeminiContent[];
    generationConfig?: GeminiGenerationConfig;
    // safetySettings?: SafetySetting[];
    // tools?: Tool[];
}

