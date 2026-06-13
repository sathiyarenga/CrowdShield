"use client";

import { useMemo, useState, useCallback } from "react";
import type { FredrikstadArea } from "@/lib/api/client";
import styles from "./AreaRanking.module.css";

type SortKey = "daily_max_people" | "daily_avg_people" | "hourly_max_people" | "hourly_avg_people" | "days_observed";
type SortDir = "asc" | "desc";

interface AreaRankingProps {
  data: FredrikstadArea[];
  loading?: boolean;
  selectedArea?: string | null;
  onSelectArea?: (areaName: string) => void;
}

const COLUMNS: { key: SortKey; label: string; color: string }[] = [
  { key: "daily_max_people", label: "Daily Max", color: "var(--color-data-1)" },
  { key: "daily_avg_people", label: "Daily Avg", color: "var(--color-data-3)" },
  { key: "hourly_max_people", label: "Hourly Max", color: "var(--color-data-6)" },
  { key: "hourly_avg_people", label: "Hourly Avg", color: "var(--color-data-4)" },
  { key: "days_observed", label: "Days", color: "var(--color-data-5)" },
];

export default function AreaRanking({
  data,
  loading,
  selectedArea,
  onSelectArea,
}: AreaRankingProps) {
  const [sortKey, setSortKey] = useState<SortKey>("daily_max_people");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey]
  );

  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return copy;
  }, [data, sortKey, sortDir]);

  // Compute max per column for inline bar widths
  const maxValues = useMemo(() => {
    const result: Record<string, number> = {};
    for (const col of COLUMNS) {
      result[col.key] = Math.max(...data.map((a) => a[col.key]), 1);
    }
    return result;
  }, [data]);

  // Summary stats
  const summary = useMemo(() => {
    if (data.length === 0) return null;
    return {
      totalAreas: data.length,
      peakDaily: Math.max(...data.map((a) => a.daily_max_people)),
      avgDaily: Math.round(
        data.reduce((s, a) => s + a.daily_avg_people, 0) / data.length
      ),
      peakHourly: Math.max(...data.map((a) => a.hourly_max_people)),
    };
  }, [data]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        Loading area rankings…
      </div>
    );
  }

  if (data.length === 0) {
    return <div className={styles.empty}>No area data available</div>;
  }

  return (
    <div className={styles.container}>
      {/* Summary strip */}
      {summary && (
        <div className={styles.summaryRow}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Total Areas</span>
            <span className={styles.summaryValue}>{summary.totalAreas}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Peak Daily</span>
            <span className={styles.summaryValue}>
              {summary.peakDaily.toLocaleString()}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Avg Daily</span>
            <span className={styles.summaryValue}>
              {summary.avgDaily.toLocaleString()}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Peak Hourly</span>
            <span className={styles.summaryValue}>
              {summary.peakHourly.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th className={styles.rankCell}>#</th>
            <th>Area Name</th>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`${styles.sortableHeader} ${
                  sortKey === col.key ? styles.sortActive : ""
                }`}
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                <span className={styles.sortIndicator}>
                  {sortKey === col.key
                    ? sortDir === "desc"
                      ? "▼"
                      : "▲"
                    : "▽"}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((area, idx) => (
            <tr
              key={area.area_code}
              className={`${styles.clickableRow} ${
                selectedArea === area.area_name ? styles.selectedRow : ""
              }`}
              onClick={() => onSelectArea?.(area.area_name)}
            >
              <td
                className={`${styles.rankCell} ${
                  idx < 3 ? styles.rankTop : ""
                }`}
              >
                {idx + 1}
              </td>
              <td>
                <div className={styles.areaNameCell}>
                  <span className={styles.areaName}>{area.area_name}</span>
                  {area.admin_level_2 && (
                    <span className={styles.areaRegion}>
                      {area.admin_level_2}
                    </span>
                  )}
                </div>
              </td>
              {COLUMNS.map((col) => {
                const val = area[col.key];
                const pct = (val / maxValues[col.key]) * 100;

                if (col.key === "days_observed") {
                  return (
                    <td key={col.key}>
                      <span className={styles.daysBadge}>{val}</span>
                    </td>
                  );
                }

                return (
                  <td key={col.key} className={styles.metricCell}>
                    <div
                      className={styles.metricBar}
                      style={{
                        width: `${pct}%`,
                        background: col.color,
                      }}
                    />
                    <span className={styles.metricValue}>
                      {val.toLocaleString()}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
