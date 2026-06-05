# SliqPay Programmatic Pages — Demo Guide (Pilot: Abound)

**Use this doc to walk stakeholders through the working pipeline.**  
**Pilot competitor:** Abound (Times Club / TClub Inc.) — `competitor_id = 1`  
**Last successful pipeline run:** June 2026

---

## 30-second pitch

> We imported **257 competitors** from the manager’s Google Sheet, ran an automated research pipeline on **Abound** as a pilot, and produced **8 SEO comparison pages** (Sliq pay vs Abound, cheaper, faster, safer, etc.) — stored in PostgreSQL and viewable on localhost. The system scrapes the competitor site, enriches data with OpenAI, and generates structured page content monthly at scale.

---

## What to showcase (recommended order)

### 1. Source data — Google Sheet (30 sec)

**Show:** [Full remittance player long list](https://docs.google.com/spreadsheets/d/1iMcfRuqJivLIvBDLffEkYAPbmm1XuTj8j4U810UtHqo/edit)

**Say:** “This is our master list — 257 remittance players. We import it with one command (`npm run seed:sheet`). For Abound, we also pull HQ, service type, US→India support, payout methods, and fees notes into the database.”

**Abound row highlights:**

| Field | Value |
|-------|--------|
| Company | Abound (Times Club / TClub Inc.) |
| Website | https://www.joinabound.com |
| HQ | United States |
| Service type | Diaspora app with remittance + rewards |
| US→India | Yes |
| India payout | Bank deposit (typ.) |

---

### 2. Pipeline architecture (1 min)

**Show:** `docs/architecture.md` (management diagram) or whiteboard this flow:

```
Google Sheet → seed → PostgreSQL
                         ↓
              Scrape joinabound.com (100 pages)
                         ↓
              OpenAI: metadata extraction
                         ↓
              OpenAI: 8 comparison page types
                         ↓
              Next.js reads DB → localhost pages
```

**Say:** “Three automated steps — research, understand, write. No manual copy for each page type. At full scale: 257 × 8 ≈ **2,056 pages**.”

---

### 3. Terminal proof — pipeline ran (30 sec)

**Show:** Terminal output from:

```bash
npm run pipeline -- --ids 1
```

**Expected lines:**

```
Scraped 100 pages for competitor 1
Metadata enriched for competitor 1
Summarized [Sliq pay vs Abound (Times Club / TClub Inc.)] ...
... (8 page types total)
```

**Say:** “One command processes a competitor end-to-end. Failed scrapes stop before AI steps so we don’t generate empty comparisons.”

---

### 4. Database — proof of stored content (2 min)

**Show:** pgAdmin or psql with these queries:

```sql
-- Competitor + sheet metadata
SELECT name, website_url, scrape_status, last_scraped_at, sheet_metadata
FROM competitors WHERE id = 1;

-- How much we scraped
SELECT COUNT(*) AS pages FROM knowledge_pages WHERE competitor_id = 1;

-- Sample scraped URLs (marketing pages, not just homepage)
SELECT url, LENGTH(clean_text) AS chars
FROM knowledge_pages
WHERE competitor_id = 1
  AND url NOT LIKE '%.css%'
  AND url NOT LIKE '%wp-json%'
ORDER BY chars DESC
LIMIT 8;

-- AI competitor profile
SELECT service_type, fee_structure, transfer_speed, raw_metadata
FROM competitor_metadata WHERE competitor_id = 1;

-- All 8 generated pages
SELECT page_type, meta_title, generated_at
FROM page_content WHERE competitor_id = 1
ORDER BY page_type;
```

**Say:** “Everything is auditable in Postgres — raw research, enriched profile, and final page JSON. We can re-run monthly to refresh.”

**Honest note for Q&A:** Some scraped URLs are CSS/API endpoints (WordPress noise). Phase 2 of our upgrade plan filters these and prioritizes pricing/fees pages. See `docs/pipeline-upgrade-plan.md`.

---

### 5. Live website — 8 comparison pages (3 min)

**Start dev server:**

```bash
npm run dev
```

**Show home:** http://localhost:3000  
Lists all 8 Abound pages with full titles.

**Open these URLs (pick 2–3 for the demo, skim all 8 if time allows):**

| Page | URL |
|------|-----|
| Vs | http://localhost:3000/compare/abound-times-club-tclub-inc/sliqpay-vs-competitor |
| Cheaper | http://localhost:3000/compare/abound-times-club-tclub-inc/which-is-cheaper |
| Faster | http://localhost:3000/compare/abound-times-club-tclub-inc/which-is-faster |
| Safer | http://localhost:3000/compare/abound-times-club-tclub-inc/which-is-safer |
| More convenient | http://localhost:3000/compare/abound-times-club-tclub-inc/which-is-more-convenient |
| Tourists | http://localhost:3000/compare/abound-times-club-tclub-inc/which-is-better-for-tourists-visiting-india |
| NRIs | http://localhost:3000/compare/abound-times-club-tclub-inc/which-is-better-for-nris |
| Alternative | http://localhost:3000/compare/abound-times-club-tclub-inc/competitor-alternative-sliqpay |

**Say:** “UI is a **debug preview** — it renders the JSON sections the pipeline produced. The real marketing site (separate repo) will use the same database content with final design.”

**Point out on a page:**

- `hero` / `meta_title` — correct page naming
- `comparison_table_rows` or `score_cards` — Sliq pay vs Abound facts
- `data_gaps` — fields we **couldn’t verify** (honest comparisons, not invented)
- `faqs` + `cta` — ready for SEO layout

---

### 6. Scale story (1 min)

**Show:** Sheet row count or:

```sql
SELECT COUNT(*) FROM competitors;  -- 257
SELECT COUNT(*) FROM page_content; -- 8 (pilot); target 2,056
```

**Say:**

- “Pilot = 1 competitor, 8 pages, ~9 OpenAI calls.”
- “Full run = 257 competitors, ~2,250 AI calls/month, GitHub Actions cron.”
- “Marketing site connects to same DB — pipeline and website are separate repos.”

---

## Demo checklist (before the meeting)

- [ ] PostgreSQL running; `npm run db:test` passes
- [ ] `npm run dev` running at http://localhost:3000
- [ ] Pipeline already run for id 1 (`npm run pipeline -- --ids 1`)
- [ ] Google Sheet open in a browser tab
- [ ] `docs/architecture.md` open (optional)
- [ ] pgAdmin query ready (optional, for technical audience)

---

## Likely questions & answers

| Question | Answer |
|----------|--------|
| Is the data accurate? | Pilot uses scraped site + manager sheet. Pages include `data_gaps` where facts aren’t verified. Human review before go-live. |
| Why does the UI look basic? | This repo is the **content factory**. Final styled pages live in the marketing repo. |
| Why only Abound? | Controlled pilot. Wise (`--ids 176`) is next; scraper was upgraded for heavy sites. |
| How often does it update? | Monthly cron (or on demand). Pages revalidate every 30 days on the web side. |
| What’s next? | Phase 2: better URL filtering, scrape reports. Phase 3: field-level validation + review queue. See `docs/pipeline-upgrade-plan.md`. |

---

## One-liner close

*“We’ve proven the factory works: sheet in, research automated, eight comparison pages out, ready to plug into the public site and scale to all 257 competitors.”*

---

## Quick re-run (if asked to demo live)

```bash
npm run seed:sheet
npm run pipeline -- --ids 1
npm run dev
```

**Do not** run full 257 in a live demo — takes hours and significant API cost.
