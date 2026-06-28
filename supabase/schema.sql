-- Supabase Database Schema for DevPulse
-- Compatible with PostgreSQL 15+

-- Enable pg_crypt if needed (for gen_random_uuid())
-- Note: Supabase enables this by default, but it's good practice.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  hashed_password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Services table
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  api_key TEXT UNIQUE DEFAULT gen_random_uuid()::TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Metrics table
CREATE TABLE IF NOT EXISTS metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  metric_type TEXT CHECK (metric_type IN ('cpu', 'memory', 'error_rate', 'response_time', 'custom')) NOT NULL,
  value FLOAT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  metric_id UUID REFERENCES metrics(id) ON DELETE SET NULL,
  severity TEXT CHECK (severity IN ('low', 'medium', 'critical')) NOT NULL,
  message TEXT NOT NULL,
  is_resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Anomalies table
CREATE TABLE IF NOT EXISTS anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
  score FLOAT NOT NULL,
  confidence FLOAT DEFAULT 0.0,
  severity TEXT CHECK (severity IN ('low', 'medium', 'critical')),
  explanation TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  context JSONB DEFAULT '{}'
);

-- Incidents table
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  root_cause_service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  affected_service_ids UUID[] DEFAULT '{}',
  summary TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_metrics_service_id ON metrics(service_id);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_service_id ON alerts(service_id);
CREATE INDEX IF NOT EXISTS idx_alerts_is_resolved ON alerts(is_resolved);
CREATE INDEX IF NOT EXISTS idx_anomalies_service_id ON anomalies(service_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_detected_at ON anomalies(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_is_active ON incidents(is_active);
