"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import EventCurveChart from "@/components/charts/EventCurveChart";
import EventFingerprints from "@/components/charts/EventFingerprints";
import NationalityChart from "@/components/charts/NationalityChart";
import { api, API_BASE, type HealthResponse, type FredrikstadAreasResponse } from "@/lib/api/client";
import { AreaDetailPanel } from "@/components/maps/FredrikstadMap";
import { useEvent } from "@/context/EventContext";
import styles from "./page.module.css";

// Dynamically import MapLibre-based component (no SSR)
const FredrikstadMap = dynamic(() => import("@/components/maps/FredrikstadMap"), {
  ssr: false,
  loading: () => <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-muted)" }}>Loading map…</div>,
});

// ── Galway types ──────────────────────────────────────────────────────────
interface RiskItem {
  id: string;
  hazard_category: string;
  title: string;
  description: string;
  likelihood: string;
  consequence: string;
  controls: string[];
  spatial_reference: string | null;
  source_page: number;
  confidence: number;
}

interface GapItem {
  category: string;
  status: string;
  coverage_score: number;
  recommendations: string[];
}

const CATEGORY_ICONS: Record<string, string> = {
  crowd_crush: "👥", fire: "🔥", weather: "🌧", security: "🔒",
  medical: "🏥", infrastructure: "🏗", traffic: "🚗",
  environmental: "🌿", water: "💧",
};

const LIKELIHOOD_ORDER = ["low", "medium", "high", "very_high"];
const CONSEQUENCE_ORDER = ["minor", "moderate", "major", "catastrophic"];

function riskScore(l: string, c: string): number {
  return (LIKELIHOOD_ORDER.indexOf(l) + 1) * (CONSEQUENCE_ORDER.indexOf(c) + 1);
}

function riskColor(score: number): string {
  if (score >= 12) return "var(--color-critical)";
  if (score >= 8) return "var(--color-high)";
  if (score >= 4) return "var(--color-elevated)";
  return "var(--color-nominal)";
}

