-- Migration: Add conversation_requests table
-- Created: 2025-12-03
-- Description: Add support for conversation request/invitation system
-- Compatible with: PostgreSQL

-- ============================================================================
-- CONVERSATION_REQUESTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversation_requests (
  id VARCHAR(255) PRIMARY KEY,
  from_user_id VARCHAR(255) NOT NULL,
  to_user_id VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE,
  conversation_id VARCHAR(255),
  
  FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  
  UNIQUE(from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_requests_to_user 
  ON conversation_requests(to_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_requests_from_user 
  ON conversation_requests(from_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_requests_status 
  ON conversation_requests(status, created_at DESC);
