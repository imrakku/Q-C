import L from 'leaflet'; // Import Leaflet
import * as d3 from 'd3-delaunay'; // Import d3-delaunay for Voronoi
import { LatLng, LatLngTuple, GeoJsonPolygon, DarkStore, Agent, Order } from '../types';
import { ccrGeoJsonPolygon, defaultDarkStoreLocationSim, twColors } from '../data/ccrData';

// Ensure Leaflet's CSS is loaded (typically done in index.html or App.tsx)
// import 'leaflet/dist/leaflet.css'; // If you install leaflet via npm and don't use CDN

// Fix for default Leaflet marker icons when using a module bundler
// delete (L.Icon.Default.prototype as any)._getIconUrl;
// L.Icon.Default.mergeOptions({
//   iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
//   iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
//   shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
// });


// Registry to keep track of map instances by a key
const mapRegistry: Record<string, L.Map> = {};

export const initializeMap = (
  mapId: string,
  centerCoords: LatLngTuple,
  zoomLevel: number,
  mapKey: string // Unique key to store/retrieve this map instance
): L.Map | null => {
  // If map for this key already exists and is for the same DOM element, just update and return
  if (mapRegistry[mapKey] && mapRegistry[mapKey].getContainer().id === mapId) {
    mapRegistry[mapKey].invalidateSize();
    mapRegistry[mapKey].setView(centerCoords, zoomLevel);
    return mapRegistry[mapKey];
  }

  // If map for this key exists but for a different DOM element (e.g., due to React re-renders), remove old one
  if (mapRegistry[mapKey] && mapRegistry[mapKey].getContainer().id !== mapId) {
    mapRegistry[mapKey].remove();
    delete mapRegistry[mapKey];
  }

  try {
    const mapElement = document.getElementById(mapId);
    if (!mapElement) {
      console.error(`Map container element with ID '${mapId}' not found.`);
      return null;
    }
    // Check if Leaflet has already initialized a map on this element
    // This is a common issue in React if not handled carefully
    if ((mapElement as any)._leaflet_id) {
        console.warn(`Leaflet map already initialized on '${mapId}'. Attempting to reuse or re-initialize carefully.`);
        // Potentially remove existing instance before creating a new one if necessary
        // Or, find a way to get the existing instance if mapKey logic isn't sufficient
    }


    const map = L.map(mapId, { preferCanvas: true }).setView(centerCoords, zoomLevel);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);

    mapRegistry[mapKey] = map;
    return map;
  } catch (error: any) {
    console.error(`Map initialization error for '${mapKey}' on ID '${mapId}': ${error.message}`, error);
    const mapDiv = document.getElementById(mapId);
    if (mapDiv) {
      mapDiv.innerHTML = `<p class="text-red-600 p-4 text-center font-semibold">Map loading failed. Check connection & console.</p>`;
    }
    return null;
  }
};

export const getMapInstance = (mapKey: string): L.Map | undefined => {
  return mapRegistry[mapKey];
};

export const removeMapInstance = (mapKey: string): void => {
    if (mapRegistry[mapKey]) {
        mapRegistry[mapKey].remove();
        delete mapRegistry[mapKey];
    }
};

