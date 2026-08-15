import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import sharp from 'sharp';

// Sibling repo where all rendered assets actually live.
const WEBSITE_PUBLIC_DIR = path.join(__dirname, '..', '..', 'Sliq-website', 'public');

const BAR_SIZE = { width: 520, height: 80 };
const PATTERN_SIZE = { width: 960, height: 1600 };
const ICON_HEIGHT = 80;
const WORDMARK_HEIGHT = 60;

type AssetPaths = {
  icon: string;
  wordmark: string;
  bar: string;
  pattern: string;
};

function assetPaths(id: string): AssetPaths {
  return {
    icon: path.join(WEBSITE_PUBLIC_DIR, 'image', 'programmatic', `${id}.png`),
    wordmark: path.join(WEBSITE_PUBLIC_DIR, 'image', 'compare', `section1-${id}-wordmark.png`),
    bar: path.join(WEBSITE_PUBLIC_DIR, 'image', 'compare', `section2-bar-${id}.png`),
    pattern: path.join(WEBSITE_PUBLIC_DIR, 'image', 'compare', `section6-${id}-pattern.png`),
  };
}

/** True if this competitor already has hand-placed assets (e.g. wise/remitly/sliq) — never overwritten. */
export function hasExistingAssets(id: string): boolean {
  const paths = assetPaths(id);
  return Object.values(paths).some((p) => fs.existsSync(p));
}

type LogoCandidates = {
  /** Ordered best-first; prefer square/pre-cropped sources for the small app-icon badge. */
  icon: string[];
  /** Ordered best-first; prefer the brand's own wordmark/social image for the wide Section 1 lockup. */
  wordmark: string[];
};

async function findLogoCandidates(homepageUrl: string): Promise<LogoCandidates> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(homepageUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    return await page.evaluate(() => {
      function absolute(url: string | null): string | null {
        if (!url) return null;
        try {
          return new URL(url, document.baseURI).toString();
        } catch {
          return null;
        }
      }

      const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
      const appleHref = absolute(appleTouchIcon?.getAttribute('href') ?? null);

      // .ico/.bmp aren't decodable by the image-processing step downstream.
      const isSupportedFormat = (href: string) => !/\.(ico|bmp)(\?|$)/i.test(href);

      const iconLinks = Array.from(document.querySelectorAll('link[rel="icon"]'));
      let bestIcon: { href: string; size: number } | null = null;
      for (const link of iconLinks) {
        const href = absolute(link.getAttribute('href'));
        if (!href || !isSupportedFormat(href)) continue;
        const sizes = link.getAttribute('sizes') ?? '';
        const match = sizes.match(/(\d+)x(\d+)/);
        const size = match ? parseInt(match[1], 10) : 32;
        if (!bestIcon || size > bestIcon.size) bestIcon = { href, size };
      }

      const headerImgs = Array.from(
        document.querySelectorAll('header img, nav img, [class*="logo"] img, img[class*="logo"]')
      );
      let headerLogo: string | null = null;
      for (const img of headerImgs) {
        const src = absolute(img.getAttribute('src'));
        if (src) {
          headerLogo = src;
          break;
        }
      }

      const ogImage = document.querySelector('meta[property="og:image"]');
      const ogContent = absolute(ogImage?.getAttribute('content') ?? null);
      const ogValid = ogContent && isSupportedFormat(ogContent) ? ogContent : null;
      const headerValid = headerLogo && isSupportedFormat(headerLogo) ? headerLogo : null;
      const appleValid = appleHref && isSupportedFormat(appleHref) ? appleHref : null;

      const dedupe = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => Boolean(v)))];

      // Square/pre-cropped sources make the best small app icon.
      const icon = dedupe([appleValid, bestIcon?.href ?? null, headerValid, ogValid]);
      // The header logo or a dedicated brand image reads best as a wordmark;
      // og:image (often a wide social-share banner) is the last resort.
      const wordmark = dedupe([headerValid, appleValid, bestIcon?.href ?? null, ogValid]);

      return { icon, wordmark };
    });
  } finally {
    await browser.close();
  }
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download logo (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function trimmed(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer).trim().png().toBuffer();
  } catch {
    // trim() throws if the whole image is one flat color (nothing to trim) — fall back untouched.
    return sharp(buffer).png().toBuffer();
  }
}

async function resizeToHeight(buffer: Buffer, height: number): Promise<Buffer> {
  return sharp(buffer).resize({ height, withoutEnlargement: false }).png().toBuffer();
}

