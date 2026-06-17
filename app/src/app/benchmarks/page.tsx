"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { useEvent } from "@/context/EventContext";
import { API_BASE } from "@/lib/api/client";
import styles from "./page.module.css";

// -- Types ------------------------------------------------------------------

interface ComparisonRow {
  event_date: string;
  peak_count: number;
  peak_time: string;
  ingress_duration_minutes: number;
  egress_duration_minutes: number;
  clearance_time_minutes: number;
  total_person_hours: number;
  baseline_floor: number;
  sigma_above_baseline: number;
  observation_count: number;
  amplitude: number;
  amplitude_ratio: number;
}

interface PercentileRow {
  event_date: string;
  peak_count_pct: number;
  ingress_pct: number;
  egress_pct: number;
  person_hours_pct: number;
  sigma_pct: number;
  amplitude_ratio_pct: number;
  clearance_pct: number;
}

interface PredictiveRange {
  mean: number;
  std: number;
  min: number;
  max: number;
  prediction_range_1sigma: [number, number];
  prediction_range_2sigma: [number, number];
}

interface BenchmarkData {
  comparison_table: ComparisonRow[];
  percentile_rankings: PercentileRow[];
  pattern_similarity: {
    matrix: number[][];
    event_dates: string[];
  };
  predictive_ranges: {
    based_on_events: number;
    ranges: Record<string, PredictiveRange>;
  };
}

// -- Demo Data --------------------------------------------------------------

const DEMO_DATA: BenchmarkData = {
  comparison_table: [
    { event_date: "2025-09-03", peak_count: 5660, peak_time: "10:50", ingress_duration_minutes: 0, egress_duration_minutes: 0, clearance_time_minutes: 0, total_person_hours: 26891, baseline_floor: 2973, sigma_above_baseline: 1.93, observation_count: 288, amplitude: 2687, amplitude_ratio: 1.9 },
    { event_date: "2025-09-04", peak_count: 19938, peak_time: "16:55", ingress_duration_minutes: 130, egress_duration_minutes: 55, clearance_time_minutes: 80, total_person_hours: 132987, baseline_floor: 2942, sigma_above_baseline: 19.85, observation_count: 288, amplitude: 16996, amplitude_ratio: 6.78 },
    { event_date: "2025-09-09", peak_count: 29811, peak_time: "20:00", ingress_duration_minutes: 205, egress_duration_minutes: 85, clearance_time_minutes: 130, total_person_hours: 194515, baseline_floor: 3064, sigma_above_baseline: 375.01, observation_count: 288, amplitude: 26747, amplitude_ratio: 9.73 },
    { event_date: "2025-10-11", peak_count: 22922, peak_time: "17:10", ingress_duration_minutes: 160, egress_duration_minutes: 65, clearance_time_minutes: 95, total_person_hours: 149876, baseline_floor: 3150, sigma_above_baseline: 23.7, observation_count: 288, amplitude: 19772, amplitude_ratio: 7.28 },
    { event_date: "2025-10-12", peak_count: 3869, peak_time: "14:20", ingress_duration_minutes: 0, egress_duration_minutes: 0, clearance_time_minutes: 0, total_person_hours: 21450, baseline_floor: 3100, sigma_above_baseline: -0.42, observation_count: 288, amplitude: 769, amplitude_ratio: 1.25 },
  ],
  percentile_rankings: [
    { event_date: "2025-09-03", peak_count_pct: 40, ingress_pct: 0, egress_pct: 0, person_hours_pct: 40, sigma_pct: 40, amplitude_ratio_pct: 40, clearance_pct: 0 },
    { event_date: "2025-09-04", peak_count_pct: 60, ingress_pct: 33, egress_pct: 33, person_hours_pct: 60, sigma_pct: 60, amplitude_ratio_pct: 60, clearance_pct: 33 },
    { event_date: "2025-09-09", peak_count_pct: 100, ingress_pct: 100, egress_pct: 100, person_hours_pct: 100, sigma_pct: 100, amplitude_ratio_pct: 100, clearance_pct: 100 },
    { event_date: "2025-10-11", peak_count_pct: 80, ingress_pct: 67, egress_pct: 67, person_hours_pct: 80, sigma_pct: 80, amplitude_ratio_pct: 80, clearance_pct: 67 },
    { event_date: "2025-10-12", peak_count_pct: 20, ingress_pct: 0, egress_pct: 0, person_hours_pct: 20, sigma_pct: 20, amplitude_ratio_pct: 20, clearance_pct: 0 },
  ],
  pattern_similarity: {
    matrix: [
      [1.0, 0.72, 0.65, 0.7, 0.92],
      [0.72, 1.0, 0.88, 0.95, 0.58],
      [0.65, 0.88, 1.0, 0.91, 0.49],
      [0.7, 0.95, 0.91, 1.0, 0.55],
      [0.92, 0.58, 0.49, 0.55, 1.0],
    ],
    event_dates: ["2025-09-03", "2025-09-04", "2025-09-09", "2025-10-11", "2025-10-12"],
  },
  predictive_ranges: {
    based_on_events: 5,
    ranges: {
      peak_count: { mean: 16440, std: 11261, min: 3869, max: 29811, prediction_range_1sigma: [5179, 27701], prediction_range_2sigma: [0, 38962] },
      ingress_duration_minutes: { mean: 99, std: 89, min: 0, max: 205, prediction_range_1sigma: [10, 188], prediction_range_2sigma: [0, 277] },
      egress_duration_minutes: { mean: 41, std: 38, min: 0, max: 85, prediction_range_1sigma: [3, 79], prediction_range_2sigma: [0, 117] },
      total_person_hours: { mean: 105144, std: 74690, min: 21450, max: 194515, prediction_range_1sigma: [30454, 179834], prediction_range_2sigma: [0, 254524] },
    },
  },
};

