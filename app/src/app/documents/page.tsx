"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { useEvent } from "@/context/EventContext";
import RiskRegister from "@/components/documents/RiskRegister";
import HazardCoverage from "@/components/documents/HazardCoverage";
import RiskMatrix from "@/components/documents/RiskMatrix";
import {
  api,
  API_BASE,
  type DocumentSummary,
  type ExtractedRisk,
  type GapAnalysisItem,
} from "@/lib/api/client";
import styles from "./page.module.css";

// -- Fallback data (used when backend is offline) -------------------------

const FALLBACK_SUMMARY: DocumentSummary = {
  document_name: "Galway International Arts Festival — Event Safety Plan",
  total_pages: 47,
  total_risks: 24,
  extraction_mode: "rule_based",
  hazard_distribution: {
    "Crowd Management": 6,
    "Fire Safety": 4,
    "Severe Weather": 3,
    "Structural Integrity": 2,
    "Public Order": 3,
    "First Aid": 2,
    "Traffic Management": 2,
    "Emergency Communications": 2,
  },
  risk_levels: { low: 4, medium: 8, high: 9, critical: 3 },
  gap_analysis: {
    overall_score: 0.72,
    gaps: [
      { category: "Crowd Management", status: "covered", coverage_score: 0.92, recommendations: [] },
      { category: "Fire Safety", status: "covered", coverage_score: 0.85, recommendations: ["Add fire warden shift schedule"] },
      { category: "Severe Weather", status: "partial", coverage_score: 0.55, recommendations: ["Add wind-speed trigger thresholds", "Define shelter-in-place protocol"] },
      { category: "Structural Integrity", status: "partial", coverage_score: 0.6, recommendations: ["Include structural engineer sign-off checklist"] },
      { category: "Public Order", status: "covered", coverage_score: 0.8, recommendations: [] },
      { category: "First Aid", status: "partial", coverage_score: 0.5, recommendations: ["Define ambulance staging positions", "Add patient triage protocol"] },
      { category: "Traffic Management", status: "missing", coverage_score: 0.2, recommendations: ["Create traffic management plan", "Define road closure schedule", "Add parking overflow protocol"] },
      { category: "Emergency Communications", status: "partial", coverage_score: 0.45, recommendations: ["Define radio channel allocation", "Add backup communications plan"] },
    ],
  },
};

