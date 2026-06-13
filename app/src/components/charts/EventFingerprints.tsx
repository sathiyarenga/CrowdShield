"use client";

import { useEffect, useState } from "react";
import { api, type EventFingerprint, type EventDetection } from "@/lib/api/client";
import styles from "./EventFingerprints.module.css";

function getRiskLevel(peak: number): { level: string; cssClass: string } {
  if (peak >= 25000) return { level: "critical", cssClass: "risk-badge--critical" };
  if (peak >= 15000) return { level: "high", cssClass: "risk-badge--high" };
  if (peak >= 8000) return { level: "elevated", cssClass: "risk-badge--elevated" };
  return { level: "nominal", cssClass: "risk-badge--nominal" };
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export default function EventFingerprints() {
  const [fingerprints, setFingerprints] = useState<EventFingerprint[]>([]);
  const [detections, setDetections] = useState<EventDetection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await api.ullevaal.events();
        setFingerprints(res.fingerprints);
        setDetections(res.event_detection);
        setLoading(false);
      } catch {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return <div className={styles.loading}>Loading fingerprints…</div>;
  }

  return (
    <div className={styles.grid}>
      {fingerprints.map((fp) => {
        const risk = getRiskLevel(fp.peak_count);
        const detection = detections.find((d) => d.date === fp.event_date);
        const dateObj = new Date(fp.event_date);
        const dateLabel = dateObj.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });

        return (
          <div key={fp.event_date} className={`panel ${styles.card}`}>
            <div className={styles.dateRow}>
              <span className={styles.dateLabel}>{dateLabel}</span>
              <span className={styles.dayName}>{dayName}</span>
            </div>

            <div className={styles.peakValue}>
              {fp.peak_count.toLocaleString()}
            </div>
            <div className={styles.peakLabel}>peak at {formatTime(fp.peak_time)}</div>

            <span className={`risk-badge ${risk.cssClass}`}>{risk.level}</span>

            <div className={styles.metrics}>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Ingress</span>
                <span className={styles.metricValue}>
                  {formatDuration(fp.ingress_duration_minutes)}
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Egress</span>
                <span className={styles.metricValue}>
                  {formatDuration(fp.egress_duration_minutes)}
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>σ above</span>
                <span className={styles.metricValue}>
                  {detection?.sigma_above_baseline?.toFixed(1) ?? "—"}
                </span>
              </div>
            </div>

            <div className={styles.typeTag}>
              {fp.is_event_day ? "Event Day" : "Non-Event"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
