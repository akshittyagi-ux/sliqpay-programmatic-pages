# SliqPay Programmatic Comparison Pages — Architecture Overview

**Audience:** Leadership, product, and stakeholders  
**Purpose:** Explain what we are building, why, and how it works at a high level  
**Status:** Pipeline implemented; marketing website may live in a separate repository  
**Scale:** 250 competitors × 8 page angles = **2,000 SEO comparison pages**

For engineering detail (agents, database tables, APIs), see [architecture-technical.md](./architecture-technical.md).

---

## What problem does this solve?

People searching for money transfer options often look for comparisons: *“SliqPay vs Wise”*, *“cheaper than Remitly”*, *“best remittance for NRIs”*, and similar queries. Creating and maintaining hundreds of comparison pages by hand is slow, expensive, and goes stale as competitors change fees and features.

This system **automates research and page creation** so SliqPay can publish a large set of accurate, search-friendly comparison pages and **refresh them monthly** without a large content team.

---

## What we are building

A **content factory** plus a **website**:

| Part | What it does | Who uses it |
|------|----------------|-------------|
| **Research pipeline** | Visits competitor sites, understands their offering, writes comparison content | Runs automatically (monthly) |
| **Content database** | Stores raw research and finished page copy | Pipeline writes; website reads |
| **Comparison website** | Publishes pages like `/compare/wise/cheaper` | Customers and search engines |

The pipeline and the public website **do not need to live in the same codebase**. They share one database (or exported content). That keeps marketing design separate from backend automation.

---

## How it works (simple view)

```
Competitor list (250 companies)
        │
        ▼
   ┌─────────────┐
   │  RESEARCH   │  Runs once a month (or on demand)
   │  PIPELINE   │
   └──────┬──────┘
          │
    Step 1 │  Collect information from competitor websites
          │
    Step 2 │  AI extracts key facts (fees, speed, regulation, etc.)
          │
    Step 3 │  AI writes 8 comparison pages per competitor
          │
          ▼
   ┌─────────────┐
   │  DATABASE   │  Single source of truth for all page content
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │  WEBSITE    │  Fast, SEO-friendly pages for end users
   └─────────────┘
```

**In plain terms:** We teach the system what each competitor offers, then ask AI to write SliqPay-focused comparison copy using **fixed templates** so every page is consistent and on-brand.

---

## The three steps of the pipeline

### Step 1 — Research (no AI)

An automated browser visits each competitor’s website (similar to how a person would browse) and saves the text from important pages—pricing, features, about us, etc. Blog and careers pages are skipped.

**Output:** A research library per competitor (what they say on their site today).

### Step 2 — Understand (AI)

OpenAI reads the saved research and pulls out structured facts: fee model, transfer speed, countries served, regulation, mobile app, and similar attributes.

**Output:** A structured “competitor profile” used in all comparisons.

### Step 3 — Write (AI)

For each competitor, the system generates **8 comparison pages** with these exact titles (competitor name substituted, e.g. Wise):

| # | Page title |
|---|------------|
| 1 | Sliq pay vs Competitor |
| 2 | Which is cheaper: Sliq pay or Competitor |
| 3 | Which is faster: Sliq pay or Competitor |
| 4 | Which is safer: Sliq pay or Competitor |
| 5 | Which is more convenient: Sliq pay or Competitor |
| 6 | Which is better for tourists visiting India: Sliq pay or Competitor |
| 7 | Which is better for NRIs: Sliq pay or Competitor |
| 8 | Competitor alternative: Sliq pay |

Every page includes SEO title and description, comparison sections, FAQs, and a call-to-action. **SliqPay’s official product facts** (rates, limits, compliance) are baked into the prompts so copy stays aligned with what we actually offer.

**Output:** Ready-to-publish page content stored in the database.

---

## What gets stored (conceptual, not technical)

Think of three layers of information:

1. **Competitor list** — Names, websites, and processing status (pending, done, failed).
2. **Research archive** — Raw material scraped from competitor sites (refreshed monthly).
3. **Published content** — The 8 finished page variants per competitor, plus SEO metadata.

A separate **run log** tracks each monthly batch: how many competitors succeeded, what failed, and when the job finished.

---

## How pages reach customers

The marketing site reads finished content from the database and renders it as **fast static pages** (good for SEO and performance). Pages are set to **refresh about every 30 days**, aligned with the monthly research run.

Example URLs:

- `/compare/wise/sliqpay-vs-competitor`
- `/compare/remitly/which-is-cheaper`
- `/compare/western-union/which-is-better-for-nris`

After the pipeline updates the database, the site needs a **rebuild or refresh** to show the latest copy—this can be automated.

---

## How often it runs

| Trigger | When |
|---------|------|
| **Scheduled** | 1st of each month (automated via GitHub Actions) |
| **Manual** | On demand—for a new competitor, a fix, or a pilot |

Each competitor is processed end-to-end: research → profile → all 8 pages.

---

## Cost and scale (order of magnitude)

For a full run across **250 competitors**:

- **~2,250 AI calls** per month (1 profile + 8 pages per competitor)
- **Scraping** is mostly infrastructure time, not AI cost
- Default AI model: **GPT-5.5** (configurable; e.g. `gpt-5.4-mini` for lower-cost pilots)

Exact spend depends on page length and OpenAI pricing; a **pilot on 3–5 competitors** validates quality and cost before full rollout.

---

## Risks and how we manage them

| Risk | Mitigation |
|------|------------|
| **Inaccurate competitor claims** | Content grounded in scraped site text; human spot-check on first batch |
| **Outdated pages** | Monthly refresh; competitor profiles tied to latest scrape |
| **Off-brand SliqPay messaging** | Fixed SliqPay fact sheet in every prompt; templated page structure |
| **Competitor site blocking scraper** | Per-competitor failure logging; retry or manual review |
| **AI hallucination** | Structured JSON outputs; prompts require data from research only |

---

## Rollout plan

1. **Pilot** — 3–5 competitors, review all 8 page types for quality and legal comfort  
2. **Website connect** — Marketing repo pulls content; design final comparison layouts  
3. **Scale** — Load full competitor list (250)  
4. **Automate** — Monthly cron + optional auto-redeploy of website after pipeline success  

Future improvements (not required for launch): parallel processing for speed, smarter page selection, semantic search over research archives.

---

## What we need to operate

| Requirement | Notes |
|-------------|--------|
| **PostgreSQL database** | Hosted (e.g. Neon, Supabase, RDS) |
| **OpenAI API access** | For steps 2 and 3 |
| **GitHub** | Runs scheduled pipeline; secrets for DB and API keys |
| **Competitor list** | CSV of names and website URLs |
| **Marketing website** | Separate repo acceptable; reads same database |

---

## Summary

We are building an **automated comparison-content engine** that keeps SliqPay visible across high-intent search queries against ~250 remittance and fintech competitors. Research and writing run on a schedule; the website stays a thin, fast layer on top of stored content. The approach scales to **2,000 pages** without proportional headcount, while keeping room for human review where it matters.

---

**Technical appendix:** [architecture-technical.md](./architecture-technical.md)
