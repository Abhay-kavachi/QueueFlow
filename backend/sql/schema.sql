-- QueueFlow Multi-Tenant Architecture Schema

-- Drop existing schema aggressively for clean re-architecture
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Organizations (Tenants)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('govt', 'private', 'institution')),
    auth_mode VARCHAR(50) NOT NULL CHECK (auth_mode IN ('aadhaar', 'mobile', 'student_id')),
    admin_invite_key VARCHAR(100) UNIQUE,
    worker_invite_key VARCHAR(100) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Services (Queues scoped to organization)
CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    capacity INTEGER DEFAULT 1, -- Number of parallel active users
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Workers (Staff mapped to organizations and services)
CREATE TABLE IF NOT EXISTS workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'manager', 'worker')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Users (Global pool, but identifiers depend on context)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    phone VARCHAR(15),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Live Queue (Scans org_id and service_id for true queue key)
CREATE TABLE IF NOT EXISTS live_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
    user_hash TEXT NOT NULL,
    entry_type VARCHAR(50) NOT NULL DEFAULT 'walk_in',
    appointment_time TIMESTAMP NULL,
    state VARCHAR(20) NOT NULL CHECK (state IN ('pending', 'next', 'active', 'grace', 'skipped')),
    CONSTRAINT chk_entry_type CHECK (entry_type IN ('walk_in', 'appointment', 'grace')),
    position INTEGER,
    grace_started_at TIMESTAMP,
    worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. Historical Queue Logs (Audit Table & ML Dataset)
CREATE TABLE IF NOT EXISTS historical_queue_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
    user_hash TEXT NOT NULL,
    entry_type VARCHAR(50),
    appointment_time TIMESTAMP NULL,
    grace_started_at TIMESTAMP NULL,
    registration_source VARCHAR(20) NOT NULL CHECK (registration_source IN ('self', 'worker', 'admin')),
    final_status VARCHAR(20) NOT NULL CHECK (final_status IN ('completed', 'expired')),
    actual_wait_duration INTEGER,
    worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
    completed_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Service configurations
CREATE TABLE IF NOT EXISTS service_configurations (
    id SERIAL PRIMARY KEY,
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
    min_buffer_minutes INTEGER DEFAULT 15,
    grace_period_seconds INTEGER DEFAULT 300,
    is_paused BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Auth & Session Tables
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_hash TEXT NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    session_token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_hash TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    purpose VARCHAR(20) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_live_queue_org_service ON live_queue(organization_id, service_id);
CREATE INDEX IF NOT EXISTS idx_live_queue_state ON live_queue(state);
CREATE INDEX IF NOT EXISTS idx_live_queue_position ON live_queue(position);
CREATE INDEX IF NOT EXISTS idx_live_queue_user_hash ON live_queue(user_hash);
CREATE INDEX IF NOT EXISTS idx_live_queue_appt_time ON live_queue(service_id, appointment_time) WHERE entry_type = 'appointment';
CREATE INDEX IF NOT EXISTS idx_queue_records_org_service ON queue_records(organization_id, service_id);

-- Updated Timestamps Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workers_updated_at BEFORE UPDATE ON workers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_live_queue_updated_at BEFORE UPDATE ON live_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_service_configurations_updated_at BEFORE UPDATE ON service_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- SEED DATA (Demo Isolation)

-- Org 1: Government Hospital (Aadhaar Mode)
INSERT INTO organizations (id, name, type, auth_mode) VALUES 
('11111111-1111-1111-1111-111111111111', 'City General Hospital', 'govt', 'aadhaar');

-- Service 1: Doctor Checkup (Cap 2)
INSERT INTO services (id, organization_id, name, description, capacity) VALUES 
(1, '11111111-1111-1111-1111-111111111111', 'General Outpatient', 'General Consultations', 2);
INSERT INTO service_configurations (service_id) VALUES (1);

-- Worker 1
INSERT INTO workers (organization_id, service_id, name, username, password_hash, role) VALUES 
('11111111-1111-1111-1111-111111111111', 1, 'Admin Health', 'admin_health', '$2b$10$NyyAWsVr6k5b9ylxryZBeOAOgEEEACiiPvCUGwi/r.qLaRHRyY8kO', 'admin');


-- Org 2: University Cafe (Student ID Mode)
INSERT INTO organizations (id, name, type, auth_mode) VALUES 
('22222222-2222-2222-2222-222222222222', 'Tech University Cafe', 'institution', 'student_id');

-- Service 2: Coffee Counter (Cap 3)
INSERT INTO services (id, organization_id, name, description, capacity) VALUES 
(2, '22222222-2222-2222-2222-222222222222', 'Barista Counter', 'Coffee and Snacks', 3);
INSERT INTO service_configurations (service_id) VALUES (2);

-- Worker 2
INSERT INTO workers (organization_id, service_id, name, username, password_hash, role) VALUES 
('22222222-2222-2222-2222-222222222222', 2, 'Admin Cafe', 'admin_cafe', '$2b$10$NyyAWsVr6k5b9ylxryZBeOAOgEEEACiiPvCUGwi/r.qLaRHRyY8kO', 'admin');