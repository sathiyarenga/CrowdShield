"""Pydantic v2 models for the CrowdShield ontology — all 8 modules.

Module mapping
──────────────
1. Event & Venue   → Event, Venue, Zone
2. Hazard & Risk   → Hazard, Risk, RiskAssessment, Control
3. Stakeholders    → Stakeholder, Document
4. Observations    → Observation, DataSource
5. Alerts          → Alert, Recommendation
6. Simulation      → BehaviorProfile, SimulationRun
7. Compliance      → Regulation, ComplianceCheck
8. Benchmark/Intel → EventFingerprint, MobilityPattern, CrowdBenchmark, AnomalyBaseline
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from src.ontology.controlled_vocab import (
    AlertSeverity,
    AlertStatus,
    AlertType,
    ComplianceStatus,
    ConsequenceLevel,
    ControlStatus,
    DataSourceType,
    DocumentType,
    EventStatus,
    HazardCategory,
    LikelihoodLevel,
    MetricType,
    RiskLevel,
    SimulationStatus,
    StakeholderRole,
    ZoneType,
)

__all__ = [
    # Module 1
    "Event", "Venue", "Zone",
    # Module 2
    "Hazard", "Risk", "RiskAssessment", "Control",
    # Module 3
    "Stakeholder", "Document",
    # Module 4
    "Observation", "DataSource",
    # Module 5
    "Alert", "Recommendation",
    # Module 6
    "BehaviorProfile", "SimulationRun",
    # Module 7
    "Regulation", "ComplianceCheck",
    # Module 8
    "EventFingerprint", "MobilityPattern", "CrowdBenchmark", "AnomalyBaseline",
]


# ─────────────────────────────────────────────────────────────────────────────
# Shared base
# ─────────────────────────────────────────────────────────────────────────────

class CrowdShieldBase(BaseModel):
    """Common base with UUID primary key and timestamps."""

    id: UUID = Field(default_factory=uuid4)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# ═════════════════════════════════════════════════════════════════════════════
# MODULE 1 — Event & Venue
# ═════════════════════════════════════════════════════════════════════════════

class Venue(CrowdShieldBase):
    """Physical location where events take place."""

    name: str
    address: str | None = None
    city: str | None = None
    country: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    total_capacity: int | None = None
    polygon_wkt: str | None = None  # WKT geometry


class Zone(CrowdShieldBase):
    """Named spatial subdivision of a venue."""

    venue_id: UUID
    name: str
    zone_type: ZoneType
    capacity: int | None = None
    area_sqm: float | None = None
    polygon_wkt: str | None = None
    max_density_ppm2: float | None = None  # persons per m²


class Event(CrowdShieldBase):
    """A planned or past mass-gathering event."""

    name: str
    venue_id: UUID
    status: EventStatus = EventStatus.PLANNED
    event_date: date
    start_time: datetime | None = None
    end_time: datetime | None = None
    expected_attendance: int | None = None
    actual_attendance: int | None = None
    event_type: str | None = None  # e.g. "football", "concert"
    description: str | None = None


# ═════════════════════════════════════════════════════════════════════════════
# MODULE 2 — Hazard & Risk
# ═════════════════════════════════════════════════════════════════════════════

class Hazard(CrowdShieldBase):
    """An identified hazard in the event context."""

    event_id: UUID
    category: HazardCategory
    description: str
    location_zone_id: UUID | None = None


class Risk(CrowdShieldBase):
    """A specific risk arising from a hazard."""

    hazard_id: UUID
    event_id: UUID
    description: str
    likelihood: LikelihoodLevel
    consequence: ConsequenceLevel
    risk_level: RiskLevel
    residual_risk_level: RiskLevel | None = None


class RiskAssessment(CrowdShieldBase):
    """A formal risk-assessment document instance."""

    event_id: UUID
    assessor_id: UUID | None = None
    assessment_date: date
    overall_risk_level: RiskLevel
    summary: str | None = None
    risks: list[UUID] = Field(default_factory=list)  # FK to Risk


class Control(CrowdShieldBase):
    """A risk-control / mitigation measure."""

    risk_id: UUID
    description: str
    status: ControlStatus = ControlStatus.PROPOSED
    responsible_stakeholder_id: UUID | None = None
    effectiveness_rating: float | None = None  # 0-1


# ═════════════════════════════════════════════════════════════════════════════
# MODULE 3 — Stakeholders & Documents
# ═════════════════════════════════════════════════════════════════════════════

class Stakeholder(CrowdShieldBase):
    """An organisation or individual involved in event safety."""

    name: str
    role: StakeholderRole
    organisation: str | None = None
    email: str | None = None
    phone: str | None = None
    event_ids: list[UUID] = Field(default_factory=list)


class Document(CrowdShieldBase):
    """A document attached to an event's risk-management record."""

    event_id: UUID
    doc_type: DocumentType
    title: str
    version: str | None = None
    file_path: str | None = None
    author_id: UUID | None = None
    approved: bool = False


