import React, { useState, useEffect, useRef, useCallback } from 'react';
import L, { LatLngExpression } from 'leaflet';
import { useAppContext } from '../../contexts/AppContext';
import { useModal } from '../../contexts/ModalContext';
import * as mapUtils from '../../utils/mapUtils';
import * as chartUtils from '../../utils/chartUtils';
import {
  ccrGeoJsonPolygon, DEFAULT_MAP_CENTER_CCR, DEFAULT_MAP_ZOOM_CCR, defaultDarkStoreLocationSim,
  SIMULATION_STEP_INTERVAL_MS, MINUTES_PER_SIMULATION_STEP, DYNAMIC_TRAFFIC_UPDATE_INTERVAL_STEPS,
  ccrSectors, ccrHotspotCenters
} from '../../data/ccrData';
import {
  Agent, Order, SimulationState, LatLngTuple, AgentStatus, OrderStatus,
  HeatmapDataPoint, HeatmapDataset, CustomDemandProfile, SimulationParams, SimulationStats
} from '../../types';
import { createLogEntry, LogEntry, initialSystemLog } from '../../utils/logger';
import { generateUniqueId, formatSimTime, fetchGeminiTextGeneration, arrayToCsv, downloadFile } from '../../utils/helpers';
import LogPanel from '../common/LogPanel';
import Spinner from '../common/Spinner';
import SliderInput from '../common/SliderInput';
// Assuming scenario analysis module will be a separate context or passed via props if needed immediately
// For now, we'll implement a local save scenario which can be enhanced later.
import { SCENARIO_STORAGE_KEY } from '../../data/ccrData'; // For local storage of scenarios
import { Scenario } from '../../types';


// Leaflet Heatmap Overlay global type (if not already declared in vite-env.d.ts or similar)
declare global {
  namespace L { // eslint-disable-line @typescript-eslint/no-namespace
    function heatmapOverlay(options: any): any; // Basic type, can be improved
  }
}


