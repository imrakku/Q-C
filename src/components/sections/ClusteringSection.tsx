import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import * as mapUtils from '../../utils/mapUtils';
import { calculateStdDev } from '../../utils/chartUtils';
import { ccrGeoJsonPolygon, DEFAULT_MAP_CENTER_CCR, DEFAULT_MAP_ZOOM_CCR, ccrHotspotCenters } from '../../data/ccrData';
import { LatLngTuple, DemandPoint, DarkStore } from '../../types';
import { useAppContext } from '../../contexts/AppContext';
import { useModal } from '../../contexts/ModalContext';
import { createLogEntry, LogEntry, initialSystemLog } from '../../utils/logger';
import SliderInput from '../common/SliderInput';
import LogPanel from '../common/LogPanel';
import Spinner from '../common/Spinner';

const ClusteringSection: React.FC = () => {
  const { clusteredDarkStores, setClusteredDarkStores } = useAppContext();
  const { showModal } = useModal();

  const [numBackgroundOrders, setNumBackgroundOrders] = useState(700);
  const [numHotspotOrders, setNumHotspotOrders] = useState(300);
  const [numDarkStores, setNumDarkStores] = useState(5); // k value for k-Means
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([initialSystemLog('generate clusters', 'Clustering (CCR)')]);

  const mapRef = useRef<L.Map | null>(null);
  const demandPointsLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const darkStoresLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const voronoiLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const mapContainerId = 'clusteringMap'; // DOM ID for the map container

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'SYSTEM') => {
    setLogs(prevLogs => [...prevLogs, createLogEntry(message, type)]);
  }, []);

  useEffect(() => {
    // Initialize map only once when the component mounts
    if (!mapRef.current && document.getElementById(mapContainerId)) {
      const mapInstance = mapUtils.initializeMap(
        mapContainerId,
        DEFAULT_MAP_CENTER_CCR,
        DEFAULT_MAP_ZOOM_CCR,
        'clusteringMapKey' // Unique key for this map instance
      );
      if (mapInstance) {
        mapRef.current = mapInstance;
        demandPointsLayerRef.current.addTo(mapInstance);
        darkStoresLayerRef.current.addTo(mapInstance);
        voronoiLayerRef.current.addTo(mapInstance);
        L.geoJSON(ccrGeoJsonPolygon as any, {
          style: { color: mapUtils.twColors.slate[700], weight: 2.5, opacity: 0.7, fillOpacity: 0.05, interactive: false }
        }).addTo(mapInstance);
        addLog('Clustering map initialized for CCR.', 'SYSTEM');
      } else {
        addLog('Failed to initialize clustering map.', 'ERROR');
      }
    }
    // Cleanup map instance on component unmount
    return () => {
        mapUtils.removeMapInstance('clusteringMapKey');
        mapRef.current = null; // Clear the ref
    };
  }, [addLog]);


  const generateDemandPoints = (numBackground: number, numHotspot: number): DemandPoint[] => {
    const points: LatLngTuple[] = [];
    for (let i = 0; i < numBackground; i++) {
      points.push(mapUtils.getRandomPointInCcr());
    }
    if (numHotspot > 0 && ccrHotspotCenters.length > 0) {
      for (let i = 0; i < numHotspot; i++) {
        points.push(mapUtils.getRandomPointNearHotspot(ccrHotspotCenters[i % ccrHotspotCenters.length], 2.5));
      }
    }
    return points.map(p => ({ lat: p[0], lng: p[1] }));
  };

  const kMeans = (points: DemandPoint[], k: number): { centroids: DemandPoint[], clusters: DemandPoint[][] } => {
    if (points.length === 0 || k === 0) return { centroids: [], clusters: [] };

    let currentCentroids: DemandPoint[] = points.slice(0, k).map(p => ({ ...p }));
    if (points.length < k) {
      currentCentroids = points.map(p => ({ ...p }));
      k = points.length;
    }

    let assignments: number[] = [];
    const maxIterations = 30;
    let iterations = 0;

    while (iterations < maxIterations) {
      assignments = points.map(point => {
        let minDist = Infinity;
        let closestCentroidIndex = 0;
        currentCentroids.forEach((centroid, index) => {
          const dist = mapUtils.getDistanceKm([point.lat, point.lng], [centroid.lat, centroid.lng]);
          if (dist < minDist) {
            minDist = dist;
            closestCentroidIndex = index;
          }
        });
        return closestCentroidIndex;
      });

      const newCentroids: DemandPoint[] = [];
      let moved = false;
      for (let i = 0; i < k; i++) {
        const clusterPoints = points.filter((_, index) => assignments[index] === i);
        if (clusterPoints.length > 0) {
          const sumLat = clusterPoints.reduce((sum, p) => sum + p.lat, 0);
          const sumLng = clusterPoints.reduce((sum, p) => sum + p.lng, 0);
          const newCentroid = { lat: sumLat / clusterPoints.length, lng: sumLng / clusterPoints.length };
          if (!currentCentroids[i] || mapUtils.getDistanceKm([newCentroid.lat, newCentroid.lng], [currentCentroids[i].lat, currentCentroids[i].lng]) > 0.001) {
            moved = true;
          }
          newCentroids.push(newCentroid);
        } else {
          // Re-initialize centroid if cluster becomes empty (e.g., random point or previous centroid)
          newCentroids.push(currentCentroids[i] || points[Math.floor(Math.random() * points.length)]);
          moved = true;
        }
      }
      currentCentroids = newCentroids;
      if (!moved && iterations > 0) break; // Convergence
      iterations++;
    }

    const finalClusters: DemandPoint[][] = Array(k).fill(null).map(() => []);
    assignments.forEach((centroidIndex, pointIndex) => {
      if (finalClusters[centroidIndex]) { // Ensure the cluster array exists
        finalClusters[centroidIndex].push(points[pointIndex]);
      }
    });
    return { centroids: currentCentroids, clusters: finalClusters };
  };

  const handleRunClustering = async () => {
    addLog('Generating clusters for CCR...', 'SYSTEM');
    setIsLoading(true);

    demandPointsLayerRef.current.clearLayers();
    darkStoresLayerRef.current.clearLayers();
    voronoiLayerRef.current.clearLayers();
    setClusteredDarkStores([]); // Clear global state

    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 50));

    const demandPoints = generateDemandPoints(numBackgroundOrders, numHotspotOrders);

    // Visualize demand points (optional, can be heavy for large numbers)
    if (demandPoints.length < 700) { // Only draw if not too many
        demandPoints.forEach(p => {
        L.circleMarker([p.lat, p.lng], {
            radius: 2.5, color: 'rgba(100, 100, 100, 0.5)', weight: 0.5, fillOpacity: 0.6, interactive: false
        }).addTo(demandPointsLayerRef.current);
        });
    } else {
        L.circleMarker(DEFAULT_MAP_CENTER_CCR, { radius: 12, color: 'rgba(100,100,100,0.25)', fillOpacity:0.15, interactive:false})
        .bindTooltip(`${demandPoints.length} demand points (general spread across CCR).`)
        .addTo(demandPointsLayerRef.current);
    }


    if (demandPoints.length === 0) {
        showModal("No Demand Data", "Cannot run clustering without demand points. Adjust parameters.");
        setIsLoading(false);
        addLog('Clustering failed: No demand points generated.', 'ERROR');
        return;
    }
     if (numDarkStores === 0 ) {
        showModal("No Dark Stores", "Number of dark stores (k) must be greater than 0.");
        setIsLoading(false);
        addLog('Clustering failed: Number of dark stores (k) is 0.', 'ERROR');
        return;
    }


    const { centroids, clusters } = kMeans(demandPoints, numDarkStores);
    addLog(`K-Means found ${centroids.length} centroids.`, 'ALGO');

    const newDarkStores: DarkStore[] = centroids.map((centroid, index) => {
      const darkStore: DarkStore = {
        name: `DS ${index + 1}`,
        coords: [centroid.lat, centroid.lng],
        assignedOrders: clusters[index] ? clusters[index].length : 0,
        points: clusters[index] || []
      };
      L.marker(darkStore.coords, { icon: mapUtils.darkStoreIcon, zIndexOffset: 1000 })
        .bindPopup(`<b>${darkStore.name}</b><br>Est. Orders: ${darkStore.assignedOrders}`)
        .addTo(darkStoresLayerRef.current);
      return darkStore;
    });

    setClusteredDarkStores(newDarkStores);
    if (mapRef.current) {
        mapUtils.drawVoronoiCells(mapRef.current, newDarkStores, voronoiLayerRef.current);
    }


    setIsLoading(false);
    addLog('Clustering analysis complete for CCR.', 'SYSTEM');
  };

  const renderClusteringStatsTable = () => {
    if (clusteredDarkStores.length === 0) {
      return <p className="text-slate-500 p-6 text-center">Cluster statistics will appear here after generation.</p>;
    }

    let totalOrders = 0;
    const allDistances: number[] = [];

    const rows = clusteredDarkStores.map(store => {
      totalOrders += store.assignedOrders;
      const distances = store.points.map(p => mapUtils.getDistanceKm(store.coords, [p.lat, p.lng]));
      allDistances.push(...distances);
      const avgDist = distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : 0;
      const stdDevDist = calculateStdDev(distances, avgDist);

      return (
        <tr key={store.name}>
          <td>{store.name}</td>
          <td>{`${store.coords[0].toFixed(4)}, ${store.coords[1].toFixed(4)}`}</td>
          <td className="text-center">{store.assignedOrders}</td>
          <td className="text-center">{avgDist.toFixed(2)}</td>
          <td className="text-center">{stdDevDist.toFixed(2)}</td>
        </tr>
      );
    });

    const overallAvgDistance = allDistances.length > 0 ? allDistances.reduce((a, b) => a + b, 0) / allDistances.length : 0;

    return (
      <div className="overflow-x-auto bg-white p-2 rounded-lg border border-slate-200 shadow-md">
        <table>
          <thead>
            <tr>
              <th>Dark Store</th>
              <th>Coordinates</th>
              <th className="text-center">Assigned Orders</th>
              <th className="text-center">Avg. Dist. (km)</th>
              <th className="text-center">StdDev Dist. (km)</th>
            </tr>
          </thead>
          <tbody>
            {rows}
            <tr className="font-semibold bg-slate-100">
              <td colSpan={2}>Overall (CCR)</td>
              <td className="text-center">{totalOrders}</td>
              <td className="text-center">{overallAvgDistance.toFixed(2)} (All Orders)</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };


  return (
    <section id="clustering" className="p-6 sm:p-8 bg-white rounded-xl shadow-xl mb-8">
      <h2 className="text-3xl font-bold text-slate-900 mb-6 pb-4 border-b border-slate-300">
        Demand Clustering & Dark Store Placement (CCR)
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 control-panel">
          <h3>Configuration</h3>
          <div className="control-group">
            <SliderInput
              id="numBackgroundOrders"
              label="Background Orders (CCR)"
              min={100} max={3000} step={50}
              initialValue={numBackgroundOrders}
              onChange={setNumBackgroundOrders}
              disabled={isLoading}
            />
            <SliderInput
              id="numHotspotOrders"
              label="Hotspot Orders (CCR)"
              min={0} max={1500} step={25}
              initialValue={numHotspotOrders}
              onChange={setNumHotspotOrders}
              disabled={isLoading}
            />
            <SliderInput
              id="numDarkStores"
              label="Number of Dark Stores (k)"
              min={1} max={25} step={1}
              initialValue={numDarkStores}
              onChange={setNumDarkStores}
              disabled={isLoading}
            />
          </div>
          <button
            id="runClusteringBtn"
            onClick={handleRunClustering}
            className="btn btn-primary w-full mt-2"
            disabled={isLoading}
          >
            {isLoading ? 'Generating...' : 'Generate Clusters'}
          </button>
          {isLoading && <Spinner className="mt-4" />}
        </div>
        <div className="lg:col-span-2">
          <div id={mapContainerId} className="map-container">
            {/* Map will be initialized here by Leaflet */}
             {!mapRef.current && !document.getElementById(mapContainerId) && (
                <div className="flex items-center justify-center h-full text-slate-500">Initializing map...</div>
            )}
          </div>
        </div>
      </div>
      <div className="mt-10">
        <h3 className="text-xl font-semibold text-slate-800 mb-4">Clustering Results</h3>
        {renderClusteringStatsTable()}
        <LogPanel logEntries={logs} title="Clustering Log" heightClass="h-40" />
      </div>
    </section>
  );
};

export default ClusteringSection;
