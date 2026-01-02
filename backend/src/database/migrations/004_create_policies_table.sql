-- Policies table
CREATE TABLE IF NOT EXISTS policies (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  s3_key VARCHAR(500) NOT NULL,
  public_url TEXT NOT NULL,
  icon_type VARCHAR(50) DEFAULT 'default',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster retrieval
CREATE INDEX IF NOT EXISTS idx_policies_created_at ON policies(created_at);
