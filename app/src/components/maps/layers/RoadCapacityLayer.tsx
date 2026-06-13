/**
 * RoadCapacityLayer — Bottleneck analysis visualization.
 *
 * Color-codes road segments by pedestrian capacity relative to crowd size.
 * Critical bottlenecks are red, warnings orange, adequate green.
 * Line width reflects road width. Configurable crowd size and egress time.
 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { api } from "@/lib/api/client";
import styles from "./RoadCapacityLayer.module.css";

/* -- Types ------------------------------------------------------------- */

interface BottleneckFeature {
  type: "Feature";
  properties: {
    osm_id: number;
    name: string;
    highway_type: string;
    width_m: number;
    lanes: number | null;
    ped_capacity_ppm: number;
    capacity_rating: string;
    segment_length_m: number;
    capacity_ratio: number;
    severity: "critical" | "warning" | "adequate";
    color: string;
    is_key_route: boolean;
    surface: string;
    lit: string;
    label: string;
  };
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
}

interface BottleneckStats {
  critical: number;
  warning: number;
  adequate: number;
  total_segments: number;
  avg_capacity_ppm: number;
  min_capacity_ppm: number;
  narrowest_segment: string;
}

interface Props {
  venueId: string;
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  visible: boolean;
}

/* -- Component --------------------------------------------------------- */

