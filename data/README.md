# Competitor data

## Source of truth (manager)

Google Sheet:  
https://docs.google.com/spreadsheets/d/1iMcfRuqJivLIvBDLffEkYAPbmm1XuTj8j4U810UtHqo/edit

Import into Postgres:

```bash
npm run seed:sheet
```

**Required:** Sheet shared as **Anyone with the link → Viewer**. Otherwise import fails with a sign-in error.

## Column headers

The importer accepts common header names (case-insensitive):

| Required | Accepted headers |
|----------|------------------|
| Name | `company` (manager sheet), `name`, `competitor`, `brand`, … |
| Website | `website` (manager sheet), `website_url`, `url`, `site`, `domain`, … |
| Slug (optional) | `slug`, `id`, `key` — auto-generated from name if omitted |

URLs without `https://` are normalized automatically.

## Offline / manual CSV

1. File → Download → CSV from the Google Sheet  
2. Save as `data/competitors.csv`  
3. Run `npm run seed`

`competitors.sample.csv` is only a tiny local example for testing.
