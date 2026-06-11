# SliqPay Programmatic Pages

Research agent pipeline that scrapes competitor sites, enriches metadata with OpenAI, summarizes content per page type, and publishes static comparison pages via Next.js ISR.

See [docs/architecture.md](docs/architecture.md) for a management overview, [docs/architecture-technical.md](docs/architecture-technical.md) for engineering detail, [docs/pipeline-upgrade-plan.md](docs/pipeline-upgrade-plan.md) for the quality roadmap, **[docs/DEMO.md](docs/DEMO.md)** for the Abound pilot walkthrough, and **[docs/TECHNICAL-WALKTHROUGH.md](docs/TECHNICAL-WALKTHROUGH.md)** for a full deep-dive prep guide (demo / technical review).

## Architecture

```
Competitor URLs → Scraper → MongoDB (raw HTML)
                              ↓
                    Metadata Enrichment (OpenAI) → PostgreSQL
                              ↓
                    Summarizer (8 page types) → page_content (PostgreSQL)
                              ↓
                    Next.js ISR → /compare/[competitor]/[pageType]
```

## Setup

1. **Install dependencies**

   ```bash
   npm install
   npx playwright install chromium
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` and set:

   - `DATABASE_URL` — PostgreSQL connection string (competitors, metadata, page content)
   - `MONGODB_URI` — MongoDB connection string (raw scraped HTML)
   - `OPENAI_API_KEY` — for metadata and summarizer agents
   - `OPENAI_MODEL` — optional, defaults to `gpt-5.5` (OpenAI’s latest frontier model)

3. **Test database connections**

   ```bash
   npm run db:test
   npm run db:test:mongo
   ```

   If PostgreSQL shows `password authentication failed`, reset the local password (PowerShell **as Administrator**):

   ```powershell
   cd C:\Users\ishit\Documents\sliqpay-programmatic-pages
   Set-ExecutionPolicy -Scope Process Bypass -Force
   .\scripts\resetPostgresPassword.ps1
   ```

   Default new password is `postgres` (pass `-NewPassword 'your-secret'` to customize). Then set `DATABASE_URL` in `.env` to match.

4. **Apply schema**

   ```bash
   npm run db:schema
   npm run db:document-store
   ```

   If you have legacy `knowledge_pages` rows in PostgreSQL from an older install:

   ```bash
   npm run db:migrate:knowledge
   ```

5. **Seed competitors** (from manager Google Sheet)

   Sheet: [Full remittance player long list](https://docs.google.com/spreadsheets/d/1iMcfRuqJivLIvBDLffEkYAPbmm1XuTj8j4U810UtHqo/edit)

   Your manager must set **Share → General access → Anyone with the link (Viewer)** so the pipeline can read it.

   ```bash
   npm run seed:sheet
   ```

   Or export the sheet as CSV → `data/competitors.csv`, then:

   ```bash
   npm run seed
   ```

   Column headers are auto-detected (`name` / `competitor` / `company` + `website_url` / `website` / `url`, optional `slug`). See `data/README.md`.

## Running the pipeline

| Command | Description |
|---------|-------------|
| `npm run pipeline` | Full pipeline for all competitors |
| `npm run pipeline -- --pending` | Only `scrape_status = pending` |
| `npm run pipeline -- --ids 1` | Single competitor by id |
| `npm run pipeline -- --ids 1 --page-type which-is-cheaper` | One page type only |
| `npm run scrape` | Scrape only (`--scrape-only`) |
| `npm run pipeline -- --summarize-only` | Re-run page generation without scrape/metadata |

Examples:

```bash
npx ts-node scripts/runPipeline.ts --ids 1
npx ts-node scripts/runPipeline.ts --ids 1,2,3 --pending
npx ts-node scripts/runPipeline.ts --ids 1 --page-type which-is-cheaper
```

## Page types

| Title | `page_type` id |
|-------|----------------|
| Sliq pay vs Competitor | `sliqpay-vs-competitor` |
| Which is cheaper: Sliq pay or Competitor | `which-is-cheaper` |
| Which is faster: Sliq pay or Competitor | `which-is-faster` |
| Which is safer: Sliq pay or Competitor | `which-is-safer` |
| Which is more convenient: Sliq pay or Competitor | `which-is-more-convenient` |
| Which is better for tourists visiting India: Sliq pay or Competitor | `which-is-better-for-tourists-visiting-india` |
| Which is better for NRIs: Sliq pay or Competitor | `which-is-better-for-nris` |
| Competitor alternative: Sliq pay | `competitor-alternative-sliqpay` |

See `agents/pageTypes.ts` for the source of truth.

Prompts live in `prompts/summarizer/`. Edit those files to change JSON shape and tone.

## Next.js

```bash
npm run dev
```

Build requires `DATABASE_URL` so `getStaticPaths` can read `page_content`:

```bash
npm run build
```

Pages revalidate every 30 days (`revalidate: 2592000`).

## GitHub Actions cron

`.github/workflows/cron.yml` runs on the 1st of each month (02:00 UTC) and via `workflow_dispatch`.

Add repository secrets: `DATABASE_URL`, `MONGODB_URI`, `OPENAI_API_KEY`.

## Project layout

```
agents/          scraper, metadata, summarizer, llm, pageBuilder
cron/            monthly pipeline orchestrator
db/              schema.sql, pool, MongoDB document store, query helpers
docs/            architecture documentation
prompts/         LLM prompt templates
pages/compare/   ISR comparison routes (optional; may live in web repo)
scripts/         seedCompetitors, runPipeline, runSchema
data/            competitors CSV
```

## Recommended rollout

1. Seed 1–3 competitors from sample CSV
2. `npx ts-node scripts/runPipeline.ts --ids 1`
3. Verify MongoDB scrape docs + PostgreSQL rows in `competitor_metadata`, `page_content`
4. `npm run dev` → open `/compare/wise/sliqpay-vs-competitor`
5. Scale to 5 competitors, then full CSV (250 × 8 = 2,000 pages)

BullMQ + Redis can be added later for parallel job queues at scale.
