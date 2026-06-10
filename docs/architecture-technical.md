# SliqPay Programmatic Comparison Pages — Technical Architecture

**Audience:** Engineering and technical reviewers  
**Management overview:** See [architecture.md](./architecture.md)

**Status:** Implemented (pipeline repo); marketing site may live in a separate repository.  
**Scale target:** 250 competitors × 8 page types = **2,000 static comparison pages**.

---

## Executive summary

We run a **monthly research pipeline** that:

1. Crawls competitor websites and stores raw HTML in **MongoDB**.
2. Uses **OpenAI** to extract structured competitor metadata (fees, rails, regulation, etc.) into **PostgreSQL**.
3. Uses **OpenAI** again to generate **8 comparison page variants** per competitor (vs, cheaper, faster, etc.).
4. Stores final page JSON in PostgreSQL for a **Next.js site** to render as static/ISR pages.

The pipeline and the public website can be **separate repositories**; they connect through **MongoDB** (raw research) and **PostgreSQL** (structured content), or a future JSON/API export.

---

## System diagram

```
┌─────────────────┐
│ Competitor CSV  │  (250 names + URLs, seeded once)
└────────┬────────┘
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    RESEARCH PIPELINE REPO                    │
│  GitHub Actions (monthly cron) OR manual: runPipeline.ts    │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ 1. Scraper      │────▶│ 2. Metadata      │────▶│ 3. Summarizer   │
│    Agent        │     │    Agent (OpenAI)│     │    Agent (OpenAI)│
│ Playwright +    │     │ Structured JSON  │     │ 8 page types    │
│ Cheerio         │     │ per competitor   │     │ per competitor  │
└────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
         │                       │                          │
         ▼                       └────────────┬─────────────┘
┌─────────────────┐                            ▼
│   MongoDB       │              ┌────────────────────────┐
│ knowledge_pages │              │   PostgreSQL           │
│ (raw HTML)      │              │   • competitors        │
└─────────────────┘              │   • competitor_metadata│
                                 │   • page_content       │
                                 └────────────┬───────────┘
                                 ▼
                    ┌────────────────────────┐
                    │   WEB REPO (separate)  │
                    │   Next.js ISR          │
                    │   /compare/{slug}/{type}│
                    └────────────────────────┘
```

---

## Technology stack

| Layer | Technology | Role |
|-------|------------|------|
| Crawling | Playwright + Cheerio | JS-rendered sites; HTML → clean text |
| Document store | MongoDB (`knowledge_pages`) | Raw HTML archive per scraped URL |
| Structured store | PostgreSQL | Competitors, metadata, page content |
| Final content store | PostgreSQL (`page_content`) | Structured JSON per page type |
| AI enrichment | OpenAI API (`gpt-5.5` default) | Metadata + page copy generation |
| LLM wrapper | `agents/llm.ts` | Shared client, JSON response format |
| Orchestration | TypeScript + GitHub Actions | Monthly batch pipeline |
| Publishing | Next.js 14 ISR | Static pages, 30-day revalidation |
| Queue (future) | BullMQ + Redis | Parallel jobs at full 250-competitor scale |

---

## Agent specifications

### Agent 1 — Scraper (`agents/scraper.ts`)

**Input:** `competitor_id`, competitor `website_url`  
**Output:** Documents in MongoDB `knowledge_pages` collection  
**AI:** None

**Behavior:**

- Breadth-first crawl, same-origin only, up to **1,000 pages** per competitor.
- Skips blog, news, press, careers paths.
- Stores `rawHtml`, `cleanText`, `title`, `url` in MongoDB.
- 500ms delay between requests; updates `competitors.scrape_status` (`pending` → `running` → `done` / `failed`).

---

### Agent 2 — Metadata enrichment (`agents/metadata.ts`)

**Input:** Top 20 MongoDB knowledge pages (prioritized: pricing, fees, features, how-it-works, about)  
**Output:** One row in `competitor_metadata` per competitor  
**AI:** OpenAI via `generateJson()` in `agents/llm.ts`

**Behavior:**

- Concatenates page text (~80K char cap).
- Sends prompt from `prompts/metadata.txt`.
- Uses `response_format: { type: "json_object" }` for reliable JSON parsing.
- Writes typed columns plus full blob in `raw_metadata`.

**Extracted fields (examples):**

- `service_type`, `transfer_rails`, `geo_coverage`, `supported_currencies`
- `fee_structure`, `transfer_speed`, `delivery_methods`
- `has_mobile_app`, `has_business_account`, `founded_year`, `headquarters`
- `is_regulated`, `regulation_bodies`
- Extended fields in JSON: typical fees, rate markup, USPs, weaknesses

