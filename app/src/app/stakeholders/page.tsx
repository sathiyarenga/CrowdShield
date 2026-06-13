"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import {
  api,
  type Stakeholder,
  type StakeholderMatrixResponse,
  type ActionsResponse,
  type CoverageSummaryResponse,
  type MatrixCell,
  type MatrixCellCovered,
  type CategoryDef,
  type ActionItem,
  type SystemInsight,
} from "@/lib/api/client";
import styles from "./page.module.css";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Compute green-channel opacity based on risk count (more risks = more opaque) */
function coveredCellOpacity(riskCount: number): number {
  // Clamp between 0.15 and 0.55 based on risk count, peaking around 35
  const t = Math.min(riskCount / 35, 1);
  return 0.15 + t * 0.4;
}

function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "critical":
      return `${styles.priorityBadge} ${styles.priorityCritical}`;
    case "high":
      return `${styles.priorityBadge} ${styles.priorityHigh}`;
    case "medium":
      return `${styles.priorityBadge} ${styles.priorityMedium}`;
    case "info":
      return `${styles.priorityBadge} ${styles.priorityInfo}`;
    case "low":
      return `${styles.priorityBadge} ${styles.priorityLow}`;
    default:
      return styles.priorityBadge;
  }
}

function insightBorderClass(priority: string): string {
  switch (priority) {
    case "critical":
      return styles.insightCritical;
    case "high":
      return styles.insightHigh;
    case "medium":
      return styles.insightMedium;
    case "info":
      return styles.insightInfo;
    case "low":
      return styles.insightLow;
    default:
      return "";
  }
}

function isCovered(cell: MatrixCell): cell is MatrixCellCovered {
  return cell.status === "covered";
}

