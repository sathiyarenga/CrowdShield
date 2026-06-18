/**
 * CrowdShield API client — fetches data from the FastAPI backend.
 *
 * When NEXT_PUBLIC_DEMO_MODE=true, all GET requests return bundled
 * demo data instead of making network calls. This makes the entire
 * app work offline — perfect for demos and trade shows.
 */

import { resolveDemoData } from "@/lib/demo/demoData";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  // Demo mode: return bundled data, no network calls
  if (DEMO_MODE) {
    const demo = resolveDemoData(path, params);
    if (demo !== undefined) {
      // Simulate tiny async delay for natural loading states
      await new Promise(r => setTimeout(r, 80));
      return demo as T;
    }
  }

  const url = new URL(path, API_BASE);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    });
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

async function apiMutate<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const url = new URL(path, API_BASE);
  const res = await fetch(url.toString(), {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

// -- Types ----------------------------------------------------------------

export interface HealthResponse {
  status: string;
  data_loaded: boolean;
  datasets: Record<string, number>;
}

export interface UllevaalSummaryRecord {
  timestamp: string;
  people: number;
  area_name: string;
}

export interface UllevaalSummaryResponse {
  total_records: number;
  dates_available: string[];
  data: UllevaalSummaryRecord[];
}

export interface EventDetection {
  date: string;
  max_people: number;
  sigma_above_baseline: number;
  is_event: boolean;
}

export interface EventFingerprint {
  event_date: string;
  is_event_day: boolean;
  peak_count: number;
  peak_time: string;
  baseline_floor: number;
  sigma_above_baseline: number;
  ingress_onset: string;
  ingress_duration_minutes: number;
  egress_onset: string;
  egress_duration_minutes: number;
  clearance_time_minutes: number;
  total_person_hours: number;
  observation_count: number;
  amplitude?: number;
  amplitude_ratio?: number;
}

export interface EventsResponse {
  event_detection: EventDetection[];
  fingerprints: EventFingerprint[];
}

export interface AnomalyRecord {
  timestamp: string;
  people: number;
  hour: number;
  baseline_mean: number;
  baseline_std: number;
  z_score: number;
  severity: string;
}

export interface AnomalyResponse {
  total_records: number;
  severity_summary: Record<string, number>;
  data: AnomalyRecord[];
}

export interface NationalityRecord {
  country: string;
  total_people: number;
  observation_count: number;
}

export interface BreakdownResponse {
  date: string;
  countries: NationalityRecord[];
  timeseries_count: number;
  timeseries: { timestamp: string; country: string; people: number }[];
}

export interface FredrikstadArea {
  area_name: string;
  area_code: string;
  admin_level_2: string;
  daily_max_people: number;
  daily_avg_people: number;
  hourly_max_people: number;
  hourly_avg_people: number;
  days_observed: number;
}

export interface FredrikstadAreasResponse {
  total_areas: number;
  returned: number;
  data: FredrikstadArea[];
}

export interface GeoJSONFeature {
  type: "Feature";
  properties: {
    id: string;
    area_name: string;
    area_sqm: number | null;
    centroid_lat: number;
    centroid_lon: number;
    zone_id?: string;
    zone_name?: string;
    capacity_estimate?: number;
    // Risk marker fields
    risk_id?: string;
    title?: string;
    hazard_category?: string;
    risk_score?: number;
    severity_label?: string;
    source_page?: number;
    // Density point fields
    weight?: number;
    // Allow any additional properties
    [key: string]: unknown;
  };
  geometry: {
    type: string;
    coordinates: number[][][] | number[];
  } | null;
}

export interface GeoJSONResponse {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

// -- Document Intelligence Types -----------------------------------------

export interface ExtractedRisk {
  id: string;
  hazard_category: string;
  title: string;
  description: string;
  likelihood: string;
  consequence: string;
  controls: string[];
  spatial_reference: string | null;
  source_page: number;
  source_text: string;
  confidence: number;
}

export interface GapAnalysisItem {
  category: string;
  status: string; // "covered" | "partial" | "missing"
  coverage_score: number;
  recommendations: string[];
  risk_count?: number;
}

export interface DocumentSummary {
  document_name: string;
  total_pages: number;
  total_risks: number;
  extraction_mode: string;
  hazard_distribution: Record<string, number>;
  risk_levels: Record<string, number>;
  gap_analysis: { overall_score: number; gaps: GapAnalysisItem[] };
}

// -- Risk Intelligence Types ----------------------------------------------

export interface RiskComponent {
  name: string;
  score: number;
  weight: number;
  level: string;
  description: string;
}

export interface RiskTimelinePoint {
  time: string;
  composite_score: number;
  document_risk: number;
  historical_anomaly: number;
  density_prediction: number;
}

export interface HazardRiskItem {
  category: string;
  risk_score: number;
  risk_count: number;
  level: string;
}

export interface CompositeRiskResponse {
  date: string;
  composite_score: number;
  composite_level: string;
  components: RiskComponent[];
  timeline: RiskTimelinePoint[];
  hazard_breakdown: HazardRiskItem[];
}

// -- Stakeholder Intelligence Types ------------------------------------------

export interface Stakeholder {
  id: string;
  name: string;
  role: string;
  icon: string;
  expected_document: string;
  document_status: "submitted" | "pending" | "not_requested";
}

export interface StakeholdersListResponse {
  event: string;
  stakeholders: Stakeholder[];
}

export interface MatrixCellCovered {
  status: "covered";
  risk_count: number;
  avg_score: number;
  top_risk: string | null;
  top_score: number | null;
}

export interface MatrixCellGap {
  status: "gap";
}

export interface MatrixCellNoDocument {
  status: "no_document";
}

export type MatrixCell = MatrixCellCovered | MatrixCellGap | MatrixCellNoDocument;

export interface CategoryDef {
  id: string;
  label: string;
}

export interface CoverageGap {
  category: string;
  label: string;
  risk_count: number;
  severity: "critical" | "weak";
}

export interface AlignmentSummary {
  status: "active" | "insufficient_data";
  message: string;
}

export interface SystemInsight {
  type: string;
  priority: "info" | "high" | "medium" | "low";
  message: string;
}

export interface StakeholderMatrixResponse {
  event: string;
  categories: CategoryDef[];
  stakeholders: Stakeholder[];
  matrix: Record<string, Record<string, MatrixCell>>;
  alignment_summary: AlignmentSummary;
  coverage_gaps: CoverageGap[];
  system_insights: SystemInsight[];
}

export interface ActionItem {
  number: number;
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  category: string | null;
  current_risk_count: number | null;
  relevant_stakeholder: string | null;
}

export interface ActionsResponse {
  event: string;
  total_actions: number;
  actions: ActionItem[];
}

export interface CoverageSummaryResponse {
  event: string;
  documents_submitted: number;
  documents_expected: number;
  categories_covered: number;
  categories_fully_covered: number;
  categories_total: number;
  categories_weak: number;
  categories_empty: number;
  pending_stakeholders: number;
  cross_validation_ready: boolean;
  total_risks_extracted: number;
  scored_risks: number;
  average_risk_score: number;
}

// -- Venue Types ----------------------------------------------------------

export interface VenueConfig {
  id: string;
  name: string;
  city: string;
  country: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
  pitch: number;
  bearing: number;
  has_telemetry: boolean;
  event_dates: string[];
}

export interface VenueListResponse {
  venues: VenueConfig[];
}

export interface VenueDetailResponse extends VenueConfig {
  zones: GeoJSONResponse;
}

// -- Custom Zone Types ----------------------------------------------------

export type CustomZoneType =
  | "gate"
  | "stage"
  | "crowd_corridor"
  | "medical"
  | "vip"
  | "parking"
  | "buffer"
  | "custom";

export interface CustomZoneCreate {
  name: string;
  zone_type: CustomZoneType;
  capacity: number;
  color: string;
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export interface CustomZoneUpdate {
  name?: string;
  zone_type?: CustomZoneType;
  capacity?: number;
  color?: string;
  geometry?: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export interface ZoneTemplate {
  zone_id: string;
  name: string;
  zone_type: CustomZoneType;
  capacity: number;
  color: string;
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export interface ZoneTemplatesResponse {
  total: number;
  templates: ZoneTemplate[];
}

// -- API Functions --------------------------------------------------------

export const api = {
  health: () => apiFetch<HealthResponse>("/api/health"),

  ullevaal: {
    summary: (date?: string) =>
      apiFetch<UllevaalSummaryResponse>(
        "/api/analytics/ullevaal/summary",
        date ? { date } : undefined
      ),
    events: () => apiFetch<EventsResponse>("/api/analytics/ullevaal/events"),
    anomalies: (date?: string) =>
      apiFetch<AnomalyResponse>(
        "/api/analytics/ullevaal/anomalies",
        date ? { date } : undefined
      ),
    breakdown: (date: string) =>
      apiFetch<BreakdownResponse>(`/api/analytics/ullevaal/breakdown/${date}`),
  },

  fredrikstad: {
    areas: (sortBy?: string, limit?: number) =>
      apiFetch<FredrikstadAreasResponse>("/api/analytics/fredrikstad/areas", {
        ...(sortBy ? { sort_by: sortBy } : {}),
        ...(limit ? { limit: String(limit) } : {}),
      }),
  },

  documents: {
    summary: () =>
      apiFetch<DocumentSummary>("/api/documents/galway/summary"),
    risks: () =>
      apiFetch<{ risks: ExtractedRisk[] }>("/api/documents/galway/risks"),
    gaps: () =>
      apiFetch<{ overall_score: number; gaps: GapAnalysisItem[] }>(
        "/api/documents/galway/gaps"
      ),
  },

  zones: () => apiFetch<GeoJSONResponse>("/api/analytics/zones"),

  venues: {
    list: () => apiFetch<VenueListResponse>("/api/venues/"),
    detail: (id: string) => apiFetch<VenueDetailResponse>(`/api/venues/${id}`),
    riskMarkers: (id: string) => apiFetch<GeoJSONResponse>(`/api/venues/${id}/risk-markers`),
    densityPoints: (id: string) => apiFetch<GeoJSONResponse>(`/api/venues/${id}/density-points`),
    customZones: (id: string) =>
      apiFetch<GeoJSONResponse>(`/api/venues/${id}/zones/custom`),
    saveCustomZone: (id: string, zone: CustomZoneCreate) =>
      apiMutate<GeoJSONFeature>(`/api/venues/${id}/zones/custom`, "POST", zone),
    updateCustomZone: (id: string, zoneId: string, data: CustomZoneUpdate) =>
      apiMutate<GeoJSONFeature>(`/api/venues/${id}/zones/custom/${zoneId}`, "PUT", data),
    deleteCustomZone: (id: string, zoneId: string) =>
      apiMutate<{ detail: string; zone_id: string }>(`/api/venues/${id}/zones/custom/${zoneId}`, "DELETE"),
    zoneTemplates: (id: string) =>
      apiFetch<ZoneTemplatesResponse>(`/api/venues/${id}/zones/templates`),
  },

  risk: {
    composite: (date?: string) =>
      apiFetch<CompositeRiskResponse>(
        "/api/risk/composite",
        date ? { date } : undefined
      ),
  },

  stakeholders: {
    list: () =>
      apiFetch<StakeholdersListResponse>("/api/stakeholders/"),
    matrix: () =>
      apiFetch<StakeholderMatrixResponse>("/api/stakeholders/matrix"),
    actions: () =>
      apiFetch<ActionsResponse>("/api/stakeholders/actions"),
    coverageSummary: () =>
      apiFetch<CoverageSummaryResponse>("/api/stakeholders/coverage-summary"),
  },

  spatial: {
    facilities: (venueId: string, radius = 5000, types?: string) =>
      apiFetch<GeoJSONResponse>(
        `/api/spatial/${venueId}/facilities`,
        { radius: String(radius), ...(types ? { types } : {}) },
      ),
    transit: (venueId: string, radius = 3000) =>
      apiFetch<GeoJSONResponse>(
        `/api/spatial/${venueId}/transit`,
        { radius: String(radius) },
      ),
    roads: (venueId: string, radius = 2000) =>
      apiFetch<GeoJSONResponse>(
        `/api/spatial/${venueId}/roads`,
        { radius: String(radius) },
      ),
    isochrones: (venueId: string, minutes = "5,10,15", source = "venue") =>
      apiFetch<GeoJSONResponse>(
        `/api/spatial/${venueId}/isochrones`,
        { minutes, source },
      ),
    route: (venueId: string, fromLon: number, fromLat: number, toLon: number, toLat: number) =>
      apiFetch<GeoJSONResponse>(
        `/api/spatial/${venueId}/route`,
        { from_lon: String(fromLon), from_lat: String(fromLat), to_lon: String(toLon), to_lat: String(toLat) },
      ),
    bottlenecks: (venueId: string, crowdSize = 10000, egressMinutes = 15, radius = 1500) =>
      apiFetch<GeoJSONResponse>(
        `/api/spatial/${venueId}/bottlenecks`,
        { crowd_size: String(crowdSize), egress_minutes: String(egressMinutes), radius: String(radius) },
      ),
    simulate: async (
      venueId: string,
      params: {
        num_agents?: number;
        scenario?: "ingress" | "egress" | "bidirectional";
        total_time?: number;
        desired_speed?: number;
        domain_radius?: number;
        origins?: Array<{
          lat: number; lon: number; name: string;
          hub_type: string; crowd_share: number;
          arrival_offset_min?: number; arrival_spread_min?: number;
        }>;
        destinations?: Array<{
          lat: number; lon: number; name: string;
          hub_type: string; crowd_share: number;
        }>;
        avoid_polygons?: Array<Record<string, unknown>>;
      } = {},
    ) => {
      const resp = await fetch(`${API_BASE}/api/spatial/${venueId}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          num_agents: params.num_agents ?? 2000,
          scenario: params.scenario ?? "ingress",
          total_time: params.total_time ?? 300,
          desired_speed: params.desired_speed ?? 1.2,
          domain_radius: params.domain_radius ?? 400,
          origins: params.origins ?? [],
          destinations: params.destinations ?? [],
          avoid_polygons: params.avoid_polygons ?? null,
        }),
      });
      if (!resp.ok) throw new Error(`Simulation failed: ${resp.status}`);
      return resp.json();
    },
    transportHubs: (venueId: string, radius = 1200) =>
      apiFetch<{
        venue_id: string;
        hubs: Array<{
          lat: number; lon: number; name: string;
          hub_type: string; crowd_share: number;
          arrival_offset_min: number; arrival_spread_min: number;
        }>;
        total_hubs: number;
      }>(`/api/spatial/${venueId}/transport-hubs`, { radius: String(radius) }),
  },
};

