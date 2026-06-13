"use client";

import { useMemo } from "react";
import type { CustomZone } from "../maps/VenueMap";
import styles from "./PlanningPanel.module.css";

/* ── Zone type metadata ──────────────────────────────────────────────── */
const ZONE_TYPE_ICONS: Record<string, string> = {
  gate: "🚪",
  stage: "🎤",
  crowd_corridor: "🚶",
  medical: "🏥",
  vip: "⭐",
  parking: "🅿️",
  buffer: "🔲",
  custom: "📍",
};

/* ── Risk category data ──────────────────────────────────────────────── */
interface RiskSummary {
  category: string;
  count: number;
  highRisk: number;
  color: string;
}

const RISK_CATEGORY_COLORS: Record<string, string> = {
  crowd_crush: "#ef4444",
  medical: "#22c55e",
  security: "#6366f1",
  fire: "#f97316",
  weather: "#3b82f6",
  infrastructure: "#8b5cf6",
  traffic: "#eab308",
  environmental: "#06b6d4",
};

interface PlanningPanelProps {
  venueId: string;
  venueName: string;
  customZones: CustomZone[];
  riskMarkerCount: number;
  riskCategories: { category: string; count: number; highRisk: number }[];
  onStartDrawing: () => void;
  expectedCrowd?: number;
}

export default function PlanningPanel({
  venueId,
  venueName,
  customZones,
  riskMarkerCount,
  riskCategories,
  onStartDrawing,
  expectedCrowd = 0,
}: PlanningPanelProps) {
  /* ── Capacity analysis ─────────────────────────────────────────────── */
  const totalCapacity = useMemo(
    () => customZones.reduce((sum, z) => sum + z.capacity, 0),
    [customZones]
  );

  const capacityPercentage = totalCapacity > 0
    ? Math.min(100, Math.round((expectedCrowd / totalCapacity) * 100))
    : 0;

  const capacityStatus = capacityPercentage >= 90 ? "critical" :
    capacityPercentage >= 70 ? "warning" :
    capacityPercentage >= 50 ? "moderate" : "safe";

  const capacityColor = capacityStatus === "critical" ? "#ef4444" :
    capacityStatus === "warning" ? "#f97316" :
    capacityStatus === "moderate" ? "#eab308" : "#22c55e";

  /* ── Readiness score ───────────────────────────────────────────────── */
  const readinessItems = [
    { label: "Event zones defined", done: customZones.length >= 3 },
    { label: "Medical zone present", done: customZones.some(z => z.zone_type === "medical") },
    { label: "Gates identified", done: customZones.some(z => z.zone_type === "gate") },
    { label: "Risk assessment uploaded", done: riskMarkerCount > 0 },
    { label: "Capacity limits set", done: totalCapacity > 0 },
    { label: "Crowd corridors mapped", done: customZones.some(z => z.zone_type === "crowd_corridor") },
  ];

  const readinessScore = readinessItems.filter(i => i.done).length;
  const readinessTotal = readinessItems.length;
  const readinessPercentage = Math.round((readinessScore / readinessTotal) * 100);

  return (
    <div className={styles.planningPanel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerIcon}>📋</div>
        <div className={styles.headerText}>
          <h3>Pre-Event Planning</h3>
          <span>{venueName}</span>
        </div>
      </div>

      {/* Readiness Score */}
      <div className={styles.readinessCard}>
        <div className={styles.readinessHeader}>
          <span className={styles.cardLabel}>Event Readiness</span>
          <span className={styles.readinessPercent} style={{
            color: readinessPercentage >= 80 ? "#22c55e" :
              readinessPercentage >= 50 ? "#eab308" : "#ef4444"
          }}>
            {readinessPercentage}%
          </span>
        </div>
        <div className={styles.readinessBar}>
          <div
            className={styles.readinessBarFill}
            style={{
              width: `${readinessPercentage}%`,
              background: readinessPercentage >= 80 ? "#22c55e" :
                readinessPercentage >= 50 ? "#eab308" : "#ef4444",
            }}
          />
        </div>
        <div className={styles.readinessChecklist}>
          {readinessItems.map((item, i) => (
            <div key={i} className={`${styles.checkItem} ${item.done ? styles.done : ""}`}>
              <span className={styles.checkIcon}>{item.done ? "✓" : "○"}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Zone Summary */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardLabel}>Zones Defined</span>
          <span className={styles.cardValue}>{customZones.length}</span>
        </div>
        {customZones.length > 0 ? (
          <div className={styles.zoneBreakdown}>
            {customZones.map(z => (
              <div key={z.zone_id} className={styles.zoneMiniRow}>
                <span>{ZONE_TYPE_ICONS[z.zone_type] || "📍"} {z.name}</span>
                <span className={styles.zoneCap}>{z.capacity.toLocaleString()}</span>
              </div>
            ))}
            <div className={styles.zoneTotalRow}>
              <span>Total Capacity</span>
              <span>{totalCapacity.toLocaleString()}</span>
            </div>
          </div>
        ) : (
          <button className={styles.drawCta} onClick={onStartDrawing}>
            ✏️ Start Drawing Zones
          </button>
        )}
      </div>

      {/* Capacity Analysis */}
      {totalCapacity > 0 && expectedCrowd > 0 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>Capacity Analysis</span>
            <span className={styles.cardValue} style={{ color: capacityColor }}>
              {capacityPercentage}%
            </span>
          </div>
          <div className={styles.capacityBar}>
            <div
              className={styles.capacityFill}
              style={{ width: `${capacityPercentage}%`, background: capacityColor }}
            />
          </div>
          <div className={styles.capacityRow}>
            <span>Expected: {expectedCrowd.toLocaleString()}</span>
            <span>Capacity: {totalCapacity.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Risk Overview */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardLabel}>Risk Markers</span>
          <span className={styles.cardValue}>{riskMarkerCount}</span>
        </div>
        {riskCategories.length > 0 ? (
          <div className={styles.riskBreakdown}>
            {riskCategories.map(rc => {
              const color = RISK_CATEGORY_COLORS[rc.category] || "#94a3b8";
              return (
                <div key={rc.category} className={styles.riskRow}>
                  <div className={styles.riskDot} style={{ background: color }} />
                  <span className={styles.riskCategory}>
                    {rc.category.replace(/_/g, " ")}
                  </span>
                  <span className={styles.riskCount}>{rc.count}</span>
                  {rc.highRisk > 0 && (
                    <span className={styles.highRiskBadge}>
                      {rc.highRisk} high
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>
            No risk assessment uploaded yet
          </div>
        )}
      </div>

      {/* Planning Actions */}
      <div className={styles.actionsCard}>
        <button className={styles.actionBtn} onClick={onStartDrawing}>
          ✏️ Draw Zone
        </button>
        <button className={styles.actionBtnSecondary} disabled>
          📄 Upload Assessment
        </button>
        <button className={styles.actionBtnSecondary} disabled>
          📊 Generate Report
        </button>
      </div>
    </div>
  );
}
