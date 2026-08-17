import type {
  EvidenceConfidence,
  EvidenceMethod,
  EvidenceRef,
  ProviderEvidenceBundle,
} from './comparePageTypes';
import {
  GOVERNED_FIELDS,
  SLIQ_CANONICAL_TEXT,
  TRANSFER_METHOD_ITEMS,
  classifyGovernedField,
  formatSupportChannels,
  formatTransferMethods,
  overrideFor,
  type GovernedField,
  type SupportChannels,
  type TransferMethodItem,
} from './compareFieldRules';

type KnowledgePage = {
  url: string;
  title: string | null;
  clean_text: string;
};

export type CompetitorEvidenceInput = {
  id: string;
  name: string;
  sheetMeta: Record<string, string>;
  rawMetadata: Record<string, unknown>;
  pages: KnowledgePage[];
  // When this competitor's underlying data was actually last scraped —
  // NOT "now". Evidence gets re-exported for every live competitor on every
  // pipeline run regardless of whether that competitor was touched, so
  // stamping wall-clock time here would make every provider file's diff
  // look like a real refresh even when nothing changed.
  retrievedAt: string;
};

const FEATURE_PATTERNS: Record<string, string[]> = {
  easyToUse: ['app', 'mobile', 'easy', 'simple', 'track'],
  scanToPay: ['qr', 'scan', 'upi', 'pay like a local'],
  sendPhoneEmail: ['phone', 'email', 'recipient', 'send to'],
  sendBank: ['bank account', 'bank deposit', 'account'],
  requestMoney: ['request money', 'payment request', 'request a payment'],
  instantTransfers: ['instant', 'seconds', 'minutes', 'upi', 'imps'],
};

const SUPPORT_CHANNEL_PATTERNS: Record<keyof SupportChannels, string[]> = {
  email: ['email support', 'support@', 'email us', 'contact us by email'],
  chat: ['live chat', 'chat support', 'chat with us', '24/7 chat'],
  call: ['phone support', 'call us', 'helpline', 'customer service number', 'call support'],
};

