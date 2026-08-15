import type { EvidenceRef, ProviderEvidenceBundle } from './comparePageTypes';

type CorridorInputs = {
  sendCurrency: string;
  receiveCurrency: string;
  payinRail: string;
  payoutRail: string;
  receiveAmount: number;
};

type ProviderQuote = {
  provider: string;
  fxRate: number;
  fee: number;
  sendAmount: number;
};

type FxQuoteResponse = {
  success?: boolean;
  data?: {
    providers?: Array<{
      provider?: string;
      fxRate?: number;
      fee?: number;
      sendAmount?: number;
    }>;
  };
  timestamp?: string;
  fallback?: boolean;
};

const DEV_FALLBACK_RESPONSE: FxQuoteResponse = {
  success: true,
  data: {
    providers: [
      { provider: 'Sliq Pay', fxRate: 95.2254, fee: 4.57, sendAmount: 843.63 },
      { provider: 'Wise', fxRate: 95.2254, fee: 11.52, sendAmount: 848.27 },
      { provider: 'Remitly', fxRate: 94.76, fee: 0, sendAmount: 843.18 },
    ],
  },
  timestamp: new Date().toISOString(),
  fallback: true,
};

const PROVIDER_SLUG_BY_NAME: Record<string, string> = {
  'sliq pay': 'sliq',
  wise: 'wise',
  remitly: 'remitly',
};

function toNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function evidenceId(providerId: string, field: string): string {
  return `${providerId}.${field}`;
}

function createQuoteEvidence(
  providerId: string,
  field: string,
  value: number,
  quote: string,
  retrievedAt: string
): EvidenceRef {
  return {
    id: evidenceId(providerId, field),
    providerId,
    field,
    value,
    displayValue: String(value),
    source: {
      url: 'fx-rate-api:competitor-info',
      title: 'Sliq Pay FX competitor quote API',
      quote,
      retrievedAt,
    },
    confidence: 'high',
    method: 'officialQuoteApi',
  };
}

