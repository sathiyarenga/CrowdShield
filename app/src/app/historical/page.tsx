"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import EventComparisonTable from "@/components/analytics/EventComparisonTable";
import HistoricalEventFingerprints from "@/components/analytics/EventFingerprints";
import IngresEgressChart from "@/components/analytics/IngresEgressChart";
import {
  api,
  type EventsResponse,
  type UllevaalSummaryResponse,
} from "@/lib/api/client";
import styles from "./page.module.css";

export default function HistoricalPage() {
  const [eventsData, setEventsData] = useState<EventsResponse | null>(null);
  const [summaryData, setSummaryData] = useState<UllevaalSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [events, summary] = await Promise.all([
          api.ullevaal.events(),
          api.ullevaal.summary(),
        ]);
        setEventsData(events);
        setSummaryData(summary);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const fingerprints = eventsData?.fingerprints ?? [];
  const detections = eventsData?.event_detection ?? [];
  const eventDays = fingerprints.filter((fp) => fp.is_event_day);

  // Compute summary stats
  const totalEventsAnalyzed = fingerprints.length;
  const highestPeak = fingerprints.length
    ? Math.max(...fingerprints.map((fp) => fp.peak_count))
    : 0;
  const fastestEgress = eventDays.length
    ? Math.min(...eventDays.map((fp) => fp.egress_duration_minutes))
    : 0;
  const avgAttendance = eventDays.length
    ? Math.round(
        eventDays.reduce((s, fp) => s + fp.peak_count, 0) / eventDays.length
      )
    : 0;
  const busiestDate = fingerprints.length
    ? fingerprints.reduce((a, b) => (a.peak_count > b.peak_count ? a : b))
        .event_date
    : "—";
  const busiestDateLabel =
    busiestDate !== "—"
      ? new Date(busiestDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : "—";

  const stats = [
    {
      label: "Events Analyzed",
      value: totalEventsAnalyzed.toString(),
      detail: "Match + non-event days",
      color: "var(--color-accent)",
    },
    {
      label: "Highest Peak",
      value: highestPeak.toLocaleString(),
      detail: `Recorded on ${busiestDateLabel}`,
      color: "var(--color-critical)",
    },
    {
      label: "Fastest Egress",
      value: `${Math.round(fastestEgress)}min`,
      detail: "Shortest clearance time",
      color: "var(--color-nominal)",
    },
    {
      label: "Avg Attendance",
      value: avgAttendance.toLocaleString(),
      detail: "Event days only",
      color: "var(--color-data-2)",
    },
    {
      label: "Busiest Date",
      value: busiestDateLabel,
      detail: `${highestPeak.toLocaleString()} peak count`,
      color: "var(--color-data-5)",
    },
  ];

  return (
    <div className="app-shell">
      <Sidebar />
      <Header
        title="Historical Intelligence"
        subtitle="Cross-Event Analysis — Ullevaal Stadion Event Fingerprinting"
      />
      <main className="app-main">
        {/* Connection banner */}
        {error && (
          <div className={styles.connectionBanner}>
            <span>⚠ {error} —</span>
            <code>cd backend &amp;&amp; python3 -m uvicorn src.api.main:app --port 8000</code>
          </div>
        )}

        {loading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner} />
            <span>Loading historical data…</span>
          </div>
        ) : (
          <>
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

            {/* Comparison Table */}
            <div className={`panel ${styles.tablePanel}`}>
              <div className="panel__header">
                <h2 className="panel__title">
                  Event Comparison — All Dates Side by Side
                </h2>
                <span className="usp-badge">★ Sortable</span>
              </div>
              <EventComparisonTable
                fingerprints={fingerprints}
                detections={detections}
              />
            </div>

            {/* Bottom Grid: Fingerprints + Scatter */}
            <div className={styles.bottomGrid}>
              <div className={`panel ${styles.fingerprintPanel}`}>
                <div className="panel__header">
                  <h2 className="panel__title">
                    Event Fingerprints — Shape Profiles
                  </h2>
                </div>
                <HistoricalEventFingerprints
                  fingerprints={fingerprints}
                  timeseries={summaryData?.data ?? []}
                />
              </div>

              <div className={`panel ${styles.scatterPanel}`}>
                <div className="panel__header">
                  <h2 className="panel__title">
                    Ingress vs Egress — Duration Scatter
                  </h2>
                </div>
                <IngresEgressChart
                  fingerprints={fingerprints}
                  detections={detections}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
