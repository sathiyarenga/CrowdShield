"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { api, type GeoJSONResponse, type VenueDetailResponse } from "@/lib/api/client";
import InfrastructureLayer from "./layers/InfrastructureLayer";
import IsochroneLayer from "./layers/IsochroneLayer";
import RoadCapacityLayer from "./layers/RoadCapacityLayer";
import CrowdFlowLayer from "./layers/CrowdFlowLayer";
import styles from "./VenueMap.module.css";

/* -- Risk-level color scheme (crowd count thresholds) ------------------ */
const RISK_COLORS = {
  nominal: "#22c55e",
  elevated: "#eab308",
  high: "#f97316",
  critical: "#ef4444",
} as const;

type RiskLevel = keyof typeof RISK_COLORS;

function getRiskLevel(people: number): RiskLevel {
  if (people >= 20000) return "critical";
  if (people >= 10000) return "high";
  if (people >= 5000) return "elevated";
  return "nominal";
}

function getRiskColor(people: number): string {
  return RISK_COLORS[getRiskLevel(people)];
}

function getRiskOpacity(people: number): number {
  if (people >= 20000) return 0.45;
  if (people >= 10000) return 0.35;
  if (people >= 5000) return 0.25;
  return 0.15;
}

function formatPeople(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

/* -- Zone type styling ------------------------------------------------- */
const ZONE_TYPE_ICONS: Record<string, string> = {
  gate: "🚪",
  stage: "🎤",
  crowd_corridor: "🚶",
  medical: "🏥",
  vip: "⭐",
  parking: "🅿️",
  buffer: "🔲",
  custom: "📍",
};

const ZONE_TYPE_COLORS: Record<string, string> = {
  gate: "#3b82f6",
  stage: "#a855f7",
  crowd_corridor: "#f97316",
  medical: "#22c55e",
  vip: "#eab308",
  parking: "#6b7280",
  buffer: "#64748b",
  custom: "#06b6d4",
};

/* -- Risk overlay category colors -------------------------------------- */
const HAZARD_COLORS: Record<string, string> = {
  medical: "#22c55e",
  security: "#6366f1",
  crowd_crush: "#ef4444",
  fire: "#f97316",
  weather: "#3b82f6",
  infrastructure: "#8b5cf6",
  traffic: "#eab308",
  environmental: "#06b6d4",
};

/* -- Default venue configs (fallback when API is unavailable) ------- */
const VENUE_DEFAULTS: Record<string, { center: [number, number]; zoom: number; pitch: number; bearing: number }> = {
  ullevaal: { center: [10.734, 59.948], zoom: 14, pitch: 0, bearing: 0 },
  galway: { center: [-9.0545, 53.2707], zoom: 17, pitch: 0, bearing: 0 },
};

/* -- Basemaps — OpenFreeMap (free vector tiles, no API key, 3D buildings) -- */
type BasemapStyle = "dark" | "light" | "satellite" | "bright";
const BASEMAPS: Record<BasemapStyle, string> = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/positron",
  satellite: "https://tiles.openfreemap.org/styles/liberty",
  bright: "https://tiles.openfreemap.org/styles/bright",
};
const ZONE_SOURCE = "venue-zones";
const ZONE_FILL = "zone-fill";
const ZONE_FILL_GLOW = "zone-fill-glow";
const ZONE_LINE = "zone-border";
const ZONE_EXTRUDE = "zone-extrusion";
const ZONE_LABEL = "zone-labels";
const ZONE_GLOW = "zone-glow";
const CUSTOM_ZONE_SOURCE = "custom-zones";
const CUSTOM_ZONE_FILL = "custom-zone-fill";
const CUSTOM_ZONE_LINE = "custom-zone-border";
const CUSTOM_ZONE_LABEL = "custom-zone-labels";
const HEATMAP_SOURCE = "density-heatmap";
const HEATMAP_LAYER = "heatmap-layer";
const RISK_SOURCE = "risk-markers";
const RISK_LAYER = "risk-circles";
const RISK_PULSE_LAYER = "risk-pulse";

/* -- Component Props ---------------------------------------------------- */
export interface CustomZone {
  zone_id: string;
  name: string;
  zone_type: string;
  capacity: number;
  color: string;
  geometry: GeoJSON.Polygon;
  created_at?: string;
  updated_at?: string;
}

