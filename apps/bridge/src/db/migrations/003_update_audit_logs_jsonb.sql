-- Migration 003: Update audit_logs to use JSONB
-- Date: 2025-12-03
-- Description: Convert old_values and new_values to JSONB for better querying in Postgres
-- Compatible with: PostgreSQL

-- Convert old_values and new_values columns to JSONB
-- We use USING clause to parse the existing TEXT data as JSON
ALTER TABLE audit_logs 
  ALTER COLUMN old_values TYPE JSONB USING old_values::jsonb,
  ALTER COLUMN new_values TYPE JSONB USING new_values::jsonb;

-- Create GIN indexes for efficient JSON querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_old_values ON audit_logs USING GIN (old_values);
CREATE INDEX IF NOT EXISTS idx_audit_logs_new_values ON audit_logs USING GIN (new_values);