const SimulationSection: React.FC = () => {
  const { customDemandProfiles, geminiApiKey, clusteredDarkStores } = useAppContext();
  const { showModal } = useModal();

  const [simParams, setSimParams] = useState({
    numAgents: 15,
    agentSpeedKmph: 25,
    orderGenProfileId: 'default_uniform_ccr', // Default profile
    baseTrafficFactor: 1.0,
    enableDynamicTraffic: false,
    enableHeatmap: false,
  });

  const initialSimState = useCallback((): SimulationState => ({
    isRunning: false,
    agents: Array(simParams.numAgents).fill(null).map((_, i) => ({
      id: generateUniqueId(`A${i + 1}_`),
      lat: defaultDarkStoreLocationSim[0] + (Math.random() - 0.5) * 0.002,
      lng: defaultDarkStoreLocationSim[1] + (Math.random() - 0.5) * 0.002,
      status: 'available' as AgentStatus,
      currentOrder: null, routePath: [], legProgress: 0, currentLegIndex: 0,
      fatigueFactor: 1.0, consecutiveDeliveriesSinceRest: 0, timeContinuouslyActive: 0,
      totalDistance: 0, deliveriesCompleted: 0,
      timeSpentIdle: 0, timeSpentDelivering: 0, timeSpentAtStore: 0,
    })),
    orders: [],
    orderIdCounter: 0,
    agentIdCounter: simParams.numAgents, // Assuming agent IDs start from 1
    currentSimulationTime: 0,
    currentOrderGenerationProbability: 0.1, // This might be dynamically set by profile
    uniformOrderRadiusKm: 7, // Example, could be a param
    currentDynamicTrafficFactor: 1.0,
    totalOrdersGenerated: 0, totalOrdersDelivered: 0, totalDeliveryTime: 0,
    totalAgentTravelDistance: 0, totalAgentActiveTime: 0,
    lastAiAnalysisRequestTime: 0, aiAnalysisCooldownMs: 60000, // 1 minute
    lastDynamicEventSuggestionTime: 0, dynamicEventCooldownMs: 90000, // 1.5 minutes
    darkStoreLocations: clusteredDarkStores.length > 0 ? clusteredDarkStores.map(ds => ds.coords) : [defaultDarkStoreLocationSim], // Use clustered stores or default
    // ... other state fields from original simState ...
  }), [simParams.numAgents, clusteredDarkStores]);


  const [simState, setSimState] = useState<SimulationState>(initialSimState());
  const [logs, setLogs] = useState<LogEntry[]>([initialSystemLog('start simulation', 'Simulation (CCR)')]);
  const [isSimConfigLocked, setIsSimConfigLocked] = useState(false);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [aiAnalysisOutput, setAiAnalysisOutput] = useState<string | null>(null);
  const [dynamicEventSuggestion, setDynamicEventSuggestion] = useState<string | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  const agentMarkersLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const orderMarkersLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const heatmapLayerRef = useRef<any | null>(null); // Leaflet.HeatmapOverlay instance
  const deliveredOrderDataForHeatmapRef = useRef<HeatmapDataset>({ max: 1, data: [] });

  const simulationIntervalRef = useRef<number | null>(null);
  const mapContainerId = 'simulationMap';

  const pendingOrdersChartRefKey = 'pendingOrdersSimChart';
  const activeAgentsChartRefKey = 'activeAgentsSimChart';


  const addLog = useCallback((message: string, type: LogEntry['type'] = 'SYSTEM', simTime?: string) => {
    setLogs(prevLogs => [...prevLogs, createLogEntry(message, type, simTime)]);
  }, []);

  // Update sim state when params change, but only if not running
  useEffect(() => {
    if (!simState.isRunning) {
        setSimState(initialSimState());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simParams.numAgents, initialSimState]); // Only re-init agents if numAgents changes & not running


  // Initialize Map and Charts
  useEffect(() => {
    if (!mapRef.current && document.getElementById(mapContainerId)) {
      const mapInstance = mapUtils.initializeMap(mapContainerId, DEFAULT_MAP_CENTER_CCR, DEFAULT_MAP_ZOOM_CCR, 'simulationMapKey');
      if (mapInstance) {
        mapRef.current = mapInstance;
        agentMarkersLayerRef.current.addTo(mapInstance);
        orderMarkersLayerRef.current.addTo(mapInstance);

        // Add dark store markers
        (simState.darkStoreLocations || [defaultDarkStoreLocationSim]).forEach((loc, idx) => {
            L.marker(loc, { icon: mapUtils.darkStoreIcon, zIndexOffset:1000 })
             .bindPopup(`<b>Dark Store ${idx + 1}</b>`)
             .addTo(mapInstance);
        });

        L.geoJSON(ccrGeoJsonPolygon as any, { style: { color: mapUtils.twColors.slate[700], weight: 2.5, opacity: 0.7, fillOpacity: 0.05, interactive: false }})
          .addTo(mapInstance);
        addLog('Simulation map initialized.', 'SYSTEM');
      } else { addLog('Failed to initialize simulation map.', 'ERROR'); }
    }

    chartUtils.initializeChart('pendingOrdersChartSim', pendingOrdersChartRefKey, { type: 'line', data: { labels: [], datasets: [chartUtils.createLineDataset('Pending Orders', [])]}});
    chartUtils.initializeChart('activeAgentsChartSim', activeAgentsChartRefKey, { type: 'line', data: { labels: [], datasets: [chartUtils.createLineDataset('Active Agents', [], mapUtils.twColors.slate[400], `rgba(${mapUtils.hexToRgb(mapUtils.twColors.slate[400])},0.1)`)]}});

    return () => { // Cleanup
      if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
      mapUtils.removeMapInstance('simulationMapKey');
      mapRef.current = null;
      chartUtils.destroyChart(pendingOrdersChartRefKey);
      chartUtils.destroyChart(activeAgentsChartRefKey);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog]); // Only on mount/unmount


  // Simulation Step Logic (abstracted into a function)
  const runSimulationStep = useCallback(() => {
    setSimState(prevState => {
      if (!prevState.isRunning) return prevState;

      let newState = { ...prevState, currentSimulationTime: prevState.currentSimulationTime + MINUTES_PER_SIMULATION_STEP };
      const currentSimTimeStr = formatSimTime(newState.currentSimulationTime);

      // 1. Dynamic Traffic Update (if enabled)
      if (simParams.enableDynamicTraffic && (newState.currentSimulationTime / MINUTES_PER_SIMULATION_STEP) % DYNAMIC_TRAFFIC_UPDATE_INTERVAL_STEPS === 0) {
        newState.currentDynamicTrafficFactor = 0.6 + Math.random() * 0.8; // Range 0.6 to 1.4
        addLog(`Dynamic traffic factor updated: ${newState.currentDynamicTrafficFactor.toFixed(2)}`, 'TRAFFIC', currentSimTimeStr);
      }

      // 2. Generate Orders
      const { newOrders, updatedOrderIdCounter, totalGeneratedIncrement } = generateOrdersLogic(
        newState.orderIdCounter,
        simParams.orderGenProfileId,
        newState.currentSimulationTime,
        customDemandProfiles,
        newState.darkStoreLocations || [defaultDarkStoreLocationSim] // Use array of DS locations
      );
      newState.orders = [...newState.orders, ...newOrders];
      newState.orderIdCounter = updatedOrderIdCounter;
      newState.totalOrdersGenerated += totalGeneratedIncrement;
      if (newOrders.length > 0) {
        newOrders.forEach(no => addLog(`Generated Order ${no.id} for profile ${simParams.orderGenProfileId}`, 'ORDER', currentSimTimeStr));
      }


      // 3. Assign Orders to Agents
      const { updatedAgents: agentsAfterAssign, updatedOrders: ordersAfterAssign } = assignOrdersToAgentsLogic(
        newState.agents,
        newState.orders,
        simParams.agentSpeedKmph,
        simParams.enableDynamicTraffic ? newState.currentDynamicTrafficFactor : simParams.baseTrafficFactor,
        newState.darkStoreLocations || [defaultDarkStoreLocationSim], // Use array of DS locations
        currentSimTimeStr,
        addLog
      );
      newState.agents = agentsAfterAssign;
      newState.orders = ordersAfterAssign;


      // 4. Update Agents' Movement and Status
      let totalDistanceThisStep = 0;
      const {
        updatedAgents: agentsAfterMovement,
        updatedOrders: ordersAfterMovement,
        deliveredOrdersThisStep,
        totalDeliveryTimeIncrement,
        heatmapPointsToAdd
      } = updateAgentsMovementAndStatusLogic(
        newState.agents,
        newState.orders,
        simParams.agentSpeedKmph,
        simParams.enableDynamicTraffic ? newState.currentDynamicTrafficFactor : simParams.baseTrafficFactor,
        newState.currentSimulationTime,
        newState.darkStoreLocations || [defaultDarkStoreLocationSim],
        currentSimTimeStr,
        addLog
      );
      newState.agents = agentsAfterMovement;
      newState.orders = ordersAfterMovement;
      newState.totalOrdersDelivered += deliveredOrdersThisStep.length;
      newState.totalDeliveryTime += totalDeliveryTimeIncrement;
      deliveredOrdersThisStep.forEach(order => {
        totalDistanceThisStep += mapUtils.getDistanceKm(
            (newState.darkStoreLocations || [defaultDarkStoreLocationSim])[0], // Simplified: assume from first DS for now
            [order.lat, order.lng]
        );
      });
      newState.totalAgentTravelDistance += totalDistanceThisStep; // This is a rough sum, individual agent distances are more accurate
      
      // Update heatmap data
      if (simParams.enableHeatmap && heatmapPointsToAdd.length > 0) {
        heatmapPointsToAdd.forEach(newPoint => {
          const existingPoint = deliveredOrderDataForHeatmapRef.current.data.find(
            p => p.lat.toFixed(4) === newPoint.lat.toFixed(4) && p.lng.toFixed(4) === newPoint.lng.toFixed(4)
          );
          if (existingPoint) existingPoint.count++;
          else deliveredOrderDataForHeatmapRef.current.data.push({ ...newPoint, count: 1 });
        });
        if (deliveredOrderDataForHeatmapRef.current.data.length > 0) {
          const maxCount = Math.max(...deliveredOrderDataForHeatmapRef.current.data.map(d => d.count));
          deliveredOrderDataForHeatmapRef.current.max = Math.max(1, maxCount);
        }
      }

      // 5. Update Agent Fatigue
      newState.agents = updateAgentFatigueLogic(newState.agents, currentSimTimeStr, addLog);
      
      return newState;
    });
  }, [simParams, customDemandProfiles, addLog]); // Add other dependencies as needed


  // Effect for running simulation step interval
  useEffect(() => {
    if (simState.isRunning) {
      simulationIntervalRef.current = window.setInterval(runSimulationStep, SIMULATION_STEP_INTERVAL_MS);
    } else {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
    }
    return () => { // Cleanup interval on unmount or if isRunning changes
      if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
    };
  }, [simState.isRunning, runSimulationStep]);


  // Effect for UI Updates (Map markers, Charts, Stats) - runs after simState changes
  useEffect(() => {
    updateAgentMarkers(simState.agents, agentMarkersLayerRef.current, mapRef.current);
    updateOrderMarkers(simState.orders, orderMarkersLayerRef.current, mapRef.current);
    if (simParams.enableHeatmap && heatmapLayerRef.current && mapRef.current?.hasLayer(heatmapLayerRef.current)) {
      heatmapLayerRef.current.setData(deliveredOrderDataForHeatmapRef.current);
    }
    updateLiveCharts(simState.currentSimulationTime, simState.orders, simState.agents, pendingOrdersChartRefKey, activeAgentsChartRefKey);
    // updateKPIDisplays() is implicit in the JSX rendering based on simState
  }, [simState, simParams.enableHeatmap]);


  // UI Handlers
  const handleParamChange = (param: keyof typeof simParams, value: any) => {
    if (simState.isRunning) return; // Don't allow changes while running
    setSimParams(prev => ({ ...prev, [param]: value }));
    if (param === 'enableHeatmap') toggleHeatmapLayer(value);
  };

  const toggleHeatmapLayer = (show: boolean) => {
    if (show && !heatmapLayerRef.current && mapRef.current) {
        if (typeof L.heatmapOverlay === 'undefined') {
            addLog('Leaflet Heatmap Overlay library not loaded.', 'ERROR');
            showModal("Heatmap Error", "Leaflet Heatmap library component is missing.");
            setSimParams(p => ({...p, enableHeatmap: false})); // Uncheck the box
            return;
        }
      heatmapLayerRef.current = L.heatmapOverlay({
        "radius": 0.008, "maxOpacity": .7, "scaleRadius": true,
        "useLocalExtrema": false, latField: 'lat', lngField: 'lng', valueField: 'count',
        gradient: { 0.25: 'blue', 0.50: 'cyan', 0.70: 'lime', 0.85: 'yellow', 1.0: 'red' }
      }).addTo(mapRef.current);
      heatmapLayerRef.current.setData(deliveredOrderDataForHeatmapRef.current);
    } else if (!show && heatmapLayerRef.current && mapRef.current) {
      mapRef.current.removeLayer(heatmapLayerRef.current);
      heatmapLayerRef.current = null;
    }
  };


  const startSim = () => {
    if (simState.isRunning) return;
    setSimState(prev => ({ ...prev, isRunning: true }));
    setIsSimConfigLocked(true);
    addLog('Simulation started.', 'SYSTEM', formatSimTime(simState.currentSimulationTime));
    document.getElementById('startSimBtn')?.classList.add('btn-sim-active');
    document.getElementById('pauseSimBtn')?.classList.remove('btn-sim-active');
  };

  const pauseSim = () => {
    if (!simState.isRunning && !simulationIntervalRef.current) return;
    setSimState(prev => ({ ...prev, isRunning: false }));
    setIsSimConfigLocked(false); // Unlock config when paused
    addLog('Simulation paused.', 'SYSTEM', formatSimTime(simState.currentSimulationTime));
    document.getElementById('pauseSimBtn')?.classList.add('btn-sim-active');
    document.getElementById('startSimBtn')?.classList.remove('btn-sim-active');
  };

  const resetSim = () => {
    if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
    simulationIntervalRef.current = null;
    
    const newInitialState = initialSimState(); // Get fresh initial state based on current simParams
    setSimState(newInitialState);

    setIsSimConfigLocked(false);
    agentMarkersLayerRef.current.clearLayers();
    orderMarkersLayerRef.current.clearLayers();
    deliveredOrderDataForHeatmapRef.current = { max: 1, data: [] };
    if (heatmapLayerRef.current) heatmapLayerRef.current.setData(deliveredOrderDataForHeatmapRef.current);
    
    // Explicitly update charts with empty data for reset
    chartUtils.updateChartData(pendingOrdersChartRefKey, [], [chartUtils.createLineDataset('Pending Orders', [])]);
    chartUtils.updateChartData(activeAgentsChartRefKey, [], [chartUtils.createLineDataset('Active Agents', [], mapUtils.twColors.slate[400], `rgba(${mapUtils.hexToRgb(mapUtils.twColors.slate[400])},0.1)`)]);

    addLog('Simulation state reset.', 'SYSTEM');
    setAiAnalysisOutput(null);
    setDynamicEventSuggestion(null);
    document.getElementById('startSimBtn')?.classList.remove('btn-sim-active');
    document.getElementById('pauseSimBtn')?.classList.remove('btn-sim-active');
  };

  const handleExportResults = () => {
    if (simState.orders.length === 0) {
      showModal("No Data", "No orders to export. Run the simulation first.");
      return;
    }
    const csvData = simState.orders.map(o => ({
      OrderID: o.id,
      TimePlaced: formatSimTime(o.timePlaced),
      StoreArrivalTime: o.storeArrivalTime ? formatSimTime(o.storeArrivalTime) : 'N/A',
      CustomerArrivalTime: o.customerArrivalTime ? formatSimTime(o.customerArrivalTime) : 'N/A',
      DeliveryTimeMinutes: o.deliveryTime !== null ? o.deliveryTime.toFixed(1) : 'N/A',
      AssignedAgentID: o.assignedAgentId || 'N/A',
      Status: o.status,
      OrderLat: o.lat.toFixed(5),
      OrderLng: o.lng.toFixed(5),
    }));
    const csvString = arrayToCsv(csvData);
    downloadFile(csvString, `simulation_results_${Date.now()}_ccr.csv`, 'text/csv;charset=utf-8;');
    addLog('Simulation results exported.', 'SYSTEM');
  };

  const handleSaveScenario = () => {
    const scenarioName = prompt("Enter a name for this CCR simulation scenario (e.g., 'CCR High Demand Test'):");
    if (!scenarioName || scenarioName.trim() === "") {
      showModal("Save Cancelled", "Scenario saving cancelled or name was empty.");
      return;
    }

    const currentParams: SimulationParams = {
        numAgents: simParams.numAgents,
        agentSpeed: simParams.agentSpeedKmph,
        orderGenerationProfile: simParams.orderGenProfileId,
        baseTrafficFactor: simParams.baseTrafficFactor,
        enableDynamicTraffic: simParams.enableDynamicTraffic,
        simulationDurationRun: simState.currentSimulationTime,
    };
    const avgDeliveryTime = simState.totalOrdersDelivered > 0 ? (simState.totalDeliveryTime / simState.totalOrdersDelivered) : 0;
    const totalPossibleAgentTime = simState.agents.length * simState.currentSimulationTime;
    const totalActualActiveTime = simState.agents.reduce((sum, agent) => sum + (agent.timeSpentDelivering + agent.timeSpentAtStore), 0);
    const agentUtilization = totalPossibleAgentTime > 0 ? (totalActualActiveTime / totalPossibleAgentTime) * 100 : 0;

    const currentStats: SimulationStats = {
        totalOrdersGenerated: simState.totalOrdersGenerated,
        totalOrdersDelivered: simState.totalOrdersDelivered,
        averageDeliveryTimeMin: parseFloat(avgDeliveryTime.toFixed(1)),
        totalAgentTravelDistanceKm: parseFloat(simState.totalAgentTravelDistance.toFixed(1)), // This needs to be accumulated correctly
        averageAgentUtilizationPercent: parseFloat(agentUtilization.toFixed(1)),
    };

    const newScenario: Scenario = {
      id: generateUniqueId(`scenario_`),
      name: scenarioName.trim(),
      timestamp: new Date().toLocaleString(),
      parameters: currentParams,
      statistics: currentStats,
    };

    const existingScenarios: Scenario[] = JSON.parse(localStorage.getItem(SCENARIO_STORAGE_KEY) || '[]');
    localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify([...existingScenarios, newScenario]));
    addLog(`Scenario "${newScenario.name}" saved.`, 'SYSTEM');
    showModal("Scenario Saved", `Scenario "${newScenario.name}" has been saved locally.`);
  };

  const prepareDataForAi = (type: 'analysis' | 'event'): object => {
    const params = {
        numAgents: simParams.numAgents,
        agentSpeedKmph: simParams.agentSpeedKmph,
        orderGenerationProfile: customDemandProfiles.find(p=>p.id === simParams.orderGenProfileId)?.name || simParams.orderGenProfileId,
        baseTrafficFactor: simParams.baseTrafficFactor,
        enableDynamicTraffic: simParams.enableDynamicTraffic,
        currentDynamicTrafficFactor: simState.currentDynamicTrafficFactor,
    };
    const avgDeliveryTime = simState.totalOrdersDelivered > 0 ? (simState.totalDeliveryTime / simState.totalOrdersDelivered) : 0;
    const totalPossibleAgentTime = simState.agents.length * simState.currentSimulationTime;
    const totalActualActiveTime = simState.agents.reduce((sum, agent) => sum + (agent.timeSpentDelivering + agent.timeSpentAtStore), 0);
    const agentUtilization = totalPossibleAgentTime > 0 ? (totalActualActiveTime / totalPossibleAgentTime) * 100 : 0;

    const kpis = {
        totalOrdersGenerated: simState.totalOrdersGenerated,
        totalOrdersDelivered: simState.totalOrdersDelivered,
        averageDeliveryTimeMin: parseFloat(avgDeliveryTime.toFixed(1)),
        averageAgentUtilizationPercent: parseFloat(agentUtilization.toFixed(1)),
        pendingOrders: simState.orders.filter(o => o.status === 'pending').length,
    };

    if (type === 'analysis') {
        const agentSummary = simState.agents.map(a => ({ id: a.id, status: a.status, deliveries: a.deliveriesCompleted, fatigue: a.fatigueFactor.toFixed(2) }));
        const recentDelivered = simState.orders.filter(o => o.status === 'delivered').slice(-3).map(o => ({id:o.id, time: o.deliveryTime?.toFixed(0)}));
        return { simulationParameters: params, keyPerformanceIndicators: kpis, agentSummarySample: agentSummary.slice(0,5), recentDeliveredOrdersSample: recentDelivered, currentTime: formatSimTime(simState.currentSimulationTime), notes: "Analyze quick commerce last-mile delivery for Chandigarh Capital Region (CCR). Focus on efficiency, service levels, resource use. Provide concise, actionable insights." };
    } else { // 'event'
        return { simulationTime: formatSimTime(simState.currentSimulationTime), totalPendingOrders: kpis.pendingOrders, activeAgents: simState.agents.filter(a => a.status !== 'available').length, city: "Chandigarh Capital Region (CCR), India", businessType: "Quick Commerce (groceries, essentials)" };
    }
  };

  const handleAiAnalysisRequest = async () => {
    const now = Date.now();
    if (now - simState.lastAiAnalysisRequestTime < simState.aiAnalysisCooldownMs) {
      showModal("AI Cooldown", `Please wait ${Math.ceil((simState.aiAnalysisCooldownMs - (now - simState.lastAiAnalysisRequestTime)) / 1000)}s for next AI analysis.`); return;
    }
    if (simState.totalOrdersGenerated < 5 && simState.currentSimulationTime < 30) {
      showModal("Insufficient Data", "Run simulation longer (at least 5 orders or 30 sim minutes) for AI analysis."); return;
    }
     if (!geminiApiKey || geminiApiKey === "YOUR_GEMINI_API_KEY_HERE" || geminiApiKey.includes("AIzaSyDwjlcdDvgre9mLWR7abRx2qta_NFLISuI")) {
        showModal("API Key Error", "A valid Gemini API key is required."); return;
    }

    addLog('Preparing data for AI analysis...', 'AI'); setIsLoadingAi(true); setAiAnalysisOutput(null); setDynamicEventSuggestion(null);
    const simDataForAI = prepareDataForAi('analysis');
    const prompt = `Analyze this Q-Commerce simulation data for Chandigarh Capital Region (CCR). Provide insights, bottlenecks, and actionable suggestions. Focus on efficiency, delivery times, resource use. Be concise. Data: ${JSON.stringify(simDataForAI, null, 2)}`;
    try {
      const responseText = await fetchGeminiTextGeneration(geminiApiKey, prompt);
      setAiAnalysisOutput(responseText); addLog('AI analysis received.', 'AI');
      setSimState(prev => ({ ...prev, lastAiAnalysisRequestTime: Date.now() }));
    } catch (error: any) {
      addLog(`AI analysis error: ${error.message}`, 'ERROR'); setAiAnalysisOutput(`Error: ${error.message}`);
    } finally { setIsLoadingAi(false); }
  };

  const handleSuggestDynamicEvent = async () => {
     const now = Date.now();
    if (now - simState.lastDynamicEventSuggestionTime < simState.dynamicEventCooldownMs) {
      showModal("AI Cooldown", `Please wait ${Math.ceil((simState.dynamicEventCooldownMs - (now - simState.lastDynamicEventSuggestionTime)) / 1000)}s for another event suggestion.`); return;
    }
    if (!simState.isRunning && simState.currentSimulationTime < 15) {
      showModal("Run Simulation", "Start simulation or run longer before suggesting an event."); return;
    }
    if (!geminiApiKey || geminiApiKey === "YOUR_GEMINI_API_KEY_HERE" || geminiApiKey.includes("AIzaSyDwjlcdDvgre9mLWR7abRx2qta_NFLISuI")) {
        showModal("API Key Error", "A valid Gemini API key is required."); return;
    }
    addLog('Requesting dynamic event suggestion...', 'AI'); setIsLoadingAi(true); setAiAnalysisOutput(null); setDynamicEventSuggestion(null);
    const eventContext = prepareDataForAi('event');
    const prompt = `For a Q-Commerce simulation in ${eventContext.city} at sim time ${eventContext.simulationTime}, with ${eventContext.totalPendingOrders} pending orders and ${eventContext.activeAgents} active agents: Suggest ONE plausible, concise disruptive event. Examples: "Sudden heavy rainfall causing widespread traffic delays across Mohali.", "Major road closure on Himalayan Expressway." Event description only.`;
    try {
      const responseText = await fetchGeminiTextGeneration(geminiApiKey, prompt);
      setDynamicEventSuggestion(responseText.trim()); addLog(`AI suggested event: ${responseText.trim()}`, 'AI');
      setSimState(prev => ({ ...prev, lastDynamicEventSuggestionTime: Date.now() }));
    } catch (error: any) {
      addLog(`Error getting dynamic event: ${error.message}`, 'ERROR'); setDynamicEventSuggestion(`Error: ${error.message}`);
    } finally { setIsLoadingAi(false); }
  };


  // Options for Order Generation Profile Selector
  const orderGenProfileOptions = [
    { value: 'default_uniform_ccr', label: 'Default Uniform (CCR)' },
    { value: 'default_focused_ccr', label: 'Default Focused (Central CCR)' },
    ...customDemandProfiles.map(p => ({ value: p.id, label: p.name })),
  ];

  return (
    <section id="simulation" className="p-6 sm:p-8 bg-white rounded-xl shadow-xl mb-8">
      <h2 className="text-3xl font-bold text-slate-900 mb-6 pb-4 border-b border-slate-300">
        Interactive Delivery Simulation (CCR)
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Controls & Map/Charts */}
        <div className="lg:col-span-7 xl:col-span-8">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Controls Panel */}
            <div className="xl:col-span-1 control-panel order-2 xl:order-1">
              <h3>Simulation Controls</h3>
              <div className="flex space-x-2.5 mb-4">
                <button id="startSimBtn" onClick={startSim} className="btn btn-success flex-1" disabled={isSimConfigLocked && simState.isRunning}>Start</button>
                <button id="pauseSimBtn" onClick={pauseSim} className="btn btn-warning flex-1" disabled={!simState.isRunning && !simulationIntervalRef.current}>Pause</button>
                <button onClick={resetSim} className="btn btn-danger flex-1">Reset</button>
              </div>
              <div className="text-center py-4 border-y border-slate-300 mb-4">
                <span className="text-2xl font-bold text-slate-800">Sim Time: <span className="tabular-nums">{formatSimTime(simState.currentSimulationTime)}</span></span>
              </div>
              <div className={`control-group space-y-5 ${isSimConfigLocked ? 'opacity-60 pointer-events-none' : ''}`}>
                <h4 className="text-md font-semibold text-slate-700 -mb-1">Parameters:</h4>
                <SliderInput id="numAgentsSim" label="Number of Agents" min={1} max={75} step={1} initialValue={simParams.numAgents} onChange={val => handleParamChange('numAgents',val)} disabled={isSimConfigLocked}/>
                <SliderInput id="agentSpeedSim" label="Avg. Agent Speed (km/h)" min={10} max={60} step={1} initialValue={simParams.agentSpeedKmph} onChange={val => handleParamChange('agentSpeedKmph',val)} disabled={isSimConfigLocked}/>
                <div>
                  <label htmlFor="orderGenProfileSimCtrl" className="block text-sm font-medium text-slate-700 mb-1">Order Generation Profile:</label>
                  <select id="orderGenProfileSimCtrl" value={simParams.orderGenProfileId} onChange={e => handleParamChange('orderGenProfileId', e.target.value)} disabled={isSimConfigLocked} className="w-full">
                    {orderGenProfileOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <SliderInput id="baseTrafficFactorSim" label="Base Traffic Factor" min={0.5} max={2.0} step={0.1} initialValue={simParams.baseTrafficFactor} onChange={val => handleParamChange('baseTrafficFactor',val)} disabled={isSimConfigLocked}/>
                <div className="flex items-center pt-2.5 space-x-6">
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" checked={simParams.enableDynamicTraffic} onChange={e => handleParamChange('enableDynamicTraffic', e.target.checked)} disabled={isSimConfigLocked} className="h-5 w-5"/>
                        <span className="text-sm text-slate-800">Dynamic Traffic</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" checked={simParams.enableHeatmap} onChange={e => handleParamChange('enableHeatmap', e.target.checked)} disabled={isSimConfigLocked} className="h-5 w-5"/>
                        <span className="text-sm text-slate-800">Show Heatmap</span>
                    </label>
                </div>
              </div>
              <div className="control-actions">
                <button onClick={handleExportResults} className="btn btn-secondary w-full btn-sm">Export Results (CSV)</button>
                <button onClick={handleSaveScenario} className="btn btn-purple w-full btn-sm">Save Scenario for Comparison</button>
                <button onClick={handleAiAnalysisRequest} className="btn btn-info w-full btn-sm" disabled={isLoadingAi}> {isLoadingAi && dynamicEventSuggestion === null ? 'Analyzing...' : 'Get AI Analysis'}</button>
                <button onClick={handleSuggestDynamicEvent} className="btn btn-info w-full btn-sm" disabled={isLoadingAi}>✨ {isLoadingAi && aiAnalysisOutput === null ? 'Suggesting...' : 'Suggest Dynamic Event'}</button>
              </div>
               {isLoadingAi && <Spinner size="small" className="mt-3"/>}
            </div>

            {/* Map & Charts Column */}
            <div className="xl:col-span-2 order-1 xl:order-2">
              <div id={mapContainerId} className="map-container">{!mapRef.current && <Spinner message="Initializing map..."/>}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
                <div className="bg-white p-4 rounded-xl shadow-lg border border-slate-200"><canvas id="pendingOrdersChartSim" className="h-52"></canvas></div>
                <div className="bg-white p-4 rounded-xl shadow-lg border border-slate-200"><canvas id="activeAgentsChartSim" className="h-52"></canvas></div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Stats & Log */}
        <div className="lg:col-span-5 xl:col-span-4 order-3 lg:order-3">
          <div className="space-y-6 sticky top-20"> {/* Sticky container */}
            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-lg">
              <h3 className="text-lg font-semibold text-slate-800 mb-3">Agent Status</h3>
              <ul className="max-h-48 overflow-y-auto text-xs space-y-1.5 pr-2 styled-scrollbar">
                {simState.agents.length === 0 && <li className="text-slate-500">No agents configured.</li>}
                {simState.agents.map(a => <li key={a.id} className={`${a.status !== 'available' ? 'text-green-600 font-medium' : 'text-slate-600'}`}> {a.id.substring(0,8)}: {a.status} {a.currentOrder ? `(${a.currentOrder.substring(0,8)})` : ''} | F: {a.fatigueFactor.toFixed(1)} | D: {a.deliveriesCompleted}</li>)}
              </ul>
            </div>
            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-lg">
              <h3 className="text-lg font-semibold text-slate-800 mb-3">Pending Orders ({simState.orders.filter(o=>o.status === 'pending' || o.status === 'assigned' || o.status === 'picked_up').length})</h3>
              <ul className="max-h-48 overflow-y-auto text-xs space-y-1.5 pr-2 styled-scrollbar">
                {simState.orders.filter(o=>o.status !== 'delivered' && o.status !== 'cancelled').length === 0 && <li className="text-slate-500">No active orders.</li>}
                {simState.orders.filter(o=>o.status !== 'delivered' && o.status !== 'cancelled').slice(0,15).map(o => <li key={o.id} className={`${o.status === 'pending' ? 'text-red-600' : 'text-blue-600'}`}> {o.id.substring(0,8)}: {o.status} {o.assignedAgentId ? `(To ${o.assignedAgentId.substring(0,8)})` : ''} ({formatTime(o.timePlaced)})</li>)}
              </ul>
            </div>
             <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-lg">
                <h3 className="text-lg font-semibold text-slate-800 mb-3">Overall Statistics</h3>
                <div className="text-sm space-y-1.5">
                    <p>Generated: <strong className="text-slate-700">{simState.totalOrdersGenerated}</strong></p>
                    <p>Delivered: <strong className="text-slate-700">{simState.totalOrdersDelivered}</strong></p>
                    <p>Avg. Delivery Time: <strong className="text-slate-700">{(simState.totalOrdersDelivered > 0 ? simState.totalDeliveryTime / simState.totalOrdersDelivered : 0).toFixed(1)} min</strong></p>
                    <p>Agent Utilization: <strong className="text-slate-700">{(simState.agents.length * simState.currentSimulationTime > 0 ? (simState.agents.reduce((sum, a) => sum + a.timeSpentDelivering + a.timeSpentAtStore, 0) / (simState.agents.length * simState.currentSimulationTime)) * 100 : 0).toFixed(1)}%</strong></p>
                    <p>Traffic Factor: <strong className="text-slate-700">{(simParams.enableDynamicTraffic ? simState.currentDynamicTrafficFactor : simParams.baseTrafficFactor).toFixed(2)}</strong></p>
                </div>
            </div>
            <LogPanel logEntries={logs} title="Simulation Log" heightClass="h-60"/>
          </div>
        </div>
      </div>

      {aiAnalysisOutput && (
        <div className="ai-output-area mt-8">
          <h3>AI Analysis & Suggestions</h3>
          <div className="styled-scrollbar whitespace-pre-wrap">{aiAnalysisOutput}</div>
        </div>
      )}
      {dynamicEventSuggestion && (
        <div className="ai-output-area mt-8">
          <h3>✨ Dynamic Event Suggestion</h3>
          <div className="styled-scrollbar whitespace-pre-wrap">{dynamicEventSuggestion}</div>
        </div>
      )}
    </section>
  );
};


