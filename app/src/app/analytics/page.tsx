"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import AreaHeatmap from "@/components/charts/AreaHeatmap";
import AreaRanking from "@/components/charts/AreaRanking";
import {
  api,
  type FredrikstadArea,
  type FredrikstadAreasResponse,
} from "@/lib/api/client";
import styles from "./page.module.css";

export default function AnalyticsPage() {
  const [areas, setAreas] = useState<FredrikstadArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAreas() {
      try {
        setLoading(true);
        const res: FredrikstadAreasResponse = await api.fredrikstad.areas(
          "daily_max_people",
          50
        );
        setAreas(res.data);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load area data"
        );
      } finally {
        setLoading(false);
      }
    }
    fetchAreas();
  }, []);

  // Derive selected area data
  const selectedAreaData = useMemo(
    () => areas.find((a) => a.area_name === selectedArea) ?? null,
    [areas, selectedArea]
  );

  // Compute global maxes for detail bar charts
  const globalMax = useMemo(() => {
    if (areas.length === 0) return { daily: 1, hourly: 1 };
    return {
      daily: Math.max(...areas.map((a) => a.daily_max_people)),
      hourly: Math.max(...areas.map((a) => a.hourly_max_people)),
    };
  }, [areas]);

  const handleSelectArea = useCallback(
    (name: string) => {
      setSelectedArea((prev) => (prev === name ? null : name));
    },
    []
  );

  // Stat cards derived from data
  const stats = useMemo(() => {
    if (areas.length === 0) return [];
    const totalAreas = areas.length;
    const peakDaily = Math.max(...areas.map((a) => a.daily_max_people));
    const peakArea = areas.find((a) => a.daily_max_people === peakDaily);
    const avgDailyAll = Math.round(
      areas.reduce((s, a) => s + a.daily_avg_people, 0) / totalAreas
    );
    const peakHourly = Math.max(...areas.map((a) => a.hourly_max_people));

    return [
      {
        label: "Areas Monitored",
        value: totalAreas.toString(),
        detail: "Fredrikstad municipality",
        color: "var(--color-data-2)",
      },
      {
        label: "Peak Daily Activity",
        value: peakDaily.toLocaleString(),
        detail: peakArea?.area_name ?? "—",
        color: "var(--color-critical)",
      },
      {
        label: "Avg Daily Across Areas",
        value: avgDailyAll.toLocaleString(),
        detail: "Mean daily_avg_people",
        color: "var(--color-data-3)",
      },
      {
        label: "Peak Hourly Activity",
        value: peakHourly.toLocaleString(),
        detail: "Highest hourly observation",
        color: "var(--color-data-6)",
      },
    ];
  }, [areas]);

  return (
    <div className="app-shell">
      <Sidebar />
      <Header
        title="Event Analytics"
        subtitle="Fredrikstad Area Activity Intelligence — Telia Crowd Insights"
      />
      <main className="app-main">
        {/* Error banner */}
        {error && (
          <div className={styles.connectionBanner}>
            <span>⚠ {error} —</span>
            <code>Ensure backend is running on localhost:8000</code>
          </div>
        )}

        {/* Stat Cards */}
        {!loading && stats.length > 0 && (
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
        )}

        {/* Heatmap Section */}
        <div className={styles.heatmapSection}>
          <div className="panel">
            <div className="panel__header">
              <h2 className="panel__title">
                Area Activity Heatmap — Top 30 by Daily Max
              </h2>
              <span className={styles.sectionSubtitle}>
                Intensity by metric
              </span>
            </div>
            <AreaHeatmap data={areas} loading={loading} />
          </div>
        </div>

        {/* Table + Detail Section */}
        <div
          className={`${styles.contentGrid} ${
            selectedAreaData ? styles.withDetail : ""
          }`}
        >
          {/* Ranking Table */}
          <div className={`panel ${styles.tablePanel}`}>
            <div className="panel__header">
              <h2 className="panel__title">
                Area Rankings — All {areas.length} Areas
              </h2>
              <span className={styles.sectionSubtitle}>
                Click a row for details
              </span>
            </div>
            <AreaRanking
              data={areas}
              loading={loading}
              selectedArea={selectedArea}
              onSelectArea={handleSelectArea}
            />
          </div>

          {/* Area Detail Panel */}
          {selectedAreaData && (
            <div className={`panel ${styles.detailPanel}`}>
              <div className={styles.detailHeader}>
                <div>
                  <div className={styles.detailTitle}>
                    {selectedAreaData.area_name}
                  </div>
                  <div className={styles.detailRegion}>
                    {selectedAreaData.admin_level_2} ·{" "}
                    {selectedAreaData.area_code}
                  </div>
                </div>
                <button
                  className={styles.detailClose}
                  onClick={() => setSelectedArea(null)}
                  aria-label="Close detail panel"
                >
                  ✕
                </button>
              </div>

              {/* Stat Grid */}
              <div className={styles.detailStats}>
                <div className={styles.detailStatCard}>
                  <div className={styles.detailStatLabel}>Daily Max</div>
                  <div
                    className={styles.detailStatValue}
                    style={{ color: "var(--color-data-1)" }}
                  >
                    {selectedAreaData.daily_max_people.toLocaleString()}
                  </div>
                </div>
                <div className={styles.detailStatCard}>
                  <div className={styles.detailStatLabel}>Daily Avg</div>
                  <div
                    className={styles.detailStatValue}
                    style={{ color: "var(--color-data-3)" }}
                  >
                    {selectedAreaData.daily_avg_people.toLocaleString()}
                  </div>
                </div>
                <div className={styles.detailStatCard}>
                  <div className={styles.detailStatLabel}>Hourly Max</div>
                  <div
                    className={styles.detailStatValue}
                    style={{ color: "var(--color-data-6)" }}
                  >
                    {selectedAreaData.hourly_max_people.toLocaleString()}
                  </div>
                </div>
                <div className={styles.detailStatCard}>
                  <div className={styles.detailStatLabel}>Days Observed</div>
                  <div
                    className={styles.detailStatValue}
                    style={{ color: "var(--color-data-5)" }}
                  >
                    {selectedAreaData.days_observed}
                  </div>
                </div>
              </div>

              {/* Comparison Bars */}
              <div className={styles.detailBarSection}>
                <div>
                  <div className={styles.detailBarLabel}>
                    Daily Max vs Global Peak
                  </div>
                  <div className={styles.detailBar}>
                    <div
                      className={styles.detailBarFill}
                      style={{
                        width: `${
                          (selectedAreaData.daily_max_people / globalMax.daily) *
                          100
                        }%`,
                        background:
                          "linear-gradient(90deg, var(--color-data-1), var(--color-data-2))",
                      }}
                    />
                  </div>
                  <div className={styles.detailBarValues}>
                    <span>
                      {selectedAreaData.daily_max_people.toLocaleString()}
                    </span>
                    <span>{globalMax.daily.toLocaleString()}</span>
                  </div>
                </div>

                <div>
                  <div className={styles.detailBarLabel}>
                    Daily Avg vs Daily Max
                  </div>
                  <div className={styles.detailBar}>
                    <div
                      className={styles.detailBarFill}
                      style={{
                        width: `${
                          (selectedAreaData.daily_avg_people /
                            Math.max(
                              selectedAreaData.daily_max_people,
                              1
                            )) *
                          100
                        }%`,
                        background:
                          "linear-gradient(90deg, var(--color-data-3), var(--color-data-4))",
                      }}
                    />
                  </div>
                  <div className={styles.detailBarValues}>
                    <span>
                      {selectedAreaData.daily_avg_people.toLocaleString()} avg
                    </span>
                    <span>
                      {selectedAreaData.daily_max_people.toLocaleString()} max
                    </span>
                  </div>
                </div>

                <div>
                  <div className={styles.detailBarLabel}>
                    Hourly Max vs Global Peak
                  </div>
                  <div className={styles.detailBar}>
                    <div
                      className={styles.detailBarFill}
                      style={{
                        width: `${
                          (selectedAreaData.hourly_max_people /
                            globalMax.hourly) *
                          100
                        }%`,
                        background:
                          "linear-gradient(90deg, var(--color-data-6), var(--color-data-7))",
                      }}
                    />
                  </div>
                  <div className={styles.detailBarValues}>
                    <span>
                      {selectedAreaData.hourly_max_people.toLocaleString()}
                    </span>
                    <span>{globalMax.hourly.toLocaleString()}</span>
                  </div>
                </div>

                <div>
                  <div className={styles.detailBarLabel}>
                    Hourly Avg vs Hourly Max
                  </div>
                  <div className={styles.detailBar}>
                    <div
                      className={styles.detailBarFill}
                      style={{
                        width: `${
                          (selectedAreaData.hourly_avg_people /
                            Math.max(
                              selectedAreaData.hourly_max_people,
                              1
                            )) *
                          100
                        }%`,
                        background:
                          "linear-gradient(90deg, var(--color-data-4), var(--color-data-8))",
                      }}
                    />
                  </div>
                  <div className={styles.detailBarValues}>
                    <span>
                      {selectedAreaData.hourly_avg_people.toLocaleString()} avg
                    </span>
                    <span>
                      {selectedAreaData.hourly_max_people.toLocaleString()} max
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
