import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { useModal } from '../../contexts/ModalContext';
import * as chartUtils from '../../utils/chartUtils';
import * as mapUtils from '../../utils/mapUtils'; // For distance calculations if needed for cost
import {
  ccrSectors, defaultDarkStoreLocationSim,
  MIN_DELIVERY_COMPLETION_RATE_TARGET, TARGET_SLA_PERCENTAGE_TARGET,
  IDEAL_AGENT_UTILIZATION_MIN_PERCENT, IDEAL_AGENT_UTILIZATION_MAX_PERCENT,
  BASE_HANDLING_TIME_MIN_OPT, AGENT_COST_PER_HOUR, COST_PER_KM_TRAVEL,
  MINUTES_PER_SIMULATION_STEP
} from '../../data/ccrData';
import {
  DarkStore, CustomDemandProfile, OptimizationIterationResult, SimplifiedSimRunStats, LatLngTuple
} from '../../types';
import { createLogEntry, LogEntry, initialSystemLog } from '../../utils/logger';
import { generateUniqueId, fetchGeminiTextGeneration, arrayToCsv, downloadFile } from '../../utils/helpers';
import LogPanel from '../common/LogPanel';
import Spinner from '../common/Spinner';
import SliderInput from '../common/SliderInput';

const WorkforceOptimizationSection: React.FC = () => {
  const { clusteredDarkStores, customDemandProfiles, geminiApiKey } = useAppContext();
  const { showModal } = useModal();

  const [optParams, setOptParams] = useState({
    targetAvgDeliveryTime: 25,
    selectedDarkStoreIndex: '', // Index in clusteredDarkStores array
    demandProfileId: 'default_opt_uniform_ccr',
    minAgentsToTest: 10,
    maxAgentsToTest: 40,
    numRunsPerAgentCount: 3,
    maxSimTimePerIteration: 120, // minutes
  });

  const [optimizationResults, setOptimizationResults] = useState<OptimizationIterationResult[]>([]);
  const [recommendation, setRecommendation] = useState<string>('Optimization recommendation will appear here.');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [aiAnalysisOutput, setAiAnalysisOutput] = useState<string | null>(null);
  const [aiExplainOutput, setAiExplainOutput] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([initialSystemLog('run optimization', 'Workforce Optimization (CCR)')]);
  const lastAIExplainRequestTimeRef = useRef<number>(0);
  const aiExplainCooldownMs = 60000; // 1 minute

  const optChartKeys = [
    'optDeliveryTimeChart', 'optUtilizationChart',
    'optCostPerOrderChart', 'optOrdersDeliveredChart'
  ];

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'SYSTEM') => {
    setLogs(prevLogs => [...prevLogs, createLogEntry(message, type)]);
  }, []);

  useEffect(() => {
    optChartKeys.forEach(key => chartUtils.destroyChart(key)); // Clear previous charts on mount/param change
    // Initialize charts (can also be done once on mount)
    chartUtils.initializeChart('optDeliveryTimeChart', optChartKeys[0], {type: 'line', data: {labels:[], datasets: [chartUtils.createLineDataset('Avg. Delivery Time (min)',[])]}});
    chartUtils.initializeChart('optUtilizationChart', optChartKeys[1], {type: 'line', data: {labels:[], datasets: [chartUtils.createLineDataset('Avg. Agent Utilization (%)',[])]}, options: {scales: {y: {max:100, beginAtZero:true}}}});
    chartUtils.initializeChart('optCostPerOrderChart', optChartKeys[2], {type: 'line', data: {labels:[], datasets: [chartUtils.createLineDataset('Avg. Cost/Order (INR)',[], undefined, undefined, 0.3, true, 2, 5)]}, options: {scales: {y: {beginAtZero: true}}}}); // spanGaps might be useful here
    chartUtils.initializeChart('optOrdersDeliveredChart', optChartKeys[3], {type: 'bar', data: {labels:[], datasets: [chartUtils.createBarDataset('Avg. Orders Delivered',[])]}});
    
    return () => optChartKeys.forEach(key => chartUtils.destroyChart(key));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Initialize charts once

  const handleParamChange = (param: keyof typeof optParams, value: string | number) => {
    setOptParams(prev => ({ ...prev, [param]: value }));
  };

  const simplifiedSimulationRun = async (
    numAgents: number,
    darkStore: DarkStore, // The selected dark store
    demandProfileId: string,
    maxSimTime: number,
    targetSLA: number // targetAvgDeliveryTime
  ): Promise<SimplifiedSimRunStats> => {
    let currentTime = 0;
    let orders: { id: string; lat: number; lng: number; timePlaced: number; status: 'pending' | 'assigned' | 'delivered'; deliveryTime?: number }[] = [];
    let orderIdCounter = 0;
    let generatedOrders = 0;
    let deliveredOrders = 0;
    let totalDeliveryTime = 0;
    let ordersMeetingSLA = 0;
    let totalDistanceKmThisRun = 0;
    let totalAgentActiveTimeThisRun = 0;

    const agents = Array(numAgents).fill(null).map(() => ({
        availableAtTime: 0, // Sim time when agent becomes free
        totalActiveTimeThisRun: 0,
        distanceThisRun: 0,
    }));

    // Order Generation based on profile (simplified from main simulation)
    const profile = customDemandProfiles.find(p => p.id === demandProfileId);
    for (let t_step = 0; t_step < maxSimTime; t_step += MINUTES_PER_SIMULATION_STEP) {
        const currentHour = Math.floor((t_step / 60) % 24);
        let ordersThisStep = 0;
        if (profile) {
            profile.zones.forEach(zone => {
                if (t_step >= zone.startTime * 60 && t_step <= zone.endTime * 60) {
                    const ordersPerHour = zone.minOrders + Math.random() * (zone.maxOrders - zone.minOrders);
                    ordersThisStep += ordersPerHour * (MINUTES_PER_SIMULATION_STEP / 60);
                }
            });
        } else { // Default profiles
            const baseOrderRate = (demandProfileId === 'default_opt_peak_ccr') ? 0.6 : 0.25;
            ordersThisStep = baseOrderRate * MINUTES_PER_SIMULATION_STEP;
        }

        if (Math.random() < (ordersThisStep - Math.floor(ordersThisStep))) ordersThisStep = Math.ceil(ordersThisStep);
        else ordersThisStep = Math.floor(ordersThisStep);

        for (let i = 0; i < ordersThisStep; i++) {
            orderIdCounter++; generatedOrders++;
            // Orders generated around the selected dark store for this optimization run
            const orderCoords = mapUtils.getRandomPointNearHotspot(darkStore.coords, 5); // 5km radius for simplified opt
            orders.push({ id: `OptO${orderIdCounter}`, lat: orderCoords[0], lng: orderCoords[1], timePlaced: t_step, status: 'pending' });
        }
    }
    if (generatedOrders === 0 && orders.length > 0) generatedOrders = orders.length; // Ensure generatedOrders is at least count of manually pushed orders
    if (generatedOrders === 0) generatedOrders = 1; // Avoid division by zero if no orders

    // Event-driven simplified simulation core
    orders.sort((a,b) => a.timePlaced - b.timePlaced); // Process orders chronologically

    for (const order of orders) {
        if (currentTime > maxSimTime) break; // Stop if max sim time exceeded

        // Find the earliest available agent
        let earliestAgentIndex = -1;
        let earliestAvailableTime = Infinity;
        agents.forEach((agent, index) => {
            if (agent.availableAtTime < earliestAvailableTime) {
                earliestAvailableTime = agent.availableAtTime;
                earliestAgentIndex = index;
            }
        });
        
        if (earliestAgentIndex === -1) continue; // Should not happen if agents exist

        // Agent becomes busy at max(order.timePlaced, agent.availableAtTime)
        const engagementTime = Math.max(order.timePlaced, agents[earliestAgentIndex].availableAtTime);
        if (engagementTime > maxSimTime) continue; // Order picked too late

        currentTime = engagementTime; // Advance simulation time to when agent picks up order

        const distStoreToCustomer = mapUtils.getDistanceKm(darkStore.coords, [order.lat, order.lng]);
        const travelTime = (distStoreToCustomer / 20) * 60; // Avg speed 20km/h for opt
        const deliveryDuration = travelTime + BASE_HANDLING_TIME_MIN_OPT;
        
        const completionTime = currentTime + deliveryDuration;
        if (completionTime > maxSimTime) continue; // Delivery would complete after sim ends

        order.status = 'delivered';
        deliveredOrders++;
        order.deliveryTime = completionTime - order.timePlaced;
        totalDeliveryTime += order.deliveryTime;
        if (order.deliveryTime <= targetSLA) ordersMeetingSLA++;
        
        agents[earliestAgentIndex].availableAtTime = completionTime;
        agents[earliestAgentIndex].totalActiveTimeThisRun += deliveryDuration;
        agents[earliestAgentIndex].distanceThisRun += distStoreToCustomer;
        totalDistanceKmThisRun += distStoreToCustomer;
    }
    
    totalAgentActiveTimeThisRun = agents.reduce((sum,a) => sum + a.totalActiveTimeThisRun, 0);
    const avgUtilization = (totalAgentActiveTimeThisRun / (numAgents * maxSimTime)) * 100;

    return {
        deliveredOrders, totalDeliveryTime,
        avgUtilization: isNaN(avgUtilization) ? 0 : avgUtilization,
        ordersMeetingSLA, generatedOrders, totalDistanceKm: totalDistanceKmThisRun
    };
  };


  const runOptimization = async () => {
    if (isLoading) { showModal("In Progress", "Optimization is already running."); return; }
    if (optParams.selectedDarkStoreIndex === '' || clusteredDarkStores.length === 0) {
      showModal("Setup Error", "Please select a dark store. Run Clustering module if no stores are available."); return;
    }
    setIsLoading(true); setOptimizationResults([]); setRecommendation(''); setAiAnalysisOutput(null); setAiExplainOutput(null);
    addLog('Starting workforce optimization for CCR...', 'SYSTEM');

    const selectedStore = clusteredDarkStores[parseInt(optParams.selectedDarkStoreIndex)];
    if (!selectedStore) {
      showModal("Error", "Selected dark store not found."); setIsLoading(false); return;
    }

    const allIterationsData: OptimizationIterationResult[] = [];

    for (let numAgents = optParams.minAgentsToTest; numAgents <= optParams.maxAgentsToTest; numAgents++) {
      const runResultsForAgentCount: SimplifiedSimRunStats[] = [];
      addLog(`Optimizing for ${numAgents} agents...`, 'INFO');
      for (let run = 0; run < optParams.numRunsPerAgentCount; run++) {
        addLog(`  Run ${run + 1}/${optParams.numRunsPerAgentCount} for ${numAgents} agents.`, 'INFO');
        // Add a small delay to allow UI updates if needed, and prevent freezing on long loops
        await new Promise(resolve => setTimeout(resolve, 10)); 
        const singleRunStats = await simplifiedSimulationRun(
          numAgents, selectedStore, optParams.demandProfileId,
          optParams.maxSimTimePerIteration, optParams.targetAvgDeliveryTime
        );
        runResultsForAgentCount.push(singleRunStats);
      }

      const totalDelivered = runResultsForAgentCount.reduce((s, r) => s + r.deliveredOrders, 0);
      const totalGenerated = runResultsForAgentCount.reduce((s,r) => s + r.generatedOrders, 0);

      const aggregated: OptimizationIterationResult = {
        numAgents,
        avgDeliveredOrders: totalDelivered / optParams.numRunsPerAgentCount,
        avgDeliveryTime: totalDelivered > 0 ? runResultsForAgentCount.reduce((s, r) => s + r.totalDeliveryTime, 0) / totalDelivered : 0,
        avgAgentUtilization: runResultsForAgentCount.reduce((s, r) => s + r.avgUtilization, 0) / optParams.numRunsPerAgentCount,
        avgTravelDistanceKm: runResultsForAgentCount.reduce((s, r) => s + r.totalDistanceKm, 0) / optParams.numRunsPerAgentCount,
        percentageMeetingSLA: totalDelivered > 0 ? (runResultsForAgentCount.reduce((s, r) => s + r.ordersMeetingSLA, 0) / totalDelivered) * 100 : 0,
        completionRate: totalGenerated > 0 ? (totalDelivered / totalGenerated) * 100 : 0,
        avgCostPerOrder: 0, // Calculate below
      };
      
      const totalAgentHoursForAllRuns = numAgents * (optParams.maxSimTimePerIteration / 60) * optParams.numRunsPerAgentCount;
      const totalLaborCost = totalAgentHoursForAllRuns * AGENT_COST_PER_HOUR;
      const totalTravelCostForAllRuns = aggregated.avgTravelDistanceKm * optParams.numRunsPerAgentCount * COST_PER_KM_TRAVEL;
      const totalOperationalCost = totalLaborCost + totalTravelCostForAllRuns;
      const totalDeliveredOverAllRuns = aggregated.avgDeliveredOrders * optParams.numRunsPerAgentCount;

      aggregated.avgCostPerOrder = totalDeliveredOverAllRuns > 0 ? totalOperationalCost / totalDeliveredOverAllRuns : Infinity;
      allIterationsData.push(aggregated);
      setOptimizationResults([...allIterationsData]); // Update state incrementally for live chart updates
    }
    generateAndSetRecommendation(allIterationsData);
    setIsLoading(false);
    addLog('Workforce optimization complete for CCR.', 'SYSTEM');
  };

  const generateAndSetRecommendation = (data: OptimizationIterationResult[]) => {
    if (data.length === 0) { setRecommendation("No data for recommendation."); return; }

    let candidates = data.filter(iter =>
      iter.completionRate >= MIN_DELIVERY_COMPLETION_RATE_TARGET * 100 &&
      iter.percentageMeetingSLA >= TARGET_SLA_PERCENTAGE_TARGET * 100 &&
      iter.avgDeliveryTime <= optParams.targetAvgDeliveryTime
    );
    if (candidates.length === 0) candidates = data.filter(iter => iter.completionRate >= (MIN_DELIVERY_COMPLETION_RATE_TARGET * 0.8 * 100)); // Relax completion
    if (candidates.length === 0) candidates = [...data]; // Use all data if still no candidates

    candidates.sort((a, b) => {
      if (a.avgCostPerOrder !== b.avgCostPerOrder) return (isFinite(a.avgCostPerOrder) ? a.avgCostPerOrder : Infinity) - (isFinite(b.avgCostPerOrder) ? b.avgCostPerOrder : Infinity);
      const a_in_ideal_util = a.avgAgentUtilization >= IDEAL_AGENT_UTILIZATION_MIN_PERCENT && a.avgAgentUtilization <= IDEAL_AGENT_UTILIZATION_MAX_PERCENT;
      const b_in_ideal_util = b.avgAgentUtilization >= IDEAL_AGENT_UTILIZATION_MIN_PERCENT && b.avgAgentUtilization <= IDEAL_AGENT_UTILIZATION_MAX_PERCENT;
      if (a_in_ideal_util && !b_in_ideal_util) return -1;
      if (!a_in_ideal_util && b_in_ideal_util) return 1;
      const idealCenterUtil = (IDEAL_AGENT_UTILIZATION_MIN_PERCENT + IDEAL_AGENT_UTILIZATION_MAX_PERCENT) / 2;
      return Math.abs(a.avgAgentUtilization - idealCenterUtil) - Math.abs(b.avgAgentUtilization - idealCenterUtil);
    });

    const best = candidates[0];
    let recText = "";
    if (best) {
      recText = `Based on the analysis for CCR, employing **${best.numAgents} agents** appears to be the most balanced option.
        - Avg. Delivery Time: **${(best.avgDeliveryTime || 0).toFixed(1)} min** (Target: ${optParams.targetAvgDeliveryTime} min)
        - Orders Meeting SLA: **${(best.percentageMeetingSLA || 0).toFixed(1)}%** (Goal: ${TARGET_SLA_PERCENTAGE_TARGET * 100}%)
        - Order Completion Rate: **${(best.completionRate || 0).toFixed(1)}%** (Goal: ${MIN_DELIVERY_COMPLETION_RATE_TARGET * 100}%)
        - Avg. Agent Utilization: **${(best.avgAgentUtilization || 0).toFixed(1)}%** (Ideal: ${IDEAL_AGENT_UTILIZATION_MIN_PERCENT}-${IDEAL_AGENT_UTILIZATION_MAX_PERCENT}%)
        - Avg. Cost Per Order: **${isFinite(best.avgCostPerOrder) ? `INR ${best.avgCostPerOrder.toFixed(2)}` : 'N/A'}**
        \n*Rationale: This configuration aims to balance service level and operational cost-efficiency for CCR.*`;
      if (best.avgDeliveryTime > optParams.targetAvgDeliveryTime) recText += `\n*Note: Avg. delivery time is above target. Consider if this is acceptable for CCR.*`;
      if (best.percentageMeetingSLA < TARGET_SLA_PERCENTAGE_TARGET * 100) recText += `\n*Note: SLA adherence is below target. This might impact customer satisfaction.*`;
    } else {
      recText = "Could not determine a clear optimal number of agents. Review table and adjust parameters.";
    }
    setRecommendation(recText);
  };

  // Update charts when optimizationResults change
  useEffect(() => {
    if (optimizationResults.length > 0) {
      const labels = optimizationResults.map(d => d.numAgents.toString());
      chartUtils.updateChartData(optChartKeys[0], labels, [chartUtils.createLineDataset('Avg. Delivery Time (min)', optimizationResults.map(d => d.avgDeliveryTime || 0))]);
      chartUtils.updateChartData(optChartKeys[1], labels, [chartUtils.createLineDataset('Avg. Agent Utilization (%)', optimizationResults.map(d => d.avgAgentUtilization || 0))]);
      chartUtils.updateChartData(optChartKeys[2], labels, [chartUtils.createLineDataset('Avg. Cost/Order (INR)', optimizationResults.map(d => isFinite(d.avgCostPerOrder) ? d.avgCostPerOrder : NaN))]); // Use NaN for Chart.js to handle gaps
      chartUtils.updateChartData(optChartKeys[3], labels, [chartUtils.createBarDataset('Avg. Orders Delivered', optimizationResults.map(d => d.avgDeliveredOrders))]);
    } else { // Clear charts if no results
        optChartKeys.forEach(key => {
            const chartInstance = chartUtils.getChartInstance(key);
            if(chartInstance) {
                 chartInstance.data.labels = [];
                 chartInstance.data.datasets.forEach(ds => ds.data = []);
                 chartInstance.update();
            }
        });
    }
  }, [optimizationResults, optChartKeys]);

  const handleExportResults = () => {
    if (optimizationResults.length === 0) { showModal("No Data", "No optimization data to export."); return; }
    const csvData = optimizationResults.map(iter => ({
      NumAgents: iter.numAgents, AvgDeliveredOrders: iter.avgDeliveredOrders.toFixed(1),
      AvgDeliveryTimeMin: (iter.avgDeliveryTime||0).toFixed(1), PercentageMeetingSLA: (iter.percentageMeetingSLA||0).toFixed(1),
      CompletionRatePercent: (iter.completionRate||0).toFixed(1), AvgAgentUtilizationPercent: (iter.avgAgentUtilization||0).toFixed(1),
      AvgCostPerOrderINR: isFinite(iter.avgCostPerOrder) ? iter.avgCostPerOrder.toFixed(2) : 'N/A',
      AvgTravelDistanceKmPerRun: iter.avgTravelDistanceKm.toFixed(1)
    }));
    downloadFile(arrayToCsv(csvData), `workforce_opt_results_ccr_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
    addLog('Workforce optimization results exported.', 'SYSTEM');
  };

  const prepareDataForAI = (forExplanation: boolean): object => {
    const params = {
        targetAvgDeliveryTime: optParams.targetAvgDeliveryTime,
        selectedDarkStore: clusteredDarkStores[parseInt(optParams.selectedDarkStoreIndex)]?.name || "N/A",
        demandProfile: customDemandProfiles.find(p => p.id === optParams.demandProfileId)?.name || optParams.demandProfileId,
        agentRangeTested: `${optParams.minAgentsToTest} to ${optParams.maxAgentsToTest}`,
        numRunsPerAgentCount: optParams.numRunsPerAgentCount,
        maxSimTimePerIteration: optParams.maxSimTimePerIteration
    };
    const resultsSummary = optimizationResults.map(d => ({
        agents: d.numAgents, avgDeliveryTime: parseFloat((d.avgDeliveryTime||0).toFixed(1)),
        slaMetPercent: parseFloat((d.percentageMeetingSLA||0).toFixed(1)),
        utilizationPercent: parseFloat((d.avgAgentUtilization||0).toFixed(1)),
        costPerOrder: isFinite(d.avgCostPerOrder)?parseFloat(d.avgCostPerOrder.toFixed(2)):null,
        deliveredOrders: parseFloat(d.avgDeliveredOrders.toFixed(1))
    }));
    const notes = forExplanation
        ? "Explain the provided workforce optimization recommendation for Chandigarh Capital Region (CCR) based on the data. Discuss trends and trade-offs that lead to this recommendation. Be clear and easy to understand."
        : "Analyze workforce optimization results for Chandigarh Capital Region (CCR). Goal: optimal agent count balancing service & cost. Comment on trends, recommendation, and strategic considerations.";
    return { optimizationParameters: params, optimizationResultsTableSummary: resultsSummary, currentRecommendation: recommendation, notes };
  };

  const handleAiAnalysis = async (isExplanation: boolean) => {
    if (optimizationResults.length === 0) { showModal("No Data", "Run optimization first."); return; }
    if (isExplanation && recommendation === 'Optimization recommendation will appear here.') { showModal("No Rec.", "Generate a recommendation first."); return; }
    if (isExplanation) {
        const now = Date.now();
        if (now - lastAIExplainRequestTimeRef.current < aiExplainCooldownMs) {
            showModal("AI Cooldown", `Please wait ${Math.ceil((aiExplainCooldownMs - (now - lastAIExplainRequestTimeRef.current))/1000)}s for another explanation.`); return;
        }
    }
    if (!geminiApiKey || geminiApiKey === "YOUR_GEMINI_API_KEY_HERE" || geminiApiKey.includes("AIzaSyDwjlcdDvgre9mLWR7abRx2qta_NFLISuI")) {
        showModal("API Key Error", "A valid Gemini API key is required."); return;
    }

    addLog(`Requesting AI ${isExplanation ? 'explanation' : 'analysis'}...`, 'AI');
    setIsLoadingAi(true); setAiAnalysisOutput(null); setAiExplainOutput(null);
    const aiData = prepareDataForAI(isExplanation);
    const prompt = `Data: ${JSON.stringify(aiData, null, 2)}. Task: ${aiData.notes}`;
    try {
      const responseText = await fetchGeminiTextGeneration(geminiApiKey, prompt);
      if (isExplanation) { setAiExplainOutput(responseText); lastAIExplainRequestTimeRef.current = Date.now(); }
      else { setAiAnalysisOutput(responseText); }
      addLog(`AI ${isExplanation ? 'explanation' : 'analysis'} received.`, 'AI');
    } catch (error: any) {
      addLog(`AI error: ${error.message}`, 'ERROR');
      if (isExplanation) setAiExplainOutput(`Error: ${error.message}`);
      else setAiAnalysisOutput(`Error: ${error.message}`);
    } finally { setIsLoadingAi(false); }
  };

  const darkStoreOptions = clusteredDarkStores.length > 0
    ? clusteredDarkStores.map((store, index) => ({ value: index.toString(), label: `${store.name} (${store.coords[0].toFixed(3)}, ${store.coords[1].toFixed(3)})` }))
    : [{ value: '', label: 'Run Clustering First' }];

  const demandProfileOptions = [
    { value: 'default_opt_uniform_ccr', label: 'Default Opt. Uniform (CCR)' },
    { value: 'default_opt_peak_ccr', label: 'Default Opt. Peak Hour (CCR)' },
    ...customDemandProfiles.map(p => ({ value: p.id, label: p.name })),
  ];


  return (
    <section id="workforce-opt" className="p-6 sm:p-8 bg-white rounded-xl shadow-xl mb-8">
      <h2 className="text-3xl font-bold text-slate-900 mb-6 pb-4 border-b border-slate-300">Workforce Optimization Analysis (CCR)</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Controls Panel */}
        <div className="lg:col-span-1 control-panel">
          <h3>Optimization Parameters</h3>
          <div className="control-group space-y-4">
            <h4 className="text-md font-semibold text-slate-700 -mb-1">Targets & Scope:</h4>
            <div>
                <label htmlFor="targetAvgDeliveryTimeOptCtrl">Target Avg. Delivery Time (min):</label>
                <input type="number" id="targetAvgDeliveryTimeOptCtrl" value={optParams.targetAvgDeliveryTime} onChange={e => handleParamChange('targetAvgDeliveryTime', parseInt(e.target.value))} disabled={isLoading} />
            </div>
            <div>
                <label htmlFor="darkStoreSelectOptCtrl">Select Dark Store (from CCR Clustering):</label>
                <select id="darkStoreSelectOptCtrl" value={optParams.selectedDarkStoreIndex} onChange={e => handleParamChange('selectedDarkStoreIndex', e.target.value)} disabled={isLoading || clusteredDarkStores.length === 0}>
                    <option value="">-- Select Store --</option>
                    {darkStoreOptions.map(opt => <option key={opt.value} value={opt.value} disabled={opt.value==='' && clusteredDarkStores.length > 0}>{opt.label}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="demandProfileSelectOptCtrl">Select Demand Profile (CCR):</label>
                <select id="demandProfileSelectOptCtrl" value={optParams.demandProfileId} onChange={e => handleParamChange('demandProfileId', e.target.value)} disabled={isLoading}>
                    {demandProfileOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
            </div>
          </div>
          <div className="control-group space-y-4">
            <h4 className="text-md font-semibold text-slate-700 -mb-1">Simulation Settings:</h4>
            <SliderInput id="minAgentsToTestOpt" label="Min Agents to Test" min={1} max={50} step={1} initialValue={optParams.minAgentsToTest} onChange={val => handleParamChange('minAgentsToTest', val)} disabled={isLoading}/>
            <SliderInput id="maxAgentsToTestOpt" label="Max Agents to Test" min={2} max={100} step={1} initialValue={optParams.maxAgentsToTest} onChange={val => handleParamChange('maxAgentsToTest', val)} disabled={isLoading}/>
            <SliderInput id="numRunsPerAgentCountOpt" label="Sim Runs per Agent Count" min={1} max={10} step={1} initialValue={optParams.numRunsPerAgentCount} onChange={val => handleParamChange('numRunsPerAgentCount', val)} disabled={isLoading}/>
            <SliderInput id="maxSimTimePerIterationOpt" label="Max Sim Time per Iteration (min)" min={30} max={360} step={30} initialValue={optParams.maxSimTimePerIteration} onChange={val => handleParamChange('maxSimTimePerIteration', val)} disabled={isLoading}/>
          </div>
          <button onClick={runOptimization} className="btn btn-primary w-full" disabled={isLoading || optParams.selectedDarkStoreIndex === ''}>
            {isLoading ? 'Optimizing...' : 'Run Optimization Analysis'}
          </button>
          {isLoading && <Spinner className="mt-4" />}
          <div className="control-actions">
            <button onClick={handleExportResults} className="btn btn-secondary w-full btn-sm" disabled={optimizationResults.length === 0}>Export Table (CSV)</button>
            <button onClick={() => handleAiAnalysis(false)} className="btn btn-info w-full btn-sm" disabled={isLoadingAi || optimizationResults.length === 0}>Get AI Analysis of Results</button>
            <button onClick={() => handleAiAnalysis(true)} className="btn btn-info w-full btn-sm" disabled={isLoadingAi || recommendation === 'Optimization recommendation will appear here.'}>✨ Explain Recommendation with AI</button>
          </div>
        </div>

        {/* Results Area */}
        <div className="lg:col-span-2">
          <h3 className="text-xl font-semibold text-slate-800 mb-4">Optimization Results Comparison</h3>
          <div className="overflow-x-auto bg-white p-1 rounded-lg border border-slate-200 shadow-md mb-8 max-h-[28rem] styled-scrollbar">
            {optimizationResults.length === 0 && !isLoading ? <p className="text-slate-500 p-6 text-center">Comparison table will appear here after running optimization.</p> :
            <table><thead><tr>
                <th>Agents</th><th>Avg Delivered</th><th>Avg Delivery Time (min)</th>
                <th>% SLA Met</th><th>% Completion</th><th>Avg Utilization (%)</th>
                <th>Avg Cost/Order (INR)</th><th>Avg Dist/Run (km)</th>
            </tr></thead><tbody>
            {optimizationResults.map(iter => (<tr key={iter.numAgents}>
                <td className="text-center">{iter.numAgents}</td><td className="text-center">{iter.avgDeliveredOrders.toFixed(1)}</td>
                <td className="text-center">{(iter.avgDeliveryTime || 0).toFixed(1)}</td><td className="text-center">{(iter.percentageMeetingSLA || 0).toFixed(1)}%</td>
                <td className="text-center">{(iter.completionRate || 0).toFixed(1)}%</td><td className="text-center">{(iter.avgAgentUtilization || 0).toFixed(1)}%</td>
                <td className="text-center">{isFinite(iter.avgCostPerOrder) ? iter.avgCostPerOrder.toFixed(2) : 'N/A'}</td>
                <td className="text-center">{iter.avgTravelDistanceKm.toFixed(1)}</td>
            </tr>))}</tbody></table>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white p-4 rounded-xl shadow-lg border border-slate-200"><canvas id="optDeliveryTimeChart" className="h-56"></canvas></div>
            <div className="bg-white p-4 rounded-xl shadow-lg border border-slate-200"><canvas id="optUtilizationChart" className="h-56"></canvas></div>
            <div className="bg-white p-4 rounded-xl shadow-lg border border-slate-200"><canvas id="optCostPerOrderChart" className="h-56"></canvas></div>
            <div className="bg-white p-4 rounded-xl shadow-lg border border-slate-200"><canvas id="optOrdersDeliveredChart" className="h-56"></canvas></div>
          </div>
          <div className="mt-6 p-6 bg-slate-50 border border-slate-200 rounded-xl shadow-lg">
            <h4 className="text-lg font-bold text-slate-800 mb-3">Recommendation:</h4>
            <pre className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">{recommendation}</pre>
          </div>
        </div>
      </div>

      {aiAnalysisOutput && (<div className="ai-output-area mt-6"><h3>AI Analysis & Strategic Considerations</h3><div className="styled-scrollbar whitespace-pre-wrap">{aiAnalysisOutput}</div></div>)}
      {aiExplainOutput && (<div className="ai-output-area mt-6"><h3>✨ AI Explanation of Recommendation</h3><div className="styled-scrollbar whitespace-pre-wrap">{aiExplainOutput}</div></div>)}
      
      <LogPanel logEntries={logs} title="Optimization Log" heightClass="h-40" />
    </section>
  );
};

export default WorkforceOptimizationSection;

