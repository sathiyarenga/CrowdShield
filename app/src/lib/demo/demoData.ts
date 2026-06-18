/**
 * demoData.ts — Bundled demo data for offline / demo mode.
 *
 * When NEXT_PUBLIC_DEMO_MODE=true, the API client returns this data
 * instead of making network calls. This makes the entire app work
 * without a backend — perfect for demos, trade shows, and offline use.
 *
 * Data sources:
 * - Galway risk/gap data: extracted from the uploaded Event Safety Plan PDF
 * - Ullevål crowd data: representative subset from Telia Crowd Insights CSV
 * - Benchmark data: pre-computed from 5 events at Ullevål Stadion
 * - Stakeholder data: illustrative coverage matrix
 */

import type {
  HealthResponse,
  UllevaalSummaryResponse,
  EventsResponse,
  AnomalyResponse,
  BreakdownResponse,
  FredrikstadAreasResponse,
  GeoJSONResponse,
  DocumentSummary,
  ExtractedRisk,
  GapAnalysisItem,
  CompositeRiskResponse,
  StakeholderMatrixResponse,
  ActionsResponse,
  CoverageSummaryResponse,
  VenueDetailResponse,
} from "@/lib/api/client";

// ═══════════════════════════════════════════════════════════════════════════
// Health
// ═══════════════════════════════════════════════════════════════════════════

