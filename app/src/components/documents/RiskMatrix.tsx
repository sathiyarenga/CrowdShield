"use client";

import { useMemo } from "react";
import type { ExtractedRisk } from "@/lib/api/client";
import styles from "./RiskMatrix.module.css";

interface RiskMatrixProps {
  risks: ExtractedRisk[];
}

const LEVELS = ["Rare", "Unlikely", "Possible", "Likely"] as const;
const CONSEQUENCES = ["Minor", "Moderate", "Major", "Catastrophic"] as const;

const LEVEL_MAP: Record<string, number> = {
  rare: 0,
  unlikely: 1,
  possible: 2,
  likely: 3,
  "almost certain": 3,
  negligible: 0,
  insignificant: 0,
  minor: 0,
  moderate: 1,
  significant: 2,
  major: 2,
  severe: 3,
  catastrophic: 3,
  critical: 3,
  extreme: 3,
  low: 0,
  medium: 1,
  high: 2,
};

// The risk matrix color is determined by the combined severity index
// Row index (likelihood 0–3) + Col index (consequence 0–3) → severity
function cellSeverity(row: number, col: number): string {
  const score = row + col;
  if (score >= 5) return styles.cellRed;
  if (score >= 4) return styles.cellOrange;
  if (score >= 2) return styles.cellYellow;
  return styles.cellGreen;
}

export default function RiskMatrix({ risks }: RiskMatrixProps) {
  // Build a 4×4 count matrix
  const matrix = useMemo(() => {
    const grid = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => 0));
    for (const risk of risks) {
      const lKey = risk.likelihood.toLowerCase();
      const cKey = risk.consequence.toLowerCase();
      const row = LEVEL_MAP[lKey] ?? 1;
      const col = LEVEL_MAP[cKey] ?? 1;
      grid[row][col]++;
    }
    return grid;
  }, [risks]);

  return (
    <div className={styles.container}>
      <div className={styles.matrixWrap}>
        <div className={styles.yAxisTitle}>Likelihood →</div>
        <div className={styles.yAxis}>
          {[...LEVELS].reverse().map((l) => (
            <div key={l} className={styles.yLabel}>
              {l}
            </div>
          ))}
        </div>
        <div className={styles.grid}>
          {/* Render rows from top (Likely=3) to bottom (Rare=0) */}
          {[3, 2, 1, 0].map((row) =>
            [0, 1, 2, 3].map((col) => {
              const count = matrix[row][col];
              return (
                <div
                  key={`${row}-${col}`}
                  className={`${styles.cell} ${count > 0 ? cellSeverity(row, col) : styles.cellEmpty}`}
                  title={`${LEVELS[row]} likelihood × ${CONSEQUENCES[col]} consequence: ${count} risk(s)`}
                >
                  {count > 0 ? count : "·"}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className={styles.xAxis}>
        {CONSEQUENCES.map((c) => (
          <div key={c} className={styles.xLabel}>
            {c}
          </div>
        ))}
      </div>
      <div className={styles.axisTitle}>Consequence →</div>

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.legendGreen}`} />
          Low
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.legendYellow}`} />
          Moderate
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.legendOrange}`} />
          High
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.legendRed}`} />
          Critical
        </div>
      </div>
    </div>
  );
}
