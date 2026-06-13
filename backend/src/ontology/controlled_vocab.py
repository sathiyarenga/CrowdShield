"""Controlled vocabulary enumerations for the CrowdShield ontology.

These enums enforce valid values across the eight ontology modules
(Event, Risk, Observation, Analytics, Compliance, Simulation, Alert, Benchmark).
"""

from enum import Enum

__all__ = [
    "HazardCategory",
    "StakeholderRole",
    "DocumentType",
    "RiskLevel",
    "LikelihoodLevel",
    "ConsequenceLevel",
    "MetricType",
    "DataSourceType",
    "AlertSeverity",
    "AlertType",
    "AlertStatus",
    "EventStatus",
    "ZoneType",
    "ControlStatus",
    "ComplianceStatus",
    "SimulationStatus",
]


# ── Module 1: Event & Venue ────────────────────────────────────────────────

class EventStatus(str, Enum):
    """Lifecycle status of an event."""
    PLANNED = "PLANNED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class ZoneType(str, Enum):
    """Spatial zone classification within a venue."""
    INGRESS = "INGRESS"
    EGRESS = "EGRESS"
    STANDING = "STANDING"
    SEATED = "SEATED"
    VIP = "VIP"
    STAGING = "STAGING"
    EMERGENCY_ROUTE = "EMERGENCY_ROUTE"
    BUFFER = "BUFFER"
    CONCOURSE = "CONCOURSE"
    PARKING = "PARKING"


# ── Module 2: Hazard & Risk ────────────────────────────────────────────────

class HazardCategory(str, Enum):
    """Standard hazard taxonomy for mass-gathering risk assessment."""
    CROWD_CRUSH = "CROWD_CRUSH"
    CROWD_SURGE = "CROWD_SURGE"
    STRUCTURAL_FAILURE = "STRUCTURAL_FAILURE"
    FIRE = "FIRE"
    WEATHER_EXTREME = "WEATHER_EXTREME"
    MEDICAL_MASS_CASUALTY = "MEDICAL_MASS_CASUALTY"
    SECURITY_THREAT = "SECURITY_THREAT"
    PUBLIC_ORDER = "PUBLIC_ORDER"
    TRANSPORT_DISRUPTION = "TRANSPORT_DISRUPTION"
    INFRASTRUCTURE = "INFRASTRUCTURE"


class RiskLevel(str, Enum):
    """Overall risk rating (5-level ISO 31000 style)."""
    NEGLIGIBLE = "NEGLIGIBLE"
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    EXTREME = "EXTREME"


class LikelihoodLevel(str, Enum):
    """Qualitative probability scale."""
    RARE = "RARE"
    UNLIKELY = "UNLIKELY"
    POSSIBLE = "POSSIBLE"
    LIKELY = "LIKELY"
    ALMOST_CERTAIN = "ALMOST_CERTAIN"


class ConsequenceLevel(str, Enum):
    """Qualitative consequence/impact scale."""
    INSIGNIFICANT = "INSIGNIFICANT"
    MINOR = "MINOR"
    MODERATE = "MODERATE"
    MAJOR = "MAJOR"
    CATASTROPHIC = "CATASTROPHIC"


class ControlStatus(str, Enum):
    """Implementation status for a risk control/mitigation measure."""
    PROPOSED = "PROPOSED"
    APPROVED = "APPROVED"
    IMPLEMENTED = "IMPLEMENTED"
    VERIFIED = "VERIFIED"
    INEFFECTIVE = "INEFFECTIVE"


# ── Module 3: Stakeholders & Documents ─────────────────────────────────────

class StakeholderRole(str, Enum):
    """Roles in the event risk-management ecosystem."""
    EVENT_ORGANISER = "EVENT_ORGANISER"
    VENUE_OPERATOR = "VENUE_OPERATOR"
    SAFETY_OFFICER = "SAFETY_OFFICER"
    POLICE = "POLICE"
    FIRE_SERVICE = "FIRE_SERVICE"
    AMBULANCE = "AMBULANCE"
    LOCAL_AUTHORITY = "LOCAL_AUTHORITY"
    TRANSPORT_OPERATOR = "TRANSPORT_OPERATOR"
    SECURITY_CONTRACTOR = "SECURITY_CONTRACTOR"
    CROWD_MANAGER = "CROWD_MANAGER"
    MEDICAL_PROVIDER = "MEDICAL_PROVIDER"
    COMMUNICATIONS = "COMMUNICATIONS"