// --- Simulation Logic Functions (to be kept in the same file or moved to a dedicated simulationLogic.ts and imported) ---

// Placeholder for generateOrdersLogic
function generateOrdersLogic(
    currentOrderIdCounter: number,
    profileId: string,
    currentTime: number,
    customProfiles: CustomDemandProfile[],
    darkStoreLocations: LatLngTuple[] // Now an array
): { newOrders: Order[], updatedOrderIdCounter: number, totalGeneratedIncrement: number } {
    const newOrders: Order[] = [];
    let updatedOrderIdCounter = currentOrderIdCounter;
    let totalGeneratedIncrement = 0;
    const currentHour = Math.floor((currentTime / 60) % 24);
    const primaryDarkStore = darkStoreLocations[0] || defaultDarkStoreLocationSim; // Use first DS as reference for some logic

    const baseOrderRate = 0.15; // Default for uniform/focused if not custom
    const focusedRadiusKm = 5; // For default_focused_ccr

    if (profileId === 'default_uniform_ccr' || profileId === 'default_focused_ccr') {
        if (Math.random() < baseOrderRate) { // Simplified base rate for this step
            updatedOrderIdCounter++;
            totalGeneratedIncrement++;
            const orderCoords = profileId === 'default_uniform_ccr'
                ? mapUtils.getRandomPointInCcr()
                : mapUtils.getRandomPointNearHotspot(primaryDarkStore, focusedRadiusKm);
            newOrders.push({
                id: generateUniqueId(`O${updatedOrderIdCounter}_`), lat: orderCoords[0], lng: orderCoords[1],
                timePlaced: currentTime, status: 'pending' as OrderStatus, assignedAgentId: null,
                storeArrivalTime: null, customerArrivalTime: null, deliveryTime: null,
            });
        }
    } else {
        const profile = customProfiles.find(p => p.id === profileId);
        if (profile) {
            profile.zones.forEach(zone => {
                if (currentTime >= zone.startTime * 60 && currentTime <= zone.endTime * 60) { // Compare minutes
                    const ordersPerHour = zone.minOrders + Math.random() * (zone.maxOrders - zone.minOrders);
                    const ordersThisStep = ordersPerHour * (MINUTES_PER_SIMULATION_STEP / 60);
                    if (Math.random() < ordersThisStep) {
                        updatedOrderIdCounter++;
                        totalGeneratedIncrement++;
                        let orderCoords: LatLngTuple | undefined;
                        // Determine coords based on zone type, potentially selecting a relevant dark store if multi-DS logic is complex
                        const relevantDarkStore = darkStoreLocations[Math.floor(Math.random() * darkStoreLocations.length)] || primaryDarkStore;

                        if (zone.type === 'uniform_ccr') orderCoords = mapUtils.getRandomPointInCcr();
                        else if (zone.type === 'hotspot') orderCoords = mapUtils.getRandomPointNearHotspot(zone.center || relevantDarkStore, zone.radius);
                        else if (zone.type === 'sector' && zone.sectors.length > 0) {
                            const randomSectorName = zone.sectors[Math.floor(Math.random() * zone.sectors.length)];
                            const sectorData = ccrSectors.find(s => s.name === randomSectorName);
                            orderCoords = sectorData ? mapUtils.getRandomPointNearHotspot(sectorData.coords, 1.5) : mapUtils.getRandomPointNearHotspot(relevantDarkStore, 5);
                        } else if (zone.type === 'route' && zone.routePath && zone.routePath.length > 1) {
                            const segIdx = Math.floor(Math.random() * (zone.routePath.length - 1));
                            const p1 = zone.routePath[segIdx], p2 = zone.routePath[segIdx+1], t = Math.random();
                            const mid: LatLngTuple = [p1[0]*(1-t)+p2[0]*t, p1[1]*(1-t)+p2[1]*t];
                            orderCoords = mapUtils.getRandomPointNearHotspot(mid, zone.buffer);
                        } else {
                             orderCoords = mapUtils.getRandomPointNearHotspot(relevantDarkStore, 5); // Fallback
                        }
                        
                        if (orderCoords) {
                             newOrders.push({
                                id: generateUniqueId(`O${updatedOrderIdCounter}_`), lat: orderCoords[0], lng: orderCoords[1],
                                timePlaced: currentTime, status: 'pending' as OrderStatus, assignedAgentId: null,
                                storeArrivalTime: null, customerArrivalTime: null, deliveryTime: null,
                            });
                        }
                    }
                }
            });
        }
    }
    return { newOrders, updatedOrderIdCounter, totalGeneratedIncrement };
}

