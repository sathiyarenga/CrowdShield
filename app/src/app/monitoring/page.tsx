"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import VenueMap, { type CustomZone } from "@/components/maps/VenueMap";
import ZoneDrawer from "@/components/maps/ZoneDrawer";
import PlanningPanel from "@/components/panels/PlanningPanel";
import PlaybackControls from "@/components/maps/PlaybackControls";
import {
  api,
  type UllevaalSummaryRecord,
  type AnomalyRecord,
} from "@/lib/api/client";
import {
  AreaChart,
  Area,
  ReferenceLine,
  ResponsiveContainer,
  YAxis,
} from "recharts";
import { useEvent } from "@/context/EventContext";
import styles from "./page.module.css";

/* -- Constants ---------------------------------------------------------- */
const AVAILABLE_DATES = [
  "2025-09-03",
  "2025-09-04",
  "2025-09-09",
  "2025-10-11",
  "2025-10-12",
];

const DEFAULT_DATE = "2025-09-09";
const PLAYBACK_INTERVAL_MS = 300;

/* Venue options removed — now driven by EventContext sidebar selector */

/* -- Risk logic --------------------------------------------------------- */
type RiskLevel = "nominal" | "elevated" | "high" | "critical";

const RISK_COLORS: Record<RiskLevel, string> = {
  nominal: "#22c55e",
  elevated: "#eab308",
  high: "#f97316",
  critical: "#ef4444",
};

function getRiskLevel(people: number): RiskLevel {
  if (people >= 20000) return "critical";
  if (people >= 10000) return "high";
  if (people >= 5000) return "elevated";
  return "nominal";
}

function getSeverityColor(severity?: string): string {
  switch (severity?.toLowerCase()) {
    case "critical":
      return RISK_COLORS.critical;
    case "high":
      return RISK_COLORS.high;
    case "elevated":
    case "warning":
      return RISK_COLORS.elevated;
    default:
      return RISK_COLORS.nominal;
  }
}

