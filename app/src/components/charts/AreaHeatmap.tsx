"use client";

import { useMemo } from "react";
import type { FredrikstadArea } from "@/lib/api/client";
import styles from "./AreaHeatmap.module.css";

interface AreaHeatmapProps {
  data: FredrikstadArea[];
  loading?: boolean;
}

/** Maps a value [0–1] to a color across a blue→cyan→yellow→red gradient. */
function intensityColor(t: number): string {
  // 5-stop gradient: deep navy → blue → cyan → amber → red
  const stops = [
    { r: 15, g: 23, b: 42 },   // near-black navy
    { r: 30, g: 64, b: 175 },  // deep blue
    { r: 6, g: 182, b: 212 },  // cyan
    { r: 245, g: 158, b: 11 }, // amber
    { r: 239, g: 68, b: 68 },  // red
  ];

  const clamped = Math.max(0, Math.min(1, t));
  const segment = clamped * (stops.length - 1);
  const i = Math.floor(segment);
  const f = segment - i;
  const a = stops[Math.min(i, stops.length - 1)];
  const b = stops[Math.min(i + 1, stops.length - 1)];

  const r = Math.round(a.r + (b.r - a.r) * f);
  const g = Math.round(a.g + (b.g - a.g) * f);
  const bv = Math.round(a.b + (b.b - a.b) * f);

  return `rgb(${r}, ${g}, ${bv})`;
}

const METRIC_COLS = [
  { key: "daily_max_people" as const, label: "Daily Max" },
  { key: "daily_avg_people" as const, label: "Daily Avg" },
  { key: "hourly_max_people" as const, label: "Hourly Max" },
  { key: "hourly_avg_people" as const, label: "Hourly Avg" },
];

export default function AreaHeatmap({ data, loading }: AreaHeatmapProps) {
  // Take the top 30 areas (data is already sorted by the page)
  const top30 = useMemo(() => data.slice(0, 30), [data]);

  // Compute global max for each metric for normalization
  const maxValues = useMemo(() => {
    const result: Record<string, number> = {};
    for (const col of METRIC_COLS) {
      result[col.key] = Math.max(...top30.map((a) => a[col.key]), 1);
    }
    return result;
  }, [top30]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        Loading area heatmap…
      </div>
    );
  }

  if (top30.length === 0) {
    return <div className={styles.empty}>No area data available</div>;
  }

  return (
    <div className={styles.container}>
      {/* Color legend */}
      <div className={styles.legend}>
        <span className={styles.legendLabel}>Intensity</span>
        <div>
          <div className={styles.legendBar}>
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <div
                key={t}
                className={styles.legendBarSegment}
                style={{ background: intensityColor(t) }}
              />
            ))}
          </div>
          <div className={styles.legendMinMax}>
            <span>Low</span>
            <span>High</span>
          </div>
        </div>
      </div>

      {/* Grid header */}
      <div className={styles.grid}>
        <div className={styles.headerCell}>Area</div>
        {METRIC_COLS.map((col) => (
          <div key={col.key} className={styles.headerCell}>
            {col.label}
          </div>
        ))}

        {/* Data rows */}
        {top30.map((area, idx) => (
          <div key={area.area_code} className={styles.row}>
            <div className={styles.areaLabel} title={area.area_name}>
              <span
                className={`${styles.rank} ${idx < 3 ? styles.rankTop3 : ""}`}
              >
                {idx + 1}
              </span>
              {area.area_name}
            </div>
            {METRIC_COLS.map((col) => {
              const val = area[col.key];
              const normalized = val / maxValues[col.key];
              return (
                <div
                  key={col.key}
                  className={styles.cell}
                  style={{ background: intensityColor(normalized) }}
                  data-tooltip={`${col.label}: ${val.toLocaleString()}`}
                >
                  {val.toLocaleString()}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