---

### Agent 3 — Summarizer (`agents/summarizer.ts`)

**Input:** Up to 30 knowledge pages + `competitor_metadata` + SliqPay product facts + page-type prompt  
**Output:** One row per `(competitor_id, page_type)` in `page_content`  
**AI:** OpenAI via `generateJson()` (max 4,000 tokens per page type)

**Page types (8)** — canonical ids in `agents/pageTypes.ts`:

| `page_type` (URL slug) | Page title |
|------------------------|------------|
| `sliqpay-vs-competitor` | Sliq pay vs {competitor} |
| `which-is-cheaper` | Which is cheaper: Sliq pay or {competitor} |
| `which-is-faster` | Which is faster: Sliq pay or {competitor} |
| `which-is-safer` | Which is safer: Sliq pay or {competitor} |
| `which-is-more-convenient` | Which is more convenient: Sliq pay or {competitor} |
| `which-is-better-for-tourists-visiting-india` | Which is better for tourists visiting India: Sliq pay or {competitor} |
| `which-is-better-for-nris` | Which is better for NRIs: Sliq pay or {competitor} |
| `competitor-alternative-sliqpay` | {competitor} alternative: Sliq pay |

Each type has a dedicated prompt in `prompts/summarizer/*.txt` defining the **JSON shape** (hero, FAQs, CTA, `meta_title`, `meta_description`, etc.).

**Rate limiting:** 1 second between page-type calls per competitor.

---

### LLM wrapper (`agents/llm.ts`)

Centralizes OpenAI configuration:

- **Env:** `OPENAI_API_KEY` (required), `OPENAI_MODEL` (optional, default `gpt-5.5`)
- **API:** `chat.completions.create` with JSON response format
- **Parsing:** `parseJsonFromModel()` strips markdown fences if present

Both metadata and summarizer agents call `generateJson()` — no direct SDK usage elsewhere.

---

### Pipeline orchestrator (`cron/monthly.ts`)

Runs per competitor, sequentially:

1. Scrape → 2. Metadata → 3. Summarize (all 8 types)

Logs each run in `cron_runs` (status, counts, errors). Supports filtering by `--pending` or specific `--ids`.

**Schedule:** GitHub Actions — 1st of each month, 02:00 UTC (+ manual `workflow_dispatch`).

---

## Database schema

**PostgreSQL** (`db/schema.sql`) holds competitors, enriched metadata, and publishable page content.  
**MongoDB** (`MONGODB_URI`, collection `knowledge_pages`) holds raw scraped HTML.

### `competitors`

Master list of money-transfer competitors.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `name` | TEXT | Display name |
| `website_url` | TEXT | Crawl entry point |
| `slug` | TEXT UNIQUE | URL slug (e.g. `wise`) |
| `last_scraped_at` | TIMESTAMP | |
| `scrape_status` | TEXT | `pending` \| `running` \| `done` \| `failed` |

### MongoDB — `knowledge_pages` collection (document store)

Raw crawl output — one document per URL per competitor.

| Field | Type | Notes |
|--------|------|-------|
| `competitorId` | number | FK to Postgres `competitors.id` |
| `url` | string | Unique with `competitorId` |
| `title` | string \| null | |
| `rawHtml` | string | Full HTML |
| `cleanText` | string | Text for LLM input |
| `scrapedAt` | Date | |

**Indexes:** unique `(competitorId, url)`; `(competitorId, scrapedAt)`.

**Env:** `MONGODB_URI` (e.g. `mongodb://localhost:27017/sliqpay_knowledge`).

### `competitor_metadata`

LLM-enriched structured profile — **one row per competitor**.

| Column | Type | Notes |
|--------|------|-------|
| `competitor_id` | FK UNIQUE | |
| `service_type` | TEXT | bank \| fintech \| remittance \| wallet |
| `transfer_rails` | TEXT[] | e.g. SWIFT, UPI, ACH |
| `geo_coverage` | TEXT[] | Country/region codes |
| `supported_currencies` | TEXT[] | |
| `fee_structure` | TEXT | free \| flat \| percentage \| mixed |
| `transfer_speed` | TEXT | instant \| hours \| days |
| `delivery_methods` | TEXT[] | bank, cash, wallet, UPI |
| `has_mobile_app` | BOOLEAN | |
| `has_business_account` | BOOLEAN | |
| `founded_year` | INT | |
| `headquarters` | TEXT | |
| `is_regulated` | BOOLEAN | |
| `regulation_bodies` | TEXT[] | FinCEN, FCA, RBI, etc. |
| `raw_metadata` | JSONB | Full LLM output |
| `updated_at` | TIMESTAMP | |