# ═════════════════════════════════════════════════════════════════════════════
# MODULE 4 — Observations & Data Sources
# ═════════════════════════════════════════════════════════════════════════════

class DataSource(CrowdShieldBase):
    """A data provider / sensor contributing observations."""

    name: str
    source_type: DataSourceType
    provider: str | None = None  # e.g. "Telia", "Telcofy"
    description: str | None = None
    sampling_interval_seconds: int | None = None
    coverage_polygon_wkt: str | None = None


class Observation(CrowdShieldBase):
    """A single time-stamped measurement or observation."""

    data_source_id: UUID
    event_id: UUID | None = None
    zone_id: UUID | None = None
    timestamp: datetime
    metric_type: MetricType
    value: float
    unit: str | None = None
    area_name: str | None = None
    area_code: str | None = None
    rating: str | None = None
    metadata: dict[str, Any] | None = None


# ═════════════════════════════════════════════════════════════════════════════
# MODULE 5 — Alerts
# ═════════════════════════════════════════════════════════════════════════════

class Alert(CrowdShieldBase):
    """An operational alert generated by analytics or rules."""

    event_id: UUID | None = None
    zone_id: UUID | None = None
    alert_type: AlertType
    severity: AlertSeverity
    status: AlertStatus = AlertStatus.ACTIVE
    title: str
    description: str | None = None
    triggered_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: datetime | None = None
    metric_value: float | None = None
    threshold_value: float | None = None


class Recommendation(CrowdShieldBase):
    """An actionable recommendation linked to an alert."""

    alert_id: UUID
    description: str
    priority: int = 1
    accepted: bool = False
    implemented_at: datetime | None = None


# ═════════════════════════════════════════════════════════════════════════════
# MODULE 6 — Simulation
# ═════════════════════════════════════════════════════════════════════════════

class BehaviorProfile(CrowdShieldBase):
    """Crowd-behaviour model parameters for simulation."""

    name: str
    walking_speed_ms: float = 1.34
    reaction_time_s: float = 1.0
    personal_space_m: float = 0.45
    max_density_ppm2: float = 6.0
    description: str | None = None


class SimulationRun(CrowdShieldBase):
    """Record of a simulation execution."""

    event_id: UUID
    behavior_profile_id: UUID
    status: SimulationStatus = SimulationStatus.PENDING
    scenario_name: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    peak_density: float | None = None
    egress_time_seconds: float | None = None
    results_summary: dict[str, Any] | None = None


# ═════════════════════════════════════════════════════════════════════════════
# MODULE 7 — Compliance
# ═════════════════════════════════════════════════════════════════════════════

class Regulation(CrowdShieldBase):
    """A legal / regulatory requirement applicable to events."""

    jurisdiction: str
    title: str
    reference_code: str | None = None
    description: str | None = None
    effective_date: date | None = None
    url: str | None = None


class ComplianceCheck(CrowdShieldBase):
    """A single compliance-check result for an event × regulation."""

    event_id: UUID
    regulation_id: UUID
    checked_by_id: UUID | None = None
    check_date: date
    status: ComplianceStatus = ComplianceStatus.NOT_ASSESSED
    notes: str | None = None
    evidence_document_ids: list[UUID] = Field(default_factory=list)


# ═════════════════════════════════════════════════════════════════════════════
# MODULE 8 — Benchmark & Intelligence
# ═════════════════════════════════════════════════════════════════════════════

class EventFingerprint(CrowdShieldBase):
    """Statistical signature of an event day derived from crowd data."""

    event_id: UUID | None = None
    event_date: date
    venue_name: str | None = None
    is_event_day: bool = True
    peak_count: int
    peak_time: datetime | None = None
    baseline_mean: float | None = None
    baseline_std: float | None = None
    sigma_above_baseline: float | None = None
    ingress_onset: datetime | None = None
    ingress_duration_minutes: float | None = None
    egress_onset: datetime | None = None
    egress_duration_minutes: float | None = None
    clearance_time_minutes: float | None = None
    total_person_hours: float | None = None


class MobilityPattern(CrowdShieldBase):
    """Aggregated mobility pattern for an area over a time window."""

    area_name: str
    area_code: str | None = None
    admin_level_2: str | None = None
    date: date
    hour: int | None = None  # 0-23, None = daily aggregate
    people_count: int
    rating: str | None = None
    data_source: str | None = None  # "telia" or "telcofy"


class CrowdBenchmark(CrowdShieldBase):
    """Historical benchmark statistics for a venue / area."""

    venue_name: str
    area_name: str | None = None
    day_of_week: int | None = None  # 0=Mon … 6=Sun
    hour_of_day: int | None = None  # 0-23
    mean_people: float
    std_people: float
    percentile_95: float
    sample_count: int


class AnomalyBaseline(CrowdShieldBase):
    """Per-interval baseline for anomaly detection."""

    venue_name: str
    area_name: str | None = None
    hour_of_day: int  # 0-23
    day_of_week: int | None = None  # 0=Mon … 6=Sun
    baseline_mean: float
    baseline_std: float
    percentile_95: float
    sample_count: int = 0
