"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { api } from "@/lib/api/client";
import styles from "./page.module.css";

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
  crowd_crush: "👥",
  fire: "🔥",
  weather: "🌧",
  security: "🔒",
  medical: "🏥",
  infrastructure: "🏗",
  traffic: "🚗",
  environmental: "🌿",
  water: "💧",
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

export default function GalwayPilotPage() {
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [overallScore, setOverallScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [risksRes, gapsRes] = await Promise.all([
          fetch("http://localhost:8000/api/documents/galway/risks").then((r) =>
            r.ok ? r.json() : null
          ),
          fetch("http://localhost:8000/api/documents/galway/gaps").then((r) =>
            r.ok ? r.json() : null
          ),
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

  const highRisks = risks.filter(
    (r) => riskScore(r.likelihood, r.consequence) >= 8
  );
  const categoryCounts: Record<string, number> = {};
  risks.forEach((r) => {
    categoryCounts[r.hazard_category] = (categoryCounts[r.hazard_category] || 0) + 1;
  });

  return (
    <div className="app-shell">
      <Sidebar />
      <Header
        title="Galway Pilot Report"
        subtitle="The Whale Street Spectacle — GIAF 2026 · Pre-Event Risk Intelligence"
      />
      <main className="app-main">
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
              <span
                className="stat-card__value"
                style={{ color: "var(--color-accent)" }}
              >
                {loading ? "…" : risks.length}
              </span>
              <span className="stat-card__delta">from 91-page event plan</span>
            </div>
          </div>
          <div className="panel">
            <div className="stat-card">
              <span className="stat-card__label">High / Critical</span>
              <span
                className="stat-card__value"
                style={{ color: "var(--color-critical)" }}
              >
                {loading ? "…" : highRisks.length}
              </span>
              <span className="stat-card__delta">risks requiring attention</span>
            </div>
          </div>
          <div className="panel">
            <div className="stat-card">
              <span className="stat-card__label">Document Completeness</span>
              <span
                className="stat-card__value"
                style={{ color: overallScore >= 70 ? "var(--color-nominal)" : "var(--color-elevated)" }}
              >
                {loading ? "…" : `${Math.round(overallScore)}%`}
              </span>
              <span className="stat-card__delta">hazard category coverage</span>
            </div>
          </div>
          <div className="panel">
            <div className="stat-card">
              <span className="stat-card__label">CrowdShield Benchmark</span>
              <span
                className="stat-card__value"
                style={{ color: "var(--color-data-2)" }}
              >
                ~3,500
              </span>
              <span className="stat-card__delta">predicted baseline from comparable events</span>
            </div>
          </div>
        </div>

        {error && (
          <div className={styles.errorBanner}>
            ⚠ Backend offline — start with <code>cd backend && python3 -m uvicorn src.api.main:app --port 8000</code>
          </div>
        )}

        {/* Main Content */}
        <div className={styles.contentGrid}>
          {/* Risk Register */}
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
                                <div className={styles.spatialRef}>
                                  📍 {risk.spatial_reference}
                                </div>
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

          {/* Right Column */}
          <div className={styles.analysisColumn}>
            {/* Gap Analysis */}
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
                        gap.status === "missing"
                          ? styles.gapMissing
                          : gap.status === "partial"
                          ? styles.gapPartial
                          : styles.gapCovered
                      }`}
                    >
                      <div className={styles.gapHeader}>
                        <span>
                          {CATEGORY_ICONS[gap.category] || "⚠"}{" "}
                          {gap.category.replace("_", " ")}
                        </span>
                        <span
                          className={`risk-badge risk-badge--${
                            gap.status === "covered"
                              ? "nominal"
                              : gap.status === "partial"
                              ? "elevated"
                              : "critical"
                          }`}
                        >
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

            {/* Benchmark Panel */}
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
                  <span className={styles.benchmarkNote}>based on Ullevaal non-event baseline patterns</span>
                </div>
                <div className={styles.benchmarkItem}>
                  <span className={styles.benchmarkLabel}>Egress Clearance</span>
                  <span className={styles.benchmarkValue}>15 – 25 min</span>
                  <span className={styles.benchmarkNote}>parade disperses organically along route</span>
                </div>
                <div className={styles.benchmarkItem}>
                  <span className={styles.benchmarkLabel}>Critical Density Risk</span>
                  <span className={styles.benchmarkValue} style={{ color: "var(--color-elevated)" }}>
                    Moderate
                  </span>
                  <span className={styles.benchmarkNote}>
                    narrow Galway streets (&lt;8m wide) vs open stadium concourse
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