// Placeholder for assignOrdersToAgentsLogic
function assignOrdersToAgentsLogic(
    currentAgents: Agent[],
    currentOrders: Order[],
    agentSpeedKmph: number,
    trafficFactor: number,
    darkStoreLocations: LatLngTuple[], // Now an array
    currentSimTimeStr: string,
    addLog: (message: string, type: LogEntry['type'], simTime?: string) => void
): { updatedAgents: Agent[], updatedOrders: Order[] } {
    const pendingOrders = currentOrders.filter(o => o.status === 'pending');
    const availableAgents = currentAgents.filter(a => a.status === 'available');
    if (pendingOrders.length === 0 || availableAgents.length === 0) {
        return { updatedAgents: currentAgents, updatedOrders: currentOrders };
    }

    const modifiableAgents = [...currentAgents];
    const modifiableOrders = [...currentOrders];

    pendingOrders.forEach(order => {
        let bestAgent: Agent | null = null;
        let minEta = Infinity;
        let bestDarkStoreForOrder: LatLngTuple | null = null; // DS closest to order or assigned by logic

        // Find the best Dark Store for this order (e.g., closest one)
        // For simplicity, let's assume the order is serviced by the DS closest to it.
        // A more complex system might assign orders to DS based on inventory, load, etc.
        let closestDsDist = Infinity;
        darkStoreLocations.forEach(dsLoc => {
            const dist = mapUtils.getDistanceKm(dsLoc, [order.lat, order.lng]);
            if (dist < closestDsDist) {
                closestDsDist = dist;
                bestDarkStoreForOrder = dsLoc;
            }
        });
        if (!bestDarkStoreForOrder) bestDarkStoreForOrder = darkStoreLocations[0] || defaultDarkStoreLocationSim;


        availableAgents.forEach(agent => {
            // Check if this agent is already being considered in this iteration
            const agentInModifiableList = modifiableAgents.find(a => a.id === agent.id);
            if (!agentInModifiableList || agentInModifiableList.status !== 'available') return;

            const agentCoords: LatLngTuple = [agent.lat, agent.lng];
            // const storeCoords = defaultDarkStoreLocationSim; // This needs to be dynamic for multi-DS
            const storeCoords = bestDarkStoreForOrder!; // Use the determined best DS
            const customerCoords: LatLngTuple = [order.lat, order.lng];

            const distAgentToStore = mapUtils.getDistanceKm(agentCoords, storeCoords);
            const distStoreToCustomer = mapUtils.getDistanceKm(storeCoords, customerCoords);

            const effectiveSpeed = agentSpeedKmph * agent.fatigueFactor * trafficFactor;
            if (effectiveSpeed <= 0.1) return; // Agent is too slow or stuck

            const timeAgentToStore = (distAgentToStore / effectiveSpeed) * 60;
            const timeAtStore = 5; // Handling time in minutes
            const timeStoreToCustomer = (distStoreToCustomer / effectiveSpeed) * 60;
            const eta = timeAgentToStore + timeAtStore + timeStoreToCustomer;

            if (eta < minEta) {
                minEta = eta;
                bestAgent = agent;
            }
        });

        if (bestAgent) {
            const orderIndex = modifiableOrders.findIndex(o => o.id === order.id);
            const agentIndex = modifiableAgents.findIndex(a => a.id === bestAgent!.id);

            if (orderIndex !== -1 && agentIndex !== -1) {
                modifiableOrders[orderIndex].status = 'assigned';
                modifiableOrders[orderIndex].assignedAgentId = bestAgent!.id;

                modifiableAgents[agentIndex].status = 'to_store';
                modifiableAgents[agentIndex].currentOrder = order.id;
                // Path from agent to selected dark store, then to customer
                const storeForThisOrder = bestDarkStoreForOrder!;
                modifiableAgents[agentIndex].routePath = [
                    ...mapUtils.generateWaypoints([bestAgent!.lat, bestAgent!.lng], storeForThisOrder),
                    ...mapUtils.generateWaypoints(storeForThisOrder, [order.lat, order.lng]).slice(1) // Avoid duplicate store waypoint
                ];
                modifiableAgents[agentIndex].currentLegIndex = 0;
                modifiableAgents[agentIndex].legProgress = 0;

                addLog(`Order ${order.id} to Agent ${bestAgent!.id} (via DS at ${storeForThisOrder[0].toFixed(2)},${storeForThisOrder[1].toFixed(2)}). ETA: ${minEta.toFixed(0)} min.`, 'ASSIGN', currentSimTimeStr);
                
                // Remove agent from available list for this iteration
                const idxToRemove = availableAgents.findIndex(a => a.id === bestAgent!.id);
                if (idxToRemove > -1) availableAgents.splice(idxToRemove, 1);
            }
        }
    });
    return { updatedAgents: modifiableAgents, updatedOrders: modifiableOrders };
}