class DocumentType(str, Enum):
    """Controlled document type classification."""
    EVENT_MANAGEMENT_PLAN = "EVENT_MANAGEMENT_PLAN"
    RISK_ASSESSMENT = "RISK_ASSESSMENT"
    SAFETY_CERTIFICATE = "SAFETY_CERTIFICATE"
    SITE_PLAN = "SITE_PLAN"
    CROWD_MANAGEMENT_PLAN = "CROWD_MANAGEMENT_PLAN"
    EMERGENCY_PLAN = "EMERGENCY_PLAN"
    TRAFFIC_MANAGEMENT_PLAN = "TRAFFIC_MANAGEMENT_PLAN"
    MEDICAL_PLAN = "MEDICAL_PLAN"
    COMMUNICATIONS_PLAN = "COMMUNICATIONS_PLAN"
    POST_EVENT_REPORT = "POST_EVENT_REPORT"
    REGULATION = "REGULATION"
    INSURANCE = "INSURANCE"


# ── Module 4: Observations & Data Sources ──────────────────────────────────

class MetricType(str, Enum):
    """Types of crowd/mobility metric observations."""
    PEOPLE_COUNT = "PEOPLE_COUNT"
    DENSITY = "DENSITY"
    FLOW_RATE = "FLOW_RATE"
    DWELL_TIME = "DWELL_TIME"
    SPEED = "SPEED"
    QUEUE_LENGTH = "QUEUE_LENGTH"
    TEMPERATURE = "TEMPERATURE"
    NOISE_LEVEL = "NOISE_LEVEL"
    AIR_QUALITY = "AIR_QUALITY"


class DataSourceType(str, Enum):
    """Data provider / sensor type classification."""
    TELCO_MOBILITY = "TELCO_MOBILITY"
    WIFI_PROBE = "WIFI_PROBE"
    CCTV_VISION = "CCTV_VISION"
    LIDAR = "LIDAR"
    TICKET_SCAN = "TICKET_SCAN"
    MANUAL_COUNT = "MANUAL_COUNT"
    SOCIAL_MEDIA = "SOCIAL_MEDIA"
    WEATHER_API = "WEATHER_API"
    IOT_SENSOR = "IOT_SENSOR"


# ── Module 5: Alerts ───────────────────────────────────────────────────────

class AlertSeverity(str, Enum):
    """Operational alert severity."""
    INFO = "INFO"
    ELEVATED = "ELEVATED"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AlertType(str, Enum):
    """Category of generated alert."""
    CROWD_THRESHOLD = "CROWD_THRESHOLD"
    ANOMALY_DETECTED = "ANOMALY_DETECTED"
    RAPID_INGRESS = "RAPID_INGRESS"
    SLOW_EGRESS = "SLOW_EGRESS"
    DENSITY_EXCEEDED = "DENSITY_EXCEEDED"
    WEATHER_WARNING = "WEATHER_WARNING"
    CAPACITY_APPROACHING = "CAPACITY_APPROACHING"
    BASELINE_DEVIATION = "BASELINE_DEVIATION"


class AlertStatus(str, Enum):
    """Lifecycle status of an alert."""
    ACTIVE = "ACTIVE"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"
    SUPPRESSED = "SUPPRESSED"


# ── Module 6: Simulation ──────────────────────────────────────────────────

class SimulationStatus(str, Enum):
    """Status of a simulation run."""
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


# ── Module 7: Compliance ──────────────────────────────────────────────────

class ComplianceStatus(str, Enum):
    """Result of a compliance check."""
    COMPLIANT = "COMPLIANT"
    NON_COMPLIANT = "NON_COMPLIANT"
    PARTIALLY_COMPLIANT = "PARTIALLY_COMPLIANT"
    NOT_ASSESSED = "NOT_ASSESSED"
