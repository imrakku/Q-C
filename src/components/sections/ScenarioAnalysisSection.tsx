import React, { useState, useEffect, useCallback } from 'react';
import { useModal } from '../../contexts/ModalContext';
import { SCENARIO_STORAGE_KEY } from '../../data/ccrData';
import { Scenario, SimulationParams, SimulationStats } from '../../types';
import { createLogEntry, LogEntry, initialSystemLog } from '../../utils/logger';
import LogPanel from '../common/LogPanel';
import { Trash2, GitCompareArrows } from 'lucide-react'; // Icons

const ScenarioAnalysisSection: React.FC = () => {
  const { showModal } = useModal();
  const [savedScenarios, setSavedScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>([]);
  const [comparisonTableHtml, setComparisonTableHtml] = useState<string>('');
  const [logs, setLogs] = useState<LogEntry[]>([initialSystemLog('compare scenarios', 'Scenario Analysis (CCR)')]);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'SYSTEM') => {
    setLogs(prevLogs => [...prevLogs, createLogEntry(message, type)]);
  }, []);

  const loadScenarios = useCallback(() => {
    const stored = localStorage.getItem(SCENARIO_STORAGE_KEY);
    if (stored) {
      try {
        const parsedScenarios: Scenario[] = JSON.parse(stored);
        setSavedScenarios(parsedScenarios);
        addLog(`Loaded ${parsedScenarios.length} scenarios from local storage.`, 'SYSTEM');
      } catch (e) {
        console.error("Error parsing scenarios from local storage", e);
        setSavedScenarios([]);
        localStorage.removeItem(SCENARIO_STORAGE_KEY); // Clear corrupted data
        addLog("Error loading scenarios. Storage cleared.", "ERROR");
      }
    } else {
      addLog("No scenarios found in local storage.", "INFO");
    }
  }, [addLog]);

  useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  const handleScenarioSelection = (scenarioId: string, isSelected: boolean) => {
    setSelectedScenarioIds(prev =>
      isSelected ? [...prev, scenarioId] : prev.filter(id => id !== scenarioId)
    );
  };

  const clearAllScenarios = () => {
    showModal("Confirm Deletion", "Are you sure you want to delete ALL saved scenarios? This cannot be undone.", () => {
      localStorage.removeItem(SCENARIO_STORAGE_KEY);
      setSavedScenarios([]);
      setSelectedScenarioIds([]);
      setComparisonTableHtml('');
      addLog('All saved scenarios cleared.', 'SYSTEM');
      showModal("Scenarios Cleared", "All saved scenarios have been deleted.");
    });
  };

  const compareSelected = () => {
    if (selectedScenarioIds.length === 0) {
      showModal("Selection Error", "Please select at least one scenario to view, or two or more to compare.");
      return;
    }
    const scenariosToCompare = savedScenarios.filter(s => selectedScenarioIds.includes(s.id));
    if (scenariosToCompare.length === 0) {
      setComparisonTableHtml('<p class="text-slate-500 p-6 text-center">Error: Could not find selected scenarios.</p>');
      return;
    }

    // Define keys and display names for parameters and statistics
    const paramKeys: { key: keyof SimulationParams; name: string }[] = [
        { key: 'numAgents', name: "Agents" },
        { key: 'agentSpeed', name: "Agent Speed (km/h)" },
        { key: 'orderGenerationProfile', name: "Order Profile" },
        { key: 'baseTrafficFactor', name: "Base Traffic Factor" },
        { key: 'enableDynamicTraffic', name: "Dynamic Traffic" },
        { key: 'simulationDurationRun', name: "Sim Duration (min)" }
    ];
    const statKeys: { key: keyof SimulationStats; name: string }[] = [
        { key: 'totalOrdersGenerated', name: "Generated Orders" },
        { key: 'totalOrdersDelivered', name: "Delivered Orders" },
        { key: 'averageDeliveryTimeMin', name: "Avg. Delivery Time (min)" },
        { key: 'totalAgentTravelDistanceKm', name: "Total Agent Distance (km)" },
        { key: 'averageAgentUtilizationPercent', name: "Avg. Agent Utilization (%)" }
    ];

    let tableHTML = `<table class="w-full text-sm"><thead class="sticky top-0 z-10 bg-slate-200"><tr><th class="sticky left-0 z-20 bg-slate-200 text-left px-2 py-2">Metric</th>`;
    scenariosToCompare.forEach(s => { tableHTML += `<th class="text-center px-2 py-2 whitespace-nowrap">${s.name.length > 15 ? s.name.substring(0,12)+'...' : s.name}</th>`; });
    tableHTML += `</tr></thead><tbody class="divide-y divide-slate-200">`;
    tableHTML += `<tr><td colspan="${scenariosToCompare.length + 1}" class="px-2 py-1.5 bg-slate-300 font-semibold text-slate-700 text-xs sticky left-0 z-20">Parameters</td></tr>`;
    paramKeys.forEach(({ key, name }) => {
        tableHTML += `<tr><td class="font-medium text-slate-700 sticky left-0 z-20 bg-white px-2 py-1.5 whitespace-nowrap">${name}</td>`;
        scenariosToCompare.forEach(s => {
            let val = s.parameters[key];
            if (typeof val === 'boolean') val = val ? 'Yes' : 'No';
            if (val === undefined || val === null) val = 'N/A';
            tableHTML += `<td class="text-center px-2 py-1.5">${val}</td>`;
        });
        tableHTML += `</tr>`;
    });
    tableHTML += `<tr><td colspan="${scenariosToCompare.length + 1}" class="px-2 py-1.5 bg-slate-300 font-semibold text-slate-700 text-xs sticky left-0 z-20">Statistics (KPIs)</td></tr>`;
    statKeys.forEach(({ key, name }) => {
        tableHTML += `<tr><td class="font-medium text-slate-700 sticky left-0 z-20 bg-white px-2 py-1.5 whitespace-nowrap">${name}</td>`;
        scenariosToCompare.forEach(s => {
            let val = s.statistics[key];
            if (typeof val === 'number') val = val.toFixed(1);
            if (val === undefined || val === null || val === 'NaN') val = 'N/A';
            tableHTML += `<td class="text-center px-2 py-1.5">${val}</td>`;
        });
        tableHTML += `</tr>`;
    });
    tableHTML += `</tbody></table>`;

    setComparisonTableHtml(tableHTML);
    addLog(`Compared ${scenariosToCompare.length} scenarios.`, 'SYSTEM');
  };


  return (
    <section id="scenario-analysis" className="p-6 sm:p-8 bg-white rounded-xl shadow-xl mb-8">
      <h2 className="text-3xl font-bold text-slate-900 mb-6 pb-4 border-b border-slate-300">Scenario Comparison (CCR)</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Saved Scenarios List */}
        <div className="lg:col-span-1 control-panel">
          <h3>Saved Scenarios (Local Storage)</h3>
          <div className="control-group">
            <div className="max-h-[400px] overflow-y-auto space-y-1.5 border border-slate-300 rounded-lg p-1.5 bg-slate-100 shadow-inner mb-1 styled-scrollbar">
              {savedScenarios.length === 0 && <p className="text-slate-500 p-3 text-center">No scenarios saved yet. Save scenarios from the Simulation module.</p>}
              {savedScenarios.map(scenario => (
                <div key={scenario.id} className="flex items-center justify-between p-2 border-b border-slate-200 hover:bg-slate-200 transition-colors text-sm">
                  <label className="flex items-center cursor-pointer flex-grow">
                    <input
                      type="checkbox"
                      name="scenarioToCompare"
                      value={scenario.id}
                      checked={selectedScenarioIds.includes(scenario.id)}
                      onChange={(e) => handleScenarioSelection(scenario.id, e.target.checked)}
                      className="mr-2.5 h-4 w-4 accent-slate-600"
                    />
                    <span className="font-medium text-slate-800 flex-grow truncate" title={scenario.name}>{scenario.name}</span>
                  </label>
                  <em className="ml-2 text-xs text-slate-500 whitespace-nowrap">({scenario.timestamp})</em>
                </div>
              ))}
            </div>
          </div>
          <button onClick={compareSelected} className="btn btn-primary w-full flex items-center justify-center" disabled={selectedScenarioIds.length === 0}>
            <GitCompareArrows size={18} className="mr-2"/> Compare Selected Scenarios
          </button>
          <button onClick={clearAllScenarios} className="btn btn-danger w-full mt-3 btn-sm flex items-center justify-center" disabled={savedScenarios.length === 0}>
           <Trash2 size={16} className="mr-2"/> Clear All Saved Scenarios
          </button>
        </div>

        {/* Comparison Details Area */}
        <div className="lg:col-span-2 control-panel">
          <h3>Comparison Details</h3>
          <div className="overflow-x-auto styled-scrollbar p-0.5 bg-slate-50 rounded-md border border-slate-200 min-h-[200px]">
            {comparisonTableHtml ?
              <div dangerouslySetInnerHTML={{ __html: comparisonTableHtml }} /> :
              <p className="text-slate-500 p-6 text-center">Select scenarios and click "Compare Selected" to see details.</p>
            }
          </div>
        </div>
      </div>
      <LogPanel logEntries={logs} title="Scenario Log" heightClass="h-32" />
    </section>
  );
};

export default ScenarioAnalysisSection;
