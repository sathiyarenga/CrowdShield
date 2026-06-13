/**
 * CrowdFlowLayer — Animated crowd simulation visualization.
 *
 * Uses deck.gl TripsLayer to render agent trajectories as animated trails.
 * Key architecture: overlay is created ONCE and updated via setProps()
 * to avoid flickering and WebGL buffer re-allocation.
 */
"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { TripsLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import { api } from "@/lib/api/client";
import styles from "./CrowdFlowLayer.module.css";

/* -- Types ------------------------------------------------------------- */

interface Trip {
  path: [number, number, number][]; // [lon, lat, timestamp]
  speed: number;
  agent_id: number;
  origin?: string;
  hub_type?: string;
}

interface OriginInfo {
  name: string;
  hub_type: string;
  lat: number;
  lon: number;
  crowd_share: number;
  agents_assigned: number;
}

interface SimStats {
  num_agents: number;
  agents_visualized: number;
  viz_cap: number;
  total_routes: number;
  total_frames: number;
  simulation_time_s: number;
  wall_time_s: number;
  avg_route_length_m: number;
  avg_walk_time_min: number;
  agents_arrived: number;
  scenario: string;
  mode: string;
}

type Scenario = "ingress" | "egress" | "bidirectional";

interface Props {
  venueId: string;
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  visible: boolean;
}

/* -- Speed color scale (pre-computed for perf) ------------------------- */

function speedToColor(speed: number): [number, number, number, number] {
  const t = Math.min(speed / 2.0, 1.0);
  return [
    Math.round(255 * (1 - t)),
    Math.round(200 * t + 55),
    80,
    200,
  ];
}

/* -- Component --------------------------------------------------------- */

