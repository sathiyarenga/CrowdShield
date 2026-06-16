/**
 * RiskIntelPanel — floating panel showing document-extracted risk intelligence.
 *
 * Unlike spatial layers, these risks come from uploaded PDFs/documents and do NOT
 * have map coordinates. They are displayed as a categorised list overlay on the map
 * instead of misleading map markers.
 */
"use client";

import { useEffect, useState, useMemo } from "react";
import { API_BASE } from "@/lib/api/client";
import styles from "./RiskIntelPanel.module.css";

/* -- Risk category config --------------------------------------------- */
const CATEGORY_COLORS: Record<string, string> = {
  crowd_crush: "#ef4444",
  medical: "#22c55e",
  security: "#6366f1",
  fire: "#f97316",
  weather: "#3b82f6",
  infrastructure: "#8b5cf6",
  traffic: "#eab308",
  environmental: "#06b6d4",
};

const CATEGORY_ICONS: Record<string, string> = {
  crowd_crush: "🚨",
  medical: "🏥",
  security: "🔒",
  fire: "🔥",
  weather: "🌧️",
  infrastructure: "🏗️",
  traffic: "🚗",
  environmental: "🌿",
};

interface ExtractedRisk {
  id: string;
  title: string;
  hazard_category: string;
  risk_score: number;
  source_page?: number;
  severity_label?: string;
}

interface Props {
  venueId: string;
  visible: boolean;
}

function getSeverityLabel(score: number): string {
  if (score > 7) return "Critical";
  if (score > 5) return "High";
  if (score > 3) return "Medium";
  return "Low";
}

function getSeverityClass(score: number): string {
  if (score > 7) return styles.severityCritical;
  if (score > 5) return styles.severityHigh;
  if (score > 3) return styles.severityMedium;
  return styles.severityLow;
}

function getScoreClass(score: number): string {
  if (score > 7) return styles.riskScoreCritical;
  if (score > 5) return styles.riskScoreHigh;
  if (score > 3) return styles.riskScoreMedium;
  return styles.riskScoreLow;
}

export default function RiskIntelPanel({ venueId, visible }: Props) {
  const [risks, setRisks] = useState<ExtractedRisk[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  /* -- Fetch risks from document API ---------------------------------- */
  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setLoading(true);

    async function fetchRisks() {
      try {
        // Fetch from both the venue risk markers and document risks endpoints
        const [venueRes, docRes] = await Promise.allSettled([
          fetch(`${API_BASE}/api/venues/${venueId}/risk-markers`).then(r => r.ok ? r.json() : null),
          fetch(`${API_BASE}/api/documents/galway/risks`).then(r => r.ok ? r.json() : null),
        ]);

        if (cancelled) return;

        const allRisks: ExtractedRisk[] = [];

        // From venue risk markers (these have hazard_category, risk_score, etc.)
        if (venueRes.status === "fulfilled" && venueRes.value?.features) {
          for (const f of venueRes.value.features) {
            const p = f.properties;
            if (p?.risk_id && p?.title) {
              allRisks.push({
                id: p.risk_id,
                title: p.title,
                hazard_category: p.hazard_category || "unknown",
                risk_score: Number(p.risk_score ?? 0),
                source_page: p.source_page,
                severity_label: p.severity_label,
              });
            }
          }
        }

        // If venue markers returned nothing, try document risks
        if (allRisks.length === 0 && docRes.status === "fulfilled" && docRes.value?.risks) {
          for (const r of docRes.value.risks) {
            allRisks.push({
              id: r.id || r.title,
              title: r.title,
              hazard_category: r.hazard_category || "unknown",
              risk_score: Number(r.risk_score ?? 0),
              source_page: r.source_page,
              severity_label: r.severity_label,
            });
          }
        }

        setRisks(allRisks);
      } catch {
        /* backend may be down — not an error */
      }
      if (!cancelled) setLoading(false);
    }

    fetchRisks();
    return () => { cancelled = true; };
  }, [venueId, visible]);

  /* -- Group risks by category ---------------------------------------- */
  const grouped = useMemo(() => {
    const map = new Map<string, ExtractedRisk[]>();
    for (const risk of risks) {
      const cat = risk.hazard_category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(risk);
    }
    // Sort categories by total risk score (highest first)
    return Array.from(map.entries())
      .sort((a, b) => {
        const scoreA = a[1].reduce((s, r) => s + r.risk_score, 0);
        const scoreB = b[1].reduce((s, r) => s + r.risk_score, 0);
        return scoreB - scoreA;
      });
  }, [risks]);

  const highRiskCount = risks.filter(r => r.risk_score > 7).length;

  /* -- Toggle category expansion -------------------------------------- */
  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (!visible) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerIcon}>⚠️</span>
        <span>Risk Intelligence</span>
        {loading && <span className={styles.spinner}>⏳</span>}
        {!loading && risks.length > 0 && (
          <span className={styles.badge}>{risks.length}</span>
        )}
      </div>

      {risks.length === 0 && !loading ? (
        <div className={styles.emptyState}>
          No risk data extracted yet.<br />
          Upload a risk assessment document first.
        </div>
      ) : (
        <div className={styles.riskList}>
          {grouped.map(([category, catRisks]) => {
            const color = CATEGORY_COLORS[category] || "#94a3b8";
            const icon = CATEGORY_ICONS[category] || "⚠️";
            const isExpanded = expandedCategories.has(category);
            const catHighRisk = catRisks.filter(r => r.risk_score > 7).length;

            return (
              <div key={category} className={styles.categorySection}>
                <div className={styles.categoryHeader} onClick={() => toggleCategory(category)}>
                  <span
                    className={`${styles.categoryChevron} ${isExpanded ? styles.open : ""}`}
                  >
                    ▸
                  </span>
                  <span className={styles.categoryDot} style={{ background: color }} />
                  <span className={styles.categoryName}>
                    {icon} {category.replace(/_/g, " ")}
                  </span>
                  <span className={styles.categoryCount}>
                    {catRisks.length}
                    {catHighRisk > 0 && <span style={{ color: "#ef4444" }}> · {catHighRisk}!</span>}
                  </span>
                </div>

                {isExpanded && (
                  <div className={styles.riskItems}>
                    {catRisks
                      .sort((a, b) => b.risk_score - a.risk_score)
                      .map(risk => (
                        <div key={risk.id} className={styles.riskItem}>
                          <span className={styles.riskTitle}>
                            {risk.title}
                            {risk.source_page && (
                              <span style={{ opacity: 0.5 }}> (p.{risk.source_page})</span>
                            )}
                          </span>
                          <span className={`${styles.riskScore} ${getScoreClass(risk.risk_score)}`}>
                            {risk.risk_score}/10
                          </span>
                          <span className={`${styles.severityBadge} ${getSeverityClass(risk.risk_score)}`}>
                            {getSeverityLabel(risk.risk_score)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {risks.length > 0 && (
        <>
          <div className={styles.stats}>
            {risks.length} risks · {highRiskCount} critical
          </div>
          <div className={styles.sourceNote}>
            📄 Extracted from uploaded risk documents
          </div>
        </>
      )}
    </div>
  );
}
