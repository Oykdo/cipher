-- Migration: Add X3DH sessions table
-- Tracks handshake state for X3DH protocol WITHOUT storing any cryptographic material
-- All private keys and ratchet state are stored CLIENT-SIDE in KeyVault

-- X3DH session states
-- PENDING: Handshake initiated, waiting for response
-- ACTIVE: Handshake completed, session established
-- FAILED: Handshake failed (timeout, rejection, etc.)
-- EXPIRED: Session expired due to inactivity

CREATE TABLE IF NOT EXISTS x3dh_sessions (
    -- Session identification
    session_id VARCHAR(36) PRIMARY KEY,           -- UUID v4
    
    -- Participants (NO cryptographic material stored)
    initiator_user_id VARCHAR(255) NOT NULL,      -- User who initiated handshake
    responder_user_id VARCHAR(255) NOT NULL,      -- User who received handshake
    
    -- Session state (server tracks state, NOT keys)
    state VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, ACTIVE, FAILED, EXPIRED
    
    -- Timestamps for lifecycle management
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,          -- NULL = never expires (for active sessions)
    
    -- Retry tracking
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP WITH TIME ZONE,
    
    -- Error tracking (for debugging, no sensitive data)
    failure_reason VARCHAR(255),                  -- E.g., 'timeout', 'rejected', 'invalid_signature'
    
    -- Foreign keys
    FOREIGN KEY (initiator_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (responder_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_x3dh_sessions_initiator ON x3dh_sessions(initiator_user_id);
CREATE INDEX IF NOT EXISTS idx_x3dh_sessions_responder ON x3dh_sessions(responder_user_id);
CREATE INDEX IF NOT EXISTS idx_x3dh_sessions_state ON x3dh_sessions(state);
CREATE INDEX IF NOT EXISTS idx_x3dh_sessions_expires ON x3dh_sessions(expires_at) WHERE expires_at IS NOT NULL;

-- Unique constraint to prevent duplicate sessions between same users
CREATE UNIQUE INDEX IF NOT EXISTS idx_x3dh_sessions_unique_pair 
ON x3dh_sessions(initiator_user_id, responder_user_id) 
WHERE state IN ('PENDING', 'ACTIVE');

-- Comment on security decisions
COMMENT ON TABLE x3dh_sessions IS 'Server-side X3DH session tracking. NO cryptographic material stored - only metadata.';
COMMENT ON COLUMN x3dh_sessions.session_id IS 'UUID v4 generated client-side for handshake correlation';
COMMENT ON COLUMN x3dh_sessions.state IS 'Session state: PENDING (awaiting response), ACTIVE (established), FAILED, EXPIRED';