// Placeholder for updateAgentsMovementAndStatusLogic
function updateAgentsMovementAndStatusLogic(
    currentAgents: Agent[],
    currentOrders: Order[],
    agentSpeedKmph: number,
    trafficFactor: number,
    currentTime: number,
    darkStoreLocations: LatLngTuple[], // Now an array
    currentSimTimeStr: string,
    addLog: (message: string, type: LogEntry['type'], simTime?: string) => void
): { updatedAgents: Agent[], updatedOrders: Order[], deliveredOrdersThisStep: Order[], totalDeliveryTimeIncrement: number, heatmapPointsToAdd: HeatmapDataPoint[] } {
    const updatedAgents = [...currentAgents];
    const updatedOrders = [...currentOrders];
    const deliveredOrdersThisStep: Order[] = [];
    let totalDeliveryTimeIncrement = 0;
    const heatmapPointsToAdd: HeatmapDataPoint[] = [];

     updatedAgents.forEach(agent => {
        if (agent.status === 'available') {
            agent.timeSpentIdle += MINUTES_PER_SIMULATION_STEP;
            return;
        }
        agent.timeContinuouslyActive += MINUTES_PER_SIMULATION_STEP;
        let agentActiveThisStep = true;

        if (agent.status === 'at_store') {
            agent.timeSpentAtStore += MINUTES_PER_SIMULATION_STEP;
            agent.legProgress += MINUTES_PER_SIMULATION_STEP; // Assuming legProgress is time spent at store
            const HANDLING_TIME_AT_STORE = 5; // minutes
            if (agent.legProgress >= HANDLING_TIME_AT_STORE) {
                const order = updatedOrders.find(o => o.id === agent.currentOrder);
                if (order) {
                    agent.status = 'to_customer';
                    agent.legProgress = 0; // Reset for next phase of travel
                    order.status = 'picked_up';
                    addLog(`Agent ${agent.id} picked up Order ${order.id}.`, 'AGENT', currentSimTimeStr);
                } else { // Order might have been cancelled or something went wrong
                    agent.status = 'available'; agent.currentOrder = null; agent.routePath = [];
                }
            }
            return; // No movement if at store
        }
        
        // If agent is 'to_store' or 'to_customer'
        if (agent.routePath.length === 0 || agent.currentLegIndex >= agent.routePath.length - 1) {
            // Agent has arrived or has no path (should not happen if assigned properly)
            // This case should be handled by the arrival logic below. If it's still here, something is off.
            // For now, if no path and not available/at_store, make available to prevent stuck state.
            if(agent.status !== 'available' && agent.status !== 'at_store') {
                // addLog(`Agent ${agent.id} has no route but is ${agent.status}. Resetting to available.`, "WARN", currentSimTimeStr);
                // agent.status = 'available'; agent.currentOrder = null;
            }
            return;
        }

        agent.timeSpentDelivering += MINUTES_PER_SIMULATION_STEP; // Count as delivering if moving

        const effectiveSpeed = agentSpeedKmph * agent.fatigueFactor * trafficFactor;
        if (effectiveSpeed <= 0.01) { // Virtually stuck
            addLog(`Agent ${agent.id} is stuck or moving too slowly. Speed: ${effectiveSpeed.toFixed(2)}`, 'WARN', currentSimTimeStr);
            return;
        }

        let distanceCoveredThisStep = (effectiveSpeed / 60) * MINUTES_PER_SIMULATION_STEP;
        agent.totalDistance += distanceCoveredThisStep;
        // totalAgentTravelDistance is a global sum, can be incremented elsewhere or summed up from agents

        let remainingDistanceInStep = distanceCoveredThisStep;

        while (remainingDistanceInStep > 0 && agent.currentLegIndex < agent.routePath.length - 1) {
            const startPoint = L.latLng(agent.lat, agent.lng);
            const endPointOfLeg = L.latLng(agent.routePath[agent.currentLegIndex + 1].lat, agent.routePath[agent.currentLegIndex + 1].lng);
            
            const legTotalDistanceKm = startPoint.distanceTo(endPointOfLeg) / 1000;

            if (legTotalDistanceKm < 0.001) { // Already at or very close to the next waypoint
                agent.currentLegIndex++;
                agent.legProgress = 0;
                if (agent.currentLegIndex >= agent.routePath.length - 1) break; // Reached end of path
                continue; // Move to next leg
            }

            const distanceToCoverOnThisLegKm = legTotalDistanceKm * (1 - agent.legProgress);

            if (remainingDistanceInStep >= distanceToCoverOnThisLegKm) {
                // Agent finishes current leg and moves to the next waypoint
                agent.lat = endPointOfLeg.lat;
                agent.lng = endPointOfLeg.lng;
                remainingDistanceInStep -= distanceToCoverOnThisLegKm;
                agent.currentLegIndex++;
                agent.legProgress = 0;
            } else {
                // Agent moves partially along the current leg
                const progressThisStepOnLeg = remainingDistanceInStep / legTotalDistanceKm;
                // Interpolate position:
                // agent.lat = startPoint.lat + (endPointOfLeg.lat - startPoint.lat) * (progressThisStepOnLeg / (1-agent.legProgress)); // This is complex due to agent.legProgress also changing
                // Simpler: agent.legProgress is portion of leg completed. New progress is old + this_step_dist / leg_total_dist
                const newLegProgress = agent.legProgress + (remainingDistanceInStep / legTotalDistanceKm);

                agent.lat = startPoint.lat + (endPointOfLeg.lat - startPoint.lat) * newLegProgress;
                agent.lng = startPoint.lng + (endPointOfLeg.lng - startPoint.lng) * newLegProgress;
                
                agent.legProgress = newLegProgress; // This was missing, caused agent to not update progress on leg correctly.
                // Correction: The interpolation should be simpler if agent.legProgress is % of current leg completed.
                // Let P_start be agent.routePath[agent.currentLegIndex], P_end be agent.routePath[agent.currentLegIndex+1]
                // Current position is P_start + agent.legProgress * (P_end - P_start)
                // New position based on distance:
                const initialLatOnLeg = agent.routePath[agent.currentLegIndex].lat;
                const initialLngOnLeg = agent.routePath[agent.currentLegIndex].lng;
                
                agent.lat = initialLatOnLeg + (endPointOfLeg.lat - initialLatOnLeg) * agent.legProgress;
                agent.lng = initialLngOnLeg + (endPointOfLeg.lng - initialLngOnLeg) * agent.legProgress;


                remainingDistanceInStep = 0; // All distance for this step used up
            }
        }


        // Check for arrival at destination (store or customer)
        if (agent.currentLegIndex >= agent.routePath.length - 1) {
            const orderIndex = updatedOrders.findIndex(o => o.id === agent.currentOrder);
            if (orderIndex === -1 && agent.currentOrder) { // Order not found, but agent was on a task
                addLog(`Agent ${agent.id} completed a task for non-existent/cancelled order ${agent.currentOrder}. Resetting.`, 'WARN', currentSimTimeStr);
                agent.status = 'available'; agent.currentOrder = null; agent.routePath = []; agentActiveThisStep = false;
            } else if (orderIndex !== -1) {
                const order = updatedOrders[orderIndex];
                // Determine if arrived at store or customer based on agent status
                if (agent.status === 'to_store') {
                     // Find which dark store it was going to. The last point of the first segment of routePath.
                    const storeCoords = agent.routePath.find(p => darkStoreLocations.some(dsl => dsl[0] === p.lat && dsl[1] === p.lng));

                    agent.status = 'at_store';
                    if(storeCoords) { // Snap to store location
                        agent.lat = storeCoords.lat;
                        agent.lng = storeCoords.lng;
                    } // else agent is at the calculated end of "to_store" path
                    
                    agent.legProgress = 0; // Reset progress, will count as time spent at store
                    order.storeArrivalTime = currentTime;
                    addLog(`Agent ${agent.id} arrived at store for Order ${order.id}.`, 'AGENT', currentSimTimeStr);
                } else if (agent.status === 'to_customer') {
                    agent.status = 'available';
                    agent.lat = order.lat; // Snap to customer location
                    agent.lng = order.lng;
                    order.status = 'delivered';
                    order.customerArrivalTime = currentTime;
                    order.deliveryTime = order.customerArrivalTime - order.timePlaced;
                    
                    totalDeliveryTimeIncrement += order.deliveryTime;
                    deliveredOrdersThisStep.push(order);
                    heatmapPointsToAdd.push({ lat: order.lat, lng: order.lng, count: 1 });

                    agent.deliveriesCompleted++;
                    agent.consecutiveDeliveriesSinceRest++;
                    addLog(`Order ${order.id} delivered by Agent ${agent.id}. Time: ${order.deliveryTime} min.`, 'DELIVERY', currentSimTimeStr);
                    agent.currentOrder = null;
                    agent.routePath = [];
                    agentActiveThisStep = false;
                }
            }
        }
        if (!agentActiveThisStep) agent.timeContinuouslyActive = 0; // Reset if became available
    });

    return { updatedAgents, updatedOrders, deliveredOrdersThisStep, totalDeliveryTimeIncrement, heatmapPointsToAdd };
}