// ═══════════════════════════════════════════════════════════════════════════
// Ullevål Command Center View
// ═══════════════════════════════════════════════════════════════════════════
function UllevaalView() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);

  useEffect(() => {
    async function checkHealth() {
      try {
        const h = await api.health();
        setHealth(h);
        setBackendOnline(true);
      } catch {
        setBackendOnline(false);
      }
    }
    checkHealth();
  }, []);

  const stats = [
    {
      label: "Peak Crowd",
      value: health ? `${(health.datasets.telcofy_summary > 0 ? "29,811" : "—")}` : "…",
      detail: "Sep 9, 20:00 UTC",
      color: "var(--color-critical)",
    },
    {
      label: "Derived Baseline",
      value: "~3,064",
      detail: "Overnight floor (02–05h)",
      color: "var(--color-nominal)",
    },
    {
      label: "Events Fingerprinted",
      value: health?.datasets.ullevaal_fingerprints?.toString() ?? "…",
      detail: "3 matches + 2 non-event days",
      color: "var(--color-accent)",
    },
    {
      label: "Crowd Data Points",
      value: health?.datasets.telcofy_summary?.toLocaleString() ?? "…",
      detail: "Telcofy mobility observations",
      color: "var(--color-data-2)",
    },
  ];

  const alerts = [
    { severity: "critical" as const, time: "20:00", text: "Zone density 29,811 — 32.4σ above baseline (Sep 9)" },
    { severity: "high" as const, time: "16:55", text: "Match peak 19,938 — 19.9σ above baseline (Sep 4)" },
    { severity: "high" as const, time: "17:10", text: "Match peak 22,922 — 23.7σ above baseline (Oct 11)" },
    { severity: "elevated" as const, time: "10:50", text: "Daytime spike 5,660 on non-event day — 1.9σ (Sep 3)" },
    { severity: "nominal" as const, time: "00:45", text: "Oct 12 classified as non-event day (-0.4σ)" },
  ];

  return (
    <>
      {!backendOnline && (
        <div className={styles.connectionBanner}>
          <span>⚠ Backend API not reachable — showing cached data only</span>
        </div>
      )}

      <div className={styles.statsRow}>
        {stats.map((stat) => (
          <div key={stat.label} className="panel">
            <div className="stat-card">
              <span className="stat-card__label">{stat.label}</span>
              <span className="stat-card__value" style={{ color: stat.color }}>{stat.value}</span>
              <span className="stat-card__delta">{stat.detail}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.mainGrid}>
        <div className={`panel ${styles.heroPanel}`}>
          <div className="panel__header">
            <h2 className="panel__title">Crowd Dynamics (5 Dates Overlaid)</h2>
            <span className="risk-badge risk-badge--critical">Peak: 29,811</span>
          </div>
          <EventCurveChart />
        </div>
        <div className={`panel ${styles.alertPanel}`}>
          <div className="panel__header">
            <h2 className="panel__title">Anomaly Detections</h2>
            <span className={styles.alertCount}>{alerts.length} events scored</span>
          </div>
          <div className={styles.alertList}>
            {alerts.map((alert, i) => (
              <div key={i} className={`alert-item alert-item--${alert.severity}`}>
                <span className="alert-item__time">{alert.time}</span>
                <span className="alert-item__text">{alert.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`panel ${styles.nationalityPanel}`}>
        <div className="panel__header">
          <h2 className="panel__title">Visitor Composition — Nationality Breakdown Over Time</h2>
          <span className={styles.alertCount}>17 countries tracked</span>
        </div>
        <NationalityChart />
      </div>

      <div className={styles.fingerprintRow}>
        <div className="panel__header" style={{ padding: "0 0 var(--space-lg) 0" }}>
          <h2 className="panel__title">Event Fingerprints — Algorithmically Detected &amp; Characterized</h2>
          <span className="usp-badge">★ Historical Intelligence</span>
        </div>
        <EventFingerprints />
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Galway Command Center View (merged from /galway pilot page)
// ═══════════════════════════════════════════════════════════════════════════
function GalwayView() {
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [overallScore, setOverallScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [risksRes, gapsRes] = await Promise.all([
          fetch(`${API_BASE}/api/documents/galway/risks`).then((r) => r.ok ? r.json() : null),
          fetch(`${API_BASE}/api/documents/galway/gaps`).then((r) => r.ok ? r.json() : null),
        ]);
        if (risksRes?.risks) setRisks(risksRes.risks);
        if (gapsRes) {
          setGaps(gapsRes.gaps || []);
          setOverallScore(gapsRes.overall_score || 0);
        }
        setLoading(false);
      } catch {
        setError("Backend not available");
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const highRisks = risks.filter((r) => riskScore(r.likelihood, r.consequence) >= 8);

  return (
    <>
      {/* Event Brief */}
      <div className={`panel ${styles.briefPanel}`}>
        <div className={styles.briefGrid}>
          <div className={styles.briefItem}>
            <span className={styles.briefLabel}>Event</span>
            <span className={styles.briefValue}>The Whale Street Spectacle</span>
          </div>
          <div className={styles.briefItem}>
            <span className={styles.briefLabel}>Organiser</span>
            <span className={styles.briefValue}>Galway International Arts Festival</span>
          </div>
          <div className={styles.briefItem}>
            <span className={styles.briefLabel}>Dates</span>
            <span className={styles.briefValue}>Fri 17 & Sat 18 July 2026, 21:30</span>
          </div>
          <div className={styles.briefItem}>
            <span className={styles.briefLabel}>Type</span>
            <span className={styles.briefValue}>Street parade (free public event)</span>
          </div>
          <div className={styles.briefItem}>
            <span className={styles.briefLabel}>Location</span>
            <span className={styles.briefValue}>Galway city centre streets</span>
          </div>
          <div className={styles.briefItem}>
            <span className={styles.briefLabel}>Cameras</span>
            <span className={styles.briefValue}>8 positions along parade route</span>
            <span className={styles.briefNote} style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
              (GIAF event security)
            </span>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className={styles.statsRow}>
        <div className="panel">
          <div className="stat-card">
            <span className="stat-card__label">Visitor Origin</span>
            <span className="stat-card__value" style={{ color: "var(--color-accent)", fontSize: "1.3rem" }}>
              42% Loc | 19% Dom | 39% Int'l
            </span>
            <span className="stat-card__delta">B&A Visitor Survey 2024</span>
          </div>
        </div>
        <div className="panel">
          <div className="stat-card">
            <span className="stat-card__label">Transport Modes</span>
            <span className="stat-card__value" style={{ color: "var(--color-accent)", fontSize: "1.3rem" }}>
              41% Walk | 35% Car | 28% Bus
            </span>
            <span className="stat-card__delta">B&A Visitor Survey 2024</span>
          </div>
        </div>
        <div className="panel">
          <div className="stat-card">
            <span className="stat-card__label">High / Critical Risks</span>
            <span className="stat-card__value" style={{ color: "var(--color-critical)" }}>
              {loading ? "…" : highRisks.length}
            </span>
            <span className="stat-card__delta">extracted from safety plan</span>
          </div>
        </div>
        <div className="panel">
          <div className="stat-card">
            <span className="stat-card__label">Doc Completeness</span>
            <span className="stat-card__value" style={{ color: overallScore >= 70 ? "var(--color-nominal)" : "var(--color-elevated)" }}>
              {loading ? "…" : `${Math.round(overallScore)}%`}
            </span>
            <span className="stat-card__delta">hazard coverage</span>
          </div>
        </div>
      </div>

      {error && (
        <div className={styles.connectionBanner}>
          ⚠ Backend API not reachable — risk data requires the backend server
        </div>
      )}

      {/* Main Content */}
      <div className={styles.contentGrid}>
        <div className={`panel ${styles.riskPanel}`}>
          <div className="panel__header">
            <h2 className="panel__title">Extracted Risk Register</h2>
            <span className="usp-badge">★ AI Extracted</span>
          </div>
          {loading ? (
            <div className={styles.loadingState}>Extracting risks from event plan…</div>
          ) : (
            <div className={styles.riskTable}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Risk</th>
                    <th>L × C</th>
                    <th>Score</th>
                    <th>Controls</th>
                    <th>Page</th>
                  </tr>
                </thead>
                <tbody>
                  {risks
                    .sort((a, b) => riskScore(b.likelihood, b.consequence) - riskScore(a.likelihood, a.consequence))
                    .map((risk) => {
                      const score = riskScore(risk.likelihood, risk.consequence);
                      return (
                        <tr key={risk.id}>
                          <td>
                            <span className={styles.categoryBadge}>
                              {CATEGORY_ICONS[risk.hazard_category] || "⚠"}{" "}
                              {risk.hazard_category.replace("_", " ")}
                            </span>
                          </td>
                          <td>
                            <div className={styles.riskTitle}>{risk.title}</div>
                            {risk.spatial_reference && (
                              <div className={styles.spatialRef}>📍 {risk.spatial_reference}</div>
                            )}
                          </td>
                          <td className={styles.lcCell}>
                            {risk.likelihood.charAt(0).toUpperCase()} × {risk.consequence.charAt(0).toUpperCase()}
                          </td>
                          <td>
                            <span
                              className={styles.scoreBadge}
                              style={{
                                background: riskColor(score),
                                color: score >= 8 ? "#fff" : "#1a1a2e",
                              }}
                            >
                              {score}
                            </span>
                          </td>
                          <td>
                            <span className={styles.controlCount}>
                              {risk.controls.length} control{risk.controls.length !== 1 ? "s" : ""}
                            </span>
                          </td>
                          <td className={styles.pageRef}>p.{risk.source_page}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className={styles.analysisColumn}>
          <div className="panel">
            <div className="panel__header">
              <h2 className="panel__title">Hazard Coverage Gaps</h2>
            </div>
            {loading ? (
              <div className={styles.loadingState}>Analyzing coverage…</div>
            ) : (
              <div className={styles.gapList}>
                {gaps.map((gap) => (
                  <div
                    key={gap.category}
                    className={`${styles.gapItem} ${
                      gap.status === "missing" ? styles.gapMissing
                        : gap.status === "partial" ? styles.gapPartial
                        : styles.gapCovered
                    }`}
                  >
                    <div className={styles.gapHeader}>
                      <span>
                        {CATEGORY_ICONS[gap.category] || "⚠"}{" "}
                        {gap.category.replace("_", " ")}
                      </span>
                      <span className={`risk-badge risk-badge--${
                        gap.status === "covered" ? "nominal"
                          : gap.status === "partial" ? "elevated"
                          : "critical"
                      }`}>
                        {gap.status}
                      </span>
                    </div>
                    {gap.recommendations.length > 0 && (
                      <ul className={styles.gapRecs}>
                        {gap.recommendations.map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel__header">
              <h2 className="panel__title">Comparable Event Benchmarks</h2>
              <span className="usp-badge">★ Data Flywheel</span>
            </div>
            <div className={styles.benchmarkList}>
              <div className={styles.benchmarkItem}>
                <span className={styles.benchmarkLabel}>Expected Peak Crowd</span>
                <span className={styles.benchmarkValue}>13,000 – 15,000</span>
                <span className={styles.benchmarkNote}>Derived from GIAF historical mobility data</span>
              </div>
              <div className={styles.benchmarkItem}>
                <span className={styles.benchmarkLabel}>Ingress Duration</span>
                <span className={styles.benchmarkValue}>60 – 90 min</span>
                <span className={styles.benchmarkNote}>Modeled from Transport Hub distances</span>
              </div>
              <div className={styles.benchmarkItem}>
                <span className={styles.benchmarkLabel}>Egress Clearance</span>
                <span className={styles.benchmarkValue}>45 – 60 min</span>
                <span className={styles.benchmarkNote}>Estimated via bottleneck capacities (Fruin LoS C)</span>
              </div>
              <div className={styles.benchmarkItem}>
                <span className={styles.benchmarkLabel}>Critical Density Risk</span>
                <span className={styles.benchmarkValue} style={{ color: "var(--color-elevated)" }}>Elevated (3-4 p/m²)</span>
                <span className={styles.benchmarkNote}>
                  At Cross St & Wolfe Tone Bridge junctions
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Fredrikstad Command Center View — City-Level Monitoring
// ═══════════════════════════════════════════════════════════════════════════

interface FredrikstadAreaItem {
  area_name: string;
  area_code: string;
  admin_level_2: string;
  daily_mean_people: number;
  daily_max_people: number;
  days_observed: number;
}

function ActivityBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", flex: 1 }}>
      <div style={{
        flex: 1, height: 10, borderRadius: 5,
        background: "var(--color-bg-tertiary)",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${pct}%`, borderRadius: 5,
          background: color,
          transition: "width 0.6s ease",
        }} />
      </div>
      <span style={{
        fontSize: "var(--text-xs)", fontVariantNumeric: "tabular-nums",
        color: "var(--color-text-secondary)", minWidth: 50, textAlign: "right",
      }}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function FredrikstadView() {
  const [areas, setAreas] = useState<FredrikstadAreaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalAreas, setTotalAreas] = useState(0);
  const [selectedArea, setSelectedArea] = useState<{
    area_code: string;
    area_name: string;
    daily_max_people: number;
    daily_mean_people: number;
    days_observed: number;
  } | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await api.fredrikstad.areas("daily_max_people", 223);
        setAreas(res.data as unknown as FredrikstadAreaItem[]);
        setTotalAreas(res.total_areas);
        setLoading(false);
      } catch {
        setError("Could not load Fredrikstad area data");
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return <div className={styles.loadingState}>Loading city monitoring data…</div>;
  }

  if (error) {
    return (
      <div className={styles.connectionBanner}>
        ⚠ {error} — backend API required for city-level analytics
      </div>
    );
  }

  const topAreas = areas.slice(0, 10);
  const maxPeak = topAreas.length > 0 ? topAreas[0].daily_max_people : 1;
  const totalDailyPeople = areas.reduce((s, a) => s + Math.round(a.daily_mean_people), 0);
  const avgDailyPeople = areas.length > 0 ? Math.round(totalDailyPeople / areas.length) : 0;
  const daysObserved = areas.length > 0 ? areas[0].days_observed : 0;

  // Activity distribution tiers
  const tiers = [
    { label: "High Activity", threshold: 5000, color: "var(--color-critical)", icon: "🔴" },
    { label: "Moderate", threshold: 2000, color: "var(--color-elevated)", icon: "🟡" },
    { label: "Standard", threshold: 500, color: "var(--color-nominal)", icon: "🟢" },
    { label: "Low", threshold: 0, color: "var(--color-text-tertiary)", icon: "⚪" },
  ];

  const tierCounts = tiers.map((tier, i) => {
    const upperBound = i === 0 ? Infinity : tiers[i - 1].threshold;
    return {
      ...tier,
      count: areas.filter(a => a.daily_max_people >= tier.threshold && a.daily_max_people < upperBound).length,
    };
  });

  const stats = [
    {
      label: "Monitored Areas",
      value: totalAreas.toString(),
      detail: `${daysObserved} days observed`,
      color: "var(--color-accent)",
    },
    {
      label: "Peak Area Crowd",
      value: maxPeak.toLocaleString(),
      detail: topAreas[0]?.area_name ?? "—",
      color: "var(--color-critical)",
    },
    {
      label: "Avg Daily per Area",
      value: avgDailyPeople.toLocaleString(),
      detail: "mean daily footfall",
      color: "var(--color-data-2)",
    },
    {
      label: "High-Activity Zones",
      value: tierCounts[0].count.toString(),
      detail: "areas with peak > 5,000",
      color: "var(--color-high)",
    },
  ];

  return (
    <>
      {/* Stats Row */}
      <div className={styles.statsRow}>
        {stats.map((stat) => (
          <div key={stat.label} className="panel">
            <div className="stat-card">
              <span className="stat-card__label">{stat.label}</span>
              <span className="stat-card__value" style={{ color: stat.color }}>{stat.value}</span>
              <span className="stat-card__delta">{stat.detail}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Map + Detail Panel */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 360px",
        gap: "var(--panel-gap)",
        marginTop: "var(--panel-gap)",
        minHeight: 480,
      }}>
        {/* Map */}
        <div className="panel" style={{ padding: 0, overflow: "hidden", minHeight: 480 }}>
          <FredrikstadMap onAreaSelect={setSelectedArea} />
        </div>

        {/* Detail Panel */}
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <AreaDetailPanel area={selectedArea} />
        </div>
      </div>

      {/* Bottom row: Activity Distribution + Top Areas */}
      <div className={styles.mainGrid} style={{ marginTop: "var(--panel-gap)" }}>
        {/* Top 10 Areas */}
        <div className={`panel ${styles.heroPanel}`}>
          <div className="panel__header">
            <h2 className="panel__title">Top 10 Areas by Peak Daily Crowd</h2>
            <span className={styles.alertCount}>{totalAreas} areas total</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)", padding: "var(--space-sm) 0" }}>
            {topAreas.map((area, i) => (
              <div
                key={area.area_code}
                style={{
                  display: "flex", alignItems: "center", gap: "var(--space-md)",
                  padding: "var(--space-xs) var(--space-sm)",
                  borderRadius: "var(--radius-sm)",
                  background: selectedArea?.area_code === area.area_code ? "rgba(99, 102, 241, 0.12)" : i === 0 ? "rgba(99, 102, 241, 0.06)" : "transparent",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onClick={() => setSelectedArea({
                  area_code: area.area_code,
                  area_name: area.area_name,
                  daily_max_people: area.daily_max_people,
                  daily_mean_people: area.daily_mean_people,
                  days_observed: area.days_observed,
                })}
              >
                <span style={{
                  fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)" as never,
                  color: i < 3 ? "var(--color-accent)" : "var(--color-text-muted)",
                  width: 20, textAlign: "right", fontVariantNumeric: "tabular-nums",
                }}>
                  {i + 1}
                </span>
                <span style={{
                  fontSize: "var(--text-sm)", color: "var(--color-text-primary)",
                  fontWeight: i === 0 ? "var(--weight-semibold)" as never : undefined,
                  width: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {area.area_name}
                </span>
                <ActivityBar
                  value={area.daily_max_people}
                  max={maxPeak}
                  color={area.daily_max_people >= 5000 ? "var(--color-critical)" : area.daily_max_people >= 2000 ? "var(--color-elevated)" : "var(--color-nominal)"}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Activity Distribution */}
        <div className={styles.alertPanel} style={{ maxHeight: "none" }}>
          <div className="panel__header">
            <h2 className="panel__title">Activity Distribution</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)", padding: "var(--space-sm) 0" }}>
            {tierCounts.map((tier) => (
              <div key={tier.label} style={{
                display: "flex", alignItems: "center", gap: "var(--space-md)",
                padding: "var(--space-sm) var(--space-md)",
                borderRadius: "var(--radius-md)",
                borderLeft: `3px solid ${tier.color}`,
                background: "var(--color-bg-secondary)",
              }}>
                <span style={{ fontSize: "var(--text-lg)" }}>{tier.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)" as never, color: "var(--color-text-primary)" }}>
                    {tier.label}
                  </div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
                    Peak daily &ge; {tier.threshold.toLocaleString()}
                  </div>
                </div>
                <span style={{
                  fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)" as never,
                  fontVariantNumeric: "tabular-nums", color: tier.color,
                  minWidth: 36, textAlign: "right",
                }}>
                  {tier.count}
                </span>
              </div>
            ))}
          </div>

          {/* Bottom area distribution bar */}
          <div style={{ marginTop: "auto", paddingTop: "var(--space-lg)" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: "var(--space-xs)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Area Coverage
            </div>
            <div style={{
              display: "flex", height: 14, borderRadius: 7, overflow: "hidden",
              background: "var(--color-bg-tertiary)",
            }}>
              {tierCounts.map((tier) => (
                <div key={tier.label} style={{
                  width: `${(tier.count / totalAreas) * 100}%`,
                  background: tier.color,
                  transition: "width 0.6s ease",
                }} />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-xs)", fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
              <span>{tierCounts[0].count} high</span>
              <span>{totalAreas} areas</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Command Center (event-aware)
// ═══════════════════════════════════════════════════════════════════════════
export default function CommandCenter() {
  const { activeEvent } = useEvent();

  return (
    <div className="app-shell">
      <Sidebar />
      <Header
        title="Command Center"
        subtitle={`Event Risk Intelligence Overview`}
      />
      <main className="app-main">
        {activeEvent.id === "ullevaal" && <UllevaalView />}
        {activeEvent.id === "galway" && <GalwayView />}
        {activeEvent.id === "fredrikstad" && <FredrikstadView />}
      </main>
    </div>
  );
}
