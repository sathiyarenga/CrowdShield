"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import EventCurveChart from "@/components/charts/EventCurveChart";
import EventFingerprints from "@/components/charts/EventFingerprints";
import NationalityChart from "@/components/charts/NationalityChart";
import { api, type HealthResponse } from "@/lib/api/client";
import styles from "./page.module.css";

export default function CommandCenter() {
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
      label: "Fredrikstad Areas",
      value: health?.datasets.telia_areas?.toString() ?? "…",
      detail: `${health?.datasets.telia_hourly?.toLocaleString() ?? "…"} hourly obs.`,
      color: "var(--color-data-2)",
    },
  ];

  const alerts = [
    {
      severity: "critical" as const,
      time: "20:00",
      text: "Zone density 29,811 — 32.4σ above baseline (Sep 9)",
    },
    {
      severity: "high" as const,
      time: "16:55",
      text: "Match peak 19,938 — 19.9σ above baseline (Sep 4)",
    },
    {
      severity: "high" as const,
      time: "17:10",
      text: "Match peak 22,922 — 23.7σ above baseline (Oct 11)",
    },
    {
      severity: "elevated" as const,
      time: "10:50",
      text: "Daytime spike 5,660 on non-event day — 1.9σ (Sep 3)",
    },
    {
      severity: "nominal" as const,
      time: "00:45",
      text: "Oct 12 classified as non-event day (-0.4σ)",
    },
  ];

  return (
    <div className="app-shell">
      <Sidebar />
      <Header
        title="Command Center"
        subtitle="CrowdShield Event Risk Intelligence — Ullevaal Stadion Overview"
      />
      <main className="app-main">
        {/* Connection status */}
        {!backendOnline && (
          <div className={styles.connectionBanner}>
            <span>⚠ Backend offline —</span>
            <code>cd backend &amp;&amp; python3 -m uvicorn src.api.main:app --port 8000</code>
          </div>
        )}

        {/* Stat Cards */}
        <div className={styles.statsRow}>
          {stats.map((stat) => (
            <div key={stat.label} className="panel">
              <div className="stat-card">
                <span className="stat-card__label">{stat.label}</span>
                <span
                  className="stat-card__value"
                  style={{ color: stat.color }}
                >
                  {stat.value}
                </span>
                <span className="stat-card__delta">{stat.detail}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Main Grid: Chart + Alerts */}
        <div className={styles.mainGrid}>
          <div className={`panel ${styles.heroPanel}`}>
            <div className="panel__header">
              <h2 className="panel__title">
                Ullevaal Stadion — Crowd Dynamics (5 Dates Overlaid)
              </h2>
              <span className="risk-badge risk-badge--critical">
                Peak: 29,811
              </span>
            </div>
            <EventCurveChart />
          </div>

          <div className={`panel ${styles.alertPanel}`}>
            <div className="panel__header">
              <h2 className="panel__title">Anomaly Detections</h2>
              <span className={styles.alertCount}>
                {alerts.length} events scored
              </span>
            </div>
            <div className={styles.alertList}>
              {alerts.map((alert, i) => (
                <div
                  key={i}
                  className={`alert-item alert-item--${alert.severity}`}
                >
                  <span className="alert-item__time">{alert.time}</span>
                  <span className="alert-item__text">{alert.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Nationality Breakdown */}
        <div className={`panel ${styles.nationalityPanel}`}>
          <div className="panel__header">
            <h2 className="panel__title">
              Visitor Composition — Nationality Breakdown Over Time
            </h2>
            <span className={styles.alertCount}>17 countries tracked</span>
          </div>
          <NationalityChart />
        </div>

        {/* Event Fingerprints */}
        <div className={styles.fingerprintRow}>
          <div className="panel__header" style={{ padding: "0 0 var(--space-lg) 0" }}>
            <h2 className="panel__title">
              Event Fingerprints — Algorithmically Detected &amp; Characterized
            </h2>
            <span className="usp-badge">★ Historical Intelligence</span>
          </div>
          <EventFingerprints />
        </div>
      </main>
    </div>
  );
}