// Placeholder for updateAgentFatigueLogic
function updateAgentFatigueLogic(currentAgents: Agent[], currentSimTimeStr: string, addLog: Function): Agent[] {
    const FATIGUE_THRESHOLD_DELIVERIES = 5;
    const FATIGUE_THRESHOLD_TIME_MIN = 180; // 3 hours
    const FATIGUE_RECOVERY_IDLE_TIME_MIN = 30; // 30 minutes idle to start recovery
    const FATIGUE_FACTOR_REDUCTION = 0.15; // Reduce by 15%
    const FATIGUE_FACTOR_RECOVERY_RATE = 0.25; // Recover by 25% per sufficient idle period

    return currentAgents.map(agent => {
        if (agent.status === 'available') {
            if (agent.fatigueFactor < 1.0 && agent.timeSpentIdle >= FATIGUE_RECOVERY_IDLE_TIME_MIN) {
                const newFatigueFactor = Math.min(1.0, agent.fatigueFactor + FATIGUE_FACTOR_RECOVERY_RATE);
                if (newFatigueFactor > agent.fatigueFactor) { // Only log if there's a change
                    agent.fatigueFactor = newFatigueFactor;
                    agent.timeContinuouslyActive = 0; // Reset continuous active time
                    agent.consecutiveDeliveriesSinceRest = 0; // Reset deliveries
                    if (agent.fatigueFactor === 1.0) {
                        addLog(`Agent ${agent.id} fully recovered from fatigue.`, 'AGENT', currentSimTimeStr);
                    } else {
                        addLog(`Agent ${agent.id} recovering. Fatigue factor: ${agent.fatigueFactor.toFixed(2)}`, 'AGENT', currentSimTimeStr);
                    }
                }
            }
        } else { // Agent is busy
            agent.timeSpentIdle = 0; // Reset idle time if busy
            if (agent.fatigueFactor > 0.5) { // Min fatigue factor
                if (agent.consecutiveDeliveriesSinceRest >= FATIGUE_THRESHOLD_DELIVERIES ||
                    agent.timeContinuouslyActive >= FATIGUE_THRESHOLD_TIME_MIN) {
                    
                    agent.fatigueFactor = Math.max(0.5, agent.fatigueFactor - FATIGUE_FACTOR_REDUCTION);
                    agent.consecutiveDeliveriesSinceRest = 0; // Reset counter after fatigue hits
                    agent.timeContinuouslyActive = 0; // Reset continuous active time counter
                    addLog(`Agent ${agent.id} fatigue increased. Factor: ${agent.fatigueFactor.toFixed(2)}`, 'AGENT', currentSimTimeStr);
                }
            }
        }
        return agent;
    });
}

