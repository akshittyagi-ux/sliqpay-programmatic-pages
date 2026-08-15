# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Research/content pipeline that scrapes competitor money-transfer websites, enriches them with OpenAI, and produces two **separate, unrelated page families**. Do not conflate them:

| | **1v1 pipeline (original)** | **Multi-provider compare pipeline (current, live)** |
|---|---|---|
| Purpose | 8 narrative SEO pages per competitor (cheaper, faster, safer, etc.) | One Figma-style 8-section marketing page per slug (e.g. Wise + Remitly vs Sliq) |
| Output table | `page_content` | `compare_pages` |
| Generation | OpenAI summarizer per page type | Deterministic evidence assembler — **no LLM at build time** |
| Build command | `npm run pipeline` | `npm run compare:build` |
| Preview here | `/compare/[competitor]/[pageType]` (Next.js ISR) | Not previewed here — exported as JSON |
| Consumed by | This repo's Next.js app (`pages/compare/`) | Sibling repo `Sliq-website` via `npm run export:compare` |

The multi-provider compare pipeline is what powers the live pages on sliq-pay.com. New feature work is concentrated there (files under `agents/compare*.ts`). The full field-by-field doc is `docs/COMPARE_PAGES_DEVELOPER_GUIDE.md` — read it before making non-trivial changes to compare page output.

## Commands

```bash
npm run dev                    # Next.js dev server
npm run build                  # requires DATABASE_URL (getStaticPaths reads page_content)
npm run typecheck              # tsc --noEmit

# DB setup
npm run db:schema              # apply db/schema.sql
npm run db:document-store      # set up MongoDB collection/indexes
npm run db:test                # test Postgres connection
npm run db:test:mongo          # test MongoDB connection

# Seed competitors (from manager Google Sheet or local CSV)
npm run seed:sheet             # from COMPETITORS_SHEET_ID
npm run seed                   # from data/competitors.csv

# 1v1 pipeline (scrape -> metadata -> 8 narrative pages)
npm run pipeline                                          # all competitors
npm run pipeline -- --pending                              # only scrape_status = pending
npm run pipeline -- --ids 1,2,3                             # specific competitor ids
npm run pipeline -- --ids 1 --page-type which-is-cheaper    # one page type only
npm run pipeline -- --summarize-only                        # regenerate copy without re-scraping
npm run scrape                                              # scrape only (--scrape-only)

# Multi-provider compare pipeline
npm run compare:build                                        # all rows in data/compare-pages.csv
npm run compare:build -- --slug remitly-vs-wise-vs-sliq-pay   # one page
npm run export:compare                                       # write JSON + config.json to ../Sliq-website
```

There's no test runner configured — `npm run typecheck` is the correctness gate. Verify pipeline changes by running against 1 competitor id and inspecting the DB rows / rendered page, not by adding a test suite.

## Architecture

### Data flow (shared by both pipelines up to metadata)

```
competitors (Postgres, seeded from Google Sheet or CSV)
    -> agents/scraper.ts (Playwright + Cheerio, same-origin BFS, up to 1000 pages)
    -> MongoDB knowledge_pages (raw HTML + cleanText per URL)
    -> agents/metadata.ts (OpenAI) -> Postgres competitor_metadata (typed columns + raw_metadata JSONB)
```

From there the two pipelines diverge:

**1v1:** `agents/summarizer.ts` generates 8 page types per competitor from up to 30 knowledge pages + metadata + prompts in `prompts/summarizer/*.txt` -> Postgres `page_content` -> rendered by `pages/compare/[competitor]/*` via Next.js ISR (30-day revalidate).

**Multi-provider compare:** `scripts/runComparePages.ts` reads `data/compare-pages.csv` (slug + provider_slugs) and drives `agents/comparePageBuilder.ts` through:
1. `loadCompetitorBundle()` — pulls Postgres competitor/metadata + MongoDB pages per provider slug
2. `compareEvidenceExtractor.ts` — extracts an `EvidenceRef` per field, in priority order: scraped page text (`officialPage`) > `competitor_metadata` (`structuredMetadata`) > manager sheet extra columns (`managerSheet`) > low-confidence fallback strings; Sliq's own facts are hardcoded (`sliqCanonicalFacts`)
3. `comparePricingQuotes.ts` — overwrites pricing evidence with a live FX API call (`FX_RATE_API_BASE_URL`) at build time
4. `comparePageAssembler.ts` — assembles the full 8-section JSON document (schema in `comparePageTypes.ts`)
5. `compareValidation.ts` — fail-closed: throws on banned uncertainty phrases, missing evidence, wrong provider ordering, etc. A failed build must not publish
6. UPSERT into Postgres `compare_pages` (JSONB)