export const demoHealth: HealthResponse = {
  status: "ok",
  data_loaded: true,
  datasets: {
    telcofy_summary: 1440,
    ullevaal_fingerprints: 5,
    fredrikstad_areas: 50,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Ullevål Telemetry — representative time-series for Sep 9 2025
// ═══════════════════════════════════════════════════════════════════════════

function generateUllevaalSummary(date: string): UllevaalSummaryResponse {
  // Generate realistic 5-min interval crowd data for a match day
  const data: { timestamp: string; people: number; area_name: string }[] = [];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  for (const h of hours) {
    for (const m of [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]) {
      const t = `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
      let people: number;

      if (date === "2025-09-09") {
        // Major match day — peak at 20:00
        if (h < 6) people = 2800 + Math.floor(Math.random() * 400);
        else if (h < 14) people = 3000 + Math.floor(Math.random() * 600);
        else if (h < 17) people = 4000 + Math.floor((h - 14) * 2500 + Math.random() * 800);
        else if (h < 19) people = 12000 + Math.floor((h - 17) * 6000 + Math.random() * 2000);
        else if (h === 19) people = 22000 + Math.floor(m * 130 + Math.random() * 1500);
        else if (h === 20 && m <= 15) people = 28000 + Math.floor(Math.random() * 1800);
        else if (h === 20) people = 26000 - Math.floor((m - 15) * 200 + Math.random() * 1000);
        else if (h === 21) people = 18000 - Math.floor(m * 150 + Math.random() * 800);
        else if (h === 22) people = 8000 - Math.floor(m * 80 + Math.random() * 500);
        else people = 3200 + Math.floor(Math.random() * 600);
      } else if (date === "2025-09-04") {
        // Moderate match day
        if (h < 8) people = 2900 + Math.floor(Math.random() * 300);
        else if (h < 15) people = 3500 + Math.floor(Math.random() * 700);
        else if (h < 17) people = 8000 + Math.floor((h - 15) * 4000 + Math.random() * 1000);
        else if (h === 17) people = 18000 + Math.floor(Math.random() * 2000);
        else if (h === 18) people = 15000 - Math.floor(m * 100 + Math.random() * 800);
        else people = 3200 + Math.floor(Math.random() * 500);
      } else {
        // Non-event day
        if (h < 6) people = 2800 + Math.floor(Math.random() * 300);
        else if (h < 10) people = 3200 + Math.floor(Math.random() * 500);
        else if (h < 18) people = 3500 + Math.floor(Math.random() * 600);
        else people = 3000 + Math.floor(Math.random() * 400);
      }

      data.push({ timestamp: t, people: Math.max(0, people), area_name: "Ullevaal_Stadion_area" });
    }
  }

  return {
    total_records: data.length,
    dates_available: ["2025-09-03", "2025-09-04", "2025-09-09", "2025-10-11", "2025-10-12"],
    data,
  };
}

export const demoEvents: EventsResponse = {
  event_detection: [
    { date: "2025-09-03", max_people: 5660, sigma_above_baseline: 1.93, is_event: false },
    { date: "2025-09-04", max_people: 19938, sigma_above_baseline: 19.85, is_event: true },
    { date: "2025-09-09", max_people: 29811, sigma_above_baseline: 375.01, is_event: true },
    { date: "2025-10-11", max_people: 22922, sigma_above_baseline: 23.7, is_event: true },
    { date: "2025-10-12", max_people: 3869, sigma_above_baseline: -0.42, is_event: false },
  ],
  fingerprints: [
    {
      event_date: "2025-09-03", is_event_day: false, peak_count: 5660, peak_time: "10:50",
      baseline_floor: 2973, sigma_above_baseline: 1.93, ingress_onset: "", ingress_duration_minutes: 0,
      egress_onset: "", egress_duration_minutes: 0, clearance_time_minutes: 0,
      total_person_hours: 26891, observation_count: 288, amplitude: 2687, amplitude_ratio: 1.9,
    },
    {
      event_date: "2025-09-04", is_event_day: true, peak_count: 19938, peak_time: "16:55",
      baseline_floor: 2942, sigma_above_baseline: 19.85, ingress_onset: "14:00", ingress_duration_minutes: 130,
      egress_onset: "17:30", egress_duration_minutes: 55, clearance_time_minutes: 80,
      total_person_hours: 132987, observation_count: 288, amplitude: 16996, amplitude_ratio: 6.78,
    },
    {
      event_date: "2025-09-09", is_event_day: true, peak_count: 29811, peak_time: "20:00",
      baseline_floor: 3064, sigma_above_baseline: 375.01, ingress_onset: "16:30", ingress_duration_minutes: 205,
      egress_onset: "21:00", egress_duration_minutes: 85, clearance_time_minutes: 130,
      total_person_hours: 194515, observation_count: 288, amplitude: 26747, amplitude_ratio: 9.73,
    },
    {
      event_date: "2025-10-11", is_event_day: true, peak_count: 22922, peak_time: "17:10",
      baseline_floor: 3150, sigma_above_baseline: 23.7, ingress_onset: "14:30", ingress_duration_minutes: 160,
      egress_onset: "18:00", egress_duration_minutes: 65, clearance_time_minutes: 95,
      total_person_hours: 149876, observation_count: 288, amplitude: 19772, amplitude_ratio: 7.28,
    },
    {
      event_date: "2025-10-12", is_event_day: false, peak_count: 3869, peak_time: "14:20",
      baseline_floor: 3100, sigma_above_baseline: -0.42, ingress_onset: "", ingress_duration_minutes: 0,
      egress_onset: "", egress_duration_minutes: 0, clearance_time_minutes: 0,
      total_person_hours: 21450, observation_count: 288, amplitude: 769, amplitude_ratio: 1.25,
    },
  ],
};

function generateAnomalies(date: string): AnomalyResponse {
  const data: AnomalyResponse["data"] = [];
  const summary: Record<string, number> = { normal: 0, elevated: 0, high: 0, critical: 0 };

  const summaryData = generateUllevaalSummary(date);
  for (const rec of summaryData.data) {
    const hour = new Date(rec.timestamp).getUTCHours();
    const baselineMean = 3100;
    const baselineStd = 400;
    const zScore = (rec.people - baselineMean) / baselineStd;
    let severity: string;
    if (zScore > 30) severity = "critical";
    else if (zScore > 10) severity = "high";
    else if (zScore > 3) severity = "elevated";
    else severity = "normal";
    summary[severity] = (summary[severity] || 0) + 1;
    data.push({
      timestamp: rec.timestamp,
      people: rec.people,
      hour,
      baseline_mean: baselineMean,
      baseline_std: baselineStd,
      z_score: Math.round(zScore * 100) / 100,
      severity,
    });
  }
  return { total_records: data.length, severity_summary: summary, data };
}

export const demoBreakdown: BreakdownResponse = {
  date: "2025-09-09",
  countries: [
    { country: "Norway", total_people: 18500, observation_count: 288 },
    { country: "Sweden", total_people: 3200, observation_count: 288 },
    { country: "Denmark", total_people: 1800, observation_count: 288 },
    { country: "United Kingdom", total_people: 1200, observation_count: 288 },
    { country: "Germany", total_people: 950, observation_count: 288 },
    { country: "Finland", total_people: 720, observation_count: 288 },
    { country: "Poland", total_people: 580, observation_count: 288 },
    { country: "Netherlands", total_people: 420, observation_count: 288 },
    { country: "Spain", total_people: 350, observation_count: 288 },
    { country: "France", total_people: 310, observation_count: 288 },
  ],
  timeseries_count: 0,
  timeseries: [],
};

// ═══════════════════════════════════════════════════════════════════════════
// Fredrikstad Analytics
// ═══════════════════════════════════════════════════════════════════════════

export const demoFredrikstadAreas: FredrikstadAreasResponse = {
  total_areas: 12,
  returned: 12,
  data: [
    { area_name: "Fredrikstad sentrum", area_code: "FR001", admin_level_2: "Fredrikstad", daily_max_people: 8420, daily_avg_people: 3150, hourly_max_people: 2800, hourly_avg_people: 890, days_observed: 30 },
    { area_name: "Gamlebyen", area_code: "FR002", admin_level_2: "Fredrikstad", daily_max_people: 6210, daily_avg_people: 2300, hourly_max_people: 2100, hourly_avg_people: 650, days_observed: 30 },
    { area_name: "Kråkerøy", area_code: "FR003", admin_level_2: "Fredrikstad", daily_max_people: 4850, daily_avg_people: 1800, hourly_max_people: 1650, hourly_avg_people: 520, days_observed: 30 },
    { area_name: "Gressvik", area_code: "FR004", admin_level_2: "Fredrikstad", daily_max_people: 3900, daily_avg_people: 1450, hourly_max_people: 1300, hourly_avg_people: 410, days_observed: 30 },
    { area_name: "Lisleby", area_code: "FR005", admin_level_2: "Fredrikstad", daily_max_people: 3200, daily_avg_people: 1200, hourly_max_people: 1100, hourly_avg_people: 340, days_observed: 30 },
    { area_name: "Sellebakk", area_code: "FR006", admin_level_2: "Fredrikstad", daily_max_people: 2800, daily_avg_people: 1050, hourly_max_people: 950, hourly_avg_people: 300, days_observed: 30 },
    { area_name: "Trosvik", area_code: "FR007", admin_level_2: "Fredrikstad", daily_max_people: 2400, daily_avg_people: 900, hourly_max_people: 820, hourly_avg_people: 260, days_observed: 30 },
    { area_name: "Borge", area_code: "FR008", admin_level_2: "Fredrikstad", daily_max_people: 2100, daily_avg_people: 780, hourly_max_people: 700, hourly_avg_people: 220, days_observed: 30 },
    { area_name: "Rolvsøy", area_code: "FR009", admin_level_2: "Fredrikstad", daily_max_people: 1850, daily_avg_people: 690, hourly_max_people: 620, hourly_avg_people: 200, days_observed: 30 },
    { area_name: "Onsøy", area_code: "FR010", admin_level_2: "Fredrikstad", daily_max_people: 1600, daily_avg_people: 600, hourly_max_people: 540, hourly_avg_people: 170, days_observed: 30 },
    { area_name: "Begby", area_code: "FR011", admin_level_2: "Fredrikstad", daily_max_people: 1350, daily_avg_people: 500, hourly_max_people: 450, hourly_avg_people: 140, days_observed: 30 },
    { area_name: "Ambjørnrød", area_code: "FR012", admin_level_2: "Fredrikstad", daily_max_people: 1100, daily_avg_people: 410, hourly_max_people: 370, hourly_avg_people: 120, days_observed: 30 },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// Document Intelligence — Galway
// ═══════════════════════════════════════════════════════════════════════════

export const demoDocSummary: DocumentSummary = {
  document_name: "Galway International Arts Festival — Event Safety Plan",
  total_pages: 47,
  total_risks: 24,
  extraction_mode: "pdf_text",
  hazard_distribution: {
    crowd_crush: 5, fire: 3, security: 4, medical: 3,
    weather: 2, infrastructure: 3, transport: 2, communication: 2,
  },
  risk_levels: { low: 4, medium: 8, high: 9, critical: 3 },
  gap_analysis: {
    overall_score: 0.72,
    gaps: [
      { category: "crowd_management", status: "covered", coverage_score: 0.85, recommendations: ["Add specific density thresholds for narrow streets"], risk_count: 5 },
      { category: "fire_safety", status: "covered", coverage_score: 0.78, recommendations: ["Include fire marshal positions along parade route"], risk_count: 3 },
      { category: "medical", status: "covered", coverage_score: 0.82, recommendations: ["Specify ambulance staging locations"], risk_count: 3 },
      { category: "security", status: "covered", coverage_score: 0.75, recommendations: ["Add counter-terrorism measures for crowded spaces"], risk_count: 4 },
      { category: "weather", status: "partial", coverage_score: 0.55, recommendations: ["Develop wet-weather crowd management plan", "Specify wind-speed thresholds for large structures"], risk_count: 2 },
      { category: "infrastructure", status: "partial", coverage_score: 0.60, recommendations: ["Map all power supply points", "Identify backup generator locations"], risk_count: 3 },
      { category: "communication", status: "partial", coverage_score: 0.50, recommendations: ["Define multi-agency radio channels", "Establish social media monitoring protocol"], risk_count: 2 },
      { category: "transport", status: "covered", coverage_score: 0.70, recommendations: ["Coordinate with Bus Éireann for diversions"], risk_count: 2 },
    ],
  },
};

export const demoDocRisks: ExtractedRisk[] = [
  { id: "r1", hazard_category: "crowd_crush", title: "Overcrowding at main viewing point", description: "Risk of dangerous crowding at Shop Street junction where parade turns", likelihood: "4", consequence: "5", controls: ["Deploy crowd monitors", "Install barriers"], spatial_reference: "Shop Street junction", source_page: 12, source_text: "Crowd density risk at Shop Street", confidence: 0.92 },
  { id: "r2", hazard_category: "crowd_crush", title: "Bottleneck at east entrance", description: "Narrow entrance creates pinch point during peak ingress", likelihood: "4", consequence: "4", controls: ["Widen entrance", "Deploy stewards"], spatial_reference: "Eyre Square east", source_page: 14, source_text: "Bottleneck formation risk", confidence: 0.88 },
  { id: "r3", hazard_category: "fire", title: "Fire risk in food vendor area", description: "Concentrated cooking equipment in confined area", likelihood: "3", consequence: "4", controls: ["Fire extinguishers at each stall", "Fire marshal patrols"], spatial_reference: "Spanish Arch food area", source_page: 18, source_text: "Fire hazard from catering", confidence: 0.90 },
  { id: "r4", hazard_category: "security", title: "Hostile vehicle threat", description: "Open pedestrian areas vulnerable to vehicle intrusion", likelihood: "2", consequence: "5", controls: ["HVM barriers", "Road closures", "Police patrols"], spatial_reference: "Parade route access points", source_page: 22, source_text: "Vehicle-as-weapon threat", confidence: 0.85 },
  { id: "r5", hazard_category: "medical", title: "Heat-related illness", description: "Extended outdoor exposure during summer event", likelihood: "3", consequence: "3", controls: ["First aid stations", "Water distribution points"], spatial_reference: "All zones", source_page: 26, source_text: "Heat exposure risk", confidence: 0.87 },
  { id: "r6", hazard_category: "crowd_crush", title: "Surge risk at parade climax", description: "Crowd surge when main float passes narrow street section", likelihood: "4", consequence: "5", controls: ["Phased crowd release", "Barrier management"], spatial_reference: "Quay Street", source_page: 13, source_text: "Crowd surge during parade", confidence: 0.91 },
  { id: "r7", hazard_category: "weather", title: "High wind affecting structures", description: "Temporary structures vulnerable to gusts off Galway Bay", likelihood: "3", consequence: "4", controls: ["Wind monitoring", "Structure tie-downs", "Evacuation trigger at 50km/h"], spatial_reference: "Salthill Promenade", source_page: 30, source_text: "Wind damage to marquees", confidence: 0.82 },
  { id: "r8", hazard_category: "infrastructure", title: "Power failure to PA system", description: "Loss of public address during emergency", likelihood: "2", consequence: "5", controls: ["Backup generators", "Battery-powered megaphones"], spatial_reference: "Control room", source_page: 32, source_text: "PA system power supply", confidence: 0.79 },
  { id: "r9", hazard_category: "security", title: "Anti-social behaviour", description: "Alcohol-fuelled incidents in evening hours", likelihood: "4", consequence: "3", controls: ["Security patrols", "CCTV monitoring", "Gardaí presence"], spatial_reference: "Quay Street bars", source_page: 24, source_text: "Public disorder", confidence: 0.86 },
  { id: "r10", hazard_category: "medical", title: "Crush injury at barriers", description: "Spectators pressed against crowd barriers", likelihood: "3", consequence: "4", controls: ["Barrier design spec", "Crowd pressure monitoring"], spatial_reference: "Front-of-parade barriers", source_page: 27, source_text: "Barrier crush injury", confidence: 0.84 },
  { id: "r11", hazard_category: "transport", title: "Emergency vehicle access blocked", description: "Road closures may prevent ambulance access", likelihood: "3", consequence: "5", controls: ["Emergency corridors", "Traffic management plan"], spatial_reference: "Route access points", source_page: 35, source_text: "Emergency access obstruction", confidence: 0.89 },
  { id: "r12", hazard_category: "fire", title: "Pyrotechnic incident", description: "Fireworks/special effects malfunction during show", likelihood: "2", consequence: "4", controls: ["Licensed operators", "Safety exclusion zone", "Fire crew on standby"], spatial_reference: "Claddagh Basin", source_page: 19, source_text: "Pyrotechnic safety", confidence: 0.83 },
];

// ═══════════════════════════════════════════════════════════════════════════
// Risk Intelligence — Composite Scores
// ═══════════════════════════════════════════════════════════════════════════

export const demoCompositeRisk: CompositeRiskResponse = {
  date: "2025-09-09",
  composite_score: 72,
  composite_level: "high",
  components: [
    { name: "Document Risk", score: 68, weight: 0.3, level: "elevated", description: "Risk assessment based on safety document coverage and identified hazards" },
    { name: "Historical Anomaly", score: 85, weight: 0.4, level: "high", description: "Anomaly severity from historical crowd density patterns at 32.4σ above baseline" },
    { name: "Density Prediction", score: 62, weight: 0.3, level: "elevated", description: "Predicted crowd density based on event type, venue capacity, and historical patterns" },
  ],
  timeline: [
    { time: "08:00", composite_score: 15, document_risk: 68, historical_anomaly: 5, density_prediction: 10 },
    { time: "10:00", composite_score: 22, document_risk: 68, historical_anomaly: 12, density_prediction: 18 },
    { time: "12:00", composite_score: 30, document_risk: 68, historical_anomaly: 18, density_prediction: 25 },
    { time: "14:00", composite_score: 42, document_risk: 68, historical_anomaly: 30, density_prediction: 35 },
    { time: "15:00", composite_score: 48, document_risk: 68, historical_anomaly: 38, density_prediction: 42 },
    { time: "16:00", composite_score: 55, document_risk: 68, historical_anomaly: 48, density_prediction: 50 },
    { time: "17:00", composite_score: 65, document_risk: 68, historical_anomaly: 62, density_prediction: 58 },
    { time: "18:00", composite_score: 72, document_risk: 68, historical_anomaly: 75, density_prediction: 65 },
    { time: "19:00", composite_score: 80, document_risk: 68, historical_anomaly: 88, density_prediction: 78 },
    { time: "20:00", composite_score: 85, document_risk: 68, historical_anomaly: 95, density_prediction: 82 },
    { time: "21:00", composite_score: 65, document_risk: 68, historical_anomaly: 60, density_prediction: 55 },
    { time: "22:00", composite_score: 40, document_risk: 68, historical_anomaly: 25, density_prediction: 30 },
    { time: "23:00", composite_score: 25, document_risk: 68, historical_anomaly: 10, density_prediction: 15 },
  ],
  hazard_breakdown: [
    { category: "Crowd Crush", risk_score: 88, risk_count: 5, level: "critical" },
    { category: "Security Threat", risk_score: 70, risk_count: 4, level: "high" },
    { category: "Fire", risk_score: 65, risk_count: 3, level: "elevated" },
    { category: "Medical", risk_score: 60, risk_count: 3, level: "elevated" },
    { category: "Weather", risk_score: 55, risk_count: 2, level: "elevated" },
    { category: "Infrastructure", risk_score: 50, risk_count: 3, level: "moderate" },
    { category: "Transport", risk_score: 45, risk_count: 2, level: "moderate" },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// Stakeholder Intelligence
// ═══════════════════════════════════════════════════════════════════════════

export const demoStakeholderMatrix: StakeholderMatrixResponse = {
  event: "Galway International Arts Festival 2026",
  categories: [
    { id: "crowd_management", label: "Crowd Management" },
    { id: "fire_safety", label: "Fire Safety" },
    { id: "medical", label: "Medical" },
    { id: "security", label: "Security" },
    { id: "weather", label: "Weather" },
    { id: "infrastructure", label: "Infrastructure" },
    { id: "communication", label: "Communication" },
    { id: "transport", label: "Transport" },
  ],
  stakeholders: [
    { id: "s1", name: "GIAF Safety Team", role: "Event Organiser", icon: "🎪", expected_document: "Event Safety Plan", document_status: "submitted" },
    { id: "s2", name: "An Garda Síochána", role: "Police", icon: "🚔", expected_document: "Policing Plan", document_status: "pending" },
    { id: "s3", name: "Galway Fire Brigade", role: "Fire Service", icon: "🚒", expected_document: "Fire Safety Plan", document_status: "pending" },
    { id: "s4", name: "HSE Ambulance", role: "Medical", icon: "🚑", expected_document: "Medical Plan", document_status: "not_requested" },
    { id: "s5", name: "Galway City Council", role: "Local Authority", icon: "🏛️", expected_document: "Road Closure Order", document_status: "pending" },
  ],
  matrix: {
    s1: {
      crowd_management: { status: "covered", risk_count: 5, avg_score: 7.2, top_risk: "Overcrowding at main viewing point", top_score: 9 },
      fire_safety: { status: "covered", risk_count: 3, avg_score: 5.8, top_risk: "Fire risk in food vendor area", top_score: 7 },
      medical: { status: "covered", risk_count: 3, avg_score: 5.5, top_risk: "Heat-related illness", top_score: 6 },
      security: { status: "covered", risk_count: 4, avg_score: 6.1, top_risk: "Hostile vehicle threat", top_score: 8 },
      weather: { status: "covered", risk_count: 2, avg_score: 5.0, top_risk: "High wind affecting structures", top_score: 6 },
      infrastructure: { status: "covered", risk_count: 3, avg_score: 4.5, top_risk: "Power failure to PA system", top_score: 6 },
      communication: { status: "gap" },
      transport: { status: "covered", risk_count: 2, avg_score: 5.8, top_risk: "Emergency vehicle access blocked", top_score: 7 },
    },
    s2: { crowd_management: { status: "no_document" }, fire_safety: { status: "no_document" }, medical: { status: "no_document" }, security: { status: "no_document" }, weather: { status: "no_document" }, infrastructure: { status: "no_document" }, communication: { status: "no_document" }, transport: { status: "no_document" } },
    s3: { crowd_management: { status: "no_document" }, fire_safety: { status: "no_document" }, medical: { status: "no_document" }, security: { status: "no_document" }, weather: { status: "no_document" }, infrastructure: { status: "no_document" }, communication: { status: "no_document" }, transport: { status: "no_document" } },
    s4: { crowd_management: { status: "no_document" }, fire_safety: { status: "no_document" }, medical: { status: "no_document" }, security: { status: "no_document" }, weather: { status: "no_document" }, infrastructure: { status: "no_document" }, communication: { status: "no_document" }, transport: { status: "no_document" } },
    s5: { crowd_management: { status: "no_document" }, fire_safety: { status: "no_document" }, medical: { status: "no_document" }, security: { status: "no_document" }, weather: { status: "no_document" }, infrastructure: { status: "no_document" }, communication: { status: "no_document" }, transport: { status: "no_document" } },
  },
  alignment_summary: { status: "insufficient_data", message: "Only 1 of 5 expected documents submitted — cross-validation not yet possible" },
  coverage_gaps: [
    { category: "communication", label: "Communication", risk_count: 2, severity: "critical" },
    { category: "weather", label: "Weather", risk_count: 2, severity: "weak" },
  ],
  system_insights: [
    { type: "gap", priority: "high", message: "Communication category has no risk coverage from any stakeholder document" },
    { type: "pending", priority: "high", message: "3 stakeholder documents are pending — request submission to enable cross-validation" },
    { type: "coverage", priority: "medium", message: "GIAF Safety Team covers 7 of 8 categories — strong single-document coverage" },
    { type: "info", priority: "info", message: "24 risks extracted from Event Safety Plan — average confidence 0.86" },
  ],
};

export const demoActions: ActionsResponse = {
  event: "Galway International Arts Festival 2026",
  total_actions: 6,
  actions: [
    { number: 1, title: "Request Policing Plan from An Garda Síochána", description: "Critical for security and crowd management cross-validation", priority: "critical", category: "security", current_risk_count: 4, relevant_stakeholder: "An Garda Síochána" },
    { number: 2, title: "Request Fire Safety Plan from Galway Fire Brigade", description: "Needed to validate fire risk mitigations and evacuation routes", priority: "high", category: "fire_safety", current_risk_count: 3, relevant_stakeholder: "Galway Fire Brigade" },
    { number: 3, title: "Develop Communication Plan", description: "No coverage of communication risks — critical gap in multi-agency coordination", priority: "critical", category: "communication", current_risk_count: 0, relevant_stakeholder: null },
    { number: 4, title: "Request Medical Plan from HSE", description: "Medical response capacity verification required", priority: "high", category: "medical", current_risk_count: 3, relevant_stakeholder: "HSE Ambulance" },
    { number: 5, title: "Obtain Road Closure Order from City Council", description: "Transport and access management validation", priority: "medium", category: "transport", current_risk_count: 2, relevant_stakeholder: "Galway City Council" },
    { number: 6, title: "Strengthen weather contingency", description: "Current weather risk coverage scored at 55% — below threshold", priority: "medium", category: "weather", current_risk_count: 2, relevant_stakeholder: null },
  ],
};

export const demoCoverageSummary: CoverageSummaryResponse = {
  event: "Galway International Arts Festival 2026",
  documents_submitted: 1,
  documents_expected: 5,
  categories_covered: 7,
  categories_fully_covered: 4,
  categories_total: 8,
  categories_weak: 3,
  categories_empty: 1,
  pending_stakeholders: 3,
  cross_validation_ready: false,
  total_risks_extracted: 24,
  scored_risks: 24,
  average_risk_score: 6.1,
};

// ═══════════════════════════════════════════════════════════════════════════
// Venue Detail — Galway
// ═══════════════════════════════════════════════════════════════════════════

export const demoGalwayVenueDetail: VenueDetailResponse = {
  id: "galway",
  name: "Galway International Arts Festival",
  city: "Galway",
  country: "Ireland",
  center: [-9.0489, 53.2719],
  zoom: 15,
  pitch: 45,
  bearing: -17.6,
  has_telemetry: false,
  event_dates: [],
  zones: { type: "FeatureCollection", features: [] },
};

// ═══════════════════════════════════════════════════════════════════════════
// Empty GeoJSON (for endpoints that return features)
// ═══════════════════════════════════════════════════════════════════════════

export const emptyGeoJSON: GeoJSONResponse = {
  type: "FeatureCollection",
  features: [],
};

// ═══════════════════════════════════════════════════════════════════════════
// Path → Data Resolver
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve a request path to the appropriate demo data.
 * Returns undefined if no demo data is available for the path.
 */
export function resolveDemoData(path: string, params?: Record<string, string>): unknown | undefined {
  // Health
  if (path === "/api/health") return demoHealth;

  // Ullevaal telemetry
  if (path === "/api/analytics/ullevaal/summary") {
    return generateUllevaalSummary(params?.date ?? "2025-09-09");
  }
  if (path === "/api/analytics/ullevaal/events") return demoEvents;
  if (path === "/api/analytics/ullevaal/anomalies") {
    return generateAnomalies(params?.date ?? "2025-09-09");
  }
  if (path.startsWith("/api/analytics/ullevaal/breakdown/")) return demoBreakdown;

  // Fredrikstad
  if (path.startsWith("/api/analytics/fredrikstad/areas")) return demoFredrikstadAreas;

  // Zones
  if (path === "/api/analytics/zones") return emptyGeoJSON;

  // Documents
  if (path.includes("/documents/") && path.endsWith("/summary")) return demoDocSummary;
  if (path.includes("/documents/") && path.endsWith("/risks")) return { risks: demoDocRisks };
  if (path.includes("/documents/") && path.endsWith("/gaps")) {
    return { overall_score: demoDocSummary.gap_analysis.overall_score * 100, gaps: demoDocSummary.gap_analysis.gaps };
  }
  if (path.match(/\/api\/documents\/?$/)) return { documents: [] };

  // Risk
  if (path === "/api/risk/composite") return demoCompositeRisk;
  if (path === "/api/risk/benchmark") return {
    comparison_table: demoEvents.fingerprints.map(f => ({
      ...f, clearance_time_minutes: f.clearance_time_minutes || 0,
      total_person_hours: f.total_person_hours, baseline_floor: f.baseline_floor,
      sigma_above_baseline: f.sigma_above_baseline, observation_count: f.observation_count,
      amplitude: f.amplitude, amplitude_ratio: f.amplitude_ratio,
    })),
    percentile_rankings: [],
    pattern_similarity: { matrix: [], event_dates: [] },
    predictive_ranges: { based_on_events: 5, ranges: {} },
  };

  // Stakeholders
  if (path === "/api/stakeholders/matrix") return demoStakeholderMatrix;
  if (path === "/api/stakeholders/actions") return demoActions;
  if (path === "/api/stakeholders/coverage-summary") return demoCoverageSummary;
  if (path === "/api/stakeholders/") return {
    event: demoStakeholderMatrix.event,
    stakeholders: demoStakeholderMatrix.stakeholders,
  };

  // Venues
  if (path === "/api/venues/") return { venues: [demoGalwayVenueDetail] };
  if (path.match(/\/api\/venues\/[^/]+$/)) return demoGalwayVenueDetail;
  if (path.includes("/risk-markers")) return emptyGeoJSON;
  if (path.includes("/density-points")) return emptyGeoJSON;
  if (path.includes("/zones/custom")) return emptyGeoJSON;
  if (path.includes("/zones/templates")) return { total: 0, templates: [] };

  // Spatial — return empty GeoJSON for all spatial endpoints
  if (path.includes("/api/spatial/")) return emptyGeoJSON;

  return undefined;
}