// UI Update functions
function updateAgentMarkers(agents: Agent[], layerGroup: L.LayerGroup, map: L.Map | null) {
    if (!map) return;
    layerGroup.clearLayers();
    agents.forEach(agent => {
        const marker = L.marker([agent.lat, agent.lng], {
            icon: mapUtils.createAgentIcon(agent.id, agent.status !== 'available'),
            zIndexOffset: 500
        }).bindPopup(`<b>Agent ${agent.id.substring(0,8)}</b><br>Status: ${agent.status}<br>Order: ${agent.currentOrder?.substring(0,8) || 'None'}<br>Fatigue: ${agent.fatigueFactor.toFixed(2)}`);
        marker.addTo(layerGroup);
    });
}

function updateOrderMarkers(orders: Order[], layerGroup: L.LayerGroup, map: L.Map | null) {
    if (!map) return;
    layerGroup.clearLayers();
    orders.filter(o => o.status === 'pending' || o.status === 'assigned' || o.status === 'picked_up').forEach(order => {
        L.marker([order.lat, order.lng], { icon: mapUtils.createOrderIcon(order.id, order.status) })
            .bindPopup(`<b>Order ${order.id.substring(0,8)}</b><br>Status: ${order.status}<br>Agent: ${order.assignedAgentId?.substring(0,8) || 'None'}`)
            .addTo(layerGroup);
    });
}