// UPI is deliberately excluded — it's reserved for Sliq and never detected
// for competitors, regardless of whether their own site mentions it.
const TRANSFER_METHOD_PATTERNS: Record<Exclude<TransferMethodItem, 'UPI'>, string[]> = {
  ACH: ['ach', 'automated clearing house'],
  'Credit Card': ['credit card'],
  'Debit Card': ['debit card'],
  Wire: ['wire transfer', 'bank wire', 'wire'],
  NEFT: ['neft'],
  RTGS: ['rtgs'],
  IMPS: ['imps'],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary matching, not plain substring — short tokens like "ach" or
// "imps" otherwise false-positive inside unrelated words ("each", "approach",
// "glimpse"). Confirmed this bites in practice: Binance.US's scraped pages
// have zero real ACH/IMPS mentions, all matches were "approach"/"each".
function textIncludesAny(haystack: string, terms: string[]): boolean {
  const normalized = normalize(haystack);
  return terms.some((term) => {
    const pattern = new RegExp(`\\b${escapeRegExp(normalize(term))}\\b`, 'i');
    return pattern.test(normalized);
  });
}

// Scraped page text only — deliberately excludes rawMetadata/sheetMeta JSON.
// The LLM's own metadata blob can phrase things negatively (e.g. a data_gaps
// entry reading "no verified ACH, UPI, IMPS rails were found"), and a naive
// substring match can't tell a confirmation from a denial. Real page copy
// doesn't have that problem — sites state what they support, not what they don't.
function pageTextHaystack(input: CompetitorEvidenceInput): string {
  return input.pages.map((page) => page.clean_text).join(' ');
}

function detectSupportChannels(input: CompetitorEvidenceInput): SupportChannels {
  const haystack = pageTextHaystack(input);

  return {
    email: textIncludesAny(haystack, SUPPORT_CHANNEL_PATTERNS.email),
    chat: textIncludesAny(haystack, SUPPORT_CHANNEL_PATTERNS.chat),
    call: textIncludesAny(haystack, SUPPORT_CHANNEL_PATTERNS.call),
  };
}

function detectTransferMethods(
  input: CompetitorEvidenceInput
): Partial<Record<TransferMethodItem, boolean>> {
  const haystack = pageTextHaystack(input);

  const found: Partial<Record<TransferMethodItem, boolean>> = {};
  for (const [item, terms] of Object.entries(TRANSFER_METHOD_PATTERNS)) {
    found[item as TransferMethodItem] = textIncludesAny(haystack, terms);
  }
  return found;
}

const COMPARISON_PATTERNS: Record<string, string[]> = {
  builtFor: ['send money', 'international transfer', 'money transfer', 'remittance'],
  transferMethods: ['bank', 'upi', 'cash pickup', 'wallet', 'delivery method', 'deposit'],
  cost: ['fee', 'fees', 'cost', 'pricing', 'charges'],
  fxRate: ['exchange rate', 'mid-market', 'markup', 'mark-up', 'hidden fee'],
  speed: ['instant', 'seconds', 'minutes', 'hour', 'days', 'delivery speed'],
  security: ['security', 'encryption', 'fraud', 'protect', 'safeguard'],
  compliance: [
    'regulated',
    'license',
    'licensed',
    'registration',
    'registered',
    'compliance',
    'fincen',
    'fca',
    'money transmitter',
    'money services',
    'fintrac',
  ],
  support: ['support', 'help', 'chat', 'email', 'phone', 'contact'],
};

const FIELD_URL_HINTS: Record<string, RegExp> = {
  compliance: /legal|license|licen|regulat|compliance|fincen|msb|money-transmitter/i,
  security: /security|trust|safety|fraud|protect/i,
  support: /support|help|contact/i,
  cost: /pricing|fees|rates/i,
  fxRate: /pricing|fees|rates|exchange/i,
  speed: /pricing|send-money|transfer|delivery/i,
  builtFor: /send-money|transfer|remittance|india/i,
  transferMethods: /send-money|transfer|delivery|india/i,
};

const METADATA_KEYS_BY_FIELD: Record<string, string[]> = {
  builtFor: ['service_type', 'service type', 'usps', 'use cases'],
  transferMethods: ['delivery_methods', 'delivery methods', 'transfer_rails', 'transfer rails'],
  cost: ['fee_structure', 'fee structure', 'typical_fee_usd_to_inr', 'fees'],
  fxRate: ['exchange_rate_markup_pct', 'exchange rate markup pct', 'fx markup', 'fxRate'],
  speed: ['transfer_speed', 'transfer speed', 'delivery speed'],
  security: ['security', 'trust', 'weaknesses', 'fraud', 'encryption'],
  compliance: ['is_regulated', 'is regulated', 'regulation_bodies', 'regulation bodies', 'licenses'],
  support: ['support', 'customer support', 'contact methods', 'help'],
};

const FIELD_DISPLAY_FALLBACKS: Record<string, string> = {
  builtFor: 'International money transfers',
  transferMethods: 'Bank, card, and digital wallet options',
  cost: 'Variable fee — see live quote',
  fxRate: 'Exchange rate markup applied',
  speed: 'Delivery time varies by method',
  security: 'Security information available on provider site',
  compliance: 'Licensed money transfer provider',
  support: 'Customer support available',
};

const PRICE_KEYS: Record<string, string[]> = {
  recipientGets: [
    'recipient_gets_usd',
    'recipient gets usd',
    'amount_converted_usd',
    'amount converted usd',
    'send_amount_before_fees_usd',
  ],
  exchangeRate: [
    'exchange_rate_inr',
    'exchange rate inr',
    'usd_to_inr_exchange_rate',
    'usd to inr exchange rate',
    'fx_rate',
    'fx rate',
  ],
  hiddenCharges: [
    'hidden_charges_inr',
    'hidden charges inr',
    'exchange_rate_markup_inr',
    'exchange rate markup inr',
    'fx_markup_inr',
  ],
  transferFee: [
    'transfer_fee_inr',
    'transfer fee inr',
    'fee_inr',
    'fee inr',
    'typical_fee_usd_to_inr',
  ],
  totalTransferCost: [
    'total_transfer_cost_inr',
    'total transfer cost inr',
    'total_cost_inr',
    'total cost inr',
  ],
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function evidenceId(providerId: string, field: string): string {
  return `${providerId}.${field}`;
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const normalized = normalize(value);
    return (
      normalized.length > 0 &&
      normalized !== 'null' &&
      normalized !== 'unknown' &&
      normalized !== 'not stated' &&
      normalized !== 'not found'
    );
  }
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function stringifyValue(value: unknown): string {
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function findMetadataValue(
  source: Record<string, unknown>,
  keys: string[]
): { key: string; value: unknown } | null {
  const normalizedKeys = new Set(keys.map(normalize));
  for (const [key, value] of Object.entries(source)) {
    if (normalizedKeys.has(normalize(key)) && isPresent(value)) {
      return { key, value };
    }
  }
  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function findSentence(text: string, terms: string[], minMatches = 2): string | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  const sentences = clean.match(/[^.!?]+[.!?]?/g) ?? [clean];
  const normalizedTerms = terms.map(normalize);
  const requiredMatches = Math.min(minMatches, normalizedTerms.length);

  for (const sentence of sentences) {
    const lower = normalize(sentence);
    const matches = normalizedTerms.filter((term) => lower.includes(term)).length;
    if (matches >= requiredMatches) {
      return sentence.trim().slice(0, 500);
    }
  }

  return null;
}

function urlMatchesField(url: string, field: string): boolean {
  const pattern = FIELD_URL_HINTS[field];
  return pattern ? pattern.test(url) : false;
}

function cleanQuote(quote: string): string {
  return quote
    .replace(/\s{2,}/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([^\s])([A-Z][a-z])/g, '$1 $2')
    .slice(0, 200)
    .trim();
}

function findPageEvidence(
  providerId: string,
  field: string,
  pages: KnowledgePage[],
  terms: string[],
  retrievedAt: string,
  metadataDisplayValue?: string,
  confidence: EvidenceConfidence = 'high'
): EvidenceRef | null {
  const sortedPages = [...pages].sort((a, b) => {
    const aMatch = urlMatchesField(a.url, field) ? 0 : 1;
    const bMatch = urlMatchesField(b.url, field) ? 0 : 1;
    return aMatch - bMatch;
  });

  for (const page of sortedPages) {
    const minMatches = urlMatchesField(page.url, field) ? 1 : 2;
    const rawQuote = findSentence(page.clean_text, terms, minMatches);
    if (!rawQuote) continue;

    const quote = cleanQuote(rawQuote);
    const displayValue = metadataDisplayValue ?? quote;

    return {
      id: evidenceId(providerId, field),
      providerId,
      field,
      value: displayValue,
      displayValue,
      source: {
        url: page.url,
        title: page.title ?? undefined,
        quote: rawQuote,
        retrievedAt,
      },
      confidence,
      method: 'officialPage',
    };
  }

  return null;
}

function createMetadataEvidence(
  providerId: string,
  field: string,
  value: unknown,
  key: string,
  method: EvidenceMethod,
  retrievedAt: string
): EvidenceRef {
  const textValue = stringifyValue(value);
  return {
    id: evidenceId(providerId, field),
    providerId,
    field,
    value: typeof value === 'boolean' ? value : textValue,
    displayValue: textValue,
    source: {
      url: `${method}:${providerId}`,
      title: key,
      quote: `${key}: ${textValue}`,
      retrievedAt,
    },
    confidence: method === 'structuredMetadata' ? 'medium' : 'low',
    method,
  };
}

function addEvidence(map: Map<string, EvidenceRef>, evidence: EvidenceRef | null) {
  if (evidence) {
    map.set(evidence.field, evidence);
  }
}

function evidenceFromComplianceMetadata(input: CompetitorEvidenceInput): EvidenceRef | null {
  const bodies = findMetadataValue(input.rawMetadata, [
    'regulation_bodies',
    'regulation bodies',
    'licenses',
  ]);
  if (bodies) {
    return createMetadataEvidence(
      input.id,
      'compliance',
      bodies.value,
      bodies.key,
      'structuredMetadata',
      input.retrievedAt
    );
  }

  const sheetBodies = findMetadataValue(input.sheetMeta, [
    'regulation_bodies',
    'regulation bodies',
    'licenses',
  ]);
  if (sheetBodies) {
    return createMetadataEvidence(
      input.id,
      'compliance',
      sheetBodies.value,
      sheetBodies.key,
      'managerSheet',
      input.retrievedAt
    );
  }

  const regulated = findMetadataValue(input.rawMetadata, ['is_regulated', 'is regulated']);
  if (regulated?.value === true) {
    return {
      ...createMetadataEvidence(
        input.id,
        'compliance',
        true,
        regulated.key,
        'structuredMetadata',
        input.retrievedAt
      ),
      displayValue: 'Licensed and regulated money transfer provider',
    };
  }

  const sheetRegulated = findMetadataValue(input.sheetMeta, ['is_regulated', 'is regulated']);
  if (sheetRegulated?.value === true || sheetRegulated?.value === 'true') {
    return {
      ...createMetadataEvidence(
        input.id,
        'compliance',
        true,
        sheetRegulated.key,
        'managerSheet',
        input.retrievedAt
      ),
      displayValue: 'Licensed and regulated money transfer provider',
    };
  }

  return null;
}

function metadataDisplayForField(
  input: CompetitorEvidenceInput,
  field: string,
  metadataKeys: string[]
): string | undefined {
  const metaVal = findMetadataValue(input.rawMetadata, metadataKeys) ??
    findMetadataValue(input.sheetMeta, metadataKeys);
  if (metaVal) {
    const text = stringifyValue(metaVal.value).trim();
    if (text.length > 0 && text.length <= 120) return text;
    if (text.length > 120) return text.slice(0, 117) + '…';
  }
  return FIELD_DISPLAY_FALLBACKS[field];
}

function evidenceFromSources(
  input: CompetitorEvidenceInput,
  field: string,
  terms: string[],
  metadataKeys: string[] = terms
): EvidenceRef | null {
  if (field === 'compliance') {
    const complianceMetadata = evidenceFromComplianceMetadata(input);
    if (complianceMetadata) {
      const pageEvidence = findPageEvidence(
        input.id, field, input.pages, terms, input.retrievedAt,
        complianceMetadata.displayValue
      );
      return pageEvidence ?? complianceMetadata;
    }
  }

  const displayHint = metadataDisplayForField(input, field, metadataKeys);
  const pageEvidence = findPageEvidence(input.id, field, input.pages, terms, input.retrievedAt, displayHint);
  if (pageEvidence) return pageEvidence;

  const metadataValue = findMetadataValue(input.rawMetadata, metadataKeys);
  if (metadataValue) {
    return createMetadataEvidence(
      input.id,
      field,
      metadataValue.value,
      metadataValue.key,
      'structuredMetadata',
      input.retrievedAt
    );
  }

  const sheetValue = findMetadataValue(input.sheetMeta, metadataKeys);
  if (sheetValue) {
    return createMetadataEvidence(input.id, field, sheetValue.value, sheetValue.key, 'managerSheet', input.retrievedAt);
  }

  if (FIELD_DISPLAY_FALLBACKS[field]) {
    return {
      id: evidenceId(input.id, field),
      providerId: input.id,
      field,
      value: FIELD_DISPLAY_FALLBACKS[field],
      displayValue: FIELD_DISPLAY_FALLBACKS[field],
      source: {
        url: `structuredMetadata:${input.id}`,
        title: field,
        quote: `${field}: not found in structured metadata or scraped pages`,
        retrievedAt: input.retrievedAt,
      },
      confidence: 'low',
      method: 'structuredMetadata',
    };
  }

  return null;
}

export const FEATURE_NOT_MENTIONED_QUOTE =
  'Feature not documented in provider delivery methods or website sources.';

function defaultMissingFeatureEvidence(providerId: string, field: string, retrievedAt: string): EvidenceRef {
  return {
    id: evidenceId(providerId, field),
    providerId,
    field,
    value: false,
    displayValue: 'Unavailable',
    source: {
      url: `structuredMetadata:${providerId}`,
      title: field,
      quote: FEATURE_NOT_MENTIONED_QUOTE,
      retrievedAt,
    },
    confidence: 'low',
    method: 'structuredMetadata',
  };
}

function inferFeatureEvidence(
  input: CompetitorEvidenceInput,
  featureField: string,
  terms: string[]
): EvidenceRef | null {
  const metadataKeys = ['delivery_methods', 'transfer_rails', 'usps', 'service_type', 'transfer_speed'];
  for (const source of [input.rawMetadata, input.sheetMeta]) {
    for (const key of metadataKeys) {
      const value = source[key];
      if (!isPresent(value)) continue;
      const text = normalize(stringifyValue(value));
      if (!terms.some((term) => text.includes(normalize(term)))) continue;

      return createMetadataEvidence(
        input.id,
        featureField,
        true,
        key,
        source === input.rawMetadata ? 'structuredMetadata' : 'managerSheet',
        input.retrievedAt
      );
    }
  }

  return null;
}

function addPriceEvidence(input: CompetitorEvidenceInput, evidence: Map<string, EvidenceRef>) {
  for (const [field, keys] of Object.entries(PRICE_KEYS)) {
    const metadataValue = findMetadataValue(input.rawMetadata, keys);
    const sheetValue = findMetadataValue(input.sheetMeta, keys);
    const picked = metadataValue ?? sheetValue;
    if (!picked) continue;

    const numericValue = parseNumber(picked.value);
    if (numericValue === null) continue;

    evidence.set(
      field,
      createMetadataEvidence(
        input.id,
        field,
        numericValue,
        picked.key,
        metadataValue ? 'structuredMetadata' : 'managerSheet',
        input.retrievedAt
      )
    );
  }
}

const GOVERNED_FIELD_SET = new Set<string>(GOVERNED_FIELDS);

function governedFieldEvidence(input: CompetitorEvidenceInput, field: GovernedField): EvidenceRef {
  const result = classifyGovernedField(input.id, field, input.rawMetadata);
  const method: EvidenceMethod = result.origin === 'override' ? 'managerSheet' : 'llmClassifiedSignal';
  return {
    id: evidenceId(input.id, field),
    providerId: input.id,
    field,
    value: result.value,
    displayValue: result.value,
    source: {
      url: `${method}:${input.id}`,
      title: field,
      quote: result.quote || `${field} classified from structured website signals.`,
      retrievedAt: input.retrievedAt,
    },
    confidence: result.origin === 'override' ? 'high' : result.quote ? 'medium' : 'low',
    method,
  };
}

function supportChannelEvidence(input: CompetitorEvidenceInput): EvidenceRef {
  const channels = detectSupportChannels(input);
  const channelsText = formatSupportChannels(channels);
  const anyChannelMentioned = channels.email || channels.chat || channels.call;
  return {
    id: evidenceId(input.id, 'support'),
    providerId: input.id,
    field: 'support',
    value: channelsText,
    displayValue: channelsText,
    source: {
      url: `officialPage:${input.id}`,
      title: 'support',
      quote:
        anyChannelMentioned
          ? `Support channels detected on site: ${channelsText}.`
          : 'No specific support channel (email/chat/call) documented on site.',
      retrievedAt: input.retrievedAt,
    },
    confidence: anyChannelMentioned ? 'medium' : 'low',
    method: 'officialPage',
  };
}

function transferMethodsEvidence(input: CompetitorEvidenceInput): EvidenceRef {
  const override = overrideFor(input.id, 'transferMethods');
  if (override) {
    return {
      id: evidenceId(input.id, 'transferMethods'),
      providerId: input.id,
      field: 'transferMethods',
      value: override,
      displayValue: override,
      source: {
        url: `managerSheet:${input.id}`,
        title: 'transferMethods',
        quote: 'Manually curated canonical value.',
        retrievedAt: input.retrievedAt,
      },
      confidence: 'high',
      method: 'managerSheet',
    };
  }

  const found = detectTransferMethods(input);
  const methodsText = formatTransferMethods(found);
  if (!methodsText) {
    throw new Error(
      `No transfer methods detected for ${input.id} — add a FIELD_VALUE_OVERRIDES entry or re-run scraping.`
    );
  }

  return {
    id: evidenceId(input.id, 'transferMethods'),
    providerId: input.id,
    field: 'transferMethods',
    value: methodsText,
    displayValue: methodsText,
    source: {
      url: `officialPage:${input.id}`,
      title: 'transferMethods',
      quote: `Transfer methods detected on site: ${methodsText}.`,
      retrievedAt: input.retrievedAt,
    },
    confidence: 'medium',
    method: 'officialPage',
  };
}

export function extractProviderEvidence(input: CompetitorEvidenceInput): ProviderEvidenceBundle {
  const evidence = new Map<string, EvidenceRef>();

  for (const [field, terms] of Object.entries(COMPARISON_PATTERNS)) {
    if (field === 'transferMethods') {
      addEvidence(evidence, transferMethodsEvidence(input));
      continue;
    }
    if (field === 'support') {
      addEvidence(evidence, supportChannelEvidence(input));
      continue;
    }
    if (GOVERNED_FIELD_SET.has(field)) {
      addEvidence(evidence, governedFieldEvidence(input, field as GovernedField));
      continue;
    }
    addEvidence(evidence, evidenceFromSources(input, field, terms, METADATA_KEYS_BY_FIELD[field] ?? terms));
  }

  for (const [feature, terms] of Object.entries(FEATURE_PATTERNS)) {
    const field = `feature.${feature}`;
    const pageEvidence = evidenceFromSources(input, field, terms);
    if (pageEvidence) {
      addEvidence(evidence, pageEvidence);
      continue;
    }
    const inferred = inferFeatureEvidence(input, field, terms);
    if (inferred) {
      addEvidence(evidence, inferred);
      continue;
    }
    if (input.id !== 'sliq') {
      addEvidence(evidence, defaultMissingFeatureEvidence(input.id, field, input.retrievedAt));
    }
  }

  addPriceEvidence(input, evidence);

  return {
    id: input.id,
    name: input.name,
    evidence: [...evidence.values()],
    facts: Object.fromEntries(evidence),
  };
}

// Sliq's own facts are hardcoded product truth, not scraped — there's no
// "last scraped" date to cite, so use a fixed placeholder instead of "now".
// Otherwise sliq.json would show a spurious diff on every export run even
// though these facts never change.
const SLIQ_CANONICAL_RETRIEVED_AT = '2026-01-01T00:00:00.000Z';

function canonicalEvidence(field: string, value: string | number | boolean, quote: string): EvidenceRef {
  return {
    id: evidenceId('sliq', field),
    providerId: 'sliq',
    field,
    value,
    displayValue: typeof value === 'string' ? value : undefined,
    source: {
      url: 'sliqpay:canonical-facts',
      title: 'Sliq Pay canonical product facts',
      quote,
      retrievedAt: SLIQ_CANONICAL_RETRIEVED_AT,
    },
    confidence: 'high',
    method: 'sliqCanonicalFacts',
  };
}

export function buildSliqEvidence(): ProviderEvidenceBundle {
  const entries = [
    canonicalEvidence(
      'builtFor',
      SLIQ_CANONICAL_TEXT.builtFor,
      'Sliq Pay serves expats, tourists, businesses, and freelancers sending USD to INR.'
    ),
    canonicalEvidence(
      'transferMethods',
      SLIQ_CANONICAL_TEXT.transferMethods,
      'Sliq Pay supports ACH, credit card, debit card, wire, NEFT, RTGS, IMPS, and UPI.'
    ),
    canonicalEvidence('cost', SLIQ_CANONICAL_TEXT.cost, '0.3-0.5% fees for instant transfer.'),
    canonicalEvidence(
      'fxRate',
      SLIQ_CANONICAL_TEXT.fxRate,
      'Mid-market (Google) USD to INR rate, zero markup, no hidden charges.'
    ),
    canonicalEvidence('speed', SLIQ_CANONICAL_TEXT.speed, 'All Sliq Pay transfers are instant via IMPS/UPI.'),
    canonicalEvidence(
      'security',
      SLIQ_CANONICAL_TEXT.security,
      'Advanced data security best practices with AI fraud detection.'
    ),
    canonicalEvidence(
      'compliance',
      SLIQ_CANONICAL_TEXT.compliance,
      'FinCEN registered (NMLS #2714589), RBI compliant.'
    ),
    canonicalEvidence('support', '24/7 support by phone, email, and live chat.', '24/7 support: phone, email, live chat.'),
    canonicalEvidence('feature.easyToUse', true, 'Sliq Pay mobile experience is designed for easy USD to INR transfers.'),
    canonicalEvidence('feature.scanToPay', true, 'Sliq Pay supports scan-to-pay style local payments through UPI.'),
    canonicalEvidence('feature.sendPhoneEmail', true, 'Sliq Pay supports recipient phone/email flows.'),
    canonicalEvidence('feature.sendBank', true, 'Sliq Pay supports delivery to Indian bank accounts.'),
    canonicalEvidence('feature.requestMoney', true, 'Sliq Pay supports requesting money.'),
    canonicalEvidence('feature.instantTransfers', true, 'Sliq Pay supports instant transfers via IMPS/UPI.'),
  ];

  return {
    id: 'sliq',
    name: 'Sliq pay',
    evidence: entries,
    facts: Object.fromEntries(entries.map((entry) => [entry.field, entry])),
  };
}
