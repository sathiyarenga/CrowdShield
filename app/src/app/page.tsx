"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import EventCurveChart from "@/components/charts/EventCurveChart";
import EventFingerprints from "@/components/charts/EventFingerprints";
import NationalityChart from "@/components/charts/NationalityChart";
import { api, API_BASE, type HealthResponse } from "@/lib/api/client";
import { useEvent } from "@/context/EventContext";
import styles from "./page.module.css";

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
          <span>⚠ Backend offline —</span>
          <code>cd backend &amp;&amp; python3 -m uvicorn src.api.main:app --port 8000</code>
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
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className={styles.statsRow}>
        <div className="panel">
          <div className="stat-card">
            <span className="stat-card__label">Risks Extracted</span>
            <span className="stat-card__value" style={{ color: "var(--color-accent)" }}>
              {loading ? "…" : risks.length}
            </span>
            <span className="stat-card__delta">from event safety plan</span>
          </div>
        </div>
        <div className="panel">
          <div className="stat-card">
            <span className="stat-card__label">High / Critical</span>
            <span className="stat-card__value" style={{ color: "var(--color-critical)" }}>
              {loading ? "…" : highRisks.length}
            </span>
            <span className="stat-card__delta">risks requiring attention</span>
          </div>
        </div>
        <div className="panel">
          <div className="stat-card">
            <span className="stat-card__label">Document Completeness</span>
            <span className="stat-card__value" style={{ color: overallScore >= 70 ? "var(--color-nominal)" : "var(--color-elevated)" }}>
              {loading ? "…" : `${Math.round(overallScore)}%`}
            </span>
            <span className="stat-card__delta">hazard category coverage</span>
          </div>
        </div>
        <div className="panel">
          <div className="stat-card">
            <span className="stat-card__label">CrowdShield Benchmark</span>
            <span className="stat-card__value" style={{ color: "var(--color-data-2)" }}>~3,500</span>
            <span className="stat-card__delta">predicted baseline from comparable events</span>
          </div>
        </div>
      </div>

      {error && (
        <div className={styles.connectionBanner}>
          ⚠ Backend offline — start with <code>cd backend && python3 -m uvicorn src.api.main:app --port 8000</code>
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
                <span className={styles.benchmarkValue}>2,000 – 5,000</span>
                <span className={styles.benchmarkNote}>street parade corridor, narrow streets</span>
              </div>
              <div className={styles.benchmarkItem}>
                <span className={styles.benchmarkLabel}>Ingress Duration</span>
                <span className={styles.benchmarkValue}>30 – 45 min</span>
                <span className={styles.benchmarkNote}>based on comparable event baseline patterns</span>
              </div>
              <div className={styles.benchmarkItem}>
                <span className={styles.benchmarkLabel}>Egress Clearance</span>
                <span className={styles.benchmarkValue}>15 – 25 min</span>
                <span className={styles.benchmarkNote}>parade disperses organically along route</span>
              </div>
              <div className={styles.benchmarkItem}>
                <span className={styles.benchmarkLabel}>Critical Density Risk</span>
                <span className={styles.benchmarkValue} style={{ color: "var(--color-elevated)" }}>Moderate</span>
                <span className={styles.benchmarkNote}>
                  narrow Galway streets (&lt;8m wide) vs open stadium concourse
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
      </main>
    </div>
  );
}
