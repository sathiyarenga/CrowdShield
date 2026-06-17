"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { useEvent } from "@/context/EventContext";
import CompositeRiskGauge from "@/components/risk/CompositeRiskGauge";
import RiskTimeline from "@/components/risk/RiskTimeline";
import RiskBreakdown from "@/components/risk/RiskBreakdown";
import {
  api,
  API_BASE,
  type CompositeRiskResponse,
  type RiskComponent,
  type RiskTimelinePoint,
  type HazardRiskItem,
} from "@/lib/api/client";
import styles from "./page.module.css";

// Demo data to show when backend is offline
const DEMO_DATA: CompositeRiskResponse = {
  date: "2025-09-09",
  composite_score: 72,
  composite_level: "high",
  components: [
    {
      name: "Document Risk",
      score: 68,
      weight: 0.3,
      level: "elevated",
      description:
        "Risk assessment based on safety document coverage and identified hazards",
    },
    {
      name: "Historical Anomaly",
      score: 85,
      weight: 0.4,
      level: "high",
      description:
        "Anomaly severity from historical crowd density patterns at 32.4σ above baseline",
    },
    {
      name: "Density Prediction",
      score: 62,
      weight: 0.3,
      level: "elevated",
      description:
        "Predicted crowd density risk based on ingress/egress flow modeling",
    },
  ],
  timeline: [
    { time: "08:00", composite_score: 15, document_risk: 20, historical_anomaly: 10, density_prediction: 12 },
    { time: "10:00", composite_score: 18, document_risk: 22, historical_anomaly: 12, density_prediction: 18 },
    { time: "12:00", composite_score: 22, document_risk: 25, historical_anomaly: 15, density_prediction: 24 },
    { time: "14:00", composite_score: 35, document_risk: 30, historical_anomaly: 28, density_prediction: 45 },
    { time: "15:00", composite_score: 48, document_risk: 35, historical_anomaly: 42, density_prediction: 62 },
    { time: "16:00", composite_score: 58, document_risk: 45, historical_anomaly: 55, density_prediction: 70 },
    { time: "17:00", composite_score: 65, document_risk: 55, historical_anomaly: 68, density_prediction: 68 },
    { time: "18:00", composite_score: 72, document_risk: 62, historical_anomaly: 78, density_prediction: 72 },
    { time: "19:00", composite_score: 78, document_risk: 65, historical_anomaly: 85, density_prediction: 80 },
    { time: "20:00", composite_score: 85, document_risk: 68, historical_anomaly: 92, density_prediction: 88 },
    { time: "21:00", composite_score: 72, document_risk: 60, historical_anomaly: 75, density_prediction: 78 },
    { time: "22:00", composite_score: 45, document_risk: 40, historical_anomaly: 42, density_prediction: 52 },
    { time: "23:00", composite_score: 25, document_risk: 25, historical_anomaly: 20, density_prediction: 28 },
  ],
  hazard_breakdown: [
    { category: "Crowd Crush", risk_score: 88, risk_count: 4, level: "critical" },
    { category: "Structural Failure", risk_score: 45, risk_count: 2, level: "elevated" },
    { category: "Fire / Evacuation", risk_score: 62, risk_count: 3, level: "high" },
    { category: "Medical Emergency", risk_score: 55, risk_count: 3, level: "elevated" },
    { category: "Weather Exposure", risk_score: 30, risk_count: 2, level: "nominal" },
    { category: "Security Threat", risk_score: 70, risk_count: 2, level: "high" },
    { category: "Transport Failure", risk_score: 38, risk_count: 1, level: "nominal" },
  ],
};

function getLevelColor(level: string): string {
  switch (level.toLowerCase()) {
    case "critical":
      return "var(--color-critical)";
    case "high":
      return "var(--color-high)";
    case "elevated":
      return "var(--color-elevated)";
    default:
      return "var(--color-nominal)";
  }
}

