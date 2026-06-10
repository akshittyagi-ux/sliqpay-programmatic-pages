# Pipeline Upgrade Plan — Research & Comparison Quality

**Status:** Phase 1 implemented (see below). Phases 2–4 are the roadmap.

---

## Problem statement

The pilot (Abound, Wise) exposed three gaps:

1. **Scrape coverage** — SPAs and `networkidle` timeouts yield 0–2 pages; useful paths (pricing, fees, India corridor) are missed.
2. **Source richness** — The manager Google Sheet has 7 columns of research per competitor, but only name + URL were used.
3. **Comparison honesty** — LLM pages filled empty competitor fields with guesses instead of marking gaps.

---

## Phase 1 — Implemented now

### Scraper (`agents/scraper.ts`, `scraperPaths.ts`)

| Change | Why |
|--------|-----|
| `domcontentloaded` → `load` → `networkidle` retry ladder | Fixes Wise-style timeouts |
| 45s timeout + 2s SPA hydration wait | Heavy sites load meaningful HTML |
| **Common path probes** (pricing, fees, india, send-money, …) | Works without anchor tags |
| **Sitemap.xml / robots.txt** discovery | Finds URLs SPAs hide from `<a>` |
| Broader link extraction (`data-href`, script URLs) | Catches SPA routes |
| Skip thin pages (`<80` chars) | Avoid empty knowledge rows |
| **Fail if 0 pages** | Stops bad metadata/summarize runs |
| Cap 100 pages (was 1000) | Focus on high-value pages, faster runs |

### Data sources (`competitors.sheet_metadata`)

| Change | Why |
|--------|-----|
| Import all non-name/url columns from Google Sheet | HQ, service type, US→India, payout methods, fees notes |
| Pass sheet + scrape + metadata to AI agents | Richer, grounded comparisons |
| `data_gaps` + "Not stated" rules in prompts | No invented competitor facts |

### Knowledge selection (`agents/competitorContext.ts`)

| Change | Why |
|--------|-----|
| URL-priority ordering (pricing, fees, india, …) | Best pages first |
| Sort by content length | Prefer substantive pages |

### Commands

```bash
npm run db:migrate      # add sheet_metadata column (existing DBs)
npm run seed:sheet      # re-import sheet with full columns
npm run pipeline -- --ids 1   # re-run Abound with new scraper
npm run pipeline -- --ids 176 # re-run Wise
```

---

## Phase 2 — Scrape depth (next sprint)

| Item | Description |
|------|-------------|
| **Playwright sitemap crawl** | Follow same-site links up to depth 3 with priority queue (pricing > about > blog) |
| **Per-competitor scrape report** | Table: URL, status, char count, saved/skipped reason |
| **Resume / incremental scrape** | Only fetch URLs older than 30 days or missing |
| **Bot-block detection** | Flag Cloudflare/captcha; optional residential proxy config |
| **Secondary sources** | App Store / Play Store descriptions, public FAQ APIs where available |

**Success metric:** ≥15 substantive pages OR ≥5 high-priority URLs (pricing/fees/india) per major fintech competitor.

---

## Phase 3 — Structured extraction (quality)

| Item | Description |
|------|-------------|
| **Field-level extractor** | Separate LLM call per comparison dimension (fees, speed, regulation) with JSON schema |
| **Validation layer** | Reject page_content if >30% competitor cells are empty without "Not stated" |
| **Human review queue** | `page_content.review_status`: pending / approved / rejected |
| **Sheet + scrape merge** | Deterministic merge rules before LLM (sheet = baseline, scrape overrides pricing) |
| **pgvector** | Embed `knowledge_pages.clean_text`; retrieve top chunks per page type instead of truncating |

**Success metric:** Spot-check 10 competitors — ≥80% of fee/speed/regulation cells traceable to a source URL or sheet row.

---

## Phase 4 — Scale & ops

| Item | Description |
|------|-------------|
| **BullMQ + Redis** | Parallel scrape jobs (10 workers); rate limit per domain |
| **Post-pipeline webhook** | Trigger marketing site rebuild after monthly cron |
| **Cost controls** | `gpt-5.4-mini` for metadata; `gpt-5.5` only for final summarize |
| **Monitoring** | Dashboard: scrape_status counts, avg pages/competitor, data_gaps per page type |

**Success metric:** Full 257-competitor monthly run completes in <48h with <5% hard failures.

---

## Recommended re-pilot sequence

1. `npm run db:migrate && npm run seed:sheet`
2. Re-run **Abound** (`--ids 1`) — verify page count ↑ and `data_gaps` populated honestly
3. Re-run **Wise** (`--ids 176`) — verify no timeout, multiple corridor/pricing URLs
4. Manual review of all 8 page types for one competitor before batch of 20
5. Batch 20 → review → full 257

---

## Architecture after Phase 3 (target)

```
Google Sheet ──► competitors.sheet_metadata
                      │
Sitemap + probes ──► MongoDB knowledge_pages ──► pgvector chunks (future)
                      │                        │
                      └──────────┬─────────────┘
                                 ▼
                    Field extractors (fees, speed, …)
                                 ▼
                    competitor_metadata (verified)
                                 ▼
                    Summarizer (8 types + data_gaps)
                                 ▼
                    page_content → review → web ISR
```
