-- Optional: CREATE EXTENSION vector; (requires pgvector installed on Postgres)

-- Competitors master list
CREATE TABLE IF NOT EXISTS competitors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  website_url TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  last_scraped_at TIMESTAMP,
  scrape_status TEXT DEFAULT 'pending', -- pending | running | done | failed
  sheet_metadata JSONB -- extra columns from manager Google Sheet
);

-- Raw scraped pages live in MongoDB (MONGODB_URI), collection: knowledge_pages
-- See db/knowledgePages.ts and npm run db:document-store

-- Metadata per competitor (enriched by OpenAI)
CREATE TABLE IF NOT EXISTS competitor_metadata (
  id SERIAL PRIMARY KEY,
  competitor_id INT REFERENCES competitors(id) ON DELETE CASCADE UNIQUE,
  service_type TEXT,
  transfer_rails TEXT[],
  geo_coverage TEXT[],
  supported_currencies TEXT[],
  fee_structure TEXT,
  transfer_speed TEXT,
  delivery_methods TEXT[],
  has_mobile_app BOOLEAN,
  has_business_account BOOLEAN,
  founded_year INT,
  headquarters TEXT,
  is_regulated BOOLEAN,
  regulation_bodies TEXT[],
  raw_metadata JSONB,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Final summarized info per competitor per page type (Final Info DB)
CREATE TABLE IF NOT EXISTS page_content (
  id SERIAL PRIMARY KEY,
  competitor_id INT REFERENCES competitors(id) ON DELETE CASCADE,
  page_type TEXT NOT NULL, -- see agents/pageTypes.ts for canonical ids
  content JSONB NOT NULL,
  meta_title TEXT,
  meta_description TEXT,
  generated_at TIMESTAMP DEFAULT NOW(),
  needs_refresh BOOLEAN DEFAULT FALSE,
  UNIQUE(competitor_id, page_type)
);

-- Cron run log
CREATE TABLE IF NOT EXISTS cron_runs (
  id SERIAL PRIMARY KEY,
  run_type TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  finished_at TIMESTAMP,
  competitors_processed INT DEFAULT 0,
  status TEXT DEFAULT 'running',
  error_log TEXT
);

CREATE INDEX IF NOT EXISTS idx_page_content_competitor ON page_content(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitors_scrape_status ON competitors(scrape_status);

-- Multi-provider marketing compare pages (e.g. wise + remitly vs Sliq pay)
CREATE TABLE IF NOT EXISTS compare_pages (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  provider_slugs TEXT[] NOT NULL,
  content JSONB NOT NULL,
  meta_title TEXT,
  meta_description TEXT,
  generated_at TIMESTAMP DEFAULT NOW(),
  needs_refresh BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_compare_pages_slug ON compare_pages(slug);
