"use client";

import type { GapAnalysisItem } from "@/lib/api/client";
import styles from "./HazardCoverage.module.css";

interface HazardCoverageProps {
  gaps: GapAnalysisItem[];
  hazardDistribution: Record<string, number>;
}

const CATEGORY_ICONS: Record<string, string> = {
  crowd: "👥",
  fire: "🔥",
  weather: "⛈️",
  infrastructure: "🏗️",
  security: "🛡️",
  medical: "🏥",
  transport: "🚗",
  communication: "📡",
  // Fallback-friendly aliases
  "crowd management": "👥",
  "fire safety": "🔥",
  "severe weather": "⛈️",
  "structural integrity": "🏗️",
  "public order": "🛡️",
  "first aid": "🏥",
  "traffic management": "🚗",
  "emergency communications": "📡",
};

function getIcon(category: string): string {
  const lower = category.toLowerCase();
  // Try exact match, then partial
  if (CATEGORY_ICONS[lower]) return CATEGORY_ICONS[lower];
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key) || key.includes(lower)) return icon;
  }
  return "📋";
}

function statusClass(status: string): string {
  switch (status.toLowerCase()) {
    case "covered":
      return styles.statusCovered;
    case "partial":
      return styles.statusPartial;
    case "missing":
      return styles.statusMissing;
    default:
      return styles.statusPartial;
  }
}

function cardClass(status: string): string {
  switch (status.toLowerCase()) {
    case "covered":
      return styles.cardCovered;
    case "partial":
      return styles.cardPartial;
    case "missing":
      return styles.cardMissing;
    default:
      return "";
  }
}

function fillClass(score: number): string {
  if (score >= 0.7) return styles.coverageFillGreen;
  if (score >= 0.4) return styles.coverageFillYellow;
  return styles.coverageFillRed;
}

export default function HazardCoverage({ gaps, hazardDistribution }: HazardCoverageProps) {
  return (
    <div className={styles.grid}>
      {gaps.map((gap) => {
        const count = gap.risk_count ?? hazardDistribution[gap.category] ?? 0;
        return (
          <div key={gap.category} className={`${styles.card} ${cardClass(gap.status)}`}>
            <div className={styles.icon}>{getIcon(gap.category)}</div>
            <div className={styles.info}>
              <span className={styles.name}>{gap.category}</span>
              <div className={styles.meta}>
                <span className={styles.count}>{count} risk{count !== 1 ? "s" : ""}</span>
                <span className={`${styles.statusBadge} ${statusClass(gap.status)}`}>
                  {gap.status}
                </span>
              </div>
              <div className={styles.coverageBar}>
                <div
                  className={`${styles.coverageFill} ${fillClass(gap.coverage_score)}`}
                  style={{ width: `${Math.round(gap.coverage_score * 100)}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