export default function RoadCapacityLayer({ venueId, map, mapLoaded, visible }: Props) {
  const [crowdSize, setCrowdSize] = useState(10000);
  const [egressMinutes, setEgressMinutes] = useState(15);
  const [data, setData] = useState<BottleneckFeature[]>([]);
  const [stats, setStats] = useState<BottleneckStats | null>(null);
  const [metadata, setMetadata] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOnlyBottlenecks, setShowOnlyBottlenecks] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<BottleneckFeature | null>(null);
  const addedLayersRef = useRef<string[]>([]);
  const addedSourcesRef = useRef<string[]>([]);

  /* -- Fetch bottleneck data ---------------------------------------- */
  const fetchBottlenecks = useCallback(async () => {
    if (!visible) return;
    setLoading(true);

    try {
      const result = await api.spatial.bottlenecks(venueId, crowdSize, egressMinutes);
      const res = result as any;
      setData(res.features ?? []);
      setStats(res.metadata?.stats ?? null);
      setMetadata(res.metadata ?? null);
    } catch (e) {
      console.error("Bottleneck fetch failed:", e);
      setData([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [venueId, visible, crowdSize, egressMinutes]);

  useEffect(() => {
    fetchBottlenecks();
  }, [fetchBottlenecks]);

  /* -- Render road segments on map ---------------------------------- */
  useEffect(() => {
    if (!map || !mapLoaded) return;

    // Cleanup
    for (const layerId of addedLayersRef.current) {
      try { if (map.getLayer(layerId)) map.removeLayer(layerId); } catch { /* */ }
    }
    for (const sourceId of addedSourcesRef.current) {
      try { if (map.getSource(sourceId)) map.removeSource(sourceId); } catch { /* */ }
    }
    addedLayersRef.current = [];
    addedSourcesRef.current = [];

    if (!visible || data.length === 0) return;

    const filteredData = showOnlyBottlenecks
      ? data.filter((f) => f.properties.severity !== "adequate")
      : data;

    // Group by severity for z-ordering (adequate first, critical on top)
    const severityGroups: Record<string, BottleneckFeature[]> = {
      adequate: [],
      warning: [],
      critical: [],
    };
    for (const f of filteredData) {
      const sev = f.properties.severity;
      (severityGroups[sev] ?? severityGroups.adequate).push(f);
    }

    for (const [severity, features] of Object.entries(severityGroups)) {
      if (features.length === 0) continue;

      const sourceId = `road-capacity-${severity}`;
      const lineLayerId = `road-capacity-line-${severity}`;
      const glowLayerId = `road-capacity-glow-${severity}`;

      const color = severity === "critical" ? "#ef4444"
        : severity === "warning" ? "#f97316"
        : "#22c55e";

      map.addSource(sourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });
      addedSourcesRef.current.push(sourceId);

      // Glow layer (wider, transparent)
      map.addLayer({
        id: glowLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": color,
          "line-width": [
            "interpolate", ["linear"], ["get", "width_m"],
            1, 6,
            6, 10,
            14, 16,
          ],
          "line-opacity": 0.25,
          "line-blur": 3,
        },
      });
      addedLayersRef.current.push(glowLayerId);

      // Main line layer
      map.addLayer({
        id: lineLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": color,
          "line-width": [
            "interpolate", ["linear"], ["get", "width_m"],
            1, 2,
            6, 4,
            14, 7,
          ],
          "line-opacity": severity === "adequate" ? 0.5 : 0.85,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });
      addedLayersRef.current.push(lineLayerId);

      // Click handler
      map.on("click", lineLayerId, (e) => {
        if (e.features && e.features.length > 0) {
          const props = e.features[0].properties as any;
          setSelectedSegment({
            type: "Feature",
            properties: props,
            geometry: e.features[0].geometry as any,
          });
        }
      });

      // Cursor on hover
      map.on("mouseenter", lineLayerId, () => {
        if (map) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", lineLayerId, () => {
        if (map) map.getCanvas().style.cursor = "";
      });
    }
  }, [map, mapLoaded, visible, data, showOnlyBottlenecks]);

  /* -- Cleanup on unmount ------------------------------------------- */
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
    <>
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.headerIcon}>🚧</span>
          <span>Road Capacity</span>
          {loading && <span className={styles.spinner}>⏳</span>}
        </div>

        {/* Crowd Size Input */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Scenario Parameters</div>
          <label className={styles.inputRow}>
            <span>Crowd Size</span>
            <input
              type="number"
              min={1000}
              max={100000}
              step={1000}
              value={crowdSize}
              onChange={(e) => setCrowdSize(Number(e.target.value))}
              className={styles.numberInput}
            />
          </label>
          <label className={styles.inputRow}>
            <span>Egress Target</span>
            <div className={styles.inputWithUnit}>
              <input
                type="number"
                min={5}
                max={60}
                step={5}
                value={egressMinutes}
                onChange={(e) => setEgressMinutes(Number(e.target.value))}
                className={styles.numberInput}
              />
              <span className={styles.unit}>min</span>
            </div>
          </label>
        </div>

        {/* Filter */}
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={showOnlyBottlenecks}
            onChange={() => setShowOnlyBottlenecks((b) => !b)}
          />
          <span>Show only bottlenecks</span>
        </label>

        {/* Stats Summary */}
        {stats && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Analysis Results</div>
            <div className={styles.statsGrid}>
              <div className={`${styles.statCard} ${styles.critical}`}>
                <span className={styles.statValue}>{stats.critical}</span>
                <span className={styles.statLabel}>Critical</span>
              </div>
              <div className={`${styles.statCard} ${styles.warning}`}>
                <span className={styles.statValue}>{stats.warning}</span>
                <span className={styles.statLabel}>Warning</span>
              </div>
              <div className={`${styles.statCard} ${styles.adequate}`}>
                <span className={styles.statValue}>{stats.adequate}</span>
                <span className={styles.statLabel}>OK</span>
              </div>
            </div>
            <div className={styles.statRow}>
              <span>Avg Capacity</span>
              <span>{stats.avg_capacity_ppm} ppl/min</span>
            </div>
            <div className={styles.statRow}>
              <span>Narrowest</span>
              <span className={styles.narrowest}>{stats.narrowest_segment}</span>
            </div>
            {metadata && (
              <>
                <div className={styles.statRow}>
                  <span>Required Flow</span>
                  <span>{metadata.required_flow_ppm} ppl/min</span>
                </div>
                <div className={styles.statRow}>
                  <span>Est. Routes</span>
                  <span>{metadata.estimated_routes}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Legend */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Legend</div>
          <div className={styles.legendItem}>
            <div className={styles.legendLine} style={{ background: "#ef4444" }} />
            <span>Critical — capacity &lt;30% needed</span>
          </div>
          <div className={styles.legendItem}>
            <div className={styles.legendLine} style={{ background: "#f97316" }} />
            <span>Warning — capacity 30-70% needed</span>
          </div>
          <div className={styles.legendItem}>
            <div className={styles.legendLine} style={{ background: "#22c55e" }} />
            <span>Adequate — capacity &gt;70% needed</span>
          </div>
        </div>

        <div className={styles.info}>
          Based on Fruin LoS C: 25 ped/m/min flow rate
        </div>
      </div>

      {/* Selected Segment Popup */}
      {selectedSegment && (
        <div className={styles.popup}>
          <button className={styles.popupClose} onClick={() => setSelectedSegment(null)}>×</button>
          <div className={styles.popupTitle}>
            <span className={`${styles.severityDot} ${styles[selectedSegment.properties.severity]}`} />
            {selectedSegment.properties.name || "Unnamed Road"}
          </div>
          <div className={styles.popupType}>
            {selectedSegment.properties.highway_type} • {selectedSegment.properties.severity.toUpperCase()}
          </div>
          <div className={styles.popupRow}>
            <span>Width</span>
            <span>{selectedSegment.properties.width_m}m</span>
          </div>
          <div className={styles.popupRow}>
            <span>Lanes</span>
            <span>{selectedSegment.properties.lanes ?? "—"}</span>
          </div>
          <div className={styles.popupRow}>
            <span>Capacity</span>
            <span>{selectedSegment.properties.ped_capacity_ppm} ppl/min</span>
          </div>
          <div className={styles.popupRow}>
            <span>Length</span>
            <span>{selectedSegment.properties.segment_length_m}m</span>
          </div>
          <div className={styles.popupRow}>
            <span>Capacity Ratio</span>
            <span>{(selectedSegment.properties.capacity_ratio * 100).toFixed(0)}%</span>
          </div>
          {selectedSegment.properties.surface && (
            <div className={styles.popupRow}>
              <span>Surface</span>
              <span>{selectedSegment.properties.surface}</span>
            </div>
          )}
          {selectedSegment.properties.lit && (
            <div className={styles.popupRow}>
              <span>Lighting</span>
              <span>{selectedSegment.properties.lit === "yes" ? "✅ Lit" : "❌ Unlit"}</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