/** Check if a category row has only 1 stakeholder covering it */
function isSingleSource(
  catId: string,
  matrix: Record<string, Record<string, MatrixCell>>
): boolean {
  const row = matrix[catId];
  if (!row) return false;
  const coveredCount = Object.values(row).filter(
    (c) => c.status === "covered"
  ).length;
  return coveredCount === 1;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function StakeholderIntelligence() {
  const [matrixData, setMatrixData] =
    useState<StakeholderMatrixResponse | null>(null);
  const [actionsData, setActionsData] = useState<ActionsResponse | null>(null);
  const [summaryData, setSummaryData] =
    useState<CoverageSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = () => {
    setLoading(true);
    setError(null);

    Promise.all([
      api.stakeholders.matrix(),
      api.stakeholders.actions(),
      api.stakeholders.coverageSummary(),
    ])
      .then(([matrix, actions, summary]) => {
        setMatrixData(matrix);
        setActionsData(actions);
        setSummaryData(summary);
      })
      .catch((err) => {
        console.error("Failed to load stakeholder data:", err);
        setError(err.message || "Failed to load stakeholder data");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAll();
  }, []);

  return (
    <div className="app-shell">
      <Sidebar />
      <Header
        title="Multi-Stakeholder Intelligence"
        subtitle="Galway International Arts Festival 2026"
      />
      <main className="app-main">
        {loading ? (
          <div className={styles.loadingWrap}>
            <div className={styles.spinner} />
            <span>Loading stakeholder intelligence…</span>
          </div>
        ) : error ? (
          <div className={styles.errorWrap}>
            <span>⚠ {error}</span>
            <button className={styles.retryBtn} onClick={fetchAll}>
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* ── Coverage Summary Cards ── */}
            {summaryData && <SummaryCards data={summaryData} />}

            {/* ── Stakeholder Pipeline ── */}
            {matrixData && (
              <StakeholderPipeline stakeholders={matrixData.stakeholders} />
            )}

            {/* ── Main Content: Matrix + Insights ── */}
            <div className={styles.contentGrid}>
              {matrixData && <RiskMatrix data={matrixData} />}
              {actionsData && matrixData && (
                <InsightsPanel
                  actions={actionsData.actions}
                  insights={matrixData.system_insights}
                />
              )}
            </div>

            {/* ── Bottom Bar ── */}
            <BottomBar />
          </>
        )}
      </main>
    </div>
  );
}

// ── Sub-Components ─────────────────────────────────────────────────────────

function SummaryCards({ data }: { data: CoverageSummaryResponse }) {
  const coveragePct = Math.round(
    (data.categories_covered / data.categories_total) * 100
  );
  const coverageColor =
    coveragePct >= 80
      ? "var(--color-nominal)"
      : coveragePct >= 50
        ? "var(--color-elevated)"
        : "var(--color-critical)";

  return (
    <div className={styles.summaryRow}>
      <div className="panel">
        <div className="stat-card">
          <span className="stat-card__label">Documents Received</span>
          <span
            className={`stat-card__value ${styles.summaryValue}`}
            style={{ color: "var(--color-accent)" }}
          >
            {data.documents_submitted} of {data.documents_expected}
          </span>
          <span className={styles.summarySubtext}>
            {data.pending_stakeholders} stakeholder
            {data.pending_stakeholders !== 1 ? "s" : ""} pending
          </span>
        </div>
      </div>

      <div className="panel">
        <div className="stat-card">
          <span className="stat-card__label">Categories Covered</span>
          <span
            className={`stat-card__value ${styles.summaryValue}`}
            style={{ color: coverageColor }}
          >
            {data.categories_covered} of {data.categories_total}
          </span>
          <span className={styles.summarySubtext}>
            {data.categories_fully_covered} fully covered (≥5 risks)
          </span>
        </div>
      </div>

      <div className="panel">
        <div className="stat-card">
          <span className="stat-card__label">Weak Areas</span>
          <span
            className={`stat-card__value ${styles.summaryValue}`}
            style={{
              color:
                data.categories_weak > 0
                  ? "var(--color-high)"
                  : "var(--color-nominal)",
            }}
          >
            {data.categories_weak + data.categories_empty}
          </span>
          <span className={styles.summarySubtext}>
            Categories with ≤2 risks identified
          </span>
        </div>
      </div>

      <div className="panel">
        <div className="stat-card">
          <span className="stat-card__label">Cross-Validation</span>
          <span
            className={`stat-card__value ${styles.summaryValue}`}
            style={{
              color: data.cross_validation_ready
                ? "var(--color-nominal)"
                : "var(--color-text-muted)",
              fontSize: "var(--text-lg)",
            }}
          >
            {data.cross_validation_ready
              ? `Active (${data.documents_submitted} docs)`
              : "Awaiting 2nd document"}
          </span>
          <span className={styles.summarySubtext}>
            {data.total_risks_extracted} risks extracted • avg score{" "}
            {data.average_risk_score}
          </span>
        </div>
      </div>
    </div>
  );
}

function StakeholderPipeline({
  stakeholders,
}: {
  stakeholders: Stakeholder[];
}) {
  return (
    <div className={`panel ${styles.pipelinePanel}`}>
      <div className="panel__header">
        <h2 className="panel__title">Stakeholder Document Pipeline</h2>
        <span className="usp-badge">★ Multi-Party Intelligence</span>
      </div>
      <div className={styles.pipelineRow}>
        {stakeholders.map((sh) => {
          const isSubmitted = sh.document_status === "submitted";
          return (
            <div
              key={sh.id}
              className={`${styles.stakeholderNode} ${
                !isSubmitted ? styles.stakeholderNodePending : ""
              }`}
            >
              <div
                className={`${styles.stakeholderIcon} ${
                  isSubmitted ? styles.iconSubmitted : styles.iconPending
                }`}
              >
                {sh.icon}
              </div>
              <span className={styles.stakeholderName}>{sh.name}</span>
              <span className={styles.stakeholderRole}>{sh.role}</span>
              <span className={styles.stakeholderDoc}>
                {isSubmitted
                  ? sh.expected_document
                  : "Awaiting submission"}
              </span>
              <span
                className={`${styles.statusBadge} ${
                  isSubmitted ? styles.badgeSubmitted : styles.badgePending
                }`}
              >
                {isSubmitted ? "✅ Submitted" : "⏳ Pending"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RiskMatrix({ data }: { data: StakeholderMatrixResponse }) {
  const { categories, stakeholders, matrix } = data;

  return (
    <div className={`panel ${styles.matrixPanel}`}>
      <div className="panel__header">
        <h2 className="panel__title">Risk Coverage Matrix</h2>
        {data.coverage_gaps.length > 0 && (
          <span className="risk-badge risk-badge--elevated">
            {data.coverage_gaps.length} Weak Area
            {data.coverage_gaps.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <table className={styles.matrixTable}>
        <thead>
          <tr>
            <th>Hazard Category</th>
            {stakeholders.map((sh) => (
              <th key={sh.id}>
                {sh.icon} {sh.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => {
            const singleSource = isSingleSource(cat.id, matrix);
            return (
              <tr key={cat.id}>
                <td className={styles.hazardLabel}>
                  {cat.label}
                  {singleSource && (
                    <span className={styles.singleSourceBadge}>
                      ⚠ Single-source
                    </span>
                  )}
                </td>
                {stakeholders.map((sh) => {
                  const cell = matrix[cat.id]?.[sh.id];
                  if (!cell) {
                    return (
                      <td key={sh.id} className={styles.matrixCell}>
                        <div
                          className={`${styles.cellInner} ${styles.cellNoDoc}`}
                        >
                          —
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={sh.id} className={styles.matrixCell}>
                      <MatrixCellView
                        cell={cell}
                        catLabel={cat.label}
                        stakeholderName={sh.name}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatrixCellView({
  cell,
  catLabel,
  stakeholderName,
}: {
  cell: MatrixCell;
  catLabel: string;
  stakeholderName: string;
}) {
  if (cell.status === "no_document") {
    return (
      <div className={`${styles.cellInner} ${styles.cellNoDoc}`}>—</div>
    );
  }

  if (cell.status === "gap") {
    return (
      <div className={`${styles.cellInner} ${styles.cellGap}`}>
        <span className={styles.cellCount}>Gap</span>
      </div>
    );
  }

  // covered
  const opacity = coveredCellOpacity(cell.risk_count);
  return (
    <div
      className={`${styles.cellInner} ${styles.cellCovered}`}
      style={{
        background: `rgba(34, 197, 94, ${opacity})`,
      }}
    >
      <span className={styles.cellCount}>{cell.risk_count}</span>
      <span className={styles.cellSubtext}>risks</span>
      <div className={styles.tooltip}>
        <div className={styles.tooltipTitle}>
          {catLabel} — {stakeholderName}
        </div>
        <div className={styles.tooltipStat}>
          <span className={styles.tooltipStatLabel}>Risks:</span>
          <span className={styles.tooltipStatValue}>{cell.risk_count}</span>
        </div>
        <div className={styles.tooltipStat}>
          <span className={styles.tooltipStatLabel}>Avg Score:</span>
          <span className={styles.tooltipStatValue}>
            {cell.avg_score ?? "—"}
          </span>
        </div>
        {cell.top_risk && (
          <div className={styles.tooltipRisk}>
            Top risk: {cell.top_risk}
          </div>
        )}
      </div>
    </div>
  );
}

function InsightsPanel({
  actions,
  insights,
}: {
  actions: ActionItem[];
  insights: SystemInsight[];
}) {
  // Merge insights + action-derived cards, prioritising insights first
  const allCards = [
    ...insights.map((ins, i) => ({
      key: `insight-${i}`,
      priority: ins.priority,
      message: ins.message,
      type: ins.type,
    })),
  ];

  // Cap to keep panel scannable
  const displayCards = allCards.slice(0, 8);

  return (
    <div className={`panel ${styles.insightsPanel}`}>
      <div className={styles.insightsHeader}>
        <div className={styles.insightsIcon}>📊</div>
        <h2 className={styles.insightsTitle}>Platform Insights</h2>
      </div>
      {displayCards.map((card) => (
        <div
          key={card.key}
          className={`${styles.insightCard} ${insightBorderClass(card.priority)}`}
        >
          <div className={styles.insightMessage}>{card.message}</div>
          <span className={priorityBadgeClass(card.priority)}>
            {card.priority}
          </span>
        </div>
      ))}
    </div>
  );
}

function BottomBar() {
  return (
    <div className={`panel ${styles.bottomBar}`}>
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <div className={`${styles.legendSwatch} ${styles.swatchCovered}`} />
          <span>Covered</span>
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendSwatch} ${styles.swatchGap}`} />
          <span>Gap</span>
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendSwatch} ${styles.swatchNoDoc}`} />
          <span>No Document</span>
        </div>
      </div>
      <div className={styles.bottomNote}>
        Multi-stakeholder conflict detection activates when ≥2 documents are
        submitted
      </div>
    </div>
  );
}
