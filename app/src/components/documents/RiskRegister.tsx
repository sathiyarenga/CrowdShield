"use client";

import { useState, useMemo, Fragment } from "react";
import type { ExtractedRisk } from "@/lib/api/client";
import styles from "./RiskRegister.module.css";

interface RiskRegisterProps {
  risks: ExtractedRisk[];
}

// Maps likelihood/consequence text → numeric value for scoring
const LEVEL_MAP: Record<string, number> = {
  rare: 1,
  unlikely: 2,
  possible: 3,
  likely: 4,
  "almost certain": 4,
  negligible: 1,
  minor: 2,
  moderate: 3,
  major: 4,
  catastrophic: 4,
  insignificant: 1,
  significant: 3,
  severe: 4,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
  extreme: 4,
};

function levelToNum(level: string): number {
  return LEVEL_MAP[level.toLowerCase()] ?? 2;
}

function riskScoreClass(score: number): string {
  if (score >= 12) return styles.riskCritical;
  if (score >= 8) return styles.riskHigh;
  if (score >= 4) return styles.riskMedium;
  return styles.riskLow;
}

type SortKey = "category" | "title" | "likelihood" | "consequence" | "score" | "page";

export default function RiskRegister({ risks }: RiskRegisterProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return risks;
    const q = search.toLowerCase();
    return risks.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.hazard_category.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
    );
  }, [risks, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "category":
          cmp = a.hazard_category.localeCompare(b.hazard_category);
          break;
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "likelihood":
          cmp = levelToNum(a.likelihood) - levelToNum(b.likelihood);
          break;
        case "consequence":
          cmp = levelToNum(a.consequence) - levelToNum(b.consequence);
          break;
        case "score":
          cmp =
            levelToNum(a.likelihood) * levelToNum(a.consequence) -
            levelToNum(b.likelihood) * levelToNum(b.consequence);
          break;
        case "page":
          cmp = a.source_page - b.source_page;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortAsc]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function renderSortIndicator(key: SortKey) {
    const isActive = sortKey === key;
    return (
      <span className={`${styles.sortIndicator} ${isActive ? styles.sortActive : ""}`}>
        {isActive ? (sortAsc ? "▲" : "▼") : "▲"}
      </span>
    );
  }

  function categorySlug(category: string): string {
    return category.toLowerCase().replace(/[^a-z]/g, "");
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <span className={styles.resultCount}>
          {sorted.length} risk{sorted.length !== 1 ? "s" : ""} extracted
        </span>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search risks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.tableWrap}>
        {sorted.length === 0 ? (
          <div className={styles.emptyState}>No risks match your search.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 24 }} />
                <th onClick={() => handleSort("category")}>
                  Category{renderSortIndicator("category")}
                </th>
                <th onClick={() => handleSort("title")}>
                  Risk Title{renderSortIndicator("title")}
                </th>
                <th onClick={() => handleSort("likelihood")}>
                  L{renderSortIndicator("likelihood")}
                </th>
                <th onClick={() => handleSort("consequence")}>
                  C{renderSortIndicator("consequence")}
                </th>
                <th onClick={() => handleSort("score")}>
                  Score{renderSortIndicator("score")}
                </th>
                <th>Controls</th>
                <th onClick={() => handleSort("page")}>
                  Pg{renderSortIndicator("page")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((risk) => {
                const isExpanded = expandedId === risk.id;
                const score = levelToNum(risk.likelihood) * levelToNum(risk.consequence);
                return (
                  <Fragment key={risk.id}>
                    <tr
                      className={`${styles.row} ${isExpanded ? styles.rowExpanded : ""}`}
                      onClick={() => setExpandedId(isExpanded ? null : risk.id)}
                    >
                      <td>
                        <span
                          className={`${styles.expandIcon} ${isExpanded ? styles.expandIconOpen : ""}`}
                        >
                          ▶
                        </span>
                      </td>
                      <td>
                        <span
                          className={styles.categoryBadge}
                          data-category={categorySlug(risk.hazard_category)}
                        >
                          {risk.hazard_category}
                        </span>
                      </td>
                      <td style={{ color: "var(--color-text-primary)", maxWidth: 240 }}>
                        {risk.title}
                      </td>
                      <td>{risk.likelihood}</td>
                      <td>{risk.consequence}</td>
                      <td>
                        <span className={`${styles.riskScore} ${riskScoreClass(score)}`}>
                          {score}
                        </span>
                      </td>
                      <td>
                        <div className={styles.controlsList}>
                          {risk.controls.slice(0, 2).map((c, i) => (
                            <span key={i} className={styles.controlTag}>
                              {c}
                            </span>
                          ))}
                          {risk.controls.length > 2 && (
                            <span className={styles.controlTag}>
                              +{risk.controls.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={styles.pageNum}>p.{risk.source_page}</span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className={styles.expandedRow}>
                        <td colSpan={8}>
                          <div className={styles.expandedContent}>
                            <div className={styles.detailSection}>
                              <span className={styles.detailLabel}>Full Description</span>
                              <p className={styles.detailText}>{risk.description}</p>
                              {risk.spatial_reference && (
                                <>
                                  <span className={styles.detailLabel}>Spatial Reference</span>
                                  <p className={styles.detailText}>{risk.spatial_reference}</p>
                                </>
                              )}
                              <span className={styles.detailLabel}>All Controls</span>
                              <div className={styles.controlsList}>
                                {risk.controls.map((c, i) => (
                                  <span key={i} className={styles.controlTag}>
                                    {c}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className={styles.detailSection}>
                              <span className={styles.detailLabel}>Source Text</span>
                              <div className={styles.sourceText}>
                                {risk.source_text || "No source text available."}
                              </div>
                              <div className={styles.confidence}>
                                <span>Confidence:</span>
                                <div className={styles.confidenceBar}>
                                  <div
                                    className={styles.confidenceFill}
                                    style={{ width: `${Math.min(Math.round(risk.confidence * 100), 100)}%` }}
                                  />
                                </div>
                                <span>{Math.min(Math.round(risk.confidence * 100), 100)}%</span>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