function getLevelBg(level: string): string {
  switch (level.toLowerCase()) {
    case "critical":
      return "var(--color-critical-bg)";
    case "high":
      return "var(--color-high-bg)";
    case "elevated":
      return "var(--color-elevated-bg)";
    default:
      return "var(--color-nominal-bg)";
  }
}

export default function RiskPage() {
  const { activeEvent } = useEvent();
  const [data, setData] = useState<CompositeRiskResponse | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch composite + timeline in parallel
        const [compRaw, tlRaw] = await Promise.all([
          fetch(`${API_BASE}/api/risk/composite?date=2025-09-09`).then(
            (r) => (r.ok ? r.json() : null)
          ),
          fetch(`${API_BASE}/api/risk/timeline?date=2025-09-09`).then(
            (r) => (r.ok ? r.json() : null)
          ),
        ]);

        if (!compRaw) throw new Error("Backend offline");

        // Transform component_scores dict → components array
        const compScores = compRaw.component_scores || {};
        const componentDescriptions: Record<string, string> = {
          document:
            "Risk from AI-extracted safety document analysis — hazard coverage and severity scoring",
          anomaly:
            "Anomaly severity from historical crowd density patterns relative to baseline",
          density:
            "Predicted density risk based on current vs historical peak capacity ratio",
        };
        const componentNames: Record<string, string> = {
          document: "Document Risk",
          anomaly: "Historical Anomaly",
          density: "Density Prediction",
        };
        const components: RiskComponent[] = Object.entries(compScores).map(
          ([key, val]: [string, unknown]) => {
            const v = val as { score: number; weight: number; weighted: number };
            const score100 = Math.round(v.score * 100);
            return {
              name: componentNames[key] || key,
              score: score100,
              weight: v.weight,
              level:
                score100 >= 75
                  ? "critical"
                  : score100 >= 50
                    ? "high"
                    : score100 >= 25
                      ? "elevated"
                      : "nominal",
              description: componentDescriptions[key] || "",
            };
          }
        );

        // Transform risk_by_category dict → hazard_breakdown array
        // Use actual risk counts to differentiate scores across categories
        const riskByCat = compRaw.risk_by_category || {};
        const docRiskCats = compScores.document?.categories || {};
        const metadata = compRaw.metadata || {};
        const totalDocRisks = metadata.total_doc_risks || 131;
        
        // Fetch risk counts per category from summary endpoint
        let catCounts: Record<string, number> = {};
        try {
          const summaryRes = await fetch(
            `${API_BASE}/api/documents/galway/summary`
          ).then((r) => (r.ok ? r.json() : null));
          catCounts = summaryRes?.risk_register?.by_category || {};
        } catch { /* ignore */ }

        const hazard_breakdown: HazardRiskItem[] = Object.entries(
          riskByCat
        ).map(([cat, level]) => {
          const baseCatScore = (docRiskCats[cat] || 0.36) * 100;
          const catCount = catCounts[cat.toLowerCase()] || catCounts[cat] || 0;
          // Blend base score with count-weighted importance (more risks = higher score)
          const countWeight = totalDocRisks > 0 ? (catCount / totalDocRisks) * 100 : 0;
          const blendedScore = Math.round(baseCatScore * 0.5 + countWeight * 0.5 + (catCount > 20 ? 20 : catCount > 10 ? 10 : 0));
          return {
            category: cat.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
            risk_score: Math.min(100, Math.max(10, blendedScore)),
            risk_count: catCount,
            level: level as string,
          };
        });

        // Transform timeline points — sample every 12th point (hourly from 5-min)
        const rawTimeline = (tlRaw?.timeline || []) as Array<{
          timestamp: string;
          composite_score: number;
          anomaly_score: number;
          people: number;
        }>;
        const stride = Math.max(1, Math.floor(rawTimeline.length / 24));
        const timeline: RiskTimelinePoint[] = rawTimeline
          .filter((_: unknown, i: number) => i % stride === 0)
          .map((pt) => ({
            time: pt.timestamp.split(" ")[1]?.slice(0, 5) || pt.timestamp,
            composite_score: Math.round(pt.composite_score * 100),
            document_risk: Math.round(
              (compScores.document?.score || 0) * 100
            ),
            historical_anomaly: Math.round(pt.anomaly_score * 100),
            density_prediction: Math.round(
              (pt.people / 29811) * 100
            ),
          }));

        const transformed: CompositeRiskResponse = {
          date: compRaw.event_date || "2025-09-09",
          composite_score: Math.round(
            (compRaw.overall_risk_score || 0) * 100
          ),
          composite_level: compRaw.overall_risk_level || "elevated",
          components,
          timeline,
          hazard_breakdown,
        };

        setData(transformed);
        setIsDemo(false);
        setLoading(false);
      } catch {
        // Gracefully fall back to demo data
        setData(DEMO_DATA);
        setIsDemo(true);
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="app-shell">
        <Sidebar />
        <Header title="Risk Intelligence" subtitle="Loading..." />
        <main className="app-main">
          <div className={styles.loadingContainer}>
            <div className={styles.spinner} />
            <span>Loading risk assessment…</span>
          </div>
        </main>
      </div>
    );
  }

  const riskData = data!;

  return (
    <div className="app-shell">
      <Sidebar />
      <Header
        title="Risk Intelligence"
        subtitle={`Composite Risk Assessment — ${activeEvent.name}`}
      />
      <main className="app-main">
        {isDemo && (
          <div className="sample-data-banner">
            <span>ℹ️ Showing sample data — risk intelligence API not connected. Scores and breakdowns below are illustrative.</span>
          </div>
        )}

        {/* Top: Composite Risk Gauge */}
        <div className={`panel ${styles.gaugePanel}`}>
          <div className="panel__header">
            <h2 className="panel__title">Overall Risk Assessment</h2>
            <span
              className={`risk-badge risk-badge--${riskData.composite_level}`}
            >
              {riskData.composite_level}
            </span>
          </div>
          <CompositeRiskGauge
            score={riskData.composite_score}
            level={riskData.composite_level}
          />
        </div>

        {/* Middle: 3 Component Cards */}
        <div className={styles.componentGrid}>
          {riskData.components.map((comp) => (
            <div key={comp.name} className={`panel ${styles.componentCard}`}>
              <div className={styles.componentHeader}>
                <span className="panel__title">{comp.name}</span>
                <span
                  className={styles.componentScore}
                  style={{ color: getLevelColor(comp.level) }}
                >
                  {Math.round(comp.score)}
                </span>
              </div>
              <div className={styles.componentBar}>
                <div
                  className={styles.componentBarFill}
                  style={{
                    width: `${comp.score}%`,
                    background: getLevelColor(comp.level),
                  }}
                />
              </div>
              <p className={styles.componentDesc}>{comp.description}</p>
              <div className={styles.componentMeta}>
                <span
                  className={styles.componentLevel}
                  style={{
                    color: getLevelColor(comp.level),
                    background: getLevelBg(comp.level),
                  }}
                >
                  {comp.level.toUpperCase()}
                </span>
                <span className={styles.componentWeight}>
                  Weight: {(comp.weight * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Grid: Timeline + Breakdown */}
        <div className={styles.bottomGrid}>
          <div className={`panel ${styles.timelinePanel}`}>
            <div className="panel__header">
              <h2 className="panel__title">
                Risk Score Evolution — Event Day Timeline
              </h2>
            </div>
            <RiskTimeline data={riskData.timeline} />
          </div>

          <div className={`panel ${styles.breakdownPanel}`}>
            <div className="panel__header">
              <h2 className="panel__title">Risk by Hazard Category</h2>
              <span className={styles.hazardCount}>
                {riskData.hazard_breakdown.length} categories
              </span>
            </div>
            <RiskBreakdown data={riskData.hazard_breakdown} />
          </div>
        </div>
      </main>
    </div>
  );
}
