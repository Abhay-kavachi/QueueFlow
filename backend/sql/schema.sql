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

-- 3. Roles and RBAC
CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id VARCHAR(50) REFERENCES roles(id) ON DELETE CASCADE,
    permission VARCHAR(100) NOT NULL,
    PRIMARY KEY (role_id, permission)
);

-- 4. Workers (Staff mapped to organizations and services)
CREATE TABLE IF NOT EXISTS workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role_id VARCHAR(50) NOT NULL REFERENCES roles(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. Users (Global pool, no RLS)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    phone VARCHAR(15),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Live Queue
CREATE TABLE IF NOT EXISTS live_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
    user_hash TEXT NOT NULL,
    entry_type VARCHAR(50) NOT NULL DEFAULT 'walk_in',
    appointment_time TIMESTAMP NULL,
    state VARCHAR(20) NOT NULL CHECK (state IN ('pending', 'next', 'active', 'grace', 'skipped', 'appointment')),
    CONSTRAINT chk_entry_type CHECK (entry_type IN ('walk_in', 'appointment', 'grace')),
    position INTEGER,
    grace_started_at TIMESTAMP,
    worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 7. Historical Queue Logs
CREATE TABLE IF NOT EXISTS historical_queue_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
    user_hash TEXT NOT NULL,
    entry_type VARCHAR(50),
    appointment_time TIMESTAMP NULL,
    grace_started_at TIMESTAMP NULL,
    registration_source VARCHAR(20) NOT NULL CHECK (registration_source IN ('self', 'worker', 'admin')),
    final_status VARCHAR(20) NOT NULL CHECK (final_status IN ('completed', 'expired', 'cancelled', 'skipped')),
    actual_wait_duration INTEGER,
    worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
    completed_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 8. Service configurations
CREATE TABLE IF NOT EXISTS service_configurations (
    id SERIAL PRIMARY KEY,
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
    min_buffer_minutes INTEGER DEFAULT 15,
    grace_period_seconds INTEGER DEFAULT 300,
    is_paused BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 9. Auth & Session Tables
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_hash TEXT NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    device_name TEXT,
    last_seen TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_hash TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    purpose VARCHAR(20) NOT NULL,
    attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP NULL,
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 10. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id VARCHAR NOT NULL,
    role_id VARCHAR,
    action VARCHAR NOT NULL,
    entity_type VARCHAR NOT NULL,
    entity_id VARCHAR NOT NULL,
    correlation_id VARCHAR,
    metadata JSONB,
    ip_address INET
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_live_queue_org_service ON live_queue(organization_id, service_id);
CREATE INDEX IF NOT EXISTS idx_live_queue_state ON live_queue(state);
CREATE INDEX IF NOT EXISTS idx_live_queue_position ON live_queue(position);
CREATE INDEX IF NOT EXISTS idx_live_queue_user_hash ON live_queue(user_hash);
CREATE INDEX IF NOT EXISTS idx_live_queue_appt_time ON live_queue(service_id, appointment_time) WHERE entry_type = 'appointment';

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

-- Row Level Security (RLS)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_queue_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_org ON organizations
    USING (id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);

CREATE POLICY tenant_isolation_services ON services
    USING (organization_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);

CREATE POLICY tenant_isolation_workers ON workers
    USING (organization_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);

CREATE POLICY tenant_isolation_live_queue ON live_queue
    USING (organization_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);

CREATE POLICY tenant_isolation_history ON historical_queue_logs
    USING (organization_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);

CREATE POLICY tenant_isolation_config ON service_configurations
    USING (service_id IN (SELECT id FROM services WHERE organization_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID));

CREATE POLICY tenant_isolation_audit ON audit_logs
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);

-- Prevent Updates or Deletes on Audit Logs
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;

CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_audit_immutability
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE POLICY audit_logs_insert_only ON audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY audit_logs_select_only ON audit_logs FOR SELECT USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);

-- SEED DATA

-- Roles
INSERT INTO roles (id, name, description) VALUES
('ORG_ADMIN', 'Organization Admin', 'Full access to organization settings and queues'),
('DOCTOR', 'Doctor', 'Can manage assigned consultations and queues'),
('RECEPTIONIST', 'Receptionist', 'Can manage front desk queue operations'),
('LAB_TECHNICIAN', 'Lab Technician', 'Can manage lab tasks'),
('CASHIER', 'Cashier', 'Can process payments'),
('USER', 'Regular User', 'Standard user permissions');

-- Role Permissions
INSERT INTO role_permissions (role_id, permission) VALUES
('ORG_ADMIN', 'MANAGE_QUEUE'),
('ORG_ADMIN', 'MANAGE_STAFF'),
('ORG_ADMIN', 'VIEW_ANALYTICS'),
('DOCTOR', 'MANAGE_QUEUE'),
('RECEPTIONIST', 'MANAGE_QUEUE'),
('LAB_TECHNICIAN', 'MANAGE_TASKS'),
('CASHIER', 'PROCESS_PAYMENTS');

-- Org 1: Government Hospital
INSERT INTO organizations (id, name, type, auth_mode) VALUES 
('11111111-1111-1111-1111-111111111111', 'City General Hospital', 'govt', 'aadhaar');

-- Service 1: Doctor Checkup
INSERT INTO services (id, organization_id, name, description, capacity) VALUES 
(1, '11111111-1111-1111-1111-111111111111', 'General Outpatient', 'General Consultations', 2);
INSERT INTO service_configurations (service_id) VALUES (1);

-- Worker 1
INSERT INTO workers (organization_id, service_id, name, username, password_hash, role_id) VALUES 
('11111111-1111-1111-1111-111111111111', 1, 'Admin Health', 'admin_health', '$2b$10$NyyAWsVr6k5b9ylxryZBeOAOgEEEACiiPvCUGwi/r.qLaRHRyY8kO', 'ORG_ADMIN');

-- Org 2: University Cafe
INSERT INTO organizations (id, name, type, auth_mode) VALUES 
('22222222-2222-2222-2222-222222222222', 'Tech University Cafe', 'institution', 'student_id');

-- Service 2: Coffee Counter
INSERT INTO services (id, organization_id, name, description, capacity) VALUES 
(2, '22222222-2222-2222-2222-222222222222', 'Barista Counter', 'Coffee and Snacks', 3);
INSERT INTO service_configurations (service_id) VALUES (2);

-- Worker 2
INSERT INTO workers (organization_id, service_id, name, username, password_hash, role_id) VALUES 
('22222222-2222-2222-2222-222222222222', 2, 'Admin Cafe', 'admin_cafe', '$2b$10$NyyAWsVr6k5b9ylxryZBeOAOgEEEACiiPvCUGwi/r.qLaRHRyY8kO', 'ORG_ADMIN');