interface VenueMapProps {
  venueId: string;
  currentPeople?: number;
  currentTime?: string;
  showHeatmap?: boolean;
  show3D?: boolean;
  showRiskOverlay?: boolean;
  showInfrastructure?: boolean;
  showIsochrones?: boolean;
  showRoadCapacity?: boolean;
  showSimulation?: boolean;
  drawMode?: boolean;
  onZoneDrawn?: (geometry: GeoJSON.Polygon) => void;
  customZones?: CustomZone[];
  mapRef?: React.MutableRefObject<maplibregl.Map | null>;
}

/* -- Legend items ------------------------------------------------------- */
const RISK_LEGEND = [
  { label: "< 5K — Nominal", color: RISK_COLORS.nominal },
  { label: "5K–10K — Elevated", color: RISK_COLORS.elevated },
  { label: "10K–20K — High", color: RISK_COLORS.high },
  { label: "> 20K — Critical", color: RISK_COLORS.critical },
];

export default function VenueMap({
  venueId,
  currentPeople = 0,
  currentTime,
  showHeatmap = false,
  show3D = false,
  showRiskOverlay = false,
  showInfrastructure = false,
  showIsochrones = false,
  showRoadCapacity = false,
  showSimulation = false,
  drawMode = false,
  onZoneDrawn,
  customZones = [],
  mapRef: externalMapRef,
}: VenueMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const internalMapRef = useRef<maplibregl.Map | null>(null);
  const mapRef = externalMapRef ?? internalMapRef;
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [venueDetail, setVenueDetail] = useState<VenueDetailResponse | null>(null);
  const [fallbackZones, setFallbackZones] = useState<GeoJSONResponse | null>(null);
  const [riskData, setRiskData] = useState<GeoJSONResponse | null>(null);
  const [densityData, setDensityData] = useState<GeoJSONResponse | null>(null);
  const [basemap, setBasemap] = useState<BasemapStyle>("dark");
  const zonesInitRef = useRef(false);
  const zoneVenueRef = useRef(venueId);
  const animFrameRef = useRef<number | null>(null);

  /* -- Fetch venue detail + risk markers + density points ----------- */
  useEffect(() => {
    let cancelled = false;

    async function fetchVenueData() {
      setVenueDetail(null);
      setFallbackZones(null);
      setRiskData(null);
      setDensityData(null);
      zonesInitRef.current = false;
      zoneVenueRef.current = venueId;

      try {
        const detail = await api.venues.detail(venueId);
        if (!cancelled) setVenueDetail(detail);
      } catch {
        if (venueId === "ullevaal") {
          try {
            const zones = await api.zones();
            if (!cancelled) setFallbackZones(zones);
          } catch (err) {
            console.error("Failed to load fallback zones:", err);
          }
        }
      }

      try {
        const risk = await api.venues.riskMarkers(venueId);
        if (!cancelled) setRiskData(risk);
      } catch { /* ignore */ }

      try {
        const density = await api.venues.densityPoints(venueId);
        if (!cancelled) setDensityData(density);
      } catch { /* ignore */ }
    }

    fetchVenueData();
    return () => { cancelled = true; };
  }, [venueId]);

  /* -- Resolved zones data --------------------------------------------- */
  const zonesGeoJSON = venueDetail?.zones ?? fallbackZones;

  /* -- Compute enriched zone features (memoized) ----------------------- */
  const enrichedZoneData = useMemo(() => {
    if (!zonesGeoJSON) return null;
    // Skip if zone data doesn't belong to current venue
    if (zoneVenueRef.current !== venueId) return null;
    const features = zonesGeoJSON.features.filter(f => f.geometry !== null);
    if (features.length === 0) return null;

    const totalArea = features.reduce((sum, f) => sum + Number(f.properties?.area_sqm ?? 0), 0);
    if (totalArea === 0) return null;

    const riskColor = getRiskColor(currentPeople);
    const riskLevel = getRiskLevel(currentPeople);
    const baseOpacity = getRiskOpacity(currentPeople);

    const enriched = features.map(f => {
      const area = Number(f.properties?.area_sqm ?? 0);
      const areaRatio = area > 0 ? area / totalArea : 0;
      const zonePeople = currentPeople * areaRatio;
      const density = area > 0 ? zonePeople / area : 0;

      return {
        ...f,
        properties: {
          ...f.properties,
          _color: riskColor,
          _opacity: baseOpacity,
          _density: density,
          _people: Math.round(zonePeople),
          _label: formatPeople(zonePeople),
          _risk_level: riskLevel,
        },
      };
    });

    return {
      geojson: { type: "FeatureCollection" as const, features: enriched },
      riskColor,
      riskLevel,
      baseOpacity,
      isCritical: riskLevel === "critical" || riskLevel === "high",
    };
  }, [zonesGeoJSON, currentPeople]);

  /* -- Initialize MapLibre (once) ---------------------------------------- */
  const initialVenueRef = useRef(venueId);
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const defaults = VENUE_DEFAULTS[initialVenueRef.current] ?? VENUE_DEFAULTS.ullevaal;

    // Fix OpenFreeMap font loading — their CDN returns 404 for glyphs
    const GLYPHS_URL = "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf";
    const fixGlyphs = (_prev: any, next: any) => ({
      ...next,
      glyphs: GLYPHS_URL,
    });

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: BASEMAPS[basemap],
      center: defaults.center,
      zoom: defaults.zoom,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      pitchWithRotate: true,
      maxPitch: 60,
      transformStyle: fixGlyphs,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    map.on("load", () => {
      setMapLoaded(true);
    });

    mapRef.current = map;

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
      zonesInitRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -- Switch basemap style -------------------------------------------- */
  const basemapRef = useRef(basemap);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    // Skip on initial render (style already set in constructor)
    if (basemapRef.current === basemap) return;
    basemapRef.current = basemap;

    // Reset zones so they get re-added after the new style loads
    zonesInitRef.current = false;

    map.setStyle(BASEMAPS[basemap]);
    // After new style loads, re-enable 3D buildings if active
    map.once("styledata", () => {
      // 3D buildings are handled by the show3D effect below
    });
  }, [basemap, mapLoaded]);

  /* -- Fly to venue when venueId changes --------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Always use VENUE_DEFAULTS — venueDetail may be stale from the previous venue
    const defaults = VENUE_DEFAULTS[venueId] ?? VENUE_DEFAULTS.ullevaal;

    // Reset zone init flag so layers are rebuilt for the new venue
    zonesInitRef.current = false;
    // Clean up existing zone layers
    [ZONE_LABEL, ZONE_GLOW, ZONE_FILL_GLOW, ZONE_EXTRUDE, ZONE_FILL, ZONE_LINE].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(ZONE_SOURCE)) map.removeSource(ZONE_SOURCE);

    map.flyTo({
      center: defaults.center,
      zoom: defaults.zoom,
      pitch: show3D ? (defaults.pitch ?? 45) : 0,
      bearing: show3D ? (defaults.bearing ?? -20) : 0,
      duration: 1500,
    });
  }, [venueId, mapLoaded, show3D]);

  /* -- Phase 1: SMOOTH TRANSITIONS ------------------------------------- */
  /* Layer 1 INIT: Create zone source/layers once when zonesGeoJSON loads */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !enrichedZoneData) return;

    // Skip if zone data is from a different venue
    if (zoneVenueRef.current !== venueId) return;
    // If already initialized for THIS venue, skip
    if (zonesInitRef.current) return;

    // Clean up any leftover layers
    [ZONE_LABEL, ZONE_GLOW, ZONE_FILL_GLOW, ZONE_EXTRUDE, ZONE_FILL, ZONE_LINE].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(ZONE_SOURCE)) map.removeSource(ZONE_SOURCE);

    // Add source
    map.addSource(ZONE_SOURCE, {
      type: "geojson",
      data: enrichedZoneData.geojson as any,
    });

    // Inner glow fill (larger, blurred — subtle background glow)
    map.addLayer({
      id: ZONE_FILL_GLOW,
      type: "fill",
      source: ZONE_SOURCE,
      paint: {
        "fill-color": enrichedZoneData.riskColor,
        "fill-opacity": enrichedZoneData.baseOpacity * 0.3,
      },
    });

    // Main fill layer
    map.addLayer({
      id: ZONE_FILL,
      type: "fill",
      source: ZONE_SOURCE,
      paint: {
        "fill-color": enrichedZoneData.riskColor,
        "fill-opacity": showHeatmap ? 0.08 : enrichedZoneData.baseOpacity,
      },
    });

    // Border
    map.addLayer({
      id: ZONE_LINE,
      type: "line",
      source: ZONE_SOURCE,
      paint: {
        "line-color": enrichedZoneData.riskColor,
        "line-width": enrichedZoneData.isCritical ? 3 : 2,
        "line-opacity": enrichedZoneData.isCritical ? 1.0 : 0.7,
      },
    });

    // Outer glow border for critical/high
    map.addLayer({
      id: ZONE_GLOW,
      type: "line",
      source: ZONE_SOURCE,
      paint: {
        "line-color": enrichedZoneData.riskColor,
        "line-width": enrichedZoneData.isCritical ? 12 : 0,
        "line-opacity": enrichedZoneData.isCritical ? 0.25 : 0,
        "line-blur": 8,
      },
    });

    // Zone labels
    map.addLayer({
      id: ZONE_LABEL,
      type: "symbol",
      source: ZONE_SOURCE,
      layout: {
        "text-field": [
          "concat",
          ["get", "_label"],
          " people",
        ] as any,
        "text-size": 14,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0,0,0,0.85)",
        "text-halo-width": 2,
        "text-opacity": showHeatmap ? 0 : 1,
      },
    });

    // Register click handlers
    map.on("mouseenter", ZONE_FILL, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", ZONE_FILL, () => {
      map.getCanvas().style.cursor = "";
    });

    map.on("click", ZONE_FILL, (e) => {
      if (!e.features || e.features.length === 0 || drawMode) return;
      const feature = e.features[0];
      const props = feature.properties;
      const coords = e.lngLat;

      if (popupRef.current) popupRef.current.remove();

      const areaSqm = props.area_sqm ? Number(props.area_sqm).toLocaleString() : "N/A";
      const density = props._density ? Number(props._density).toFixed(2) : "0.00";
      const zoneName = props.zone_name || props.area_name || "Unknown Zone";
      const zonePeople = props._people ? Number(props._people).toLocaleString() : "0";
      const riskColor = props._color || "#22c55e";
      const riskLevel = props._risk_level || "nominal";

      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: "300px",
      })
        .setLngLat(coords)
        .setHTML(`
          <div class="${styles.popupTitle}">${zoneName}</div>
          <div class="${styles.popupMeta}">
            <span>Zone crowd: <strong style="color:${riskColor}">${zonePeople}</strong></span>
            <span>Area: ${areaSqm} m²</span>
            <span>Density: ${density} p/m²</span>
          </div>
          <div class="${styles.popupPeople}" style="color: ${riskColor}">
            ${riskLevel.toUpperCase()}
          </div>
        `)
        .addTo(map);
    });

    zonesInitRef.current = true;
  }, [mapLoaded, enrichedZoneData, showHeatmap, drawMode]);

  /* Layer 1 UPDATE: Smooth in-place updates when currentPeople changes */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !zonesInitRef.current || !enrichedZoneData) return;

    const src = map.getSource(ZONE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    // Update the data — MapLibre smoothly re-renders
    src.setData(enrichedZoneData.geojson as any);

    // Smoothly update paint properties
    if (map.getLayer(ZONE_FILL)) {
      map.setPaintProperty(ZONE_FILL, "fill-color", enrichedZoneData.riskColor);
      map.setPaintProperty(ZONE_FILL, "fill-opacity", showHeatmap ? 0.08 : enrichedZoneData.baseOpacity);
    }
    if (map.getLayer(ZONE_FILL_GLOW)) {
      map.setPaintProperty(ZONE_FILL_GLOW, "fill-color", enrichedZoneData.riskColor);
      map.setPaintProperty(ZONE_FILL_GLOW, "fill-opacity", enrichedZoneData.baseOpacity * 0.3);
    }
    if (map.getLayer(ZONE_LINE)) {
      map.setPaintProperty(ZONE_LINE, "line-color", enrichedZoneData.riskColor);
      map.setPaintProperty(ZONE_LINE, "line-width", enrichedZoneData.isCritical ? 3 : 2);
      map.setPaintProperty(ZONE_LINE, "line-opacity", enrichedZoneData.isCritical ? 1.0 : 0.7);
    }
    if (map.getLayer(ZONE_GLOW)) {
      map.setPaintProperty(ZONE_GLOW, "line-color", enrichedZoneData.riskColor);
      map.setPaintProperty(ZONE_GLOW, "line-width", enrichedZoneData.isCritical ? 12 : 0);
      map.setPaintProperty(ZONE_GLOW, "line-opacity", enrichedZoneData.isCritical ? 0.25 : 0);
    }
    if (map.getLayer(ZONE_LABEL)) {
      map.setPaintProperty(ZONE_LABEL, "text-opacity", showHeatmap ? 0 : 1);
    }
  }, [enrichedZoneData, mapLoaded, showHeatmap]);

  /* -- Phase 2: ANIMATED CRITICAL BORDER ------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !enrichedZoneData) return;

    // Animate glow pulse on critical zones
    if (enrichedZoneData.isCritical && map.getLayer(ZONE_GLOW)) {
      let step = 0;
      const animate = () => {
        step = (step + 1) % 120;
        const pulse = 0.15 + 0.15 * Math.sin(step * Math.PI / 60);
        const width = 8 + 6 * Math.sin(step * Math.PI / 60);
        try {
          map.setPaintProperty(ZONE_GLOW, "line-opacity", pulse);
          map.setPaintProperty(ZONE_GLOW, "line-width", width);
        } catch { /* map might be destroyed */ }
        animFrameRef.current = requestAnimationFrame(animate);
      };
      animFrameRef.current = requestAnimationFrame(animate);

      return () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      };
    } else {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
  }, [enrichedZoneData?.isCritical, mapLoaded]);

  /* -- Custom zones layer ---------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Clean up
    [CUSTOM_ZONE_LABEL, CUSTOM_ZONE_FILL, CUSTOM_ZONE_LINE].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(CUSTOM_ZONE_SOURCE)) map.removeSource(CUSTOM_ZONE_SOURCE);

    if (customZones.length === 0) return;

    const features = customZones.map(z => ({
      type: "Feature" as const,
      properties: {
        zone_id: z.zone_id,
        name: z.name,
        zone_type: z.zone_type,
        capacity: z.capacity,
        color: z.color || ZONE_TYPE_COLORS[z.zone_type] || "#06b6d4",
        icon: ZONE_TYPE_ICONS[z.zone_type] || "📍",
      },
      geometry: z.geometry,
    }));

    map.addSource(CUSTOM_ZONE_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features } as any,
    });

    // Fill
    map.addLayer({
      id: CUSTOM_ZONE_FILL,
      type: "fill",
      source: CUSTOM_ZONE_SOURCE,
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": 0.2,
      },
    });

    // Border with dash pattern
    map.addLayer({
      id: CUSTOM_ZONE_LINE,
      type: "line",
      source: CUSTOM_ZONE_SOURCE,
      paint: {
        "line-color": ["get", "color"],
        "line-width": 2,
        "line-opacity": 0.9,
        "line-dasharray": [3, 2],
      },
    });

    // Labels
    map.addLayer({
      id: CUSTOM_ZONE_LABEL,
      type: "symbol",
      source: CUSTOM_ZONE_SOURCE,
      layout: {
        "text-field": [
          "concat",
          ["get", "icon"],
          " ",
          ["get", "name"],
        ] as any,
        "text-size": 12,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0,0,0,0.85)",
        "text-halo-width": 2,
      },
    });

    // Click popup for custom zones
    map.on("click", CUSTOM_ZONE_FILL, (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      const coords = e.lngLat;

      if (popupRef.current) popupRef.current.remove();

      const color = props.color || "#06b6d4";
      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: "280px",
      })
        .setLngLat(coords)
        .setHTML(`
          <div class="${styles.popupTitle}">${props.icon || "📍"} ${props.name}</div>
          <div class="${styles.popupMeta}">
            <span>Type: <strong style="color:${color};text-transform:capitalize">${(props.zone_type || "custom").replace(/_/g, " ")}</strong></span>
            <span>Capacity: <strong>${(props.capacity ?? 0).toLocaleString()}</strong></span>
          </div>
        `)
        .addTo(map);
    });
  }, [mapLoaded, customZones]);

  /* -- Draw mode: click-to-draw polygon -------------------------------- */
  const drawPointsRef = useRef<[number, number][]>([]);
  const drawSourceId = "draw-temp-source";
  const drawFillId = "draw-temp-fill";
  const drawLineId = "draw-temp-line";
  const drawPointsId = "draw-temp-points";

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!drawMode) {
      // Clean up draw layers
      [drawPointsId, drawFillId, drawLineId].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      if (map.getSource(drawSourceId)) map.removeSource(drawSourceId);
      drawPointsRef.current = [];
      map.getCanvas().style.cursor = "";
      return;
    }

    // Enter draw mode
    map.getCanvas().style.cursor = "crosshair";
    drawPointsRef.current = [];

    // Add temp source
    if (!map.getSource(drawSourceId)) {
      map.addSource(drawSourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] } as any,
      });
    }

    // Add temp fill
    if (!map.getLayer(drawFillId)) {
      map.addLayer({
        id: drawFillId,
        type: "fill",
        source: drawSourceId,
        filter: ["==", "$type", "Polygon"],
        paint: {
          "fill-color": "#06b6d4",
          "fill-opacity": 0.2,
        },
      });
    }

    // Add temp line
    if (!map.getLayer(drawLineId)) {
      map.addLayer({
        id: drawLineId,
        type: "line",
        source: drawSourceId,
        filter: ["==", "$type", "Polygon"],
        paint: {
          "line-color": "#06b6d4",
          "line-width": 2,
          "line-dasharray": [4, 2],
        },
      });
    }

    // Add temp points
    if (!map.getLayer(drawPointsId)) {
      map.addLayer({
        id: drawPointsId,
        type: "circle",
        source: drawSourceId,
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 5,
          "circle-color": "#06b6d4",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    }

    function updateDrawPreview() {
      const src = map!.getSource(drawSourceId) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      const pts = drawPointsRef.current;

      const features: any[] = [];

      // Point markers
      pts.forEach(p => {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: p },
          properties: {},
        });
      });

      // Polygon preview (close the ring)
      if (pts.length >= 3) {
        features.push({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[...pts, pts[0]]],
          },
          properties: {},
        });
      } else if (pts.length >= 2) {
        // Line preview
        features.push({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[...pts, pts[0]]],
          },
          properties: {},
        });
      }

      src.setData({ type: "FeatureCollection", features });
    }

    function handleClick(e: maplibregl.MapMouseEvent) {
      if (!drawMode) return;
      drawPointsRef.current.push([e.lngLat.lng, e.lngLat.lat]);
      updateDrawPreview();
    }

    function handleDblClick(e: maplibregl.MapMouseEvent) {
      if (!drawMode) return;
      e.preventDefault();

      const pts = drawPointsRef.current;
      if (pts.length < 3) return;

      // Close polygon and emit
      const polygon: GeoJSON.Polygon = {
        type: "Polygon",
        coordinates: [[...pts, pts[0]]],
      };

      onZoneDrawn?.(polygon);

      // Clean up
      drawPointsRef.current = [];
      const src = map!.getSource(drawSourceId) as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData({ type: "FeatureCollection", features: [] });
    }

    map.on("click", handleClick);
    map.on("dblclick", handleDblClick);
    map.doubleClickZoom.disable();

    return () => {
      map.off("click", handleClick);
      map.off("dblclick", handleDblClick);
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
    };
  }, [drawMode, mapLoaded, onZoneDrawn]);

  /* -- Heatmap layer --------------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (map.getLayer(HEATMAP_LAYER)) map.removeLayer(HEATMAP_LAYER);
    if (map.getSource(HEATMAP_SOURCE)) map.removeSource(HEATMAP_SOURCE);

    if (!showHeatmap || !densityData || densityData.features.length === 0) return;

    const validFeatures = densityData.features.filter(f => f.geometry !== null);
    if (validFeatures.length === 0) return;

    map.addSource(HEATMAP_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: validFeatures } as any,
    });

    map.addLayer({
      id: HEATMAP_LAYER,
      type: "heatmap",
      source: HEATMAP_SOURCE,
      paint: {
        "heatmap-weight": ["get", "weight"],
        "heatmap-intensity": [
          "interpolate", ["linear"], ["zoom"],
          10, 1,
          15, 3,
        ],
        "heatmap-radius": [
          "interpolate", ["linear"], ["zoom"],
          10, 15,
          15, 30,
        ],
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0, "rgba(0,0,0,0)",
          0.2, "#22c55e",
          0.4, "#eab308",
          0.6, "#f97316",
          0.8, "#ef4444",
          1, "#dc2626",
        ],
        "heatmap-opacity": 0.7,
      },
    });
  }, [mapLoaded, showHeatmap, densityData]);

  /* -- 3D Extrusion + Buildings --------------------------------------- */
  const BUILDINGS_3D = "crowdshield-buildings-3d";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Clean up our custom layers
    if (map.getLayer(ZONE_EXTRUDE)) map.removeLayer(ZONE_EXTRUDE);
    if (map.getLayer(BUILDINGS_3D)) map.removeLayer(BUILDINGS_3D);

    if (!show3D) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
      // Hide native building-3d layer if exists
      if (map.getLayer("building-3d")) {
        map.setLayoutProperty("building-3d", "visibility", "none");
      }
      return;
    }

    const defaults = VENUE_DEFAULTS[venueId] ?? VENUE_DEFAULTS.ullevaal;

    map.easeTo({
      pitch: defaults.pitch ?? 45,
      bearing: defaults.bearing ?? -20,
      duration: 1000,
    });

    // Enable native building-3d layer from OpenFreeMap style if present
    if (map.getLayer("building-3d")) {
      map.setLayoutProperty("building-3d", "visibility", "visible");
    }

    // Add our own 3D buildings layer from the openmaptiles source
    const omtSource = map.getSource("openmaptiles");
    if (omtSource && !map.getLayer(BUILDINGS_3D)) {
      map.addLayer({
        id: BUILDINGS_3D,
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": basemap === "dark" ? "#1a1e2e" : "#d4d0c8",
          "fill-extrusion-height": [
            "interpolate", ["linear"], ["zoom"],
            14, 0,
            14.5, ["get", "render_height"],
          ],
          "fill-extrusion-base": [
            "interpolate", ["linear"], ["zoom"],
            14, 0,
            14.5, ["get", "render_min_height"],
          ],
          "fill-extrusion-opacity": basemap === "dark" ? 0.7 : 0.5,
        },
      });
    }

    // Zone extrusions (on top of buildings)
    if (zonesGeoJSON && map.getSource(ZONE_SOURCE)) {
      map.addLayer({
        id: ZONE_EXTRUDE,
        type: "fill-extrusion",
        source: ZONE_SOURCE,
        paint: {
          "fill-extrusion-color": ["get", "_color"],
          "fill-extrusion-height": ["/", ["get", "_people"], 50],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.6,
        },
      });
    }
  }, [mapLoaded, show3D, zonesGeoJSON, venueId, basemap]);

  /* -- Risk Overlay ---------------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    [RISK_PULSE_LAYER, RISK_LAYER].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(RISK_SOURCE)) map.removeSource(RISK_SOURCE);

    if (!showRiskOverlay || !riskData || riskData.features.length === 0) return;

    const validFeatures = riskData.features.filter(f => f.geometry !== null);
    if (validFeatures.length === 0) return;

    const enriched = validFeatures.map(f => ({
      ...f,
      properties: {
        ...f.properties,
        _marker_color: HAZARD_COLORS[f.properties?.hazard_category ?? ""] ?? "#94a3b8",
        _is_high_risk: (Number(f.properties?.risk_score ?? 0) > 7) ? 1 : 0,
      },
    }));

    map.addSource(RISK_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: enriched } as any,
    });

    map.addLayer({
      id: RISK_PULSE_LAYER,
      type: "circle",
      source: RISK_SOURCE,
      filter: ["==", ["get", "_is_high_risk"], 1],
      paint: {
        "circle-radius": 16,
        "circle-color": ["get", "_marker_color"],
        "circle-opacity": 0.15,
        "circle-stroke-width": 0,
      },
    });

    map.addLayer({
      id: RISK_LAYER,
      type: "circle",
      source: RISK_SOURCE,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          10, 5,
          15, 10,
        ],
        "circle-color": ["get", "_marker_color"],
        "circle-opacity": 0.85,
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(255,255,255,0.3)",
      },
    });

    map.on("mouseenter", RISK_LAYER, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", RISK_LAYER, () => {
      map.getCanvas().style.cursor = "";
    });

    map.on("click", RISK_LAYER, (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      const coords = e.lngLat;

      if (popupRef.current) popupRef.current.remove();

      const category = props.hazard_category || "unknown";
      const catColor = HAZARD_COLORS[category] ?? "#94a3b8";
      const score = Number(props.risk_score ?? 0);
      const severityLabel = props.severity_label || (score > 7 ? "High" : score > 4 ? "Medium" : "Low");

      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: "300px",
      })
        .setLngLat(coords)
        .setHTML(`
          <div class="${styles.riskPopup}">
            <div class="${styles.riskPopupHeader}">
              <span class="${styles.riskCategoryDot}" style="background:${catColor}"></span>
              <span class="${styles.popupTitle}">${props.title || "Risk Marker"}</span>
            </div>
            <div class="${styles.riskPopupBody}">
              <div class="${styles.riskPopupRow}">
                <span>Category</span>
                <span style="color:${catColor};text-transform:capitalize">${category.replace(/_/g, " ")}</span>
              </div>
              <div class="${styles.riskPopupRow}">
                <span>Risk Score</span>
                <span class="${styles.riskScore}" style="color:${score > 7 ? RISK_COLORS.critical : score > 4 ? RISK_COLORS.elevated : RISK_COLORS.nominal}">${score}/10</span>
              </div>
              <div class="${styles.riskPopupRow}">
                <span>Severity</span>
                <span>${severityLabel}</span>
              </div>
              ${props.source_page ? `<div class="${styles.riskPopupRow}"><span>Source</span><span>Page ${props.source_page}</span></div>` : ""}
            </div>
          </div>
        `)
        .addTo(map);
    });
  }, [mapLoaded, showRiskOverlay, riskData]);

  /* -- Build legend items ---------------------------------------------- */
  const legendSections = [];

  legendSections.push({
    title: "Crowd Level",
    items: RISK_LEGEND,
  });

  if (showHeatmap) {
    legendSections.push({
      title: "Heatmap Intensity",
      gradient: true,
      items: [
        { label: "Low", color: "#22c55e" },
        { label: "Medium", color: "#eab308" },
        { label: "High", color: "#f97316" },
        { label: "Critical", color: "#ef4444" },
      ],
    });
  }

  if (showRiskOverlay && riskData && riskData.features.length > 0) {
    const activeCategories = new Set(
      riskData.features.map(f => f.properties?.hazard_category).filter(Boolean)
    );
    legendSections.push({
      title: "Risk Categories",
      items: Object.entries(HAZARD_COLORS)
        .filter(([cat]) => activeCategories.has(cat))
        .map(([cat, color]) => ({
          label: cat.replace(/_/g, " "),
          color,
        })),
    });
  }

  if (customZones.length > 0) {
    const activeTypes = new Set(customZones.map(z => z.zone_type));
    legendSections.push({
      title: "Custom Zones",
      items: Array.from(activeTypes).map(t => ({
        label: `${ZONE_TYPE_ICONS[t] || "📍"} ${t.replace(/_/g, " ")}`,
        color: ZONE_TYPE_COLORS[t] || "#06b6d4",
      })),
    });
  }

  return (
    <div className={styles.mapWrap}>
      {/* Loading overlay */}
      <div className={styles.loadingOverlay} data-loaded={mapLoaded}>
        <div className={styles.loadingSpinner}>
          <div className={styles.spinnerRing} />
          <span>Loading map…</span>
        </div>
      </div>

      {/* Status badges */}
      <div className={styles.mapBadges}>
        {show3D && mapLoaded && (
          <div className={styles.mode3dBadge}>
            <span>🏗️</span> 3D View
          </div>
        )}
        {drawMode && mapLoaded && (
          <div className={styles.drawModeBadge}>
            <span>✏️</span> Drawing Zone — Click to add points, double-click to finish
          </div>
        )}
      </div>

      {/* Basemap toggle */}
      {mapLoaded && (
        <div className={styles.basemapToggle}>
          <button
            className={`${styles.basemapBtn} ${basemap === "dark" ? styles.active : ""}`}
            onClick={() => setBasemap("dark")}
            title="Dark"
          >
            🌙
          </button>
          <button
            className={`${styles.basemapBtn} ${basemap === "light" ? styles.active : ""}`}
            onClick={() => setBasemap("light")}
            title="Light"
          >
            ☀️
          </button>
          <button
            className={`${styles.basemapBtn} ${basemap === "satellite" ? styles.active : ""}`}
            onClick={() => setBasemap("satellite")}
            title="Detailed"
          >
            🗺️
          </button>
          <button
            className={`${styles.basemapBtn} ${basemap === "bright" ? styles.active : ""}`}
            onClick={() => setBasemap("bright")}
            title="Bright"
          >
            🌈
          </button>
        </div>
      )}

      {/* Map container */}
      <div ref={mapContainerRef} className={styles.mapContainer} />

      {/* deck.gl Infrastructure Layer */}
      <InfrastructureLayer
        venueId={venueId}
        map={mapRef.current}
        mapLoaded={mapLoaded}
        visible={showInfrastructure}
      />

      {/* Isochrone Layer */}
      <IsochroneLayer
        venueId={venueId}
        map={mapRef.current}
        mapLoaded={mapLoaded}
        visible={showIsochrones}
      />

      {/* Road Capacity / Bottleneck Layer */}
      <RoadCapacityLayer
        venueId={venueId}
        map={mapRef.current}
        mapLoaded={mapLoaded}
        visible={showRoadCapacity}
      />

      {/* Crowd Flow Simulation Layer */}
      <CrowdFlowLayer
        venueId={venueId}
        map={mapRef.current}
        mapLoaded={mapLoaded}
        visible={showSimulation}
      />

      {/* Legend */}
      {mapLoaded && (
        <div className={styles.legend}>
          {legendSections.map((section, si) => (
            <div key={si} className={styles.legendSection}>
              <div className={styles.legendTitle}>{section.title}</div>
              {(section as any).gradient ? (
                <div className={styles.heatmapGradient}>
                  <div className={styles.gradientBar} />
                  <div className={styles.gradientLabels}>
                    <span>Low</span>
                    <span>High</span>
                  </div>
                </div>
              ) : (
                section.items.map((item) => (
                  <div key={item.label} className={styles.legendItem}>
                    <div
                      className={styles.legendSwatch}
                      style={{ backgroundColor: item.color }}
                    />
                    <span>{item.label}</span>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
