# SliqPay Programmatic Pages — Full Technical Walkthrough

**Purpose:** Prepare for a deep-dive technical review with leadership or engineering.  
**Audience:** You (presenter) + technical stakeholders.  
**Last updated:** June 2026 — reflects MongoDB document store + Wise pilot.

For a shorter management overview see [architecture.md](./architecture.md).  
For engineering schema detail see [architecture-technical.md](./architecture-technical.md).  
For live demo steps see [DEMO.md](./DEMO.md).

---

## Table of contents

1. [The one-sentence system](#1-the-one-sentence-system)
2. [How this maps to the original 5-step vision](#2-how-this-maps-to-the-original-5-step-vision)
3. [End-to-end data flow](#3-end-to-end-data-flow)
4. [Repository layout](#4-repository-layout)
5. [Step 0 — Competitor seeding](#5-step-0--competitor-seeding)
6. [Step 1 — Scraper (no AI)](#6-step-1--scraper-no-ai)
7. [Step 2 — Document store (MongoDB)](#7-step-2--document-store-mongodb)
8. [Step 3 — Metadata agent (first LLM pass)](#8-step-3--metadata-agent-first-llm-pass)
9. [Step 4 — Summarizer agent (second LLM pass)](#9-step-4--summarizer-agent-second-llm-pass)
10. [Step 5 — PostgreSQL structured store](#10-step-5--postgresql-structured-store)
11. [Step 6 — Frontend (Next.js ISR)](#11-step-6--frontend-nextjs-isr)
12. [Orchestration and commands](#12-orchestration-and-commands)
13. [Scheduling (monthly cron)](#13-scheduling-monthly-cron)
14. [Environment variables and secrets](#14-environment-variables-and-secrets)
15. [Scale, cost, and timing](#15-scale-cost-and-timing)
16. [Wise pilot — what actually happened](#16-wise-pilot--what-actually-happened)
17. [Known limitations and roadmap](#17-known-limitations-and-roadmap)
18. [Verification queries (demo proof)](#18-verification-queries-demo-proof)
19. [Anticipated questions and answers](#19-anticipated-questions-and-answers)
20. [Suggested presentation order (45–60 min)](#20-suggested-presentation-order-4560-min)

---

## 1. The one-sentence system

We automatically **scrape competitor websites**, **archive raw HTML in MongoDB**, **use OpenAI to extract structured facts and write 8 comparison page variants per competitor into PostgreSQL**, and **publish them as SEO pages** via Next.js — refreshed monthly at scale to ~257 competitors × 8 pages ≈ **2,056 pages**.

---

## 2. How this maps to the original 5-step vision

| Original step | What leadership described | What we built |
|---------------|---------------------------|---------------|
| **1. Scrape** | Non-blog, non-career pages from competitor sites | `agents/scraper.ts` — Playwright + Cheerio |
| **2. Document store** | Dump raw HTML (MongoDB or Elastic suggested) | **MongoDB** — `knowledge_pages` collection |
| **3. Analyzer** | Scheduled job; LLM extracts insights per site design | `agents/metadata.ts` + `agents/summarizer.ts` |
| **4. SQL store** | Structured tables for the website | **PostgreSQL** — `competitor_metadata`, `page_content` |
| **5. Frontend** | SliqPay vs Wise comparison pages | Next.js `/compare/[slug]/[pageType]` |

**Scraping approach (from original discussion):**

| Suggestion | Our implementation |
|------------|-------------------|
| Don't use curl for SPAs | Playwright headless Chromium |
| Sitemap for URL catalogue | `sitemap.xml`, `robots.txt`, sitemap indexes |
| Own crawler as supplement | BFS link following, same-origin only |
| Common path probes | `/pricing`, `/fees`, `/send-money-to-india`, etc. |
| Skip blog/careers | `EXCLUDED_PATH_PATTERNS` in `scraperPaths.ts` |
| Common Crawl / Internet Archive | **Roadmap** — fallback for blocked sites |
| Mongo vs Elastic | **MongoDB** — better fit for document CRUD than search-first Elastic |

---

## 3. End-to-end data flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         COMPETITOR SOURCE                                  │
│  Google Sheet (257 rows)  OR  data/competitors.csv                       │
│  npm run seed:sheet                                                        │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PostgreSQL: competitors                                                   │
│  id, name, website_url, slug, scrape_status, sheet_metadata (JSONB)      │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  AGENT 1 — SCRAPER (agents/scraper.ts)                                     │
│  • URL discovery: sitemap + probes + BFS crawl                           │
│  • Playwright renders JS (Wise, Remitly, etc.)                           │
│  • Cheerio strips nav/footer → clean text                                  │
│  • Cap: 100 pages per competitor                                           │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  MongoDB: knowledge_pages                                                  │
│  { competitorId, url, title, rawHtml, cleanText, scrapedAt }             │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  AGENT 2 — METADATA (agents/metadata.ts)                                   │
│  • Reads top 25 prioritized pages from MongoDB                             │
│  • + sheet_metadata from Postgres                                          │
│  • OpenAI → structured JSON profile                                        │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PostgreSQL: competitor_metadata                                           │
│  fees, speed, regulation, rails, raw_metadata JSONB                        │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  AGENT 3 — SUMMARIZER (agents/summarizer.ts)                               │
│  • Reads top 40 prioritized pages + metadata + SliqPay facts               │
│  • OpenAI × 8 page types (separate prompt per type)                        │
│  • Outputs comparison JSON with data_gaps                                  │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PostgreSQL: page_content                                                  │
│  (competitor_id, page_type) → content JSONB, meta_title, meta_description  │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Next.js ISR (pages/compare/[competitor]/[pageType].tsx)                   │
│  Static pages, revalidate every 30 days                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key design choice:** Raw blobs (HTML) live in MongoDB. Relational, queryable, publishable data lives in PostgreSQL. The marketing site only reads PostgreSQL.

---

## 4. Repository layout

```
sliqpay-programmatic-pages/
├── agents/
│   ├── scraper.ts          # Agent 1 — Playwright crawl
│   ├── scraperPaths.ts     # Probe paths + exclusion patterns
│   ├── metadata.ts         # Agent 2 — structured extraction
│   ├── summarizer.ts       # Agent 3 — 8 page types
│   ├── competitorContext.ts # Sheet + Mongo knowledge → prompts
│   ├── llm.ts              # OpenAI wrapper (JSON mode, retries)
│   ├── parseJson.ts        # Parse model JSON output
│   └── pageTypes.ts        # Canonical 8 page type IDs + titles
├── db/
│   ├── schema.sql          # PostgreSQL tables
│   ├── pool.ts             # Postgres connection pool
│   ├── documentStore.ts    # MongoDB client
│   ├── knowledgePages.ts   # MongoDB CRUD + URL prioritization
│   ├── knowledgeDB.ts      # Re-export pool (pipeline)
│   └── finalInfoDB.ts      # Re-export pool (Next.js)
├── prompts/
│   ├── metadata.txt        # Metadata extraction schema
│   └── summarizer/         # One prompt file per page type
├── scripts/
│   ├── runPipeline.ts      # CLI entry point
│   ├── seedCompetitors.ts  # Sheet/CSV → Postgres
│   ├── competitorImport.ts # CSV parsing + Google Sheet fetch
│   └── setupDocumentStore.ts
├── cron/
│   └── monthly.ts          # Batch orchestrator
├── pages/                  # Next.js routes (ISR)
├── components/
│   └── ComparisonPageLayout.tsx  # Debug JSON renderer
└── .github/workflows/cron.yml    # Monthly GitHub Actions
```

---

## 5. Step 0 — Competitor seeding

**Command:** `npm run seed:sheet` (or `npm run seed` for local CSV)

**Flow:**

1. Fetches manager Google Sheet as CSV (must be public: Anyone with link → Viewer).
2. `parseCompetitorCsv()` auto-detects columns:
   - Name: `company`, `name`, `competitor`, …
   - URL: `website_url`, `website`, `url`, …
   - Optional slug column; otherwise slugified from name.
3. **All other columns** → `sheet_metadata` JSONB (HQ, service type, US→India, fee notes, etc.).
4. Upserts into `competitors` by unique `slug`.

**Why sheet metadata matters:** The metadata and summarizer agents receive sheet data *in addition to* scraped content. This grounds comparisons when the website is sparse or blocked.

**Current scale:** 257 competitors seeded.

---

## 6. Step 1 — Scraper (no AI)

**File:** `agents/scraper.ts`  
**Entry:** `scrapeCompetitor(competitorId, websiteUrl)`  
**AI:** None — pure browser automation.

### 6.1 Why Playwright, not curl

Fintech sites (Wise, Remitly, etc.) are **Single Page Applications (SPAs)**. Pricing and fees load via JavaScript after the initial HTML shell. `curl` or plain `fetch` would return empty shells. Playwright runs headless Chromium, waits for JS hydration, then captures full DOM HTML.

### 6.2 URL discovery (three layers)

We do **not** assume every site uses `/pricing` or `/fees`. Discovery is hybrid:

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **A. Sitemap** | `sitemap.xml`, `robots.txt`, sitemap indexes | Site's own URL catalogue (up to 80 URLs seeded) |
| **B. Probes** | 29 common paths in `scraperPaths.ts` | Safety net for SPAs with few crawlable links |
| **C. BFS crawl** | Follow same-origin links from each saved page | Discover real paths like `/in/pricing`, `/gb/send-money` |

**Initial queue** = probes + sitemap URLs + homepage (deduplicated).

### 6.3 Exclusions

`EXCLUDED_PATH_PATTERNS` skips URLs containing:

`/blog/`, `/news/`, `/press/`, `/careers/`, `/jobs/`, `/login`, `/sign-in`, `/signup`, `/register`, `/app/`, `/download`

Substring match — so `/blog/pricing-tips` is excluded even if path structure varies.

### 6.4 Page load strategy

For each URL, Playwright tries a **retry ladder**:

1. `domcontentloaded` (45s timeout)
2. `load` (45s)
3. `networkidle` (25s)

Then **2 second hydration wait** for SPAs. This was added specifically for Wise-style heavy sites.

### 6.5 Content extraction

```text
Playwright page.content() → full HTML
Cheerio removes: script, style, nav, footer, header, noscript, svg
cleanText = body text, whitespace collapsed
```

**Skip if `cleanText.length < 80`** — avoids storing empty SPA shells or 404 pages.

### 6.6 Crawl limits (important for big sites like Wise)

| Limit | Value | Why |
|-------|-------|-----|
| `MAX_PAGES_PER_COMPETITOR` | **100** | We need ~15–30 high-value pages, not 200k |
| Sitemap seed cap | **80** | Avoid queue explosion on huge sitemaps |
| Delay between pages | **400ms** | Polite crawling, reduce block risk |

**We do not crawl all 200k Wise URLs.** We stop at 100 saved pages. Downstream agents only read the **top 25–40** by URL priority anyway.

### 6.7 Status tracking

`competitors.scrape_status`: `pending` → `running` → `done` | `failed`

If **0 pages** saved → `ScrapeFailedError` → pipeline skips AI steps (no hallucinated comparisons from empty data).

### 6.8 Link extraction (SPA-aware)

Beyond `<a href>`, we also parse:

- `<link href>`
- `data-href`, `data-url`, `data-link` attributes
- URLs embedded in `<script>` JSON (common on React apps)

---

## 7. Step 2 — Document store (MongoDB)

**Why MongoDB over PostgreSQL for raw HTML:**

- Document-native storage (one doc = one scraped page)
- Efficient upsert by `(competitorId, url)`
- Keeps large `rawHtml` blobs out of Postgres row bloat
- Matches leadership's "document store" requirement
- Elasticsearch was rejected — it's search/analytics-first, overkill for "dump and read top N"

**Connection:** `MONGODB_URI` (e.g. `mongodb://localhost:27017/sliqpay_knowledge`)

**Collection:** `knowledge_pages`

**Document shape:**

```json
{
  "competitorId": 176,
  "url": "https://wise.com/in/pricing",
  "title": "Wise pricing",
  "rawHtml": "<html>...</html>",
  "cleanText": "Send money abroad with Wise...",
  "scrapedAt": "2026-06-07T..."
}
```

**Indexes:**

- Unique: `(competitorId, url)`
- Query: `(competitorId, scrapedAt)`

**Repository:** `db/knowledgePages.ts`

- `upsertKnowledgePage()` — called by scraper after each save
- `getPrioritizedKnowledgePages()` — called by metadata/summarizer

### URL prioritization (feeds the analyzer)

When the LLM runs, it does **not** see all 100 pages. Pages are sorted by URL keywords:

| Priority | URL contains |
|----------|----------------|
| 1 | pricing, fees, rates |
| 2 | send-money, india, transfer |
| 3 | features, how, security, trust |
| 4 | about, faq, help |
| 5 | everything else |

Tie-break: longer `cleanText` wins (more substantive content).

Metadata agent: **top 25** pages (~80K chars).  
Summarizer agent: **top 40** pages (~50K chars).

---

## 8. Step 3 — Metadata agent (first LLM pass)

**File:** `agents/metadata.ts`  
**Prompt template:** `prompts/metadata.txt`  
**Model:** `OPENAI_MODEL` (default `gpt-5.5`)  
**Output:** One row in `competitor_metadata` per competitor

### Inputs

1. Top 25 prioritized pages from MongoDB (`cleanText`)
2. `competitors.sheet_metadata` from Google Sheet
3. Structured prompt with JSON schema

### Extracted fields (examples)

- `service_type`, `fee_structure`, `transfer_speed`
- `transfer_rails`, `geo_coverage`, `supported_currencies`
- `is_regulated`, `regulation_bodies`
- `has_mobile_app`, `has_business_account`
- Extended fields in `raw_metadata` JSONB: typical fees, USPs, weaknesses

### Honesty rules

Prompt requires:

- `data_gaps` array for unverified fields
- `null` for unknowns — no invented fees or regulation
- Sources: sheet + website only

### LLM call details

- `response_format: { type: "json_object" }` — forces valid JSON
- `maxTokens: 2500`
- **3 retries** with backoff on empty/failed responses (`agents/llm.ts`)

---

## 9. Step 4 — Summarizer agent (second LLM pass)

**File:** `agents/summarizer.ts`  
**Prompts:** `prompts/summarizer/*.txt` (one per page type)  
**Output:** 8 rows in `page_content` per competitor

### The 8 page types

| `page_type` id | Title template |
|----------------|----------------|
| `sliqpay-vs-competitor` | Sliq pay vs {competitor} |
| `which-is-cheaper` | Which is cheaper: Sliq pay or {competitor} |
| `which-is-faster` | Which is faster: Sliq pay or {competitor} |
| `which-is-safer` | Which is safer: Sliq pay or {competitor} |
| `which-is-more-convenient` | Which is more convenient: Sliq pay or {competitor} |
| `which-is-better-for-tourists-visiting-india` | Which is better for tourists visiting India: … |
| `which-is-better-for-nris` | Which is better for NRIs: … |
| `competitor-alternative-sliqpay` | {competitor} alternative: Sliq pay |

Source of truth: `agents/pageTypes.ts`

### Inputs per page type

1. Top 40 MongoDB pages (prioritized)
2. `competitor_metadata.raw_metadata`
3. `sheet_metadata`
4. **SliqPay facts** (hardcoded in summarizer — authoritative for SliqPay side only)
5. Page-type-specific prompt (defines JSON sections)

### Example JSON sections (vs page)

From `prompts/summarizer/vs-competitor.txt`:

```json
{
  "page_title", "hero", "verdict_banner", "score_cards",
  "comparison_table_rows", "deep_dive_sections", "faqs", "cta",
  "meta_title", "meta_description", "data_gaps"
}
```

Cheaper page uses `fee_breakdown_sliq`, `transfer_scenarios`, etc. Each page type has different sections — **output shape depends on webpage design angle**, as leadership specified.

### Data integrity rules (`COMPARISON_DATA_RULES`)

- Competitor claims must come from scrape, sheet, or metadata
- Use **"Not stated"** when missing — never guess
- `data_gaps` array lists unverified comparison fields
- SliqPay facts are fixed in prompt (mid-market rate, zero India fees, FinCEN, etc.)

### LLM call details

- `maxTokens: 10_000` (large JSON pages)
- 1 second delay between page types (rate limiting)
- Per-page retries via `llm.ts`
- `summarizeAllPageTypes` continues on partial failure and reports which types failed

---

## 10. Step 5 — PostgreSQL structured store

**Schema:** `db/schema.sql`

| Table | Role |
|-------|------|
| `competitors` | Master list, scrape status, sheet metadata |
| `competitor_metadata` | LLM-extracted profile (1 per competitor) |
| `page_content` | Publishable JSON (8 per competitor) |
| `cron_runs` | Pipeline audit log |

**Not in Postgres anymore:** `knowledge_pages` (moved to MongoDB).

### `page_content` row

```sql
competitor_id | page_type              | content (JSONB) | meta_title | meta_description
```

Unique on `(competitor_id, page_type)` — re-runs upsert in place.

---

## 11. Step 6 — Frontend (Next.js ISR)

**This repo = content factory.** UI is a **debug preview** — final marketing design may live in a separate repo reading the same Postgres.

### Routes

| Route | File | Behavior |
|-------|------|----------|
| `/` | `pages/index.tsx` | Lists all generated pages from DB |
| `/compare/[competitor]/[pageType]` | `pages/compare/...tsx` | Renders one comparison page |

### ISR (Incremental Static Regeneration)

- `getStaticPaths` — builds paths from `page_content` JOIN `competitors`
- `getStaticProps` — loads `content` JSONB by slug + page_type
- `revalidate: 2592000` (30 days) — aligns with monthly pipeline refresh
- `fallback: 'blocking'` — new competitors work without rebuild

### `ComparisonPageLayout.tsx`

Renders:

- `<title>` and meta description from DB
- Hero headline/subheadline
- All JSON sections as formatted `<pre>` blocks (debug view)
- FAQs and CTA sections

Production marketing site would map JSON sections to designed components instead of raw JSON.

---

## 12. Orchestration and commands

**Entry point:** `scripts/runPipeline.ts` → calls agents in sequence.

### Full pipeline (one competitor)

```bash
npm run pipeline -- --ids 176
```

Runs: scrape → metadata → all 8 summarize steps.

### Partial runs (resume / debug)

| Flag | Effect |
|------|--------|
| `--scrape-only` | MongoDB only |
| `--metadata-only` | Skip scrape; re-run metadata (+ summarize if no `--page-type` alone*) |
| `--summarize-only` | Skip scrape + metadata; run summarizer |
| `--page-type which-is-cheaper` | Single page type only |
| `--pending` | Only competitors with `scrape_status = pending` |
| `--ids 1,176` | Specific competitor IDs |

*Note: `--metadata-only` without `--page-type` runs metadata only, not summarize. Use `--summarize-only` to regenerate pages.

### Examples

```bash
# Wise full run
npm run pipeline -- --ids 176

# Re-generate one page after prompt edit
npm run pipeline -- --ids 176 --summarize-only --page-type which-is-cheaper

# Scrape only (no OpenAI cost)
npm run pipeline -- --ids 176 --scrape-only
```

### Per-competitor failure behavior

- Scrape 0 pages → stops before AI
- Metadata failure → competitor marked `failed`, continues batch
- Summarize partial failure → completed pages saved; error lists failed types

---

## 13. Scheduling (monthly cron)

**File:** `.github/workflows/cron.yml`

- **Schedule:** 1st of each month, 02:00 UTC
- **Manual:** `workflow_dispatch` in GitHub Actions UI
- **Steps:** `npm ci` → Playwright install → `db:schema` → `db:document-store` → `runPipeline.ts --pending`

**Secrets required:** `DATABASE_URL`, `MONGODB_URI`, `OPENAI_API_KEY`

**Audit:** `cron_runs` table logs processed count, status, error_log.

---

## 14. Environment variables and secrets

| Variable | Required by | Purpose |
|----------|-------------|---------|
| `DATABASE_URL` | Pipeline + Next.js build | PostgreSQL connection |
| `MONGODB_URI` | Pipeline (scrape + analyze) | MongoDB document store |
| `OPENAI_API_KEY` | Metadata + summarizer | LLM calls |
| `OPENAI_MODEL` | Optional (default `gpt-5.5`) | Model selection |
| `COMPETITORS_SHEET_ID` | `seed:sheet` | Google Sheet ID |

---

## 15. Scale, cost, and timing

### Target scale

- **257 competitors** × **8 page types** = **~2,056 pages**
- **~25,700 MongoDB documents** at cap (257 × 100 pages)

### OpenAI calls per competitor

| Step | Calls |
|------|-------|
| Metadata | 1 |
| Summarize | 8 |
| **Total** | **9 per competitor** |

Full monthly run: ~257 × 9 ≈ **2,313 API calls** (+ retries on failure).

### Timing (rough)

| Competitor type | Scrape | AI steps |
|-----------------|--------|----------|
| Small/static site | 5–15 min | 5–15 min |
| Heavy SPA (Wise) | 1–2 hours | 10–20 min |

**Do not run full 257 in a live demo.**

---

## 16. Wise pilot — what actually happened

**Competitor ID:** 176 | **URL:** https://wise.com

### Scrape results

- 27 URLs from sitemap seed
- 54 URLs in initial queue (probes + sitemap + homepage)
- **100 pages saved** to MongoDB (cap hit)
- 2 skipped (thin content: `/features`, `/support`)
- Mix of high-value pages: `/pricing`, `/fees`, `/in/pricing`, `/send-money-to-india`, corridor pages

### AI results

- Metadata: enriched successfully
- 5 page types generated on first run
- Page 6 (tourists) failed: `OpenAI returned empty content` (transient / token limit on large prompt)
- **Fixed:** retries in `llm.ts`, higher token limit, resumed with `--summarize-only`
- All **8 page types** now complete

### Demo URLs

```text
http://localhost:3000/compare/wise/sliqpay-vs-competitor
http://localhost:3000/compare/wise/which-is-cheaper
... (all 8 page_type ids)
```

Verify slug: `SELECT slug FROM competitors WHERE id = 176;`

---

## 17. Known limitations and roadmap

### Current limitations

| Issue | Impact | Phase |
|-------|--------|-------|
| FIFO crawl queue (not priority) | May waste 100 slots on low-value corridor URLs on huge sites | Phase 2 |
| Sitemap capped at 80, unsorted | May miss best URLs on 200k-page sites | Phase 2 |
| Some scraped URLs are noise (sitemap XML, API endpoints) | Clutters Mongo; LLM prioritization mitigates | Phase 2 |
| No Common Crawl yet | Manual discovery only | Phase 2 fallback |
| Debug JSON UI | Not production marketing design | Separate web repo |
| No human review queue | All pages auto-published to DB | Phase 3 |

### Roadmap (`docs/pipeline-upgrade-plan.md`)

- **Phase 2:** Priority crawl queue, scrape reports, Common Crawl catalogue, bot detection
- **Phase 3:** Field-level validation, review queue, pgvector retrieval
- **Phase 4:** BullMQ parallel workers, cost controls, auto-redeploy webhook

---

## 18. Verification queries (demo proof)

### PostgreSQL

```sql
-- Competitor status
SELECT id, name, slug, scrape_status, last_scraped_at
FROM competitors WHERE id = 176;

-- AI profile
SELECT service_type, fee_structure, transfer_speed,
       is_regulated, regulation_bodies
FROM competitor_metadata WHERE competitor_id = 176;

-- All 8 pages
SELECT page_type, meta_title, generated_at
FROM page_content WHERE competitor_id = 176
ORDER BY page_type;

-- Count competitors at scale
SELECT COUNT(*) FROM competitors;
SELECT COUNT(*) FROM page_content;
```

### MongoDB

```bash
npm run db:test:mongo -- --competitor-id 176
```

```javascript
use sliqpay_knowledge
db.knowledge_pages.countDocuments({ competitorId: 176 })
db.knowledge_pages.find(
  { competitorId: 176, url: /pricing|fees|india/i },
  { url: 1, title: 1, scrapedAt: 1 }
).limit(10)
```

---

## 19. Anticipated questions and answers

### "Walk me through what happens when you run the pipeline for Wise."

> We seed Wise from the sheet into Postgres. The scraper discovers URLs via sitemap and common probes, then Playwright visits up to 100 pages and dumps raw HTML into MongoDB. The metadata agent reads the top 25 pages plus sheet data and writes a structured profile to Postgres. The summarizer runs 8 separate LLM calls — one per comparison angle — and stores JSON page content in Postgres. Next.js reads that JSON and renders ISR pages.

### "Why MongoDB and Postgres?"

> Leadership asked for a document store for raw HTML. MongoDB is the right fit — one document per scraped page, efficient upserts, no row bloat in Postgres. Postgres holds relational data the website queries: competitors, metadata, and final page content. Clean separation of concerns.

### "Why only 100 pages when Wise has 200k?"

> We don't need a full site mirror. Comparison pages need pricing, fees, regulation, India corridor — maybe 15–30 URLs. We cap Playwright at 100 as a buffer, then the LLM only reads the top 25–40 by URL priority. Common Crawl will help with URL catalogue at scale without crawling everything.

### "How do you prevent the AI from making up competitor fees?"

> Three layers: prompts require "Not stated" for missing data; `data_gaps` arrays flag unverified fields; pipeline fails scrape if zero pages so we never analyze empty data. SliqPay facts are hardcoded separately — only competitor side must be sourced.

### "What if a site blocks the scraper?"

> `scrape_status = failed`, logged in `cron_runs`. Phase 2 adds bot detection and proxies. Common Crawl / Internet Archive as fallback for catalogue + archived HTML.

### "How often does content refresh?"

> Monthly GitHub Actions cron (or on demand). ISR pages revalidate every 30 days on the web side.

### "What's the cost at full scale?"

> ~2,300 OpenAI calls per monthly run. Scrape is infrastructure time, not API cost. Pilot (1 competitor) ≈ 9 calls.

### "Is this production-ready for the marketing site?"

> The **content pipeline** is proven (Abound + Wise). This repo's UI is a debug preview. Production = separate marketing repo reading same Postgres `page_content`, with human review before go-live (Phase 3).

### "What failed on Wise and how did you fix it?"

> Scrape and metadata succeeded. Summarizer failed on page 6 with empty OpenAI response — transient API issue on a large prompt. We added retries, increased token budget, and resumed with `--summarize-only` for the 3 missing page types. All 8 complete now.

---

## 20. Suggested presentation order (45–60 min)

| Time | Topic | Show |
|------|-------|------|
| 5 min | Problem + 5-step architecture | This doc §2–3 or architecture.md diagram |
| 5 min | Competitor seeding | Google Sheet, `npm run seed:sheet` |
| 10 min | Scraper deep dive | `scraper.ts`, `scraperPaths.ts`, Wise terminal log |
| 5 min | MongoDB document store | `db/knowledgePages.ts`, mongosh count |
| 10 min | Analyzer (metadata + summarizer) | `metadata.txt`, `cheaper.txt`, `data_gaps` on live page |
| 5 min | Postgres + page JSON | SQL queries §18 |
| 5 min | Frontend ISR | localhost Wise pages |
| 5 min | Scale, cron, roadmap | §15–17 |
| 5 min | Q&A | §19 |

---

## Quick reference card (print or keep open)

```
SEED:     npm run seed:sheet
RUN:      npm run pipeline -- --ids 176
RESUME:   npm run pipeline -- --ids 176 --summarize-only --page-type <id>
DEV:      npm run dev
WISE URL: /compare/wise/sliqpay-vs-competitor

STORES:
  MongoDB  → raw HTML (knowledge_pages)
  Postgres → competitors, competitor_metadata, page_content

AGENTS:
  scraper.ts    → no AI
  metadata.ts   → 1 LLM call
  summarizer.ts → 8 LLM calls

CAPS:
  100 pages scraped / competitor
  25–40 pages fed to LLM
  8 page types / competitor
  257 competitors target
```

---

*Export to PDF: open this file in VS Code / browser → Print → Save as PDF, or use `npx md-to-pdf docs/TECHNICAL-WALKTHROUGH.md` if you have a markdown PDF tool installed.*
