-- ============================================================================
-- 002_enums.sql — Controlled vocabulary enums for CrowdShield
-- Aligned with BFO ontology modules M2–M6
-- ============================================================================

-- ---------------------------------------------------------------------------
-- M2: Hazard & Risk enums
-- ---------------------------------------------------------------------------
CREATE TYPE hazard_category AS ENUM (
    'CROWD_CRUSH',
    'CROWD_SURGE',
    'STRUCTURAL_FAILURE',
    'FIRE',
    'WEATHER_EXTREME',
    'MEDICAL_MASS_CASUALTY',
    'SECURITY_THREAT',
    'PUBLIC_ORDER',
    'TRANSPORT_DISRUPTION',
    'INFRASTRUCTURE'
);

CREATE TYPE likelihood_level AS ENUM (
    'RARE',
    'UNLIKELY',
    'POSSIBLE',
    'LIKELY',
    'ALMOST_CERTAIN'
);

CREATE TYPE consequence_level AS ENUM (
    'NEGLIGIBLE',
    'MINOR',
    'MODERATE',
    'MAJOR',
    'CATASTROPHIC'
);

CREATE TYPE risk_level AS ENUM (
    'NOMINAL',
    'ELEVATED',
    'HIGH',
    'CRITICAL'
);

-- ---------------------------------------------------------------------------
-- M3: Stakeholder & Document enums
-- ---------------------------------------------------------------------------
CREATE TYPE stakeholder_role AS ENUM (
    'RISK_CONSULTANT',
    'EVENT_ORGANISER',
    'MUNICIPALITY',
    'POLICE',
    'FIRE_SERVICE',
    'AMBULANCE_EMS',
    'VENUE_OPERATOR',
    'INSURANCE',
    'TRANSPORT_AUTHORITY',
    'CROWD_MANAGER'
);

CREATE TYPE document_type AS ENUM (
    'EVENT_RISK_ASSESSMENT',
    'SAFETY_MANAGEMENT_PLAN',
    'CITY_RISK_REGISTER',
    'TACTICAL_PLAN',
    'RESPONSE_PLAN',
    'CAPACITY_CERTIFICATE',
    'INCIDENT_REPORT',
    'VENUE_DRAWING',
    'TRANSPORT_PLAN'
);

-- ---------------------------------------------------------------------------
-- M4: Observation & Sensor enums
-- ---------------------------------------------------------------------------
CREATE TYPE metric_type AS ENUM (
    'DENSITY',
    'FLOW_RATE',
    'DWELL_TIME',
    'SPEED',
    'PEOPLE_COUNT',
    'TEMPERATURE',
    'WIND_SPEED',
    'PRECIPITATION'
);

CREATE TYPE data_source_type AS ENUM (
    'TELECOM_MOBILITY',
    'CAMERA_CV',
    'WEATHER_API',
    'TICKET_SCAN',
    'WIFI_PROBE',
    'MANUAL_COUNT'
);

-- ---------------------------------------------------------------------------
-- M6: Alert & Decision Support enums
-- ---------------------------------------------------------------------------
CREATE TYPE alert_severity AS ENUM (
    'INFO',
    'WARNING',
    'CRITICAL',
    'EMERGENCY'
);

CREATE TYPE alert_type AS ENUM (
    'DENSITY_THRESHOLD',
    'CONFLICT_DETECTED',
    'GAP_DETECTED',
    'ANOMALY_DETECTED',
    'PREDICTION_BREACH'
);

CREATE TYPE alert_status AS ENUM (
    'ACTIVE',
    'ACKNOWLEDGED',
    'RESOLVED',
    'DISMISSED'
);
