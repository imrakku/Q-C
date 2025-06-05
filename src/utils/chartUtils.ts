import { Chart, ChartConfiguration, ChartDataset as ChartJSDataset, ChartTypeRegistry, UpdateMode } from 'chart.js/auto';
import { twColors } from '../data/ccrData'; // Assuming twColors is exported for rich log colors
import { ChartData } from '../types'; // Your custom ChartData type

// It's good practice to set defaults once, perhaps in your main App.tsx or a setup file.
// For this utility, we ensure they are applied if not already.
// Chart.defaults.font.family = 'Inter';
// Chart.defaults.color = twColors.slate[700]; // e.g., '#334155'

// Registry to keep track of chart instances
const chartRegistry: Record<string, Chart> = {};

// Helper to get a specific color from your twColors object
const getTailwindColor = (colorName: keyof typeof twColors, shade: keyof typeof twColors[keyof typeof twColors]): string => {
    const colorGroup = twColors[colorName];
    if (colorGroup && typeof colorGroup === 'object' && shade in colorGroup) {
        return (colorGroup as any)[shade] as string;
    }
    return '#000000'; // Default fallback color
};


export const initializeChart = (
  canvasId: string,
  chartKey: string, // Unique key for this chart instance
  chartConfig: ChartConfiguration // Use Chart.js's ChartConfiguration type
): Chart | null => {
  const canvasElement = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvasElement) {
    console.error(`Canvas element with ID '${canvasId}' not found.`);
    return null;
  }

  // If a chart instance already exists for this key, destroy it before creating a new one
  if (chartRegistry[chartKey]) {
    chartRegistry[chartKey].destroy();
    delete chartRegistry[chartKey];
  }

  try {
    // Apply global defaults if not already set by Chart.js itself or another part of the app
    Chart.defaults.font.family = Chart.defaults.font.family || 'Inter';
    Chart.defaults.color = Chart.defaults.color || getTailwindColor('slate', 700);


    const commonOptions: Partial<ChartConfiguration['options']> = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: {
                    font: { size: 11 },
                    color: getTailwindColor('slate', 700),
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: { color: getTailwindColor('slate', 300) },
                ticks: { font: { size: 10 }, color: getTailwindColor('slate', 600) }
            },
            x: {
                grid: { display: false },
                ticks: { font: { size: 10 }, color: getTailwindColor('slate', 600), maxRotation: 0, autoSkipPadding: 10 }
            }
        }
    };

    // Deep merge options: chartConfig.options will override commonOptions if there are conflicts
    const finalOptions = {
        ...commonOptions,
        ...chartConfig.options,
        plugins: {
            ...commonOptions.plugins,
            ...chartConfig.options?.plugins,
        },
        scales: {
            x: {
                ...(commonOptions.scales?.x as object), // Type assertion
                ...(chartConfig.options?.scales?.x as object), // Type assertion
            },
            y: {
                ...(commonOptions.scales?.y as object), // Type assertion
                ...(chartConfig.options?.scales?.y as object), // Type assertion
            },
        }
    };


    const newChart = new Chart(canvasElement, { ...chartConfig, options: finalOptions });
    chartRegistry[chartKey] = newChart;
    return newChart;
  } catch (error: any) {
    console.error(`Chart initialization error for '${chartKey}' on ID '${canvasId}': ${error.message}`, error);
    return null;
  }
};

export const updateChartData = (
  chartKey: string,
  newLabels: string[],
  newDatasets: ChartJSDataset<keyof ChartTypeRegistry, number[]>[], // Use Chart.js's Dataset type
  updateMode?: UpdateMode // 'none', 'active', 'hide', 'show', 'reset', 'resize', 'normal' (default)
): void => {
  const chart = chartRegistry[chartKey];
  if (chart) {
    chart.data.labels = newLabels;
    chart.data.datasets = newDatasets;
    chart.update(updateMode);
  } else {
    console.warn(`Chart with key '${chartKey}' not found for updating.`);
  }
};

export const getChartInstance = (chartKey: string): Chart | undefined => {
  return chartRegistry[chartKey];
};

export const destroyChart = (chartKey: string): void => {
    if (chartRegistry[chartKey]) {
        chartRegistry[chartKey].destroy();
        delete chartRegistry[chartKey];
    }
};

// Utility to calculate Standard Deviation, often used with chart data
export const calculateStdDev = (dataArray: number[], mean?: number): number => {
  if (!dataArray || dataArray.length === 0) return 0;
  const m = mean !== undefined ? mean : dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
  const variance = dataArray.reduce((sq, n) => sq + Math.pow(n - m, 2), 0) / (dataArray.length <= 1 ? 1 : dataArray.length -1); // Use n-1 for sample stddev
  return Math.sqrt(variance);
};

// Function to create a basic line chart configuration (example)
export const createLineChartConfig = (
    labels: string[],
    datasets: ChartJSDataset<'line', number[]>[]
): ChartConfiguration<'line'> => {
    return {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets,
        },
        // options can be further customized here or use the defaults from initializeChart
    };
};

// Function to create a basic bar chart configuration (example)
export const createBarChartConfig = (
    labels: string[],
    datasets: ChartJSDataset<'bar', number[]>[]
): ChartConfiguration<'bar'> => {
    return {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets,
        },
    };
};


// Example dataset structure for a line chart
export const createLineDataset = (
    label: string,
    data: number[],
    borderColor?: string,
    backgroundColor?: string,
    tension: number = 0.3,
    fill: boolean = true,
    pointRadius: number = 1,
    pointHoverRadius: number = 4
): ChartJSDataset<'line', number[]> => {
    return {
        label,
        data,
        borderColor: borderColor || getTailwindColor('slate', 600),
        backgroundColor: backgroundColor || `rgba(${hexToRgb(getTailwindColor('slate', 600))}, 0.1)`,
        tension,
        fill,
        pointRadius,
        pointHoverRadius,
    };
};

// Example dataset structure for a bar chart
export const createBarDataset = (
    label: string,
    data: number[],
    backgroundColor?: string,
    barThickness?: number
): ChartJSDataset<'bar', number[]> => {
    return {
        label,
        data,
        backgroundColor: backgroundColor || getTailwindColor('slate', 500),
        barThickness: barThickness || 15,
    };
};

// Helper function to convert hex color to rgb string for rgba backgrounds
function hexToRgb(hex: string): string | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : null;
}