export default function CrowdFlowLayer({ venueId, map, mapLoaded, visible }: Props) {
  const [scenario, setScenario] = useState<Scenario>("ingress");
  const [numAgents, setNumAgents] = useState(2000);
  const [totalTime, setTotalTime] = useState(600);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [stats, setStats] = useState<SimStats | null>(null);
  const [originsUsed, setOriginsUsed] = useState<OriginInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Playback state — use refs for animation loop to avoid re-renders
  const [playing, setPlaying] = useState(false);
  const [displayTime, setDisplayTime] = useState(0); // Only for UI display
  const [playbackSpeed, setPlaybackSpeed] = useState(5);
  const [trailLength, setTrailLength] = useState(20);
  const animFrameRef = useRef<number>(0);
  const lastFrameTime = useRef<number>(0);
  const currentTimeRef = useRef<number>(0); // Mutable ref for animation loop
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const tripsRef = useRef<Trip[]>([]); // Stable ref to trips data
  const trailLengthRef = useRef(20);
  const arrivalTimesRef = useRef<number[]>([]); // Pre-computed arrival time per trip
  const venueCoordRef = useRef<[number, number]>([-9.0545, 53.2707]);

  // Keep refs in sync
  tripsRef.current = trips;
  trailLengthRef.current = trailLength;

  // Computed max time
  const maxTime = useMemo(() => {
    if (trips.length === 0) return 300;
    let max = 0;
    for (const trip of trips) {
      const last = trip.path[trip.path.length - 1];
      if (last && last[2] > max) max = last[2];
    }
    return max;
  }, [trips]);
  const maxTimeRef = useRef(maxTime);
  maxTimeRef.current = maxTime;

  /* -- Run simulation ---------------------------------------------- */
  const runSimulation = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPlaying(false);
    currentTimeRef.current = 0;
    setDisplayTime(0);

    try {
      const result = await api.spatial.simulate(venueId, {
        num_agents: numAgents,
        scenario,
        total_time: totalTime,
      });

      // Cap trips at 3000 for WebGL performance
      const allTrips: Trip[] = result.trips ?? [];
      const cappedTrips = allTrips.length > 3000 ? allTrips.slice(0, 3000) : allTrips;

      setTrips(cappedTrips);
      setStats(result.stats ?? null);
      setOriginsUsed(result.origins_used ?? []);

      // Pre-compute arrival times for accumulation visualization
      const arrivals: number[] = [];
      for (const trip of cappedTrips) {
        const path = trip.path;
        if (path.length < 2) { arrivals.push(Infinity); continue; }
        // Find the first dwell point (same coords as last point)
        const lastLon = path[path.length - 1][0];
        const lastLat = path[path.length - 1][1];
        let arrivalTime = path[path.length - 1][2];
        for (let i = path.length - 2; i >= 0; i--) {
          if (path[i][0] === lastLon && path[i][1] === lastLat) {
            arrivalTime = path[i][2];
          } else {
            break;
          }
        }
        arrivals.push(arrivalTime);
      }
      arrivalTimesRef.current = arrivals;

      // Set venue center coordinate
      const centers: Record<string, [number, number]> = {
        galway: [-9.0545, 53.2707],
        ullevaal: [10.7335, 59.9486],
      };
      venueCoordRef.current = centers[venueId] || centers.galway;
    } catch (e: any) {
      console.error("Simulation failed:", e);
      setError(e.message ?? "Simulation failed");
      setTrips([]);
      setStats(null);
      setOriginsUsed([]);
    } finally {
      setLoading(false);
    }
  }, [venueId, numAgents, scenario, totalTime]);

  /* -- Create overlay ONCE when map is ready ----------------------- */
  useEffect(() => {
    if (!map || !mapLoaded) return;

    // Create a single persistent overlay
    if (!overlayRef.current) {
      const overlay = new MapboxOverlay({
        interleaved: true,
        layers: [], // Start empty
      });
      map.addControl(overlay as any);
      overlayRef.current = overlay;
    }

    return () => {
      if (overlayRef.current) {
        try { map.removeControl(overlayRef.current as any); } catch { /* */ }
        overlayRef.current = null;
      }
    };
  }, [map, mapLoaded]);

  /* -- Update layers when trips or trailLength change -------------- */
  const updateLayers = useCallback((time: number) => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const currentTrips = tripsRef.current;
    if (currentTrips.length === 0) {
      overlay.setProps({ layers: [] });
      return;
    }

    const layers: any[] = [
      new TripsLayer({
        id: "crowd-trips",
        data: currentTrips,
        getPath: (d: Trip) => d.path,
        getTimestamps: (d: Trip) => d.path.map((p) => p[2]),
        getColor: (d: Trip) => speedToColor(d.speed),
        currentTime: time,
        trailLength: trailLengthRef.current,
        widthMinPixels: 2,
        widthMaxPixels: 3,
        opacity: 0.85,
        jointRounded: true,
        capRounded: true,
      }),
    ];

    // -- Accumulation circle at venue center ----------------------
    const arrivals = arrivalTimesRef.current;
    if (arrivals.length > 0) {
      let arrived = 0;
      for (let i = 0; i < arrivals.length; i++) {
        if (time >= arrivals[i]) arrived++;
      }

      if (arrived > 0) {
        const fraction = arrived / arrivals.length;
        // Radius: 8px at 1% → 50px at 100%
        const radius = 8 + fraction * 42;
        // Color: green → amber → red as density increases
        const r = fraction < 0.5 ? Math.round(34 + fraction * 2 * 210) : 245;
        const g = fraction < 0.5 ? Math.round(197 - fraction * 2 * 40) : Math.round(157 - (fraction - 0.5) * 2 * 90);
        const b = fraction < 0.5 ? 94 : Math.round(94 - (fraction - 0.5) * 2 * 80);

        layers.push(
          new ScatterplotLayer({
            id: "venue-accumulation",
            data: [{ position: venueCoordRef.current, arrived }],
            getPosition: (d: any) => d.position,
            getRadius: radius,
            getFillColor: [r, g, b, 120],
            getLineColor: [r, g, b, 220],
            lineWidthMinPixels: 2,
            stroked: true,
            radiusUnits: "pixels" as const,
            antialiasing: true,
          }),
        );
      }
    }

    overlay.setProps({ layers });
  }, []);

  /* -- Clear layers when hidden or trips empty --------------------- */
  useEffect(() => {
    if (!visible || trips.length === 0) {
      overlayRef.current?.setProps({ layers: [] });
    } else {
      // Initial render with current time
      updateLayers(currentTimeRef.current);
    }
  }, [visible, trips, updateLayers]);

  /* -- Update layers when trail length changes --------------------- */
  useEffect(() => {
    if (visible && trips.length > 0) {
      updateLayers(currentTimeRef.current);
    }
  }, [trailLength, visible, trips, updateLayers]);

  /* -- Animation loop — runs outside React state cycle ------------- */
  useEffect(() => {
    if (!playing || tripsRef.current.length === 0) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    let displayUpdateCounter = 0;

    const animate = (now: number) => {
      if (!lastFrameTime.current) lastFrameTime.current = now;
      const delta = (now - lastFrameTime.current) / 1000;
      lastFrameTime.current = now;

      // Update time via ref (no React re-render)
      currentTimeRef.current += delta * playbackSpeed;

      if (currentTimeRef.current >= maxTimeRef.current) {
        currentTimeRef.current = maxTimeRef.current;
        setPlaying(false);
        setDisplayTime(maxTimeRef.current);
        updateLayers(currentTimeRef.current);
        return;
      }

      // Update deck.gl layers directly (no React re-render)
      updateLayers(currentTimeRef.current);

      // Update display time every ~10 frames to avoid excessive re-renders
      displayUpdateCounter++;
      if (displayUpdateCounter % 10 === 0) {
        setDisplayTime(currentTimeRef.current);
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    lastFrameTime.current = 0;
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [playing, playbackSpeed, updateLayers]);

  /* -- Cleanup on unmount ------------------------------------------- */
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  /* -- Origin dots + venue accumulation on map ---------------------- */
  useEffect(() => {
    if (!map || !mapLoaded) return;

    const ORIGIN_SRC = "sim-origins";
    const ORIGIN_CIRCLE = "sim-origins-circles";
    const ORIGIN_ICON = "sim-origins-icons";
    const VENUE_SRC = "sim-venue-dest";
    const VENUE_CIRCLE = "sim-venue-circle";
    const VENUE_PULSE = "sim-venue-pulse";
    const VENUE_LABEL = "sim-venue-label";

    // Clean up previous
    for (const l of [ORIGIN_ICON, ORIGIN_CIRCLE, VENUE_LABEL, VENUE_PULSE, VENUE_CIRCLE]) {
      try { map.removeLayer(l); } catch { /* */ }
    }
    for (const s of [ORIGIN_SRC, VENUE_SRC]) {
      try { map.removeSource(s); } catch { /* */ }
    }

    if (!visible || originsUsed.length === 0) return;

    // Hub type → color mapping
    const hubColors: Record<string, string> = {
      train_station: "#818cf8", bus_station: "#f59e0b", bus_stop: "#fbbf24",
      parking: "#22d3ee", walking: "#4ade80", custom: "#f472b6",
    };

    // -- Origin dots (small, non-intrusive) ----------------------
    const originGeo: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: originsUsed.map((o) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [o.lon, o.lat] },
        properties: {
          color: hubColors[o.hub_type] || "#f472b6",
          name: o.name,
          hub_type: o.hub_type,
          agents: o.agents_assigned,
          share: Math.round(o.crowd_share * 100),
        },
      })),
    };

    map.addSource(ORIGIN_SRC, { type: "geojson", data: originGeo });

    // Small colored circles
    map.addLayer({
      id: ORIGIN_CIRCLE,
      type: "circle",
      source: ORIGIN_SRC,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["get", "share"],
          1, 4, 10, 6, 40, 10
        ],
        "circle-color": ["get", "color"],
        "circle-opacity": 0.85,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#0a0e1a",
      },
    });

    // Tiny icon label (just the emoji shorthand)
    const hubShort: Record<string, string> = {
      train_station: "🚉", bus_station: "🚏", bus_stop: "🚌",
      parking: "P", walking: "→", custom: "·",
    };
    map.addLayer({
      id: ORIGIN_ICON,
      type: "symbol",
      source: ORIGIN_SRC,
      layout: {
        "text-field": ["case",
          ["==", ["get", "hub_type"], "train_station"], "🚉",
          ["==", ["get", "hub_type"], "bus_station"], "🚏",
          ["==", ["get", "hub_type"], "bus_stop"], "🚌",
          ["==", ["get", "hub_type"], "parking"], "🅿",
          ""
        ],
        "text-size": 10,
        "text-anchor": "center",
        "text-allow-overlap": true,
        "text-offset": [0, -1.2],
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#0a0e1a",
        "text-halo-width": 1,
      },
    });

    // -- Popup on hover ------------------------------------------
    const popup = new maplibregl.Popup({
      closeButton: false, closeOnClick: false,
      className: "sim-origin-popup",
      offset: 12,
    });

    const onHover = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [ORIGIN_CIRCLE] });
      if (features.length > 0) {
        const f = features[0];
        const p = f.properties;
        const icons: Record<string, string> = {
          train_station: "🚉", bus_station: "🚏", bus_stop: "🚌",
          parking: "🅿️", walking: "🚶", custom: "📍",
        };
        const icon = icons[p.hub_type] || "📍";
        popup
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(`<div style="font-size:12px;line-height:1.4;color:#e2e8f0">
            <strong>${icon} ${p.name}</strong><br/>
            ${p.agents} agents (${p.share}%)
          </div>`)
          .addTo(map);
        map.getCanvas().style.cursor = "pointer";
      } else {
        popup.remove();
        map.getCanvas().style.cursor = "";
      }
    };
    map.on("mousemove", onHover);

    // -- Venue accumulation circle -------------------------------
    // Show a pulsing circle at the event venue center
    const venueCenters: Record<string, [number, number]> = {
      galway: [-9.0545, 53.2707],
      ullevaal: [10.7335, 59.9486],
    };
    const venueCoord = venueCenters[venueId] || venueCenters.galway;
    const totalAgents = originsUsed.reduce((a, o) => a + o.agents_assigned, 0);

    const venueGeo: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "Point", coordinates: venueCoord },
        properties: { agents: totalAgents },
      }],
    };

    map.addSource(VENUE_SRC, { type: "geojson", data: venueGeo });

    // Outer pulse ring
    map.addLayer({
      id: VENUE_PULSE,
      type: "circle",
      source: VENUE_SRC,
      paint: {
        "circle-radius": 25,
        "circle-color": "transparent",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#f59e0b",
        "circle-stroke-opacity": 0.4,
      },
    });

    // Inner circle — crowd mass indicator
    map.addLayer({
      id: VENUE_CIRCLE,
      type: "circle",
      source: VENUE_SRC,
      paint: {
        "circle-radius": 16,
        "circle-color": "#f59e0b",
        "circle-opacity": 0.35,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#f59e0b",
      },
    });

    // Label
    map.addLayer({
      id: VENUE_LABEL,
      type: "symbol",
      source: VENUE_SRC,
      layout: {
        "text-field": `🎯 Venue\n${totalAgents.toLocaleString()} agents`,
        "text-size": 11,
        "text-anchor": "top",
        "text-offset": [0, 2.5],
      },
      paint: {
        "text-color": "#fbbf24",
        "text-halo-color": "#0a0e1a",
        "text-halo-width": 2,
      },
    });

    return () => {
      map.off("mousemove", onHover);
      popup.remove();
      for (const l of [ORIGIN_ICON, ORIGIN_CIRCLE, VENUE_LABEL, VENUE_PULSE, VENUE_CIRCLE]) {
        try { map.removeLayer(l); } catch { /* */ }
      }
      for (const s of [ORIGIN_SRC, VENUE_SRC]) {
        try { map.removeSource(s); } catch { /* */ }
      }
    };
  }, [map, mapLoaded, visible, originsUsed, venueId]);

  if (!visible) return null;

  const progress = maxTime > 0 ? (displayTime / maxTime) * 100 : 0;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerIcon}>🏃</span>
        <span>Crowd Simulation</span>
        {loading && <span className={styles.spinner}>⏳</span>}
      </div>

      {/* Scenario Selector */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Scenario</div>
        <div className={styles.scenarioGrid}>
          {(["ingress", "egress", "bidirectional"] as Scenario[]).map((s) => (
            <button
              key={s}
              className={`${styles.scenarioBtn} ${scenario === s ? styles.scenarioBtnActive : ""}`}
              onClick={() => setScenario(s)}
              disabled={loading}
            >
              {s === "ingress" ? "📥" : s === "egress" ? "📤" : "↔️"}{" "}
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Agent Count */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Parameters</div>
        <label className={styles.inputRow}>
          <span>Agents</span>
          <select
            className={styles.select}
            value={numAgents}
            onChange={(e) => setNumAgents(Number(e.target.value))}
            disabled={loading}
          >
            <option value={500}>500</option>
            <option value={1000}>1,000</option>
            <option value={2000}>2,000</option>
            <option value={5000}>5,000</option>
            <option value={10000}>10,000</option>
          </select>
        </label>
        <label className={styles.inputRow}>
          <span>{scenario === "egress" ? "Evac. window" : "Arrival window"}</span>
          <select
            className={styles.select}
            value={totalTime}
            onChange={(e) => setTotalTime(Number(e.target.value))}
            disabled={loading}
          >
            <option value={300}>5 min</option>
            <option value={600}>10 min</option>
            <option value={900}>15 min</option>
            <option value={1800}>30 min</option>
            <option value={3600}>60 min</option>
          </select>
        </label>
      </div>

      {/* Run Button */}
      <button
        className={styles.runButton}
        onClick={runSimulation}
        disabled={loading}
      >
        {loading ? "⏳ Simulating..." : "▶ Run Simulation"}
      </button>

      {error && (
        <div className={styles.error}>⚠️ {error}</div>
      )}

      {/* Playback Controls */}
      {trips.length > 0 && (
        <div className={styles.playback}>
          <div className={styles.playbackHeader}>
            <button
              className={styles.playBtn}
              onClick={() => {
                if (currentTimeRef.current >= maxTime) {
                  currentTimeRef.current = 0;
                  setDisplayTime(0);
                }
                setPlaying((p) => !p);
              }}
            >
              {playing ? "⏸" : "▶"}
            </button>
            <span className={styles.timeDisplay}>
              {Math.floor(displayTime)}s / {Math.floor(maxTime)}s
            </span>
            <div className={styles.speedControls}>
              {[1, 5, 10, 20].map((s) => (
                <button
                  key={s}
                  className={`${styles.speedBtn} ${playbackSpeed === s ? styles.speedBtnActive : ""}`}
                  onClick={() => setPlaybackSpeed(s)}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>

          {/* Progress Bar */}
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
            <input
              type="range"
              min={0}
              max={maxTime}
              step={1}
              value={displayTime}
              onChange={(e) => {
                const t = Number(e.target.value);
                currentTimeRef.current = t;
                setDisplayTime(t);
                setPlaying(false);
                updateLayers(t);
              }}
              className={styles.progressSlider}
            />
          </div>

          {/* Live arrival counter */}
          {arrivalTimesRef.current.length > 0 && (
            <div className={styles.statRow} style={{ marginTop: 4, fontSize: "11px", opacity: 0.8 }}>
              <span>🎯 At venue</span>
              <span>
                {arrivalTimesRef.current.filter((t) => displayTime >= t).length.toLocaleString()}
                {" / "}
                {arrivalTimesRef.current.length.toLocaleString()}
              </span>
            </div>
          )}

          {/* Trail Length */}
          <label className={styles.inputRow}>
            <span>Trail length</span>
            <input
              type="range"
              min={2}
              max={60}
              value={trailLength}
              onChange={(e) => setTrailLength(Number(e.target.value))}
              className={styles.trailSlider}
            />
            <span className={styles.trailValue}>{trailLength}s</span>
          </label>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Results</div>
          <div className={styles.statRow}>
            <span>Agents</span>
            <span>{stats.num_agents.toLocaleString()}</span>
          </div>
          <div className={styles.statRow}>
            <span>Rendered</span>
            <span>
              {stats.agents_visualized.toLocaleString()}
              {stats.agents_visualized < stats.num_agents && (
                <span style={{ color: "#94a3b8", fontSize: "0.8em" }}> (GPU limit)</span>
              )}
            </span>
          </div>
          <div className={styles.statRow}>
            <span>Routes</span>
            <span>{stats.total_routes} pedestrian</span>
          </div>
          <div className={styles.statRow}>
            <span>Avg walk</span>
            <span>{stats.avg_route_length_m}m · {stats.avg_walk_time_min} min</span>
          </div>
          <div className={styles.statRow}>
            <span>Arrived ✅</span>
            <span>{stats.agents_arrived?.toLocaleString() ?? "—"}</span>
          </div>
          <div className={styles.statRow}>
            <span>Compute</span>
            <span>{stats.wall_time_s}s</span>
          </div>
        </div>
      )}

      {/* Origins Breakdown */}
      {originsUsed.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Crowd Sources</div>
          {originsUsed.map((o, i) => {
            const icons: Record<string, string> = {
              train_station: "🚉", bus_station: "🚏", bus_stop: "🚌",
              parking: "🅿️", walking: "🚶", custom: "📍",
            };
            return (
              <div key={i} className={styles.statRow}>
                <span>{icons[o.hub_type] || "📍"} {o.name}</span>
                <span>{o.agents_assigned} ({Math.round(o.crowd_share * 100)}%)</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className={styles.legend}>
        <div className={styles.legendRow}>
          <div className={styles.legendDot} style={{ background: "#22c55e" }} />
          <span>Fast (≥1.5 m/s)</span>
        </div>
        <div className={styles.legendRow}>
          <div className={styles.legendDot} style={{ background: "#eab308" }} />
          <span>Normal (~1 m/s)</span>
        </div>
        <div className={styles.legendRow}>
          <div className={styles.legendDot} style={{ background: "#ef4444" }} />
          <span>Slow/Congested</span>
        </div>
      </div>
    </div>
  );
}
