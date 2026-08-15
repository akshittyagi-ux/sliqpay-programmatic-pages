/** High-value paths to probe on every competitor site (SPA-safe discovery). */
export const COMMON_PROBE_PATHS = [
  '/',
  '/pricing',
  '/fees',
  '/rates',
  '/exchange-rates',
  '/transfer',
  '/send-money',
  '/international-transfers',
  '/remittance',
  '/features',
  '/how-it-works',
  '/about',
  '/about-us',
  '/company',
  '/security',
  '/trust',
  '/legal',
  '/regulation',
  '/faq',
  '/help',
  '/support',
  '/contact',
  '/business',
  '/personal',
  '/india',
  '/send-money-to-india',
  '/usd-to-inr',
];

/** Locale-prefixed paths used by providers like Remitly (root /legal often 404s). */
export const LOCALE_PROBE_PATHS = [
  '/us/en/home/licenses',
  '/us/en/home/legal',
  '/us/en/home/about',
  '/us/en/home/security',
  '/us/en/home/help',
  '/us/en/home/contact',
  '/us/en/money-transfer/india',
  '/us/en/money-transfer/send-money-to-india',
  '/us/en/pricing',
  '/in/en/pricing',
  '/in/en/send-money',
  '/in/en/send-money-to-india',
  '/in/safety-and-security',
  '/gb/en/home/licenses',
  '/gb/en/home/key-service-information',
];

export const ERROR_PAGE_TITLE_PATTERNS = [
  /^page not found$/i,
  /^404$/i,
  /^not found$/i,
  /^error$/i,
];

export const ERROR_PAGE_TEXT_PATTERNS = [
  /\bpage not found\b/i,
  /\b404\b.*\bnot found\b/i,
  /\bsorry[, ]+we couldn'?t find\b/i,
  /\bthis page (?:doesn't|does not) exist\b/i,
];

export const EXCLUDED_PATH_PATTERNS = [
  '/blog/',
  '/news/',
  '/press/',
  '/careers/',
  '/career/',
  '/jobs/',
  '/login',
  '/sign-in',
  '/signup',
  '/register',
  '/app/',
  '/download',
  // Locale/country redirect farms (e.g. MoneyGram's /r/{country}/{locale})
  // return near-duplicate boilerplate per country and otherwise consume the
  // whole per-competitor page budget without adding real content.
  '/r/',
];