const FALLBACK_RISKS: ExtractedRisk[] = [
  { id: "r1", hazard_category: "Crowd Management", title: "Overcrowding at main stage during headliner", description: "Risk of dangerous crowd density exceeding 4 persons/m² at the main stage area during peak headliner performance, particularly during festival Saturday evening.", likelihood: "Likely", consequence: "Major", controls: ["Crowd monitoring", "Capacity caps", "Secondary screens"], spatial_reference: "Main Stage Area A", source_page: 12, source_text: "The main stage area has a maximum capacity of 8,000 persons. During headliner acts, historical data shows attendance can exceed this by 15-20%.", confidence: 0.94 },
  { id: "r2", hazard_category: "Crowd Management", title: "Bottleneck at east entrance during ingress", description: "Narrow east entrance creates pinch point during peak arrival times.", likelihood: "Possible", consequence: "Major", controls: ["Queue management", "Barrier layout", "Staff deployment"], spatial_reference: "East Gate", source_page: 14, source_text: "The east entrance has a throughput capacity of approximately 1,200 persons per hour.", confidence: 0.88 },
  { id: "r3", hazard_category: "Crowd Management", title: "Crowd crush risk during emergency egress", description: "Insufficient emergency exits on south side may cause crush during evacuation.", likelihood: "Unlikely", consequence: "Catastrophic", controls: ["Emergency exits", "PA system", "Trained stewards"], spatial_reference: "South perimeter", source_page: 16, source_text: "Emergency evacuation modelling indicates south exits can clear area in approximately 12 minutes.", confidence: 0.91 },
  { id: "r4", hazard_category: "Fire Safety", title: "Fire risk in food vendor area", description: "Concentration of open-flame cooking equipment in food court area with limited spacing between stalls.", likelihood: "Possible", consequence: "Major", controls: ["Fire extinguishers", "Fire marshal patrols", "Vendor spacing rules"], spatial_reference: "Food Court Zone B", source_page: 21, source_text: "Food vendors using LPG must maintain minimum 3m separation between units.", confidence: 0.92 },
  { id: "r5", hazard_category: "Fire Safety", title: "Pyrotechnics storage and handling", description: "Stage pyrotechnics require secure storage and licensed handling during performances.", likelihood: "Rare", consequence: "Catastrophic", controls: ["Licensed operators", "Secure storage", "Safety perimeter"], spatial_reference: "Main Stage backstage", source_page: 23, source_text: "All pyrotechnic effects must be operated by licensed professionals with minimum 15m safety perimeter.", confidence: 0.95 },
  { id: "r6", hazard_category: "Severe Weather", title: "High wind event affecting temporary structures", description: "Marquees and staging vulnerable to wind speeds exceeding 45km/h.", likelihood: "Possible", consequence: "Major", controls: ["Weather monitoring", "Wind speed triggers", "Structural engineer on-call"], spatial_reference: null, source_page: 28, source_text: "Temporary structures must be assessed if wind speeds exceed 45km/h sustained.", confidence: 0.85 },
  { id: "r7", hazard_category: "Severe Weather", title: "Flooding of low-lying festival areas", description: "Heavy rainfall may cause surface water flooding in low-lying sections near the river.", likelihood: "Unlikely", consequence: "Moderate", controls: ["Drainage checks", "Alternative routes", "Weather monitoring"], spatial_reference: "Riverside area", source_page: 29, source_text: "The riverside area is within Flood Zone B and may be affected by tidal surges.", confidence: 0.78 },
  { id: "r8", hazard_category: "Public Order", title: "Anti-social behaviour at late-night events", description: "Alcohol-related incidents expected to peak during late-night weekend programming.", likelihood: "Likely", consequence: "Moderate", controls: ["Security patrols", "CCTV monitoring", "Alcohol controls", "Garda liaison"], spatial_reference: null, source_page: 32, source_text: "Historical data shows 60% of security incidents occur between 22:00 and 02:00.", confidence: 0.87 },
  { id: "r9", hazard_category: "First Aid", title: "Mass casualty incident overwhelms medical provision", description: "Current medical team of 6 may be insufficient for simultaneous multi-casualty event.", likelihood: "Rare", consequence: "Catastrophic", controls: ["Medical team on-site", "Hospital liaison", "Triage protocol"], spatial_reference: "Medical tent", source_page: 35, source_text: "Medical provision calculated at 1 first-aider per 1,500 attendees.", confidence: 0.82 },
  { id: "r10", hazard_category: "Traffic Management", title: "Road congestion causing delayed emergency access", description: "Festival traffic may block emergency vehicle access on surrounding roads.", likelihood: "Possible", consequence: "Major", controls: ["Traffic marshals"], spatial_reference: "Access roads", source_page: 38, source_text: "No formal traffic management plan has been submitted.", confidence: 0.76 },
  { id: "r11", hazard_category: "Structural Integrity", title: "Temporary stage structural failure", description: "Main stage temporary structure requires engineering certification and monitoring.", likelihood: "Rare", consequence: "Catastrophic", controls: ["Engineering sign-off", "Daily inspections"], spatial_reference: "Main Stage", source_page: 19, source_text: "All temporary structures must have current structural engineering certificates.", confidence: 0.93 },
  { id: "r12", hazard_category: "Emergency Communications", title: "Radio dead zones in underground areas", description: "Radio communications may fail in basement/underground hospitality areas.", likelihood: "Possible", consequence: "Moderate", controls: ["Radio repeaters", "Backup mobile phones"], spatial_reference: "Underground hospitality", source_page: 41, source_text: "Radio coverage survey identified dead spots in below-ground areas.", confidence: 0.79 },
  { id: "r13", hazard_category: "Crowd Management", title: "Uncontrolled crowd movement between stages", description: "Large crowd movements between main and second stages during changeovers create flow hazards.", likelihood: "Likely", consequence: "Moderate", controls: ["Timed changeovers", "Directional signage", "Steward guidance"], spatial_reference: "Inter-stage corridor", source_page: 15, source_text: "Stage changeover times should be staggered by minimum 15 minutes.", confidence: 0.86 },
  { id: "r14", hazard_category: "Fire Safety", title: "Electrical fault in generator compound", description: "Temporary power generators pose fire and electrocution risk.", likelihood: "Unlikely", consequence: "Major", controls: ["PAT testing", "RCD protection", "Restricted access"], spatial_reference: "Generator compound", source_page: 24, source_text: "All temporary electrical installations to be signed off by qualified electrician.", confidence: 0.9 },
  { id: "r15", hazard_category: "Crowd Management", title: "Festival perimeter breach", description: "Inadequate fencing on west boundary may allow unauthorised entry.", likelihood: "Possible", consequence: "Moderate", controls: ["Heras fencing", "Security patrols", "CCTV"], spatial_reference: "West boundary", source_page: 13, source_text: "Perimeter fencing to be minimum 2.4m Heras panels, secured at 3m intervals.", confidence: 0.84 },
  { id: "r16", hazard_category: "Public Order", title: "Ticket fraud and gate-crashing", description: "Risk of counterfeit tickets leading to overcrowding beyond safe capacity.", likelihood: "Possible", consequence: "Moderate", controls: ["Digital ticketing", "ID verification", "Turnstile counters"], spatial_reference: "All entry points", source_page: 33, source_text: "Wristband scanning system to track real-time attendance numbers.", confidence: 0.83 },
  { id: "r17", hazard_category: "Severe Weather", title: "Lightning strike risk during outdoor events", description: "Exposed outdoor areas with metal staging pose lightning strike hazard.", likelihood: "Unlikely", consequence: "Catastrophic", controls: ["Lightning detection", "Show-stop protocol", "Shelter areas"], spatial_reference: "All outdoor stages", source_page: 30, source_text: "If lightning detected within 10km, outdoor stages must cease operations.", confidence: 0.81 },
  { id: "r18", hazard_category: "First Aid", title: "Drug-related medical emergencies", description: "Risk of attendees requiring treatment for adverse reactions to illicit substances.", likelihood: "Likely", consequence: "Moderate", controls: ["Welfare tent", "Drug awareness campaign", "Trained medics"], spatial_reference: null, source_page: 36, source_text: "Welfare services to include drug awareness information and testing referral.", confidence: 0.88 },
  { id: "r19", hazard_category: "Security", title: "Terrorist attack or hostile vehicle", description: "Crowded public event presents potential target for hostile acts.", likelihood: "Rare", consequence: "Catastrophic", controls: ["HVM barriers", "Bag searches", "Counter-terrorism liaison", "CCTV"], spatial_reference: "Main entrance plaza", source_page: 34, source_text: "Hostile vehicle mitigation measures include rated HVM barriers at all vehicle access points.", confidence: 0.91 },
  { id: "r20", hazard_category: "Crowd Management", title: "Accessible viewing platform overcrowding", description: "Wheelchair-accessible viewing areas have limited capacity and may become overcrowded.", likelihood: "Unlikely", consequence: "Moderate", controls: ["Capacity management", "Dedicated steward", "Pre-booking system"], spatial_reference: "Accessible platforms", source_page: 17, source_text: "Accessible viewing area capacity limited to 50 wheelchair users plus companions.", confidence: 0.87 },
  { id: "r21", hazard_category: "Traffic Management", title: "Pedestrian-vehicle conflict on shared access road", description: "Shared use of access road by pedestrians and service vehicles creates collision risk.", likelihood: "Possible", consequence: "Major", controls: ["Time-separated access", "Banksmen"], spatial_reference: "Service road", source_page: 39, source_text: "Service vehicles restricted to 5mph in pedestrian zones.", confidence: 0.82 },
  { id: "r22", hazard_category: "Emergency Communications", title: "Mobile network congestion preventing emergency calls", description: "Large crowd may overwhelm local mobile cell capacity, preventing emergency calls.", likelihood: "Possible", consequence: "Moderate", controls: ["Temporary cell tower", "Event Wi-Fi", "Landline backup"], spatial_reference: null, source_page: 42, source_text: "Temporary cell tower capacity increase requested from network operator.", confidence: 0.77 },
  { id: "r23", hazard_category: "Public Order", title: "Crowd disorder during alcohol-free zone enforcement", description: "Enforcement of alcohol restrictions in family areas may trigger confrontations.", likelihood: "Unlikely", consequence: "Moderate", controls: ["Trained stewards", "Clear signage", "De-escalation training"], spatial_reference: "Family zone", source_page: 33, source_text: "Family zone to be designated alcohol-free with separate entrance.", confidence: 0.83 },
  { id: "r24", hazard_category: "Fire Safety", title: "Blocked emergency vehicle access routes", description: "Improperly parked vehicles may obstruct emergency access lanes.", likelihood: "Possible", consequence: "Major", controls: ["Clear signage", "Tow-away enforcement", "Access route inspections"], spatial_reference: "Emergency lanes", source_page: 25, source_text: "Emergency access routes must maintain 3.7m clear width at all times.", confidence: 0.89 },
];

