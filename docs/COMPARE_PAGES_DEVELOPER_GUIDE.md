# Compare Pages — Developer Guide (Both Repos)

This document explains how **sliqpay-programmatic-pages** (content pipeline) and **Sliq-website** (marketing site) work together to produce multi-provider compare pages like `/compare/remitly-vs-wise-vs-sliq-pay`.

Use this as the single reference for onboarding, debugging, stakeholder Q&A, and scaling to hundreds of competitor pages.

---

## Table of contents

1. [Big picture](#1-big-picture)
2. [The two pipelines](#2-the-two-pipelines)
3. [Multi-provider compare pipeline (step by step)](#3-multi-provider-compare-pipeline-step-by-step)
4. [How every JSON field gets populated](#4-how-every-json-field-gets-populated)
5. [How the website renders each section](#5-how-the-website-renders-each-section)
6. [Live pricing vs exported pricing](#6-live-pricing-vs-exported-pricing)
7. [FX API on the website](#7-fx-api-on-the-website)
8. [Commands cheat sheet](#8-commands-cheat-sheet)
9. [Environment variables](#9-environment-variables)
10. [Important file map](#10-important-file-map)
11. [Common questions (cross-examination prep)](#11-common-questions-cross-examination-prep)
12. [Scaling to ~250 competitor pages](#12-scaling-to-250-competitor-pages)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Big picture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    sliqpay-programmatic-pages (pipeline)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  Manager Google Sheet / competitors.csv                                     │
│       ↓ seed                                                                │
│  PostgreSQL: competitors, competitor_metadata, compare_pages, page_content  │
│       ↓ scrape (Playwright + Cheerio)                                       │
│  MongoDB: knowledge_pages (raw HTML per competitor URL)                     │
│       ↓ metadata agent (OpenAI) + summarizer (8 page types per competitor)  │
│       ↓ compare:build (deterministic, no LLM)                               │
│  compare_pages table (full JSON document)                                   │
│       ↓ export:compare                                                      │
│  Sliq-website/src/content/compare/pages/{slug}.json + config.json           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Sliq-website (marketing site)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  next build → static pages at /compare/[slug]                               │
│  ComparePageTemplate → 8 Figma-aligned sections                             │
│  Section 3 uses live PriceComparison widget → /api/fx-rates/competitor-info│
└─────────────────────────────────────────────────────────────────────────────┘
```

**Live page today:** `remitly-vs-wise-vs-sliq-pay` → https://www.sliq-pay.com/compare/remitly-vs-wise-vs-sliq-pay

**Repos (expected sibling layout):**

```
Documents/
  sliqpay-programmatic-pages/   ← generates content
  Sliq-website/                 ← renders content
```

---

## 2. The two pipelines

The programmatic-pages repo runs **two separate page families**. Do not confuse them.

| | **1v1 pipeline (original)** | **Multi-provider compare (current marketing pages)** |
|---|---|---|
| **Purpose** | 8 narrative SEO pages per competitor (cheaper, faster, safer, etc.) | One Figma-style 8-section marketing page per slug (Wise + Remitly + Sliq, etc.) |
| **Output table** | `page_content` | `compare_pages` |
| **Generation** | OpenAI summarizer per page type | Deterministic evidence assembler (no LLM at build time) |
| **Preview in pipeline repo** | `/compare/[competitor]/[pageType]` (Next.js ISR) | Not previewed here — exported JSON only |
| **Marketing site route** | Planned: `/compare/vs/[competitor]/[pageType]` (not live yet) | **Live:** `/compare/[slug]` |
| **Build command** | `npm run pipeline` | `npm run compare:build` |
| **Export command** | (future Phase 3) | `npm run export:compare` |

**This guide focuses on the multi-provider compare pipeline** because that is what powers the live `/compare/[slug]` pages on sliq-pay.com.

---

## 3. Multi-provider compare pipeline (step by step)

### 3.1 Define which pages to build

**File:** `data/compare-pages.csv`

```csv
slug,provider_slugs
remitly-vs-wise-vs-sliq-pay,"wise,remitly"
```

| Column | Meaning |
|--------|---------|
| `slug` | URL segment and JSON filename. Becomes `/compare/{slug}` on the website. |
| `provider_slugs` | Comma-separated competitor slugs from the `competitors` table. **Sliq is always added automatically** — do not list `sliq` here. |

Current pilot: Wise + Remitly + Sliq (3 columns in the comparison table).

### 3.2 Prerequisites per competitor

Before `compare:build` succeeds for a slug, each `provider_slug` must exist in Postgres and ideally have:

1. **Row in `competitors`** — from `npm run seed:sheet` or `npm run seed`
2. **Scraped pages in MongoDB** — from `npm run pipeline` or `npm run scrape`
3. **Metadata in `competitor_metadata`** — from the metadata enrichment step in the pipeline

Without scrape + metadata, validation may fail or cells will show low-confidence fallbacks.

### 3.3 Build (`npm run compare:build`)

**Orchestrator:** `scripts/runComparePages.ts` → `agents/comparePageBuilder.ts`

For each CSV row:

```
1. loadCompetitorBundle(slug)     — Postgres competitor + metadata + MongoDB pages (up to 30)
2. extractProviderEvidence()      — facts per field from scrape / metadata / sheet
3. buildSliqEvidence()            — hardcoded canonical Sliq facts
4. enrichBundlesWithPricingQuotes() — live FX API overwrites pricing facts
5. assembleComparePageDocument()  — full 8-section JSON
6. validateComparePageDocument()  — fail-closed checks; throws on bad data
7. UPSERT into compare_pages      — Postgres JSONB storage
```

**CLI options:**

```bash
npm run compare:build                              # all rows in CSV
npm run compare:build -- --slug remitly-vs-wise-vs-sliq-pay   # one page
```

There is a 1-second delay between pages to avoid hammering the FX API.

### 3.4 Export (`npm run export:compare`)

**Script:** `scripts/exportComparePages.ts`

- Reads all rows from `compare_pages`
- Validates again before write
- Writes `../Sliq-website/src/content/compare/pages/{slug}.json`
- Writes `../Sliq-website/src/content/compare/config.json` with `publishedSlugs` and `defaultSlug`
- Strips `data_gaps` from export (logged separately for editorial review)
- Normalizes asset paths (e.g. `sliq.svg` → `sliq-pay.svg`)

### 3.5 Website build

From **Sliq-website**:

```bash
npm run import:compare   # alias → runs export:compare in sibling repo
npm run build            # static generation + sitemap
```

**Publishing gate:** A JSON file on disk is **not enough**. The slug must appear in `config.json` → `publishedSlugs`. The export script updates this automatically.

---

## 4. How every JSON field gets populated

The canonical TypeScript schema lives in `agents/comparePageTypes.ts`. Below is the field-by-field map from **source data → JSON → UI**.

### 4.1 Top-level document

| JSON field | Populated by | Source / logic | Rendered on site? |
|------------|--------------|----------------|-------------------|
| `slug` | CSV | `data/compare-pages.csv` | Yes (URL, metadata) |
| `meta.title` | Assembler | `"{Competitor1} vs {Competitor2} vs Sliq Pay: USD to INR Comparison"` | Yes (`generateMetadata`) |
| `meta.description` | Assembler | Provider names + "source-backed pricing, speed…" | Yes |
| `meta.robots` | Assembler | Optional; `noindex` suppresses indexing | Yes |
| `hero.heading` | Assembler | Same as title + current year | Yes (Section 1 H1) |
| `corridor` | Builder constant | USD→INR, ACH pay-in, UPI payout, `receiveAmount: 100` | Yes (passed to live widget; see §6) |
| `evidence` | Extractor + assembler | Flat map `{providerId}.{field}` → `EvidenceRef` | **No** (audit trail only) |
| `validation` | Assembler | `generatedAt`, `requiredEvidenceCount`, `sourceCoverage` | **No** (pipeline metadata) |

### 4.2 Evidence model (underpins all displayed text)

Every fact is an `EvidenceRef`:

```typescript
{
  id: "wise.speed",
  providerId: "wise",
  field: "speed",
  value: string | number | boolean,
  displayValue?: string,          // what users see in cells
  source: { url, title?, quote, retrievedAt },
  confidence: "high" | "medium" | "low",
  method: "officialPage" | "officialQuoteApi" | "managerSheet" |
          "structuredMetadata" | "sliqCanonicalFacts"
}
```

**Evidence priority per field** (`compareEvidenceExtractor.ts`):

1. **Scraped pages** (`officialPage`) — sentence matching keyword patterns; legal/pricing/send-money URLs prioritized
2. **Postgres `competitor_metadata`** (`structuredMetadata`) — typed columns + `raw_metadata` JSONB
3. **Google Sheet extra columns** (`managerSheet`) — stored in `competitors.sheet_metadata`
4. **Fallback strings** (`structuredMetadata`, low confidence) — e.g. "Variable fee — see live quote"
5. **Sliq only:** `sliqCanonicalFacts` — hardcoded product truths in `buildSliqEvidence()`

**Important:** Raw scraped quotes are used for **citations** and icon detection. **Display values** come from structured metadata fallbacks when scrape text is noisy (nav menus, country lists, etc.).

### 4.3 Section 1 — `competitorComparison`

| JSON path | Populated by | Logic |
|-----------|--------------|-------|
| `rows[]` | Assembler constant | 7 fixed rows: builtFor, transferMethods, cost, fxRate, speed, security, compliance |
| `providers[]` | One per bundle | Competitors from CSV + **Sliq always last** |
| `providers[].cells[].text` | `fact.displayValue` | From evidence per row id |
| `providers[].cells[].icon` | Regex on quote text | `positive` / `negative` / `neutral` sparkle icons |
| `providers[].highlighted` | `id === 'sliq'` | Sliq column styling + store buttons |
| `providers[].iconSrc` | `wordmarkSrc()` | `/image/compare/section1-{id}-wordmark.png` |
| `mobileDefaults` | Assembler | `{ leftId: first competitor, rightId: 'sliq' }` |

**Fields extracted per row** (competitors): `builtFor`, `transferMethods`, `cost`, `fxRate`, `speed`, `security`, `compliance` — each mapped via `METADATA_KEYS_BY_FIELD` in the extractor.

### 4.4 Section 2 — `speedComparison`

| JSON path | Populated by | Logic |
|-----------|--------------|-------|
| `rows[]` | Assembler | Sliq first, then competitors |
| `rows[].copy` | Assembler + `extractSpeedPhrase()` | Sliq: highlight copy ("Instant via IMPS/UPI"); competitors: short phrase from speed fact |
| `rows[].barSrc`, `logoSrc` | Assembler | Static image paths per provider id |

### 4.5 Section 3 — `priceSection` + `priceComparison`

| JSON path | Populated by | Logic | Rendered? |
|-----------|--------------|-------|-----------|
| `priceSection.heading` | Assembler static copy | Marketing headline (split on `\n` for line breaks) | **Yes** |
| `priceSection.description` | Assembler static copy | Marketing paragraphs (split on `\n\n`) | **Yes** |
| `priceComparison` | Assembler from priced evidence | Static table: recipientGets, exchangeRate, hiddenCharges, transferFee, totalTransferCost | **No** — see §6 |

**Pricing facts** are overwritten at build time by `comparePricingQuotes.ts`:

- POST to `{FX_RATE_API_BASE_URL}/api/v1/fx-rates/competitor-info`
- Maps provider names → API slugs: Sliq Pay, Wise, Remitly
- Sets: `recipientGets`, `exchangeRate`, `hiddenCharges`, `transferFee`, `totalTransferCost`
- On 429: uses hardcoded `DEV_FALLBACK_RESPONSE` in the pipeline repo

### 4.6 Section 4 — `featureComparison`

| JSON path | Populated by | Logic |
|-----------|--------------|-------|
| `features[]` | Assembler constant | 6 features: easyToUse, scanToPay, sendPhoneEmail, sendBank, requestMoney, instantTransfers |
| `providers[].cells[]` | `statusFromFact()` on feature facts | positive / negative / neutral → tick / cross / question icons |
| Feature facts | Extractor | Page text → metadata inference → `"Unavailable"` for competitors without evidence |

### 4.7 Section 5 — `securityCompliance`

| JSON path | Populated by | Logic |
|-----------|--------------|-------|
| `heading`, `description` | Assembler static | Marketing copy |
| `bullets[]` | Assembler static Sliq bullets | Each bullet linked to Sliq compliance/security evidence ids |

Scales image is **hardcoded in the React component**, not from JSON.

### 4.8 Section 6 — `supportComparison`

| JSON path | Populated by | Logic |
|-----------|--------------|-------|
| `columns[]` | Assembler per provider | Tagline, subtitle, background pattern, gradient (Sliq only), verify badge (Sliq only) |

### 4.9 Section 7 — `faq`

| JSON path | Populated by | Logic |
|-----------|--------------|-------|
| `heading` | Assembler | Static or from `faqComparison.json` reference |
| `items[]` | `buildFaqItems()` | 5 templated Q&As weaving competitor names + evidence-derived speed/cost/compliance text |

FAQ JSON-LD is generated on the website from `faq.items`.

### 4.10 Section 8 — `guidelines`

| JSON path | Populated by | Logic |
|-----------|--------------|-------|
| `paragraphs[]` | Assembler static | Legal / disclaimer copy |

---

## 5. How the website renders each section

**Route:** `src/app/compare/[slug]/page.js`  
**Template:** `src/components/compare/ComparePageTemplate.jsx`  
**Data loader:** `src/lib/compare/data.js` (reads `config.json` + `pages/{slug}.json` at build time)

| # | Component | JSON props used |
|---|-----------|-----------------|
| 1 | `CompetitorComparisonSection` | `hero.heading`, `competitorComparison` |
| 2 | `CompareSpeedSection` | `speedComparison` |
| 3 | `ComparePriceSection` | `priceSection`, `corridor` → **live `PriceComparison`** |
| 4 | `CompareFeaturesSection` | `featureComparison` |
| 5 | `CompareSecuritySection` | `securityCompliance` |
| 6 | `CompareSupportSection` | `supportComparison` |
| 7 | `CompareFaqSection` | `faq` (+ JSON-LD) |
| 8 | `CompareGuidelinesSection` | `guidelines` |

**Not rendered today:** `priceComparison`, `evidence`, `validation` (travel with export for audit/debug).

**`/compare` index:** `src/app/compare/page.js` redirects to `config.json` → `defaultSlug`.

**Sitemap:** `next-sitemap.config.js` adds each `publishedSlugs` entry at priority 0.85 on `postbuild`.

---

## 6. Live pricing vs exported pricing

This is a common source of confusion.

| | **Exported `priceComparison` in JSON** | **Live `PriceComparison` widget on site** |
|---|---|---|
| **When populated** | At `compare:build` time (FX API or pipeline fallback) | On every page load in the browser |
| **Has From/To/Receiver inputs** | No | **Yes** (matches Figma node 234-40111) |
| **Used by ComparePageTemplate** | No | **Yes** |
| **Purpose** | Audit trail, validation, potential future SSR/SEO snapshot | Real user-facing quotes |

`ComparePriceSection.jsx` always renders:

```jsx
<PriceComparison
  showHeader={false}
  corridor={page.corridor}
  defaultReceiveAmount={1000}
/>
```

**Note:** JSON `corridor.receiveAmount` is `100` (pipeline default) but the widget defaults to **1000 INR** via hardcoded `defaultReceiveAmount`. The `/pricing` hero uses `79900`. Align these intentionally when product asks for a specific default.

`CompareStructuredPriceTable.jsx` exists for static rendering but is **not wired up** after the switch to the live widget.

---

## 7. FX API on the website

Compare page Section 3 and `/pricing` both call the same proxy.

**Route:** `src/app/api/fx-rates/competitor-info/route.js`  
**Library:** `src/lib/fxRates.js`

### Request flow

```
Browser POST /api/fx-rates/competitor-info
  → in-memory cache (key = JSON.stringify(body))
  → upstream: {FX_RATE_API_BASE_URL}/api/v1/fx-rates/competitor-info
  → on success: cache 30 min, return providers
  → on 429/5xx: serve stale cache (up to 1 hr) → else buildFallbackFxRates()
```

### Why localhost worked but prod failed (before fix)

| Factor | Localhost | Production |
|--------|-----------|------------|
| Dev-only fallback | Old code returned quotes on 429 in development | No fallback — 429 reached the browser |
| Process lifetime | `next dev` keeps in-memory cache warm | Serverless cold starts reset cache |
| Outbound IP | One machine, low volume | All visitors share server IP → exhausts upstream rate limit |
| Default upstream | `fx-rate.dev.sliqpayapp.com` | Same |

**After deploy:** prod should return 200 with either live quotes or `fallback: true` in the response body.

**Verify after deploy (PowerShell):**

```powershell
$body = '{"sendCurrency":"USD","receiveCurrency":"INR","recipientGetsAmount":1000,"payinRail":"ACH","payoutRail":"UPI"}'
Invoke-RestMethod -Uri "https://www.sliq-pay.com/api/fx-rates/competitor-info" -Method POST -ContentType "application/json" -Body $body
```

Set `FX_RATE_API_BASE_URL` on prod to the production FX service when available.

---

## 8. Commands cheat sheet

### Pipeline repo (`sliqpay-programmatic-pages`)

| Command | What it does |
|---------|--------------|
| `npm run seed:sheet` | Import ~250 competitors from manager Google Sheet → Postgres |
| `npm run seed` | Import from local `data/competitors.csv` |
| `npm run pipeline` | Full scrape → metadata → summarize (1v1 pages) |
| `npm run pipeline -- --ids 1,2,3` | Run for specific competitor IDs |
| `npm run scrape` | Scrape only |
| `npm run compare:build` | Build all compare pages from CSV → `compare_pages` |
| `npm run compare:build -- --slug <slug>` | Build one compare page |
| `npm run export:compare` | Write JSON + config to Sliq-website |
| `npm run db:schema` | Apply Postgres schema |
| `npm run typecheck` | TypeScript check |

### Website repo (`Sliq-website`)

| Command | What it does |
|---------|--------------|
| `npm run import:compare` | Runs `export:compare` in sibling pipeline repo |
| `npm run build` | Production build + static compare pages |
| `npm run dev` | Local dev server |

### End-to-end refresh (one compare page)

```bash
# In sliqpay-programmatic-pages (needs DATABASE_URL, MONGODB_URI, FX API)
npm run compare:build -- --slug remitly-vs-wise-vs-sliq-pay
npm run export:compare

# In Sliq-website
npm run build
```

---

## 9. Environment variables

### Pipeline repo

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL |
| `MONGODB_URI` | Yes | Scraped HTML store |
| `OPENAI_API_KEY` | For 1v1 pipeline | Metadata + summarizer |
| `OPENAI_MODEL` | No | Default `gpt-5.5` |
| `COMPETITORS_SHEET_ID` | For `seed:sheet` | Manager Google Sheet |
| `FX_RATE_API_BASE_URL` | For compare build | Pricing quotes (default: dev FX host) |

### Website repo

| Variable | Required | Purpose |
|----------|----------|---------|
| `FX_RATE_API_BASE_URL` | Recommended on prod | Upstream FX API for `/api/fx-rates/competitor-info` |

---

## 10. Important file map

### Pipeline — compare (multi-provider)

| Path | Role |
|------|------|
| `data/compare-pages.csv` | Which pages to build |
| `data/competitors.csv` / Google Sheet | Competitor seed list (~250 players) |
| `agents/comparePageBuilder.ts` | Build orchestrator |
| `agents/compareEvidenceExtractor.ts` | Evidence from scrape / metadata / sheet |
| `agents/comparePricingQuotes.ts` | Live FX pricing at build time |
| `agents/comparePageAssembler.ts` | JSON document assembly |
| `agents/compareValidation.ts` | Fail-closed validation |
| `agents/comparePageTypes.ts` | TypeScript schema |
| `scripts/runComparePages.ts` | `compare:build` CLI |
| `scripts/exportComparePages.ts` | Export to website |
| `db/schema.sql` | `compare_pages`, `competitors`, etc. |

### Pipeline — 1v1 (separate, not on marketing site yet)

| Path | Role |
|------|------|
| `agents/scraper.ts` | Web crawler |
| `agents/metadata.ts` | OpenAI metadata enrichment |
| `agents/summarizer.ts` | 8 page types per competitor |
| `agents/pageTypes.ts` | Page type definitions |
| `scripts/runPipeline.ts` | Main pipeline CLI |
| `docs/compare-one-to-one-integration.md` | Future website integration plan |

### Website — compare pages

| Path | Role |
|------|------|
| `src/content/compare/config.json` | `publishedSlugs`, `defaultSlug` |
| `src/content/compare/pages/*.json` | Page documents |
| `src/lib/compare/data.js` | Slug allowlist + JSON loader |
| `src/app/compare/[slug]/page.js` | Route + SSG + metadata |
| `src/components/compare/ComparePageTemplate.jsx` | 8-section layout |
| `src/components/compare/ComparePriceSection.jsx` | Section 3 → live widget |
| `src/components/common/PriceComparison.jsx` | Live FX widget |
| `src/app/api/fx-rates/competitor-info/route.js` | FX proxy |
| `src/lib/fxRates.js` | Cache, retry, fallback |
| `src/styles/compare.css` | Compare page styles |
| `public/image/compare/` | Section backgrounds, wordmarks, bars |

---

## 11. Common questions (cross-examination prep)

### "Where does the compare page content come from?"

Three layers: (1) scraped competitor websites in MongoDB, (2) structured metadata in Postgres (+ manager sheet columns), (3) live FX API for pricing facts at build time. Sliq facts are hardcoded canonical truths. The website adds a **fourth live layer** for Section 3 pricing via the FX proxy.

### "Is the compare page content AI-generated?"

The **multi-provider compare page is not LLM-generated at build time**. It is assembled deterministically from evidence. The **1v1 pipeline** (8 pages per competitor) does use OpenAI summarization — that is a separate system.

### "Why do we export `priceComparison` if the site doesn't use it?"

It is the evidence-backed snapshot at build time. Useful for QA, diffing between builds, and potential future SEO/static fallback. The user-facing widget always fetches live quotes.

### "How do we add a new compare page?"

1. Ensure competitors exist and are scraped (`seed` + `pipeline`)
2. Add a row to `data/compare-pages.csv`
3. `npm run compare:build -- --slug your-new-slug`
4. `npm run export:compare`
5. `npm run build` in Sliq-website
6. Deploy

### "Why would a slug 404 even though JSON exists?"

`getComparePageBySlug()` requires the slug in `config.json` → `publishedSlugs`. Export updates this; manual JSON drops without config update will 404.

### "What happens if scrape data is garbage?"

Validation bans uncertainty phrases ("not stated", "placeholder", etc.). The extractor prefers metadata display fallbacks over raw scrape sentences for cell text. Bad pages fail at build time rather than publishing nonsense.

### "Can we have more than 2 competitors + Sliq?"

The assembler supports N competitor bundles + Sliq. CSV `provider_slugs` can list multiple slugs. UI/CSS may need testing for 4+ columns.

### "What's the difference between `npm run import:compare` and `export:compare`?"

`import:compare` in the website repo is a convenience alias that runs `export:compare` in the sibling pipeline repo. Same outcome.

### "How often should content refresh?"

- **Scrape + metadata:** monthly cron (`cron/monthly.ts`, GitHub Actions) or on-demand
- **Compare pages:** re-run `compare:build` when competitor data or FX logic changes
- **Live pricing on site:** real-time per user input (no rebuild needed)

---

## 12. Scaling to ~250 competitor pages

The manager Google Sheet ("Full remittance player long list") contains roughly **250 remittance competitors**. Here is a practical rollout plan.

### 12.1 What "250 pages" can mean

Choose the page model before scaling:

| Model | Pages | URL pattern | Best for |
|-------|-------|-------------|----------|
| **A. 1v1 compare** | ~250 | `/compare/{competitor}-vs-sliq-pay` | Maximum SEO coverage; one hero competitor per page |
| **B. Multi-provider** | Variable | `/compare/wise-vs-remitly-vs-sliq-pay` | Head-to-head among top players |
| **C. 1v1 narrative (8 types)** | ~2,000 | `/compare/vs/{competitor}/which-is-cheaper` | Long-tail SEO; uses summarizer pipeline |
| **D. Combined** | 250 + clusters | Mix of A + B | Recommended long-term |

**Recommended phased approach:** Start with **Model A** (one Sliq-vs-competitor page per scraped competitor), then add **Model B** cluster pages for top 10–20 brands.

### 12.2 Phase 0 — Infrastructure (one time)

- [ ] Postgres + MongoDB provisioned for production pipeline runs
- [ ] `FX_RATE_API_BASE_URL` pointed at production FX service (not dev)
- [ ] Website FX proxy fallback deployed (429 handling)
- [ ] CI job or scheduled Action for monthly `pipeline` + weekly `compare:build`
- [ ] Asset pipeline for competitor logos/wordmarks (`/public/image/programmatic/{slug}.svg`)

### 12.3 Phase 1 — Seed all competitors

```bash
npm run seed:sheet
```

Verify:

```sql
SELECT COUNT(*) FROM competitors;
SELECT scrape_status, COUNT(*) FROM competitors GROUP BY scrape_status;
```

Target: ~250 rows with unique slugs and valid `website_url`.

### 12.4 Phase 2 — Scrape and enrich (batch)

**Option A — Full monthly cron:** `cron/monthly.ts` processes all pending competitors.

**Option B — Batched manual runs:**

```bash
npm run pipeline -- --pending
npm run pipeline -- --ids 1,2,3,4,5
```

For each competitor this produces:
- MongoDB pages (raw HTML)
- `competitor_metadata` (OpenAI enrichment)
- `page_content` (8 narrative pages — optional for Model A)

**Throughput estimate:** Scraping 250 sites is I/O bound; plan **hours to days** with rate limiting and Playwright. Run in batches of 10–25 with failure retry.

**Quality gate:** Only build compare pages where `scrape_status = 'done'` and metadata exists.

### 12.5 Phase 3 — Generate compare page CSV at scale

Automate CSV generation from Postgres:

```csv
slug,provider_slugs
wise-vs-sliq-pay,"wise"
remitly-vs-sliq-pay,"remitly"
western-union-vs-sliq-pay,"western-union"
...
```

**Naming convention:** `{competitor-slug}-vs-sliq-pay` with a single `provider_slug`. Sliq is appended in code.

For cluster pages among top brands:

```csv
remitly-vs-wise-vs-sliq-pay,"wise,remitly"
```

**Script to write:** A one-off `scripts/generateCompareCsv.ts` that:

1. `SELECT slug FROM competitors WHERE scrape_status = 'done'`
2. Emits one row per competitor
3. Optionally skips competitors that failed validation on a pilot build

### 12.6 Phase 4 — Batch build and export

```bash
npm run compare:build          # all CSV rows; 1s delay between pages
npm run export:compare
```

**FX API rate limits:** 250 sequential builds = ~250 FX API calls minimum. Use:
- Build-time caching in `comparePricingQuotes.ts`
- Off-peak batch windows
- Production FX API with higher limits

**Failed builds:** `compareValidation.ts` fails closed. Log failures, fix evidence gaps (re-scrape, manual sheet metadata), re-run `--slug`.

### 12.7 Phase 5 — Website build and deploy

```bash
cd Sliq-website
npm run import:compare
npm run build
```

**Build time:** 250 static pages is fine for Next.js SSG. Sitemap grows automatically via `postbuild`.

**Publishing:** `export:compare` sets `publishedSlugs` to all exported slugs. For staged rollout, manually trim `publishedSlugs` in `config.json` to publish in waves (e.g. 25/week).

### 12.8 Phase 6 — Ongoing operations

| Task | Frequency | Command |
|------|-----------|---------|
| Re-scrape competitors | Monthly | `npm run pipeline -- --pending` |
| Rebuild compare JSON | After scrape or FX logic change | `compare:build` + `export:compare` |
| Refresh live pricing on site | Automatic | No rebuild — FX proxy handles it |
| Add new competitor | Ad hoc | `seed:sheet` → `pipeline -- --ids N` → add CSV row → `compare:build` |

### 12.9 Risks at 250-page scale

| Risk | Mitigation |
|------|------------|
| FX API 429 on build and runtime | Prod FX host, website fallback, longer cache TTL |
| Missing competitor logos | Default placeholder + batch SVG import from brand assets |
| Thin scrape evidence | Manager sheet metadata fills gaps; fail build rather than publish placeholders |
| Build failures block export | `export:compare` validates each page; fix per-slug and re-run |
| SEO duplicate/thin content | Unique evidence per competitor; 1v1 slugs per brand |
| Large repo JSON size | 250 × ~50–100 KB JSON ≈ 12–25 MB — acceptable in git; consider LFS if it grows |

### 12.10 Future: 1v1 narrative pages on marketing site

The summarizer already produces 8 page types per competitor in `page_content`. Phase 3 website integration (`docs/compare-one-to-one-integration.md`) adds `/compare/vs/[competitor]/[pageType]` with a separate template. That is **8 × 250 = 2,000 additional URLs** — plan CDN, sitemap splitting, and editorial review separately.

---

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `compare:build` throws validation error | Missing evidence, banned phrases, Sliq not last | Re-scrape, check metadata, read error message for `{provider}.{field}` |
| Competitor not found | Slug not in Postgres | `npm run seed:sheet` |
| Export writes but page 404s | Slug not in `publishedSlugs` | Re-run `export:compare` or edit `config.json` |
| Price section empty / rate limit | FX API 429 on prod | Deploy website fallback; set `FX_RATE_API_BASE_URL` |
| Compare table shows garbage text | Raw scrape used before extractor fix | Re-run `compare:build` with latest assembler/extractor |
| `npm run build` MODULE_NOT_FOUND `.next` chunk | Stale Next.js cache | Delete `.next` folder and rebuild |
| Pricing widget shows 1000 not corridor amount | `defaultReceiveAmount={1000}` hardcoded in `ComparePriceSection` | Intentional; change if product wants different default |

---

## Related docs

| Doc | Location |
|-----|----------|
| Architecture overview | `docs/architecture.md` |
| Technical architecture | `docs/architecture-technical.md` |
| 1v1 website integration (future) | `docs/compare-one-to-one-integration.md` |
| Website compare content folder | `Sliq-website/src/content/compare/README.md` |

---

*Last updated: July 2026 — reflects multi-provider compare pipeline and live `PriceComparison` widget on Section 3.*