export const getDistanceKm = (latlng1: LatLngTuple | L.LatLng, latlng2: LatLngTuple | L.LatLng): number => {
  const R = 6371; // Radius of the Earth in km
  const lat1 = Array.isArray(latlng1) ? latlng1[0] : latlng1.lat;
  const lon1 = Array.isArray(latlng1) ? latlng1[1] : latlng1.lng;
  const lat2 = Array.isArray(latlng2) ? latlng2[0] : latlng2.lat;
  const lon2 = Array.isArray(latlng2) ? latlng2[1] : latlng2.lng;

  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const isPointInPolygon = (point: LatLngTuple, polygonCoords: LatLngTuple[]): boolean => {
  const x = point[1]; // lng
  const y = point[0]; // lat
  let inside = false;
  for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
    const xi = polygonCoords[i][1]; // lng
    const yi = polygonCoords[i][0]; // lat
    const xj = polygonCoords[j][1]; // lng
    const yj = polygonCoords[j][0]; // lat

    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

export const createAgentIcon = (agentId: string, isBusy = false): L.DivIcon => {
  // Using Tailwind classes directly in className doesn't work well for DivIcon's background/border.
  // We'll use the pre-defined CSS classes from index.css.
  const baseClass = 'leaflet-div-icon leaflet-div-icon-agent';
  const busyClass = isBusy ? 'leaflet-div-icon-agent-busy' : '';
  const iconSize: L.PointExpression = isBusy ? [22, 22] : [20, 20];
  const iconAnchor: L.PointExpression = isBusy ? [11, 11] : [10, 10];

  return L.divIcon({
    html: `<span style="display: flex; justify-content: center; align-items: center; height: 100%;">${agentId.substring(0, 2)}</span>`,
    className: `${baseClass} ${busyClass}`,
    iconSize: iconSize,
    iconAnchor: iconAnchor,
  });
};

export const createOrderIcon = (orderId: string, _status: string = 'pending'): L.DivIcon => {
  // Status could be used to change color/style if needed
  const displayId = orderId.length > 3 ? orderId.substring(orderId.length - 3) : orderId;
  return L.divIcon({
    html: `<span style="display: flex; justify-content: center; align-items: center; height: 100%;">${displayId}</span>`,
    className: 'leaflet-div-icon leaflet-div-icon-order', // Pre-defined in index.css
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
};

export const darkStoreIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: 'dark-store-marker', // Pre-defined in index.css
});

export const generateWaypoints = (startLatLng: LatLngTuple, endLatLng: LatLngTuple, numWaypoints = 2): L.LatLng[] => {
  const waypoints: L.LatLng[] = [];
  const start = L.latLng(startLatLng[0], startLatLng[1]);
  const end = L.latLng(endLatLng[0], endLatLng[1]);

  for (let i = 1; i <= numWaypoints; i++) {
    const t = i / (numWaypoints + 1);
    waypoints.push(L.latLng(start.lat + (end.lat - start.lat) * t, start.lng + (end.lng - start.lng) * t));
  }
  return [start, ...waypoints, end];
};

export const getRandomPointInCcr = (): LatLngTuple => {
  const bounds = L.geoJSON(ccrGeoJsonPolygon as any).getBounds(); // Type assertion for L.GeoJSON
  let point: LatLngTuple;
  let attempts = 0;
  const MAX_ATTEMPTS = 200;

  do {
    point = [
      Math.random() * (bounds.getNorth() - bounds.getSouth()) + bounds.getSouth(), // lat
      Math.random() * (bounds.getEast() - bounds.getWest()) + bounds.getWest(),   // lng
    ];
    attempts++;
    if (attempts > MAX_ATTEMPTS) {
      console.warn("Max attempts reached for getRandomPointInCcr. Using default CCR center.");
      return defaultDarkStoreLocationSim; // Fallback
    }
  } while (!isPointInPolygon(point, ccrGeoJsonPolygon.geometry.coordinates[0] as LatLngTuple[]));
  return point;
};

export const getRandomPointNearHotspot = (center: LatLngTuple, radiusKm: number): LatLngTuple => {
  const R_EARTH_KM = 6371;
  const y0 = center[0]; // lat
  const x0 = center[1]; // lng
  const rd = radiusKm / R_EARTH_KM; // Angular radius

  const u = Math.random();
  const v = Math.random();

  const w = rd * Math.sqrt(u);
  const t = 2 * Math.PI * v;

  const x = w * Math.cos(t); // Offset in radians for longitude
  const y = w * Math.sin(t); // Offset in radians for latitude

  // Adjust longitude for Earth's curvature (more accurate at poles, less critical here)
  const newLon = x / Math.cos(y0 * Math.PI / 180);

  let point: LatLngTuple = [
    y0 + (y * 180 / Math.PI),         // new lat
    x0 + (newLon * 180 / Math.PI),    // new lng
  ];

  // Ensure the point is within the CCR polygon
  if (!isPointInPolygon(point, ccrGeoJsonPolygon.geometry.coordinates[0] as LatLngTuple[])) {
    return getRandomPointInCcr(); // Fallback if generated point is outside
  }
  return point;
};

// Function to draw Voronoi cells for dark stores
export const drawVoronoiCells = (map: L.Map | null, darkStores: DarkStore[], voronoiLayerGroup: L.LayerGroup): void => {
    if (!map || !L.d3) { // L.d3 is not standard, this implies d3-delaunay is used directly
        console.warn("Map or D3/Delaunay not available for Voronoi.");
        return;
    }
    voronoiLayerGroup.clearLayers();
    if (darkStores.length === 0) return;

    const baseHueStart = 180; // Start from Cyan/Blue range
    const saturation = 65;
    const lightness = 50;
    const fillOpacity = 0.35;

    // If only one dark store, color the whole CCR polygon
    if (darkStores.length === 1) {
        L.geoJSON(ccrGeoJsonPolygon as any, {
            style: {
                color: `hsl(${baseHueStart}, ${saturation}%, ${lightness - 10}%)`,
                weight: 1.5,
                fillOpacity: fillOpacity,
                interactive: false
            }
        }).addTo(voronoiLayerGroup);
        return;
    }

    if (darkStores.length < 2) return; // Voronoi needs at least 2 points

    // d3.Delaunay expects points as [x, y] which is [lng, lat]
    const pointsForVoronoi: d3.Delaunay.Point[] = darkStores.map(ds => [ds.coords[1], ds.coords[0]]);
    const cityBounds = L.geoJSON(ccrGeoJsonPolygon as any).getBounds();

    // Define the bounding box for the Voronoi diagram slightly larger than the city
    const minLng = cityBounds.getWest() - 0.1;
    const minLat = cityBounds.getSouth() - 0.1;
    const maxLng = cityBounds.getEast() + 0.1;
    const maxLat = cityBounds.getNorth() + 0.1;

    try {
        const delaunayInstance = d3.Delaunay.from(pointsForVoronoi);
        const voronoiInstance = delaunayInstance.voronoi([minLng, minLat, maxLng, maxLat]);
        const hueStep = 300 / Math.max(1, darkStores.length);

        darkStores.forEach((_store, i) => {
            const cellPolygon = voronoiInstance.cellPolygon(i);
            const currentHue = (baseHueStart + i * hueStep) % 360;
            if (cellPolygon) {
                // Convert back to [lat, lng] for Leaflet
                const leafletPolygonCoords = cellPolygon.map(p => [p[1], p[0]] as LatLngTuple);
                L.polygon(leafletPolygonCoords, {
                    color: `hsl(${currentHue}, ${saturation}%, ${lightness}%)`,
                    weight: 1.5,
                    fillOpacity: fillOpacity,
                    interactive: false
                }).addTo(voronoiLayerGroup);
            }
        });
    } catch (e: any) {
        console.error("Voronoi calculation error:", e.message, e);
        // Fallback or error display logic
    }
};

// You might add more specific functions for adding/removing layers, markers, etc.
// For example:
// addMarkerToLayer(layerGroup: L.LayerGroup, latlng: LatLngTuple, options?: L.MarkerOptions): L.Marker
// clearLayer(layerGroup: L.LayerGroup): void