// -- Helpers ----------------------------------------------------------------

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/** Color interpolation for heatmap: red(0) → yellow(0.5) → green(1) */
function heatmapColor(value: number): string {
  const clamped = Math.max(0, Math.min(1, value));
  if (clamped < 0.5) {
    const t = clamped / 0.5;
    const r = 239;
    const g = Math.round(68 + (179 - 68) * t);
    const b = Math.round(68 + (8 - 68) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
  const t = (clamped - 0.5) / 0.5;
  const r = Math.round(234 - (234 - 34) * t);
  const g = Math.round(179 + (197 - 179) * t);
  const b = Math.round(8 + (94 - 8) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

const DATA_COLORS = [
  "var(--color-data-1)",
  "var(--color-data-2)",
  "var(--color-data-3)",
  "var(--color-data-4)",
  "var(--color-data-5)",
];

// -- Sort Key Types ---------------------------------------------------------

type SortKey =
  | "event_date"
  | "peak_count"
  | "peak_time"
  | "ingress_duration_minutes"
  | "egress_duration_minutes"
  | "total_person_hours"
  | "sigma_above_baseline"
  | "amplitude_ratio";

type SortDir = "asc" | "desc";

// -- Column Config ----------------------------------------------------------

interface TableColumn {
  key: SortKey;
  label: string;
  pctKey?: keyof PercentileRow;
  format: (v: ComparisonRow) => string;
  getValue: (v: ComparisonRow) => number;
}

const TABLE_COLUMNS: TableColumn[] = [
  {
    key: "event_date",
    label: "Date",
    format: (r) => formatDate(r.event_date),
    getValue: (r) => new Date(r.event_date).getTime(),
  },
  {
    key: "peak_count",
    label: "Peak Count",
    pctKey: "peak_count_pct",
    format: (r) => formatNumber(r.peak_count),
    getValue: (r) => r.peak_count,
  },
  {
    key: "peak_time",
    label: "Peak Time",
    format: (r) => r.peak_time,
    getValue: (r) => {
      const [h, m] = r.peak_time.split(":").map(Number);
      return h * 60 + m;
    },
  },
  {
    key: "ingress_duration_minutes",
    label: "Ingress (min)",
    pctKey: "ingress_pct",
    format: (r) => r.ingress_duration_minutes.toString(),
    getValue: (r) => r.ingress_duration_minutes,
  },
  {
    key: "egress_duration_minutes",
    label: "Egress (min)",
    pctKey: "egress_pct",
    format: (r) => r.egress_duration_minutes.toString(),
    getValue: (r) => r.egress_duration_minutes,
  },
  {
    key: "total_person_hours",
    label: "Person-Hours",
    pctKey: "person_hours_pct",
    format: (r) => formatNumber(r.total_person_hours),
    getValue: (r) => r.total_person_hours,
  },
  {
    key: "sigma_above_baseline",
    label: "σ Above Baseline",
    pctKey: "sigma_pct",
    format: (r) => r.sigma_above_baseline.toFixed(1),
    getValue: (r) => r.sigma_above_baseline,
  },
  {
    key: "amplitude_ratio",
    label: "Amplitude Ratio",
    pctKey: "amplitude_ratio_pct",
    format: (r) => r.amplitude_ratio.toFixed(2),
    getValue: (r) => r.amplitude_ratio,
  },
];

// -- Page Component ---------------------------------------------------------

export default function BenchmarksPage() {
  const { activeEvent } = useEvent();
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingDemo, setUsingDemo] = useState(false);

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>("event_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch(`${API_BASE}/api/risk/benchmark`);
        if (!res.ok) throw new Error(`API ${res.status}`);
        const json: BenchmarkData = await res.json();
        setData(json);
        setLoading(false);
      } catch {
        // Fallback to demo data
        setData(DEMO_DATA);
        setUsingDemo(true);
        setError("Showing sample data — benchmark API not available");
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // -- Sort handler -------------------------------------------------------

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey]
  );

  // -- Sorted rows --------------------------------------------------------

  const sortedRows = useMemo(() => {
    if (!data) return [];
    const col = TABLE_COLUMNS.find((c) => c.key === sortKey)!;
    const rows = [...data.comparison_table];
    rows.sort((a, b) => {
      const va = col.getValue(a);
      const vb = col.getValue(b);
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return rows;
  }, [data, sortKey, sortDir]);

  // -- Min/max per column -------------------------------------------------

  const columnExtremes = useMemo(() => {
    if (!data) return {} as Record<SortKey, { min: number; max: number }>;
    const result: Record<string, { min: number; max: number }> = {};
    for (const col of TABLE_COLUMNS) {
      if (col.key === "event_date" || col.key === "peak_time") continue;
      const values = data.comparison_table.map((r) => col.getValue(r));
      result[col.key] = { min: Math.min(...values), max: Math.max(...values) };
    }
    return result as Record<SortKey, { min: number; max: number }>;
  }, [data]);

  // -- Percentile lookup --------------------------------------------------

  const pctMap = useMemo(() => {
    if (!data) return new Map<string, PercentileRow>();
    const m = new Map<string, PercentileRow>();
    for (const p of data.percentile_rankings) {
      m.set(p.event_date, p);
    }
    return m;
  }, [data]);

  // -- Predictive ranges --------------------------------------------------

  const ranges = data?.predictive_ranges;

  // -- Render -------------------------------------------------------------

  if (loading) {
    return (
      <div className="app-shell">
        <Sidebar />
        <Header title="Benchmarks" subtitle={`Cross-Event Benchmarking & Predictive Ranges — ${activeEvent.name}`} />
        <main className="app-main">
          <div className={styles.loadingContainer}>
            <div className={styles.spinner} />
            <span>Loading benchmark data…</span>
          </div>
        </main>
      </div>
    );
  }

  const similarity = data!.pattern_similarity;
  const eventDates = similarity.event_dates;
  const matrix = similarity.matrix;

  const RANGE_METRICS: {
    key: string;
    label: string;
    unit: string;
  }[] = [
    { key: "peak_count", label: "Peak Count", unit: "" },
    { key: "ingress_duration_minutes", label: "Ingress Duration", unit: "min" },
    { key: "egress_duration_minutes", label: "Egress Duration", unit: "min" },
    { key: "total_person_hours", label: "Total Person-Hours", unit: "" },
  ];

  return (
    <div className="app-shell">
      <Sidebar />
      <Header title="Benchmarks" subtitle={`Cross-Event Benchmarking & Predictive Ranges — ${activeEvent.name}`} />
      <main className="app-main">
        {/* Banner */}
        {usingDemo && (
          <div className="sample-data-banner">
            <span>ℹ️ Showing sample data from Ullevål Stadion — benchmark API not connected. Values below are illustrative.</span>
          </div>
        )}

        {/* -- Prediction Cards ------------------------------------- */}
        <div className={styles.predictionRow}>
          {ranges &&
            RANGE_METRICS.map((metric) => {
              const r = ranges.ranges[metric.key];
              if (!r) return null;
              const rangeWidth = r.max - r.min || 1;
              const sigma1Left = ((Math.max(0, r.prediction_range_1sigma[0]) - r.min) / rangeWidth) * 100;
              const sigma1Width = ((r.prediction_range_1sigma[1] - Math.max(0, r.prediction_range_1sigma[0])) / rangeWidth) * 100;
              const meanPos = ((r.mean - r.min) / rangeWidth) * 100;

              return (
                <div key={metric.key} className={styles.predictionCard}>
                  <div className={styles.predictionCardLabel}>
                    Expected {metric.label}
                  </div>
                  <div className={styles.predictionCardValue}>
                    {formatNumber(r.mean)}
                    {metric.unit && <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", marginLeft: 4 }}>{metric.unit}</span>}
                  </div>
                  <div className={styles.predictionCardRange}>
                    ± {formatNumber(r.std)}{metric.unit ? ` ${metric.unit}` : ""}
                  </div>
                  {/* Mini range bar */}
                  <div className={styles.rangeBarContainer}>
                    <div
                      className={styles.rangeBarFill}
                      style={{ left: `${sigma1Left}%`, width: `${Math.min(sigma1Width, 100 - sigma1Left)}%` }}
                    />
                    <div className={styles.rangeBarMean} style={{ left: `${meanPos}%` }} />
                  </div>
                  <div className={styles.rangeBarMinMax}>
                    <span>{formatNumber(r.min)}</span>
                    <span>{formatNumber(r.max)}</span>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Confidence note */}
        {ranges && (
          <div style={{ marginBottom: "var(--panel-gap)", marginTop: "calc(-0.5 * var(--panel-gap))" }}>
            <span className="usp-badge">★ Based on {ranges.based_on_events} historical events</span>
          </div>
        )}

        {/* -- Comparison Table ------------------------------------- */}
        <div className={`panel ${styles.tablePanel}`}>
          <div className="panel__header">
            <h2 className="panel__title">Event Comparison — All Dates Side by Side</h2>
            <span className="usp-badge">★ Sortable</span>
          </div>
          <table className={styles.comparisonTable}>
            <thead>
              <tr>
                {TABLE_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={sortKey === col.key ? styles.thActive : undefined}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className={styles.sortArrow}>
                        {sortDir === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const pct = pctMap.get(row.event_date);
                return (
                  <tr key={row.event_date}>
                    {TABLE_COLUMNS.map((col) => {
                      const value = col.getValue(row);
                      const extremes = columnExtremes[col.key];
                      let cellClass = "";
                      if (extremes && col.key !== "event_date" && col.key !== "peak_time") {
                        if (value === extremes.max) cellClass = styles.cellHighest;
                        else if (value === extremes.min) cellClass = styles.cellLowest;
                      }
                      // Get percentile
                      const pctVal = col.pctKey && pct ? (pct[col.pctKey] as number) : null;

                      return (
                        <td key={col.key} className={cellClass}>
                          {col.format(row)}
                          {pctVal !== null && pctVal !== undefined && (
                            <span className={styles.percentileTag}>
                              {Math.round(pctVal)}th %ile
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* -- Bottom Grid ------------------------------------------ */}
        <div className={styles.bottomGrid}>
          {/* -- Heatmap -------------------------------------------- */}
          <div className={`panel ${styles.heatmapPanel}`}>
            <div className="panel__header">
              <h2 className="panel__title">Pattern Similarity — Cosine Distance</h2>
            </div>
            <div
              className={styles.heatmapGrid}
              style={{
                gridTemplateColumns: `60px repeat(${eventDates.length}, 1fr)`,
                gridTemplateRows: `28px repeat(${eventDates.length}, 1fr)`,
              }}
            >
              {/* Corner cell */}
              <div className={styles.heatmapCorner} />

              {/* Column headers */}
              {eventDates.map((d) => (
                <div key={`ch-${d}`} className={styles.heatmapColHeader}>
                  {formatDate(d)}
                </div>
              ))}

              {/* Rows */}
              {matrix.map((row, ri) => (
                <React.Fragment key={`row-${ri}`}>
                  <div className={styles.heatmapRowHeader}>
                    {formatDate(eventDates[ri])}
                  </div>
                  {row.map((val, ci) => (
                    <div
                      key={`${ri}-${ci}`}
                      className={styles.heatmapCell}
                      style={{ background: heatmapColor(val) }}
                      title={`${formatDate(eventDates[ri])} × ${formatDate(eventDates[ci])}: ${val.toFixed(2)}`}
                    >
                      {val.toFixed(2)}
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>

            <div className={styles.heatmapLegend}>
              <span>Low</span>
              <div className={styles.heatmapLegendBar} />
              <span>High</span>
            </div>
          </div>

          {/* -- Predictive Range Bars ------------------------------ */}
          <div className={`panel ${styles.rangesPanel}`}>
            <div className="panel__header">
              <h2 className="panel__title">Predictive Ranges — σ Bands</h2>
            </div>

            {ranges &&
              RANGE_METRICS.map((metric) => {
                const r = ranges.ranges[metric.key];
                if (!r) return null;

                // Build a global min/max for the track (use 2σ bounds or actual data)
                const trackMin = Math.min(r.min, r.prediction_range_2sigma[0], 0);
                const trackMax = Math.max(r.max, r.prediction_range_2sigma[1]);
                const trackRange = trackMax - trackMin || 1;

                const toPercent = (v: number) =>
                  ((v - trackMin) / trackRange) * 100;

                // Sigma bands
                const s2Left = toPercent(Math.max(trackMin, r.prediction_range_2sigma[0]));
                const s2Right = toPercent(Math.min(trackMax, r.prediction_range_2sigma[1]));
                const s1Left = toPercent(Math.max(trackMin, r.prediction_range_1sigma[0]));
                const s1Right = toPercent(Math.min(trackMax, r.prediction_range_1sigma[1]));
                const meanPos = toPercent(r.mean);

                // Actual event dots — use comparison table values
                const eventValues = data!.comparison_table.map((row) => {
                  const key = metric.key as keyof ComparisonRow;
                  return { date: row.event_date, value: row[key] as number };
                });

                return (
                  <div key={metric.key} className={styles.rangeRow}>
                    <div className={styles.rangeLabel}>
                      <span>
                        {metric.label}
                        {metric.unit && ` (${metric.unit})`}
                      </span>
                      <span className={styles.rangeLabelValue}>
                        μ = {formatNumber(r.mean)}
                      </span>
                    </div>
                    <div className={styles.rangeTrack}>
                      {/* 2σ band */}
                      <div
                        className={styles.rangeSigma2}
                        style={{ left: `${s2Left}%`, width: `${s2Right - s2Left}%` }}
                      />
                      {/* 1σ band */}
                      <div
                        className={styles.rangeSigma1}
                        style={{ left: `${s1Left}%`, width: `${s1Right - s1Left}%` }}
                      />
                      {/* Mean line */}
                      <div
                        className={styles.rangeMeanLine}
                        style={{ left: `${meanPos}%` }}
                      />
                      {/* Event dots */}
                      {eventValues.map((ev, i) => (
                        <div
                          key={ev.date}
                          className={styles.rangeDot}
                          style={{
                            left: `${toPercent(ev.value)}%`,
                            background: DATA_COLORS[i % DATA_COLORS.length],
                          }}
                          title={`${formatDate(ev.date)}: ${formatNumber(ev.value)}`}
                        />
                      ))}
                    </div>
                    <div className={styles.rangeMinMax}>
                      <span>{formatNumber(Math.max(0, r.prediction_range_2sigma[0]))}</span>
                      <span>{formatNumber(r.prediction_range_2sigma[1])}</span>
                    </div>
                  </div>
                );
              })}

            {/* Legend for dots */}
            <div style={{ marginTop: "var(--space-lg)", display: "flex", flexWrap: "wrap", gap: "var(--space-md)" }}>
              {data!.comparison_table.map((row, i) => (
                <div
                  key={row.event_date}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-xs)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: DATA_COLORS[i % DATA_COLORS.length],
                      flexShrink: 0,
                    }}
                  />
                  {formatDate(row.event_date)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