// Sampled from the trimmed mark itself (not the surrounding whitespace), so a
// mostly-white source image doesn't wash out the extracted brand color.
async function dominantColor(trimmedBuffer: Buffer): Promise<{ r: number; g: number; b: number }> {
  const { dominant } = await sharp(trimmedBuffer).stats();
  return dominant;
}

// A light, brand-tinted crosshatch weave — echoes the pilot pages' textured
// bar/pattern art style without copying their exact per-brand designs.
function wovenTextureSvg(width: number, height: number, color: { r: number; g: number; b: number }): string {
  const rgb = `rgb(${color.r}, ${color.g}, ${color.b})`;
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="weave" width="14" height="14" patternTransform="rotate(20)" patternUnits="userSpaceOnUse">
      <rect width="14" height="14" fill="#ffffff" />
      <path d="M0 14L14 0" stroke="${rgb}" stroke-width="1.4" opacity="0.5" />
      <path d="M0 0L14 14" stroke="${rgb}" stroke-width="1.4" opacity="0.3" />
    </pattern>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.85" />
      <stop offset="100%" stop-color="${rgb}" stop-opacity="0.3" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#weave)" />
  <rect width="${width}" height="${height}" fill="url(#fade)" />
</svg>`.trim();
}

async function generateTexture(
  width: number,
  height: number,
  color: { r: number; g: number; b: number }
): Promise<Buffer> {
  return sharp(Buffer.from(wovenTextureSvg(width, height, color))).png().toBuffer();
}

export type CompetitorAssetResult = 'created' | 'skipped';

/**
 * Fetches a competitor's logo from their homepage and derives every image
 * asset a comparison page needs from it. Never overwrites files that already
 * exist — Wise/Remitly/Sliq's hand-placed assets are always left untouched.
 */
// A near-solid-color (or degenerately tiny, e.g. a lazy-load placeholder
// pixel) result means the "logo" candidate wasn't real mark content.
async function looksBlank(buffer: Buffer): Promise<boolean> {
  const metadata = await sharp(buffer).metadata();
  if ((metadata.width ?? 0) < 8 || (metadata.height ?? 0) < 8) return true;

  const { channels } = await sharp(buffer).stats();
  // stdev is NaN for degenerate (e.g. 1x1) images — treat that as blank too.
  return channels.every((channel) => Number.isNaN(channel.stdev) || channel.stdev < 8);
}

// Tries each candidate URL in order and returns the first that downloads,
// decodes, and isn't a blank/placeholder image — a single bad match (a
// stray .ico, a false-positive "logo" selector hitting a spinner) shouldn't
// sink the whole fetch when a later candidate would have worked.
async function firstDecodable(urls: string[]): Promise<{ url: string; buffer: Buffer } | null> {
  for (const url of urls) {
    try {
      const buffer = await trimmed(await downloadImage(url));
      if (await looksBlank(buffer)) continue;
      return { url, buffer };
    } catch {
      continue;
    }
  }
  return null;
}

export async function ensureCompetitorAssets(
  id: string,
  homepageUrl: string
): Promise<CompetitorAssetResult> {
  if (hasExistingAssets(id)) return 'skipped';

  const candidates = await findLogoCandidates(homepageUrl);
  const iconResult = await firstDecodable(candidates.icon.length ? candidates.icon : candidates.wordmark);
  if (!iconResult) {
    throw new Error(`Could not locate a usable logo for "${id}" on ${homepageUrl}`);
  }
  const wordmarkResult =
    (await firstDecodable(candidates.wordmark.length ? candidates.wordmark : candidates.icon)) ?? iconResult;

  const rawIcon = iconResult.buffer;
  const rawWordmark = wordmarkResult.buffer;
  const color = await dominantColor(rawIcon);
  const paths = assetPaths(id);

  fs.mkdirSync(path.dirname(paths.icon), { recursive: true });
  fs.mkdirSync(path.dirname(paths.wordmark), { recursive: true });

  fs.writeFileSync(paths.icon, await resizeToHeight(rawIcon, ICON_HEIGHT));
  fs.writeFileSync(paths.wordmark, await resizeToHeight(rawWordmark, WORDMARK_HEIGHT));
  fs.writeFileSync(paths.bar, await generateTexture(BAR_SIZE.width, BAR_SIZE.height, color));
  fs.writeFileSync(paths.pattern, await generateTexture(PATTERN_SIZE.width, PATTERN_SIZE.height, color));

  return 'created';
}