`scripts/exportComparePages.ts` then reads all `compare_pages` rows, re-validates, and writes `../Sliq-website/src/content/compare/pages/{slug}.json` plus `config.json` (`publishedSlugs`, `defaultSlug`) — this assumes `Sliq-website` is checked out as a **sibling directory**. A slug is not live until it's in `publishedSlugs`; dropping a JSON file manually is not enough.

**Evidence display rule:** raw scraped quotes are used for citations/icon detection only. Cell display text prefers structured metadata fallbacks over raw scrape sentences, because scraped text is often noisy (nav menus, country lists).

### Storage split

- **MongoDB** (`MONGODB_URI`, collection `knowledge_pages`) — raw scrape archive only (`rawHtml`, `cleanText`, `title`, `url`), unique on `(competitorId, url)`. Accessed via `db/documentStore.ts` / `db/knowledgePages.ts`.
- **PostgreSQL** (`DATABASE_URL`, schema in `db/schema.sql`) — everything structured/queryable: `competitors`, `competitor_metadata`, `page_content` (1v1 pages), `compare_pages` (multi-provider pages), `cron_runs` (pipeline audit log). Pool in `db/pool.ts`; query helpers split between `db/knowledgeDB.ts` (pipeline/write side) and `db/finalInfoDB.ts` (read side, for the web layer).

### LLM usage

All OpenAI calls go through `agents/llm.ts` (`generateJson()`, `response_format: json_object`, `parseJsonFromModel()` strips markdown fences). `OPENAI_MODEL` defaults to `gpt-5.5`. Only `agents/metadata.ts` and `agents/summarizer.ts` call OpenAI — the multi-provider compare pipeline is explicitly **deterministic, no LLM at build time**; don't add LLM calls into `comparePageBuilder.ts`/`comparePageAssembler.ts` without discussing that departure first.

### Orchestration entry points

- `cron/monthly.ts` — full 1v1 pipeline (scrape -> metadata -> summarize all 8 types) per competitor, sequential, logs to `cron_runs`. Filterable by `--pending` / `--ids`. Runs via `.github/workflows/cron.yml` (1st of month, 02:00 UTC, or manual `workflow_dispatch`).
- `scripts/runPipeline.ts` — CLI wrapper around the same 1v1 pipeline for local/manual runs (`--scrape-only`, `--summarize-only`, `--ids`, `--page-type`).
- `scripts/runComparePages.ts` — CLI for the multi-provider compare build (`--slug`).

### Repo boundary with Sliq-website

This repo only produces content; it does not render the live multi-provider `/compare/[slug]` pages. That happens in the sibling `Sliq-website` repo, which pulls via `npm run export:compare` (aliased there as `import:compare`). Expected layout:

```
Documents/
  sliqpay-programmatic-pages/   <- this repo, generates content
  Sliq-website/                 <- renders content
```

If you're asked to change what a compare page displays, check `docs/COMPARE_PAGES_DEVELOPER_GUIDE.md` section 4 (field-by-field source map) and section 5 (which JSON fields the website actually renders — `priceComparison`, `evidence`, and `validation` are exported but **not** rendered) before assuming a JSON field change alone will show up.

## Environment variables

| Variable | Required for | Notes |
|----------|--------------|-------|
| `DATABASE_URL` | everything | PostgreSQL |
| `MONGODB_URI` | scraping | raw HTML store |
| `OPENAI_API_KEY` | metadata + 1v1 summarizer | not used by compare:build |
| `OPENAI_MODEL` | optional | default `gpt-5.5` |
| `COMPETITORS_SHEET_ID` | `seed:sheet` | manager Google Sheet id |
| `FX_RATE_API_BASE_URL` | `compare:build` | live pricing quotes; falls back to hardcoded dev response on 429 |
| `DATABASE_SSL` | optional | set `true` for SSL Postgres connections |

Windows-local Postgres note: if `db:test` fails with `password authentication failed`, reset the local password via `scripts/resetPostgresPassword.ps1` (run PowerShell as Administrator) — see README for the exact command.

## Conventions worth knowing

- `agents/pageTypes.ts` is the source of truth for the 8 narrative page-type ids/titles; `prompts/summarizer/*.txt` defines each page type's JSON shape and tone — edit prompts, not summarizer logic, to change page copy.
- `data/compare-pages.csv` defines which multi-provider compare pages exist (`slug,provider_slugs`). Sliq is added to every page automatically — never list `sliq` in `provider_slugs`.
- Competitor CSV/Sheet column headers are auto-detected case-insensitively (`name`/`competitor`/`company`, `website_url`/`website`/`url`, optional `slug`) — see `data/README.md`.
- `compareValidation.ts` fails closed on purpose: bad evidence should block a build, not publish a page with placeholder text. When debugging a failed `compare:build`, read the thrown error for the specific `{provider}.{field}` before touching the extractor.