// -- Helpers --------------------------------------------------------------

function levelToNum(level: string): number {
  const map: Record<string, number> = {
    rare: 1, unlikely: 2, possible: 3, likely: 4, "almost certain": 4,
    negligible: 1, minor: 1, moderate: 2, significant: 3, major: 3,
    severe: 4, catastrophic: 4, low: 1, medium: 2, high: 3, critical: 4,
  };
  return map[level.toLowerCase()] ?? 2;
}

function gapStatusClass(status: string): string {
  switch (status.toLowerCase()) {
    case "covered": return styles.gapCovered;
    case "partial": return styles.gapPartial;
    case "missing": return styles.gapMissing;
    default: return styles.gapPartial;
  }
}

function gapBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case "covered": return styles.gapStatusCovered;
    case "partial": return styles.gapStatusPartial;
    case "missing": return styles.gapStatusMissing;
    default: return styles.gapStatusPartial;
  }
}

// -- Page Component ------------------------------------------------------

export default function DocumentIntelligence() {
  const { activeEvent } = useEvent();
  const [documents, setDocuments] = useState<{ id: string; title: string; filename: string }[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("galway");
  const [uploading, setUploading] = useState(false);

  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [risks, setRisks] = useState<ExtractedRisk[]>([]);
  const [gaps, setGaps] = useState<GapAnalysisItem[]>([]);
  const [overallScore, setOverallScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [backendOnline, setBackendOnline] = useState(true);

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/documents/`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Fetch all three endpoints — they return nested structures from the backend
        const [summaryRaw, risksRaw, gapsRaw] = await Promise.all([
          fetch(`${API_BASE}/api/documents/${selectedDocId}/summary`).then((r) => r.ok ? r.json() : null),
          fetch(`${API_BASE}/api/documents/${selectedDocId}/risks`).then((r) => r.ok ? r.json() : null),
          fetch(`${API_BASE}/api/documents/${selectedDocId}/gaps`).then((r) => r.ok ? r.json() : null),
        ]);

        if (!summaryRaw || !risksRaw || !gapsRaw) throw new Error("Backend returned null");

        // Transform summary: backend nests under document/risk_register/gap_analysis
        const doc = summaryRaw.document || {};
        const reg = summaryRaw.risk_register || {};
        const gaSum = summaryRaw.gap_analysis || {};
        const transformedSummary: DocumentSummary = {
          document_name: doc.title || doc.filename || "Galway Event Plan",
          total_pages: doc.total_pages || 0,
          total_risks: reg.total_risks || 0,
          extraction_mode: risksRaw.risks?.[0]?.extraction_mode || "rule_based",
          hazard_distribution: reg.by_category || {},
          risk_levels: {},
          gap_analysis: {
            overall_score: (gaSum.completeness_score || 0) / 100, // backend returns 0-100
            gaps: [],
          },
        };
        setSummary(transformedSummary);

        // Transform risks — backend returns { risks: [...] }
        const rawRisks = risksRaw.risks || [];
        setRisks(rawRisks);

        // Transform gaps — backend nests under gap_analysis.category_details
        const gapAnalysis = gapsRaw.gap_analysis || {};
        const categoryDetails = gapAnalysis.category_details || [];
        const transformedGaps: GapAnalysisItem[] = categoryDetails.map(
          (cat: Record<string, unknown>) => ({
            category: (cat.display_name as string) || (cat.category as string) || "Unknown",
            status: ((cat.status as string) || "partial").replace("well_covered", "covered"),
            coverage_score: ((cat.coverage_ratio as number) || 0) / 100,
            recommendations: (cat.recommendations as string[]) || [],
            risk_count: (cat.risk_count as number) || 0,
          })
        );
        setGaps(transformedGaps);
        setOverallScore((gapAnalysis.completeness_score || 0) / 100);
        setBackendOnline(true);
      } catch {
        // Backend not ready — use fallback data
        setBackendOnline(false);
        setSummary(FALLBACK_SUMMARY);
        setRisks(FALLBACK_RISKS);
        setGaps(FALLBACK_SUMMARY.gap_analysis.gaps);
        setOverallScore(FALLBACK_SUMMARY.gap_analysis.overall_score);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedDocId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/api/documents/upload`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        await fetchDocuments();
        setSelectedDocId(data.document_id);
      } else {
        alert("Upload failed. Make sure the backend is running.");
      }
    } catch (error) {
      console.error("Upload failed", error);
      alert("Upload failed. Make sure the backend is running.");
    } finally {
      setUploading(false);
      if (e.target) {
        e.target.value = "";
      }
    }
  };

  // Computed stats
  const highCriticalCount = risks.filter((r) => {
    const score = levelToNum(r.likelihood) * levelToNum(r.consequence);
    return score >= 8;
  }).length;

  const completenessPercent = Math.round(overallScore * 100);

  const scoreColorClass =
    completenessPercent >= 70
      ? styles.scoreGreen
      : completenessPercent >= 40
        ? styles.scoreYellow
        : styles.scoreRed;

  if (loading) {
    return (
      <div className="app-shell">
        <Sidebar />
        <Header
          title="Document Intelligence"
          subtitle={`AI-Powered Risk Document Analysis — ${activeEvent.name}`}
        />
        <main className="app-main">
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner} />
            <span className={styles.loadingText}>
              Analyzing document with AI extraction engine…
            </span>
          </div>
        </main>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="app-shell">
        <Sidebar />
        <Header
          title="Document Intelligence"
          subtitle={`AI-Powered Risk Document Analysis — ${activeEvent.name}`}
        />
        <main className="app-main">
          <div className={styles.fallback}>
            <div className={styles.fallbackIcon}>📄</div>
            <h2 className={styles.fallbackTitle}>No Document Loaded</h2>
            <p className={styles.fallbackText}>
              Upload an event safety plan or risk assessment document to begin AI-powered analysis.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const stats = [
    {
      icon: "📊",
      label: "Total Risks Extracted",
      value: risks.length.toString(),
      detail: `from ${summary.total_pages} pages`,
      color: "var(--color-accent)",
    },
    {
      icon: "✅",
      label: "Document Completeness",
      value: `${completenessPercent}%`,
      detail: `${gaps.filter((g) => g.status === "covered").length} of ${gaps.length} categories covered`,
      color:
        completenessPercent >= 70
          ? "var(--color-nominal)"
          : completenessPercent >= 40
            ? "var(--color-elevated)"
            : "var(--color-critical)",
    },
    {
      icon: "⚠️",
      label: "High / Critical Risks",
      value: highCriticalCount.toString(),
      detail: "requiring immediate attention",
      color: "var(--color-high)",
    },
    {
      icon: "🤖",
      label: "Extraction Mode",
      value: summary.extraction_mode,
      detail: `${risks.length} risks with avg ${Math.round(risks.reduce((s, r) => s + r.confidence, 0) / risks.length * 100)}% confidence`,
      color: "var(--color-data-2)",
    },
  ];

  return (
    <div className="app-shell">
      <Sidebar />
      <Header
        title="Document Intelligence"
        subtitle={`AI-Powered Risk Document Analysis — ${activeEvent.name}`}
      />
      <main className="app-main">
        {/* Offline banner */}
        {!backendOnline && (
          <div className={styles.connectionBanner}>
            <span>⚠ Backend offline — showing demo data.</span>
            <code>cd backend && python3 -m uvicorn src.api.main:app --port 8000</code>
          </div>
        )}

        {/* Document header */}
        <div className={styles.docHeader}>
          <div>
            <h2 className={styles.docName}>{summary.document_name}</h2>
            <span className={styles.docMeta}>
              {summary.total_pages} pages analyzed · {risks.length} risks identified
            </span>
          </div>
          <div className={styles.docControls}>
            {documents.length > 0 && (
              <select
                className={styles.docSelect}
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
              >
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title}
                  </option>
                ))}
              </select>
            )}
            <label className={styles.uploadButton}>
              {uploading ? (
                <>
                  <div className={styles.uploadingSpinner} />
                  Uploading...
                </>
              ) : (
                <>
                  <span>Upload PDF</span>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    disabled={uploading || !backendOnline}
                  />
                </>
              )}
            </label>
            <span className={styles.aiBadge}>
              <span className={styles.aiBadgePulse} />
              Document Intelligence Engine
            </span>
          </div>
        </div>

        {/* Summary stat cards */}
        <div className={styles.statsRow}>
          {stats.map((stat) => (
            <div key={stat.label} className="panel">
              <div className="stat-card">
                <span className={styles.statIcon}>{stat.icon}</span>
                <span className="stat-card__label">{stat.label}</span>
                <span className="stat-card__value" style={{ color: stat.color }}>
                  {stat.value}
                </span>
                <span className="stat-card__delta">{stat.detail}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Main content: Risk Register (left) + Analysis Panels (right) */}
        <div className={styles.contentGrid}>
          {/* Left — Risk Register */}
          <div className={`panel ${styles.registerPanel}`}>
            <div className="panel__header">
              <h2 className="panel__title">Risk Register</h2>
              <span className="risk-badge risk-badge--high">
                {highCriticalCount} high/critical
              </span>
            </div>
            <RiskRegister risks={risks} />
          </div>

          {/* Right — Analysis Stack */}
          <div className={styles.analysisStack}>
            {/* Hazard Coverage */}
            <div className="panel">
              <div className="panel__header">
                <h2 className="panel__title">Hazard Coverage Map</h2>
              </div>
              <HazardCoverage
                gaps={gaps}
                hazardDistribution={summary.hazard_distribution}
              />
            </div>

            {/* Risk Matrix */}
            <div className="panel">
              <div className="panel__header">
                <h2 className="panel__title">Risk Matrix</h2>
              </div>
              <RiskMatrix risks={risks} />
            </div>

            {/* Gap Analysis */}
            <div className="panel">
              <div className="panel__header">
                <h2 className="panel__title">Gap Analysis</h2>
                <div className={`${styles.scoreCircle} ${scoreColorClass}`}>
                  {completenessPercent}
                </div>
              </div>
              <div className={styles.scoreLabel}>Overall Completeness Score</div>
              <div className={styles.gapList}>
                {gaps
                  .filter((g) => g.recommendations.length > 0)
                  .map((gap) => (
                    <div
                      key={gap.category}
                      className={`${styles.gapItem} ${gapStatusClass(gap.status)}`}
                    >
                      <div className={styles.gapHeader}>
                        <span className={styles.gapCategory}>{gap.category}</span>
                        <span className={`${styles.gapStatus} ${gapBadgeClass(gap.status)}`}>
                          {gap.status}
                        </span>
                      </div>
                      <ul className={styles.recommendationsList}>
                        {gap.recommendations.map((rec, i) => (
                          <li key={i} className={styles.recommendationItem}>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
