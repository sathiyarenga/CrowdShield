/**
 * IsochroneLayer — Walking-time isochrone visualization.
 *
 * Shows reachability polygons from venue center or hospitals,
 * rendered as semi-transparent filled polygons with smooth gradient colors.
 * Uses native MapLibre fill layers for crisp polygon rendering.
 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { api } from "@/lib/api/client";
import styles from "./IsochroneLayer.module.css";

/* ── Types ───────────────────────────────────────────────────────────── */

interface IsochroneFeature {
  type: "Feature";
  properties: {
    value: number;
    source_name: string;
    source_type: string;
    minutes: number;
    color: string;
    label: string;
  };
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

type IsochroneSource = "venue" | "hospitals";

interface Props {
  venueId: string;
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  visible: boolean;
}

/* ── Color palette for isochrone rings ───────────────────────────────── */

const RING_COLORS: Record<number, { fill: string; stroke: string; label: string }> = {
  5:  { fill: "rgba(34, 197, 94, 0.25)",  stroke: "rgba(34, 197, 94, 0.8)",  label: "5 min" },
  10: { fill: "rgba(234, 179, 8, 0.2)",   stroke: "rgba(234, 179, 8, 0.7)",  label: "10 min" },
  15: { fill: "rgba(249, 115, 22, 0.18)", stroke: "rgba(249, 115, 22, 0.7)", label: "15 min" },
  20: { fill: "rgba(239, 68, 68, 0.15)",  stroke: "rgba(239, 68, 68, 0.6)",  label: "20 min" },
  30: { fill: "rgba(220, 38, 38, 0.12)",  stroke: "rgba(220, 38, 38, 0.5)",  label: "30 min" },
};

/* ── Component ───────────────────────────────────────────────────────── */

export default function IsochroneLayer({ venueId, map, mapLoaded, visible }: Props) {
  const [source, setSource] = useState<IsochroneSource>("venue");
  const [minutes, setMinutes] = useState("5,10,15");
  const [data, setData] = useState<IsochroneFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addedLayersRef = useRef<string[]>([]);
  const addedSourcesRef = useRef<string[]>([]);

  /* ── Fetch isochrone data ───────────────────────────────────────── */
  const fetchIsochrones = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    setError(null);

    try {
      const result = await api.spatial.isochrones(venueId, minutes, source);
      setData((result as any).features ?? []);
    } catch (e: any) {
      console.error("Isochrone fetch failed:", e);
      setError(e.message ?? "Failed to load isochrones");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [venueId, visible, minutes, source]);

  useEffect(() => {
    fetchIsochrones();
  }, [fetchIsochrones]);

  /* ── Render isochrones on map using MapLibre fill layers ─────── */
  useEffect(() => {
    if (!map || !mapLoaded) return;

    // Clean up previous layers and sources
    for (const layerId of addedLayersRef.current) {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      } catch { /* layer may not exist */ }
    }
    for (const sourceId of addedSourcesRef.current) {
      try {
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch { /* source may not exist */ }
    }
    addedLayersRef.current = [];
    addedSourcesRef.current = [];

    if (!visible || data.length === 0) return;

    // Sort features: largest first so smaller rings render on top
    const sorted = [...data].sort(
      (a, b) => (b.properties.minutes ?? 0) - (a.properties.minutes ?? 0)
    );

    // Add each isochrone as a separate source+layer for clean z-ordering
    sorted.forEach((feature, idx) => {
      const mins = feature.properties.minutes;
      const colors = RING_COLORS[mins] ?? {
        fill: "rgba(99, 102, 241, 0.15)",
        stroke: "rgba(99, 102, 241, 0.6)",
        label: `${mins} min`,
      };

      const sourceId = `isochrone-source-${idx}`;
      const fillLayerId = `isochrone-fill-${idx}`;
      const lineLayerId = `isochrone-line-${idx}`;

      // Add GeoJSON source
      map.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [feature],
        },
      });
      addedSourcesRef.current.push(sourceId);

      // Fill layer
      map.addLayer({
        id: fillLayerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": colors.fill,
          "fill-opacity": 1,
        },
      });
      addedLayersRef.current.push(fillLayerId);

      // Border line layer
      map.addLayer({
        id: lineLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": colors.stroke,
          "line-width": 2,
          "line-dasharray": [4, 2],
          "line-opacity": 0.9,
        },
      });
      addedLayersRef.current.push(lineLayerId);
    });

    // Add click handler for isochrone info
    const handleClick = (e: any) => {
      if (!map) return;
      const fillLayers = addedLayersRef.current.filter(l => l.startsWith("isochrone-fill-"));
      const features = map.queryRenderedFeatures(e.point, { layers: fillLayers });
      if (features.length > 0) {
        const f = features[0];
        const props = f.properties;
        const popup = document.createElement("div");
        popup.innerHTML = `
          <div style="padding: 8px; font-size: 12px; color: #e2e8f0; background: rgba(10,14,26,0.9); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
            <strong>${props.label ?? "Isochrone"}</strong><br/>
            <span style="color: #94a3b8">${props.source_name ?? "Event Center"} • ${props.minutes ?? "?"}min walk</span>
          </div>
        `;
        new (map as any).constructor.prototype.constructor.Popup({ offset: 10, closeButton: true })
          .setLngLat(e.lngLat)
          .setDOMContent(popup)
          .addTo(map);
      }
    };

    // We'll skip native popups and keep it simple for now
  }, [map, mapLoaded, visible, data]);

  /* ── Cleanup on unmount ─────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      if (!map) return;
      for (const layerId of addedLayersRef.current) {
        try { if (map.getLayer(layerId)) map.removeLayer(layerId); } catch { /* */ }
      }
      for (const sourceId of addedSourcesRef.current) {
        try { if (map.getSource(sourceId)) map.removeSource(sourceId); } catch { /* */ }
      }
      addedLayersRef.current = [];
      addedSourcesRef.current = [];
    };
  }, [map]);

  if (!visible) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerIcon}>🎯</span>
        <span>Isochrones</span>
        {loading && <span className={styles.spinner}>⏳</span>}
      </div>

      {/* Source selector */}
      <div className={styles.sourceSelector}>
        <button
          className={`${styles.sourceBtn} ${source === "venue" ? styles.sourceBtnActive : ""}`}
          onClick={() => setSource("venue")}
        >
          📍 From Venue
        </button>
        <button
          className={`${styles.sourceBtn} ${source === "hospitals" ? styles.sourceBtnActive : ""}`}
          onClick={() => setSource("hospitals")}
        >
          🏥 From Hospitals
        </button>
      </div>

      {/* Time presets */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Walking Time Ranges</div>
        <div className={styles.presets}>
          {["5,10,15", "5,10,15,20", "5,10,15,20,30"].map((preset) => (
            <button
              key={preset}
              className={`${styles.presetBtn} ${minutes === preset ? styles.presetBtnActive : ""}`}
              onClick={() => setMinutes(preset)}
            >
              {preset.split(",").map(m => `${m}m`).join(" ")}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Legend</div>
        {minutes.split(",").map((m) => {
          const mins = parseInt(m);
          const colors = RING_COLORS[mins];
          if (!colors) return null;
          return (
            <div key={mins} className={styles.legendItem}>
              <div
                className={styles.legendSwatch}
                style={{
                  background: colors.fill,
                  borderColor: colors.stroke,
                }}
              />
              <span>{colors.label} walking</span>
            </div>
          );
        })}
      </div>

      {/* Info */}
      <div className={styles.info}>
        {source === "venue"
          ? "Shows walking coverage from the event center"
          : "Shows walking access to nearest hospitals"}
      </div>

      {error && (
        <div className={styles.error}>
          ⚠️ {error}
          <button className={styles.retryBtn} onClick={fetchIsochrones}>Retry</button>
        </div>
      )}

      {!loading && data.length > 0 && (
        <div className={styles.stats}>
          {data.length} isochrone{data.length !== 1 ? "s" : ""} rendered
        </div>
      )}
    </div>
  );
}