### `page_content` (Final Info DB)

Publishable page payload — **one row per competitor per page type**.

| Column | Type | Notes |
|--------|------|-------|
| `competitor_id` | FK | |
| `page_type` | TEXT | One of 8 types above |
| `content` | JSONB | Full page structure for frontend |
| `meta_title` | TEXT | SEO title |
| `meta_description` | TEXT | SEO description |
| `generated_at` | TIMESTAMP | |
| `needs_refresh` | BOOLEAN | Flag for stale content |

**Unique constraint:** `(competitor_id, page_type)`

### `cron_runs`

Operational audit log for pipeline executions.

| Column | Type | Notes |
|--------|------|-------|
| `run_type` | TEXT | e.g. `full` |
| `started_at` / `finished_at` | TIMESTAMP | |
| `competitors_processed` | INT | |
| `status` | TEXT | `running` \| `done` \| `failed` |
| `error_log` | TEXT | Per-competitor failures |

---

## Entity relationships

```
competitors (1) ──< MongoDB knowledge_pages (many, by competitorId)
competitors (1) ──< competitor_metadata (1)
competitors (1) ──< page_content (many, up to 8 page types)
```

---

## Publishing model (web repo)

- Route pattern: **`/compare/[competitor]/[pageType]`** (e.g. `/compare/wise/which-is-cheaper`).
- Next.js **ISR**: paths generated from `page_content` + `competitors`; **revalidate every 30 days**.
- After monthly pipeline updates DB, the site needs **revalidation or redeploy** to show new copy.
- Web repo can use **read-only DB credentials**; pipeline uses read/write.

---

## Security & operations

| Item | Approach |
|------|----------|
| Secrets | `DATABASE_URL`, `OPENAI_API_KEY` in GitHub Secrets / host env |
| DB access | Separate read-only user for web build recommended |
| Failure handling | Per-competitor try/catch; `scrape_status = failed`; errors in `cron_runs.error_log` |
| Content accuracy | Human review recommended for first batch; prompts encode SliqPay canonical facts |

---

## Cost & volume estimates

Per full monthly run (250 competitors):

| Step | Calls per competitor | Total calls |
|------|---------------------|-------------|
| Metadata | 1 | 250 |
| Summarize | 8 | 2,000 |
| **Total LLM calls** | **9** | **2,250** |

Scraper calls are bounded at 1,000 pages × 250 competitors worst case (typically far less after path exclusions).

Model default: **`gpt-5.5`**. Override with `OPENAI_MODEL` (e.g. `gpt-5.4-mini` for pilot runs).

---

## Rollout plan

1. Seed 3–5 competitors from CSV
2. Run pipeline for one competitor; validate DB rows
3. Connect web repo; verify one page per type
4. Monthly cron for full 250-competitor set
5. (Optional) BullMQ for parallel scraping; pgvector for semantic page selection

---

## Repository layout (pipeline repo)

```
agents/
  scraper.ts       Playwright crawler
  metadata.ts      OpenAI metadata extraction
  summarizer.ts    OpenAI page content generation
  llm.ts           Shared OpenAI client
  parseJson.ts     JSON parsing helper
  pageBuilder.ts   Page refresh utilities
cron/
  monthly.ts       Full pipeline orchestrator
db/
  schema.sql       Table definitions
  pool.ts          PostgreSQL connection pool
  pool.ts          PostgreSQL pool
  documentStore.ts MongoDB client
  knowledgePages.ts Raw scrape repository
  knowledgeDB.ts   Postgres query exports (pipeline)
  finalInfoDB.ts   Query exports (web)
prompts/
  metadata.txt
  summarizer/      One prompt per page type
scripts/
  seedCompetitors.ts
  runPipeline.ts
  runSchema.js
data/
  competitors.csv
.github/workflows/
  cron.yml         Monthly GitHub Actions job
docs/
  architecture.md           Management overview
  architecture-technical.md   This document
```

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `OPENAI_API_KEY` | Yes | OpenAI API key for metadata + summarizer |
| `OPENAI_MODEL` | No | Model ID (default: `gpt-5.5`) |
| `DATABASE_SSL` | No | Set to `true` for SSL connections |