let chartUpdateCounter = 0;
const CHART_UPDATE_INTERVAL_SIM_STEPS = 1; // Update charts every simulation step

function updateLiveCharts(
    currentTime: number,
    orders: Order[],
    agents: Agent[],
    pendingOrdersChartKey: string,
    activeAgentsChartKey: string
) {
    chartUpdateCounter++;
    if (chartUpdateCounter % CHART_UPDATE_INTERVAL_SIM_STEPS !== 0 && currentTime > 0) return; // Allow initial draw even if not running

    const currentSimTimeStr = formatSimTime(currentTime);
    const pendingOrdersCount = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length;
    const activeAgentsCount = agents.filter(a => a.status !== 'available').length;

    const pendingOrdersChart = chartUtils.getChartInstance(pendingOrdersChartKey);
    if (pendingOrdersChart) {
        if (pendingOrdersChart.data.labels && pendingOrdersChart.data.labels.length > 25) { // Keep last 25 points
            pendingOrdersChart.data.labels.shift();
            pendingOrdersChart.data.datasets[0].data.shift();
        }
        pendingOrdersChart.data.labels?.push(currentSimTimeStr);
        pendingOrdersChart.data.datasets[0].data.push(pendingOrdersCount);
        pendingOrdersChart.update('none'); // 'none' for smoother animation if available
    }

    const activeAgentsChart = chartUtils.getChartInstance(activeAgentsChartKey);
    if (activeAgentsChart) {
        if (activeAgentsChart.data.labels && activeAgentsChart.data.labels.length > 25) {
            activeAgentsChart.data.labels.shift();
            activeAgentsChart.data.datasets[0].data.shift();
        }
        activeAgentsChart.data.labels?.push(currentSimTimeStr);
        activeAgentsChart.data.datasets[0].data.push(activeAgentsCount);
        activeAgentsChart.update('none');
    }
}


export default SimulationSection;