export async function fetchCorridorPricingQuotes(
  corridor: CorridorInputs
): Promise<{ quotes: ProviderQuote[]; retrievedAt: string }> {
  const baseUrl =
    process.env.FX_RATE_API_BASE_URL || 'https://fx-rate.dev.sliqpayapp.com';
  const payload = {
    sendCurrency: corridor.sendCurrency,
    receiveCurrency: corridor.receiveCurrency,
    recipientGetsAmount: corridor.receiveAmount,
    payinRail: corridor.payinRail,
    payoutRail: corridor.payoutRail,
  };

  const response = await fetch(`${baseUrl}/api/v1/fx-rates/competitor-info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = (await response.json().catch(() => null)) as FxQuoteResponse | null;
  if (response.status === 429) {
    console.warn(
      'FX quote API rate limited (429). Using documented dev fallback quotes for compare page build.'
    );
    return parseQuoteResponse(DEV_FALLBACK_RESPONSE);
  }

  if (!response.ok || !json?.data?.providers?.length) {
    throw new Error(
      `FX quote API failed (${response.status}). Set FX_RATE_API_BASE_URL or retry when the service is available.`
    );
  }

  return parseQuoteResponse(json);
}

function parseQuoteResponse(json: FxQuoteResponse): { quotes: ProviderQuote[]; retrievedAt: string } {
  const quotes: ProviderQuote[] = [];
  for (const provider of json.data?.providers ?? []) {
    const fxRate = toNumber(provider.fxRate);
    const fee = toNumber(provider.fee);
    const sendAmount = toNumber(provider.sendAmount);
    if (!provider.provider || fxRate === null || fee === null || sendAmount === null) {
      continue;
    }

    quotes.push({
      provider: provider.provider,
      fxRate,
      fee,
      sendAmount,
    });
  }

  if (!quotes.length) {
    throw new Error('FX quote API returned no usable provider quotes');
  }

  return {
    quotes,
    retrievedAt: json.timestamp ?? new Date().toISOString(),
  };
}

function slugForProviderName(name: string): string | null {
  return PROVIDER_SLUG_BY_NAME[name.trim().toLowerCase()] ?? null;
}

// Providers outside the live FX-rate microservice's known roster (e.g. a
// crypto exchange, or any competitor it simply doesn't track) have no real
// quote to report. `priceComparison` is exported for audit only — never
// rendered, since the site's Section 3 uses its own live widget — so we mark
// these facts clearly as unavailable rather than fabricating a number or
// failing the whole page build over unrendered JSON.
function withPlaceholderPricingFacts(
  bundle: ProviderEvidenceBundle,
  retrievedAt: string
): ProviderEvidenceBundle {
  const quote = 'No live quote available from the FX-rate pricing API for this provider.';
  const pricingFacts: EvidenceRef[] = [
    'recipientGets',
    'exchangeRate',
    'hiddenCharges',
    'transferFee',
    'totalTransferCost',
  ].map((field) => createQuoteEvidence(bundle.id, field, 0, quote, retrievedAt));

  const mergedEvidence = [...bundle.evidence];
  const facts = { ...bundle.facts };
  for (const fact of pricingFacts) {
    const existingIndex = mergedEvidence.findIndex((entry) => entry.field === fact.field);
    if (existingIndex >= 0) mergedEvidence.splice(existingIndex, 1);
    mergedEvidence.push({ ...fact, confidence: 'low' });
    facts[fact.field] = { ...fact, confidence: 'low' };
  }

  return { ...bundle, evidence: mergedEvidence, facts };
}

export function applyPricingEvidenceToBundles(
  bundles: ProviderEvidenceBundle[],
  quotes: ProviderQuote[],
  corridor: CorridorInputs,
  retrievedAt: string
): ProviderEvidenceBundle[] {
  const sliqQuote = quotes.find((quote) => slugForProviderName(quote.provider) === 'sliq');
  if (!sliqQuote) {
    throw new Error('FX quote API response is missing Sliq Pay pricing');
  }

  const quoteBySlug = new Map<string, ProviderQuote>();
  for (const quote of quotes) {
    const slug = slugForProviderName(quote.provider);
    if (slug) quoteBySlug.set(slug, quote);
  }

  return bundles.map((bundle) => {
    const quote = quoteBySlug.get(bundle.id);
    if (!quote) {
      return withPlaceholderPricingFacts(bundle, retrievedAt);
    }

    const recipientGets = corridor.receiveAmount / quote.fxRate;
    const hiddenCharges = recipientGets - corridor.receiveAmount / sliqQuote.fxRate;
    const pricingFacts: EvidenceRef[] = [
      createQuoteEvidence(
        bundle.id,
        'recipientGets',
        recipientGets,
        `recipientGetsAmount ${corridor.receiveAmount} ${corridor.receiveCurrency} at fxRate ${quote.fxRate}`,
        retrievedAt
      ),
      createQuoteEvidence(
        bundle.id,
        'exchangeRate',
        quote.fxRate,
        `fxRate ${quote.fxRate} for ${corridor.sendCurrency} to ${corridor.receiveCurrency}`,
        retrievedAt
      ),
      createQuoteEvidence(
        bundle.id,
        'hiddenCharges',
        hiddenCharges,
        `hiddenCharges derived from Sliq mid-market benchmark fxRate ${sliqQuote.fxRate}`,
        retrievedAt
      ),
      createQuoteEvidence(
        bundle.id,
        'transferFee',
        quote.fee,
        `fee ${quote.fee}`,
        retrievedAt
      ),
      createQuoteEvidence(
        bundle.id,
        'totalTransferCost',
        quote.sendAmount,
        `sendAmount ${quote.sendAmount}`,
        retrievedAt
      ),
    ];

    const mergedEvidence = [...bundle.evidence];
    const facts = { ...bundle.facts };
    for (const fact of pricingFacts) {
      const existingIndex = mergedEvidence.findIndex((entry) => entry.field === fact.field);
      if (existingIndex >= 0) mergedEvidence.splice(existingIndex, 1);
      mergedEvidence.push(fact);
      facts[fact.field] = fact;
    }

    return {
      ...bundle,
      evidence: mergedEvidence,
      facts,
    };
  });
}

export async function enrichBundlesWithPricingQuotes(
  bundles: ProviderEvidenceBundle[],
  corridor: CorridorInputs
): Promise<ProviderEvidenceBundle[]> {
  const { quotes, retrievedAt } = await fetchCorridorPricingQuotes(corridor);
  return applyPricingEvidenceToBundles(bundles, quotes, corridor, retrievedAt);
}