/* -- Page Component ----------------------------------------------------- */
export default function LiveMonitoring() {
  /* State — venue (driven by EventContext) */
  const { activeEvent } = useEvent();
  const venueId = activeEvent.venueId ?? "ullevaal";
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [show3D, setShow3D] = useState(false);
  const [showRiskOverlay, setShowRiskOverlay] = useState(false);
  const [showInfrastructure, setShowInfrastructure] = useState(false);
  const [showIsochrones, setShowIsochrones] = useState(false);
  const [showRoadCapacity, setShowRoadCapacity] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawType, setDrawType] = useState<"Polygon" | "Point">("Polygon");
  const [customZones, setCustomZones] = useState<CustomZone[]>([]);
  const [drawnGeometry, setDrawnGeometry] = useState<GeoJSON.Polygon | GeoJSON.Point | null>(null);
  const [riskMarkerStats, setRiskMarkerStats] = useState<{ total: number; categories: { category: string; count: number; highRisk: number }[] }>({ total: 0, categories: [] });

  /* State — data */
  const [selectedDate, setSelectedDate] = useState(DEFAULT_DATE);
  const [summaryData, setSummaryData] = useState<UllevaalSummaryRecord[]>([]);
  const [anomalyData, setAnomalyData] = useState<AnomalyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* State — playback */
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  /* Refs for playback interval */
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentIndexRef = useRef(0);
  const speedRef = useRef(1);
  const dataLengthRef = useRef(0);

  // Keep refs in sync
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    dataLengthRef.current = summaryData.length;
  }, [summaryData.length]);

  /* -- Derived: telemetry availability --------------------------------- */
  const hasTelemetry = activeEvent.id === "ullevaal";

  /* -- Handle venue change (now driven by EventContext) ----------------- */
  useEffect(() => {
    if (!hasTelemetry) {
      setIsPlaying(false);
      setShowRiskOverlay(true);
    } else {
      setShowRiskOverlay(false);
    }
  }, [hasTelemetry]);

  /* -- Fetch risk marker stats for planning mode ----------------------- */
  useEffect(() => {
    if (hasTelemetry) return;

    async function fetchRiskStats() {
      try {
        const data = await api.venues.riskMarkers(venueId);
        if (!data?.features) return;

        const catMap = new Map<string, { count: number; highRisk: number }>();
        data.features.forEach((f: any) => {
          const cat = f.properties?.hazard_category || "unknown";
          const score = Number(f.properties?.risk_score ?? 0);
          const entry = catMap.get(cat) || { count: 0, highRisk: 0 };
          entry.count++;
          if (score > 7) entry.highRisk++;
          catMap.set(cat, entry);
        });

        const categories = Array.from(catMap.entries())
          .map(([category, stats]) => ({ category, ...stats }))
          .sort((a, b) => b.count - a.count);

        setRiskMarkerStats({ total: data.features.length, categories });
      } catch { /* ignore */ }
    }

    fetchRiskStats();
  }, [venueId, hasTelemetry]);

  /* -- Fetch data when date changes (only for telemetry venues) ------ */
  useEffect(() => {
    if (!hasTelemetry) {
      setSummaryData([]);
      setAnomalyData([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(null);
      setCurrentIndex(0);
      setIsPlaying(false);

      try {
        const [summaryRes, anomalyRes] = await Promise.all([
          api.ullevaal.summary(selectedDate),
          api.ullevaal.anomalies(selectedDate),
        ]);

        if (cancelled) return;

        const sorted = [...summaryRes.data].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        setSummaryData(sorted);

        const anomalySorted = [...anomalyRes.data].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        setAnomalyData(anomalySorted);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          // Make network errors user-friendly
          if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("ECONNREFUSED")) {
            setError("Backend API is not reachable — crowd data requires the backend server");
          } else {
            setError(msg);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, hasTelemetry]);

  /* -- Playback engine ---------------------------------------------- */
  const startPlayback = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      const next = currentIndexRef.current + 1;
      if (next >= dataLengthRef.current) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsPlaying(false);
        return;
      }
      setCurrentIndex(next);
    }, PLAYBACK_INTERVAL_MS / speedRef.current);
  }, []);

  const stopPlayback = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      if (prev) {
        stopPlayback();
        return false;
      } else {
        if (currentIndexRef.current >= dataLengthRef.current - 1) {
          setCurrentIndex(0);
        }
        startPlayback();
        return true;
      }
    });
  }, [startPlayback, stopPlayback]);

  // Restart interval when speed changes during playback
  useEffect(() => {
    if (isPlaying) {
      stopPlayback();
      startPlayback();
    }
  }, [speed, isPlaying, startPlayback, stopPlayback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPlayback();
  }, [stopPlayback]);

  /* -- Current data point ------------------------------------------- */
  const currentPoint = summaryData[currentIndex];
  const currentPeople = currentPoint?.people ?? 0;
  const riskLevel = getRiskLevel(currentPeople);
  const riskColor = RISK_COLORS[riskLevel];

  /* -- Match anomaly record to current timestamp ------------------- */
  const currentAnomaly = useMemo(() => {
    if (!currentPoint || anomalyData.length === 0) return null;
    const currentTs = currentPoint.timestamp;
    return anomalyData.find((a) => a.timestamp === currentTs) ?? null;
  }, [currentPoint, anomalyData]);

  /* -- Sparkline data ---------------------------------------------- */
  const sparklineData = useMemo(() => {
    return summaryData.map((d, i) => ({
      people: d.people,
      isCurrent: i === currentIndex,
    }));
  }, [summaryData, currentIndex]);

  /* -- Format helpers ----------------------------------------------- */
  function formatTime(ts?: string): string {
    if (!ts) return "--:--";
    try {
      return new Date(ts).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return ts.slice(11, 16);
    }
  }

  /* -- Playback time series for controls ---------------------------- */
  const playbackTimeSeries = useMemo(
    () => summaryData.map((d) => ({ timestamp: d.timestamp, people: d.people })),
    [summaryData]
  );

  /* -- Header ---------------------------------------------------------*/
  const headerTitle = hasTelemetry ? "Venue Monitoring" : "Venue Planning";
  const headerSubtitle = hasTelemetry
    ? `${activeEvent.name} — Historical Crowd Replay`
    : `${activeEvent.name} — Pre-Event Planning Mode`;

  return (
    <div className="app-shell">
      <Sidebar />
      <Header
        title={headerTitle}
        subtitle={headerSubtitle}
      />
      <main className="app-main" style={{ padding: "var(--space-lg)", overflow: "hidden" }}>
        {error && hasTelemetry && (
          <div className={styles.connectionBanner}>
            <span>⚠ {error}</span>
          </div>
        )}

        {/* Planning mode banner for non-telemetry venues */}
        {!hasTelemetry && (
          <div className={styles.planningBanner}>
            <span className={styles.planningIcon}>📋</span>
            <div className={styles.planningText}>
              <strong>Pre-Event Planning Mode</strong>
              <span>No live telemetry available for {activeEvent.name}. Showing risk overlay and zone data only.</span>
            </div>
          </div>
        )}

        <div className={styles.monitoringLayout}>
          {/* -- Main content: Map + Side Panel ----------------------- */}
          <div className={styles.mainContent}>
            {/* Map with layer controls overlay */}
            <div className={styles.mapPanel}>
              {/* Layer Controls — floating panel */}
              <div className={styles.layerControls}>
                {/* Venue is now selected via the sidebar event selector */}

                <div className={styles.layerToggles}>
                  <button
                    className={`${styles.layerToggle} ${showHeatmap ? styles.layerToggleActive : ""}`}
                    onClick={() => setShowHeatmap(h => !h)}
                    title="Toggle Heatmap"
                  >
                    🔥 Heatmap
                  </button>
                  <button
                    className={`${styles.layerToggle} ${show3D ? styles.layerToggleActive : ""}`}
                    onClick={() => setShow3D(d => !d)}
                    title="Toggle 3D View"
                  >
                    🏗️ 3D
                  </button>
                  <button
                    className={`${styles.layerToggle} ${showRiskOverlay ? styles.layerToggleActive : ""}`}
                    onClick={() => setShowRiskOverlay(r => !r)}
                    title="Toggle Risk Overlay"
                  >
                    ⚠️ Risk
                  </button>
                  <button
                    className={`${styles.layerToggle} ${showInfrastructure ? styles.layerToggleActive : ""}`}
                    onClick={() => setShowInfrastructure(i => !i)}
                    title="Toggle Infrastructure"
                  >
                    🏗️ Infra
                  </button>
                  <button
                    className={`${styles.layerToggle} ${showIsochrones ? styles.layerToggleActive : ""}`}
                    onClick={() => setShowIsochrones(i => !i)}
                    title="Toggle Isochrones"
                  >
                    🎯 Reach
                  </button>
                  <button
                    className={`${styles.layerToggle} ${showRoadCapacity ? styles.layerToggleActive : ""}`}
                    onClick={() => setShowRoadCapacity(r => !r)}
                    title="Toggle Road Capacity"
                  >
                    🚧 Roads
                  </button>
                  <button
                    className={`${styles.layerToggle} ${showSimulation ? styles.layerToggleActive : ""}`}
                    onClick={() => setShowSimulation(s => !s)}
                    title="Toggle Crowd Simulation"
                  >
                    🏃 Sim
                  </button>
                </div>

                {/* Zone Drawer toolbar */}
                <ZoneDrawer
                  venueId={venueId}
                  drawMode={drawMode}
                  drawType={drawType}
                  onToggleDrawMode={(type) => {
                    if (!type) {
                      setDrawMode(false);
                    } else {
                      setDrawType(type);
                      setDrawMode(true);
                    }
                  }}
                  customZones={customZones}
                  onZonesUpdated={setCustomZones}
                  drawnGeometry={drawnGeometry}
                  onGeometryConsumed={() => setDrawnGeometry(null)}
                />
              </div>

              <VenueMap
                key={venueId}
                venueId={venueId}
                currentPeople={currentPeople}
                currentTime={currentPoint?.timestamp}
                showHeatmap={showHeatmap}
                show3D={show3D}
                showRiskOverlay={showRiskOverlay}
                showInfrastructure={showInfrastructure}
                showIsochrones={showIsochrones}
                showRoadCapacity={showRoadCapacity}
                showSimulation={showSimulation}
                drawMode={drawMode}
                drawType={drawType}
                onZoneDrawn={(geometry) => setDrawnGeometry(geometry)}
                customZones={customZones}
              />
            </div>

            {/* Side Panel */}
            <div className={styles.sidePanel}>
              {!hasTelemetry ? (
                /* -- Pre-Event Planning Mode ------------ */
                <PlanningPanel
                  venueId={venueId}
                  venueName={activeEvent.name}
                  customZones={customZones}
                  riskMarkerCount={riskMarkerStats.total}
                  riskCategories={riskMarkerStats.categories}
                  onStartDrawing={() => setDrawMode(true)}
                  expectedCrowd={15000}
                />
              ) : (
                /* -- Telemetry Mode --------------------- */
                <>
                  {/* Crowd Count */}
                  <div className={styles.metricCard}>
                    <div className={styles.metricLabel}>Current Crowd</div>
                    <div
                      className={styles.metricValue}
                      style={{ color: riskColor }}
                    >
                      {loading ? "…" : (currentPeople ?? 0).toLocaleString()}
                    </div>
                    <div className={styles.metricSubtext}>
                      {`${formatTime(currentPoint?.timestamp)} · ${selectedDate}`}
                    </div>
                  </div>

                  {/* Anomaly Score */}
                  <div className={styles.anomalyCard}>
                    <div className={styles.metricLabel}>Anomaly Analysis</div>
                    {currentAnomaly ? (
                      <>
                        <div className={styles.anomalyRow}>
                          <div
                            className={styles.anomalyZScore}
                            style={{ color: getSeverityColor(currentAnomaly.severity) }}
                          >
                            {(currentAnomaly.z_score ?? 0).toFixed(1)}σ
                          </div>
                          <span
                            className={styles.anomalySeverity}
                            style={{
                              backgroundColor: `${getSeverityColor(currentAnomaly.severity)}18`,
                              color: getSeverityColor(currentAnomaly.severity),
                            }}
                          >
                            {currentAnomaly.severity}
                          </span>
                        </div>
                        <div className={styles.anomalyMeta}>
                          <span>
                            Baseline: {(currentAnomaly.baseline_mean ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} ± {(currentAnomaly.baseline_std ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                          <span>Hour: {currentAnomaly.hour}:00</span>
                        </div>
                      </>
                    ) : (
                      <div className={styles.anomalyZScore} style={{ color: "var(--color-text-muted)" }}>
                        {loading ? "…" : "—"}
                      </div>
                    )}
                  </div>

                  {/* Sparkline */}
                  <div className={styles.sparklineCard}>
                    <div className={styles.sparklineHeader}>
                      <span className={styles.metricLabel}>Day Overview</span>
                      <span style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--color-text-muted)",
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        {`${summaryData.length} data points`}
                      </span>
                    </div>
                    <div className={styles.sparklineChart}>
                      {summaryData.length > 0 && (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={sparklineData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                            <defs>
                              <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={riskColor} stopOpacity={0.4} />
                                <stop offset="100%" stopColor={riskColor} stopOpacity={0.05} />
                              </linearGradient>
                            </defs>
                            <YAxis domain={["dataMin", "dataMax"]} hide />
                            <Area
                              type="monotone"
                              dataKey="people"
                              stroke={riskColor}
                              strokeWidth={1.5}
                              fill="url(#sparkGradient)"
                              isAnimationActive={false}
                            />
                            {summaryData.length > 0 && (
                              <ReferenceLine
                                x={currentIndex}
                                stroke="var(--color-accent)"
                                strokeWidth={2}
                                strokeDasharray="3 3"
                              />
                            )}
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* -- Playback Controls ------------------------------------ */}
          <div className={styles.playbackBar} data-disabled={!hasTelemetry}>
            <PlaybackControls
              dates={AVAILABLE_DATES}
              selectedDate={selectedDate}
              onDateChange={(d) => {
                setSelectedDate(d);
                setIsPlaying(false);
              }}
              timeSeriesData={playbackTimeSeries}
              currentIndex={currentIndex}
              onIndexChange={setCurrentIndex}
              isPlaying={isPlaying}
              onTogglePlay={hasTelemetry ? handleTogglePlay : () => {}}
              speed={speed}
              onSpeedChange={setSpeed}
              currentPeople={currentPeople}
              riskLevel={riskLevel}
              riskColor={riskColor}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
