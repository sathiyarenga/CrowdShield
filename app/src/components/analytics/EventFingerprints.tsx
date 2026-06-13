"use client";

import type { EventFingerprint, UllevaalSummaryRecord } from "@/lib/api/client";
import styles from "./EventFingerprints.module.css";

interface Props {
  fingerprints: EventFingerprint[];
  timeseries: UllevaalSummaryRecord[];
}

const DATE_COLORS: Record<string, string> = {
  "2025-09-03": "#64748b",
  "2025-09-04": "#3b82f6",
  "2025-09-09": "#ef4444",
  "2025-10-11": "#8b5cf6",
  "2025-10-12": "#94a3b8",
};

function buildSparklinePath(
  records: UllevaalSummaryRecord[],
  width: number,
  height: number
): string {
  if (records.length === 0) return "";

  const maxPeople = Math.max(...records.map((r) => r.people), 1);
  const step = width / Math.max(records.length - 1, 1);
  const padding = 4;
  const usableHeight = height - padding * 2;

  return records
    .map((r, i) => {
      const x = i * step;
      const y = padding + usableHeight - (r.people / maxPeople) * usableHeight;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export default function HistoricalEventFingerprints({ fingerprints, timeseries }: Props) {
  return (
    <div className={styles.grid}>
      {fingerprints.map((fp) => {
        const dateKey = fp.event_date;
        const color = DATE_COLORS[dateKey] || "#3b82f6";
        const records = timeseries
          .filter((r) => r.timestamp.startsWith(dateKey))
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const sparkW = 160;
        const sparkH = 48;
        const sparkPath = buildSparklinePath(records, sparkW, sparkH);

        return (
          <div key={dateKey} className={`panel ${styles.card}`}>
            <div className={styles.header}>
              <span className={styles.date}>{formatDate(dateKey)}</span>
              <span
                className={styles.typeTag}
                style={{
                  color: fp.is_event_day ? "var(--color-elevated)" : "var(--color-text-tertiary)",
                  borderColor: fp.is_event_day
                    ? "rgba(234,179,8,0.3)"
                    : "rgba(255,255,255,0.08)",
                }}
              >
                {fp.is_event_day ? "EVENT" : "NON-EVENT"}
              </span>
            </div>

            <svg
              className={styles.sparkline}
              viewBox={`0 0 ${sparkW} ${sparkH}`}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id={`sg-${dateKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              {sparkPath && (
                <>
                  <path
                    d={`${sparkPath} L ${sparkW} ${sparkH} L 0 ${sparkH} Z`}
                    fill={`url(#sg-${dateKey})`}
                  />
                  <path
                    d={sparkPath}
                    fill="none"
                    stroke={color}
                    strokeWidth="1.5"
                  />
                </>
              )}
            </svg>

            <div className={styles.metrics}>
              <div className={styles.peakRow}>
                <span className={styles.peakValue}>
                  {fp.peak_count.toLocaleString()}
                </span>
                <span className={styles.peakLabel}>
                  peak @ {formatTime(fp.peak_time)}
                </span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Ingress</span>
                <span className={styles.metricValue}>
                  {Math.round(fp.ingress_duration_minutes)}m
                </span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Egress</span>
                <span className={styles.metricValue}>
                  {Math.round(fp.egress_duration_minutes)}m
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
