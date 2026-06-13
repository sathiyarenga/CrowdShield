"use client";

import { useState, useMemo } from "react";
import type { EventFingerprint, EventDetection } from "@/lib/api/client";
import styles from "./EventComparisonTable.module.css";

interface Props {
  fingerprints: EventFingerprint[];
  detections: EventDetection[];
}

type SortKey =
  | "event_date"
  | "peak_count"
  | "ingress_duration_minutes"
  | "egress_duration_minutes"
  | "total_person_hours"
  | "sigma_above_baseline";

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function EventComparisonTable({
  fingerprints,
  detections,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("event_date");
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "event_date");
    }
  };

  const sorted = useMemo(() => {
    const items = fingerprints.map((fp) => {
      const det = detections.find((d) => d.date === fp.event_date);
      return { ...fp, sigma: det?.sigma_above_baseline ?? 0 };
    });
    items.sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "event_date":
          av = new Date(a.event_date).getTime();
          bv = new Date(b.event_date).getTime();
          break;
        case "sigma_above_baseline":
          av = a.sigma;
          bv = b.sigma;
          break;
        default:
          av = a[sortKey] as number;
          bv = b[sortKey] as number;
      }
      return sortAsc ? av - bv : bv - av;
    });
    return items;
  }, [fingerprints, detections, sortKey, sortAsc]);

  const columns: { key: SortKey; label: string }[] = [
    { key: "event_date", label: "Date" },
    { key: "peak_count", label: "Peak Count" },
    { key: "ingress_duration_minutes", label: "Ingress" },
    { key: "egress_duration_minutes", label: "Egress" },
    { key: "total_person_hours", label: "Person-Hours" },
    { key: "sigma_above_baseline", label: "σ Above" },
  ];

  return (
    <div className={styles.wrapper}>
      <table className={`data-table ${styles.table}`}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={styles.sortableHeader}
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                <span className={styles.sortIcon}>
                  {sortKey === col.key ? (sortAsc ? " ▲" : " ▼") : ""}
                </span>
              </th>
            ))}
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.event_date}>
              <td className={styles.dateCell}>{formatDate(row.event_date)}</td>
              <td className={styles.peakCell}>
                {row.peak_count.toLocaleString()}
              </td>
              <td>{formatDuration(row.ingress_duration_minutes)}</td>
              <td>{formatDuration(row.egress_duration_minutes)}</td>
              <td>{row.total_person_hours.toLocaleString()}</td>
              <td>
                <span
                  className={styles.sigma}
                  style={{
                    color:
                      row.sigma >= 20
                        ? "var(--color-critical)"
                        : row.sigma >= 10
                        ? "var(--color-high)"
                        : row.sigma >= 2
                        ? "var(--color-elevated)"
                        : "var(--color-nominal)",
                  }}
                >
                  {row.sigma.toFixed(1)}σ
                </span>
              </td>
              <td>
                <span
                  className={`risk-badge ${
                    row.is_event_day
                      ? "risk-badge--elevated"
                      : "risk-badge--nominal"
                  }`}
                >
                  {row.is_event_day ? "Event" : "Non-Event"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
