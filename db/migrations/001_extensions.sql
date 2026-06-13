-- ============================================================================
-- 001_extensions.sql — Enable required PostgreSQL extensions
-- CrowdShield Event Risk Intelligence Platform
-- ============================================================================

-- UUID generation (v4)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Cryptographic UUID v7 (pgcrypto for gen_random_uuid fallback)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- PostGIS 3.4 — spatial types, GEOGRAPHY, GIST indexes
CREATE EXTENSION IF NOT EXISTS "postgis";
-- PostGIS topology (optional, useful for network analysis)
CREATE EXTENSION IF NOT EXISTS "postgis_topology";

-- TimescaleDB — hypertables for time-series observations
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- btree_gist — enables GiST indexes on scalar types (used with EXCLUDE constraints / range types)
CREATE EXTENSION IF NOT EXISTS "btree_gist";
