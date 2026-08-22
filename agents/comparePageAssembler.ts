import fs from 'fs';
import path from 'path';
import type {
  ComparePageDocument,
  CompareStatus,
  EvidenceRef,
  PriceComparison,
  ProviderEvidenceBundle,
} from './comparePageTypes';
import {
  GOVERNED_FIELDS,
  statusForGovernedValue,
  classifyFeatureStatus,
  type GovernedField,
} from './compareFieldRules';
import { FEATURE_NOT_MENTIONED_QUOTE } from './compareEvidenceExtractor';

const WEBSITE_PUBLIC_DIR = path.join(__dirname, '..', '..', 'Sliq-website', 'public');

const COMPARISON_ROWS = [
  { id: 'builtFor', label: 'Built For', mobileHeight: 110, desktopHeight: 100 },
  { id: 'transferMethods', label: 'Transfer Methods', mobileHeight: 110, desktopHeight: 100 },
  { id: 'cost', label: 'Cost', mobileHeight: 130, desktopHeight: 100 },
  { id: 'fxRate', label: 'FX Rate Transparency', mobileHeight: 150, desktopHeight: 127 },
  { id: 'speed', label: 'Speed', mobileHeight: 110, desktopHeight: 100 },
  { id: 'security', label: 'Security & Safety', mobileHeight: 130, desktopHeight: 100 },
  { id: 'compliance', label: 'Compliance & Regulation', mobileHeight: 90, desktopHeight: 100 },
] as const;

const FEATURES = [
  { id: 'easyToUse', label: 'Easy to use' },
  { id: 'scanToPay', label: 'Scan to pay like a local' },
  { id: 'sendPhoneEmail', label: 'Send to phone/email' },
  { id: 'sendBank', label: 'Send to bank account' },
  { id: 'requestMoney', label: 'Request money' },
  { id: 'instantTransfers', label: 'Instant transfers' },
] as const;

const PRICE_ROWS = [
  { id: 'recipientGets', label: 'Recipient gets', currency: 'USD' },
  { id: 'exchangeRate', label: 'Exchange rate', currency: 'INR' },
  { id: 'hiddenCharges', label: 'Hidden charges', currency: 'INR' },
  { id: 'transferFee', label: 'Transfer fee', currency: 'INR' },
  { id: 'totalTransferCost', label: 'Total transfer cost', currency: 'INR' },
] as const;

type Corridor = {
  sendCurrency: string;
  receiveCurrency: string;
  payinRail: string;
  payoutRail: string;
  receiveAmount: number;
};

function requireFact(bundle: ProviderEvidenceBundle, field: string): EvidenceRef {
  const fact = bundle.facts[field];
  if (!fact) {
    throw new Error(`Missing required evidence for ${bundle.id}.${field}`);
  }
  return fact;
}

function requireNumericFact(bundle: ProviderEvidenceBundle, field: string): EvidenceRef {
  const fact = requireFact(bundle, field);
  if (typeof fact.value !== 'number' || !Number.isFinite(fact.value)) {
    throw new Error(`Required evidence ${bundle.id}.${field} is not numeric`);
  }
  return fact;
}

function display(fact: EvidenceRef): string {
  return fact.displayValue ?? String(fact.value);
}

function statusFromFact(fact: EvidenceRef): CompareStatus {
  const quote = `${fact.displayValue ?? ''} ${fact.source.quote}`.toLowerCase();
  if (/\b(no|not|does not|without|unsupported|unavailable)\b/.test(quote)) {
    return 'negative';
  }
  if (/\b(may|can|available|supports?|offers?|instant|secure|regulated)\b/.test(quote)) {
    return 'positive';
  }
  return 'neutral';
}

const GOVERNED_FIELD_SET = new Set<string>(GOVERNED_FIELDS);

function comparisonCellStatus(providerId: string, field: string, fact: EvidenceRef): CompareStatus {
  if (!GOVERNED_FIELD_SET.has(field)) return statusFromFact(fact);
  // Sliq's governed cells are all canonical brand strengths.
  if (providerId === 'sliq') {
    return 'positive';
  }
  return statusForGovernedValue(field as GovernedField, display(fact));
}

function logoSrc(providerId: string): string {
  if (providerId === 'sliq') return '/image/programmatic/sliq-pay.svg';
  // Hand-placed pilot icons are .svg; auto-fetched competitor icons (see
  // agents/competitorAssets.ts) are saved as .png — prefer whichever exists.
  const pngPath = path.join(WEBSITE_PUBLIC_DIR, 'image', 'programmatic', `${providerId}.png`);
  if (fs.existsSync(pngPath)) return `/image/programmatic/${providerId}.png`;
  return `/image/programmatic/${providerId}.svg`;
}

function priceWordmarkSrc(providerId: string): string {
  if (providerId === 'sliq') return '/svg/sliqpay.svg';
  if (providerId === 'wise') return '/image/compare/price-wise-wordmark.png';
  if (providerId === 'remitly') return '/image/compare/price-remitly-wordmark.png';
  return logoSrc(providerId);
}

function wordmarkSrc(providerId: string): string {
  if (providerId === 'sliq') return '/image/compare/section1-sliq-union-logo.svg';
  return `/image/compare/section1-${providerId}-wordmark.png`;
}

function formatNumber(value: number, currency: string): string {
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: currency === 'INR' && value < 100 ? 4 : 2,
  })} ${currency}`;
}

function buildEvidenceMap(bundles: ProviderEvidenceBundle[]): Record<string, EvidenceRef> {
  return Object.fromEntries(
    bundles.flatMap((bundle) => bundle.evidence.map((entry) => [entry.id, entry] as const))
  );
}

function buildComparisonProvider(bundle: ProviderEvidenceBundle) {
  const highlighted = bundle.id === 'sliq';
  return {
    id: bundle.id,
    name: bundle.name,
    iconSrc: wordmarkSrc(bundle.id),
    logoType: highlighted ? ('brand' as const) : ('wordmark' as const),
    iconWidth: highlighted ? 120 : bundle.id === 'remitly' ? 112 : 80,
    iconHeight: highlighted ? 40 : 30,
    mobileIconWidth: highlighted ? undefined : bundle.id === 'remitly' ? 90 : 64,
    mobileIconHeight: highlighted ? undefined : 24,
    iconSize: 96,
    highlighted,
    showStoreButtons: highlighted ? true : undefined,
    cells: COMPARISON_ROWS.map((row) => {
      const fact = requireFact(bundle, row.id);
      return {
        text: display(fact),
        icon: comparisonCellStatus(bundle.id, row.id, fact),
        iconVariant: highlighted ? ('alt' as const) : undefined,
        emphasized: highlighted ? true : undefined,
        evidenceIds: [fact.id],
      };
    }),
  };
}

function buildSpeedRow(bundle: ProviderEvidenceBundle) {
  const fact = requireFact(bundle, 'speed');
  const isSliq = bundle.id === 'sliq';
  return {
    id: bundle.id,
    barSrc: `/image/compare/section2-bar-${bundle.id}.png`,
    logoSrc: logoSrc(bundle.id),
    logoAlt: bundle.name,
    evidenceIds: [fact.id],
    copy: isSliq
      ? {
          type: 'highlight' as const,
          prefix: 'We are ',
          highlight: 'faster, cheaper & more convenient',
        }
      : {
          type: 'highlight' as const,
          prefix: `${bundle.name} is usually `,
          highlight: 'slower and more expensive',
        },
  };
}

function buildPriceProvider(bundle: ProviderEvidenceBundle) {
  const highlighted = bundle.id === 'sliq';
  const values = Object.fromEntries(
    PRICE_ROWS.map((row) => {
      const fact = requireNumericFact(bundle, row.id);
      const value = fact.value as number;
      return [
        row.id,
        {
          value,
          displayValue: formatNumber(value, row.currency),
          evidenceIds: [fact.id],
        },
      ];
    })
  ) as PriceComparison['providers'][number]['values'];

  return {
    id: bundle.id,
    name: bundle.name,
    logoSrc: priceWordmarkSrc(bundle.id),
    highlighted,
    badge: highlighted ? 'Best rate in market' : undefined,
    values,
  };
}

function buildFeatureProvider(bundle: ProviderEvidenceBundle) {
  const evidenceIdsByFeature: Record<string, string[]> = {};
  const cells = FEATURES.map((feature) => {
    const fact = requireFact(bundle, `feature.${feature.id}`);
    evidenceIdsByFeature[feature.id] = [fact.id];
    const mentioned = fact.source.quote !== FEATURE_NOT_MENTIONED_QUOTE;
    return classifyFeatureStatus(bundle.id, feature.id, mentioned);
  });

  return {
    id: bundle.id,
    name: bundle.name,
    iconSrc: logoSrc(bundle.id),
    highlighted: bundle.id === 'sliq',
    cells,
    evidenceIdsByFeature,
  };
}

function buildSupportColumn(bundle: ProviderEvidenceBundle) {
  const fact = requireFact(bundle, 'support');
  const highlighted = bundle.id === 'sliq';
  const channelsText = display(fact);
  return {
    id: bundle.id,
    name: bundle.name,
    iconSrc: logoSrc(bundle.id),
    tagline: highlighted
      ? 'Sliq pay provides email, chat as well as call support for our customers.'
      : channelsText
        ? `${bundle.name} supports ${channelsText} to resolve customer queries`
        : `${bundle.name} supports customer queries through its standard support channels`,
    subtitle: highlighted
      ? "Whether it's a question, suggestion or concern, Sliq pay is available around the clock for whenever you need us."
      : undefined,
    backgroundPattern: `/image/compare/section6-${bundle.id}-pattern.png`,
    gradientBackground: highlighted ? '/image/compare/section6-sliq-gradient.jpg' : undefined,
    highlighted,
    showVerifyBadge: highlighted ? true : undefined,
    showStoreButtons: highlighted ? true : undefined,
    evidenceIds: [fact.id],
  };
}

function buildFaqItems(bundles: ProviderEvidenceBundle[]) {
  const sliq = bundles.find((bundle) => bundle.id === 'sliq');
  if (!sliq) {
    throw new Error('Sliq bundle is required to build FAQ items');
  }

  return [
    {
      question: "What's the best way to send money to India from the US?",
      answer:
        "It depends on how your recipient wants to receive the money. For a bank deposit, most major services will do the job. But if you want to pay a UPI ID, a phone number, or a QR code, which is how most people in India actually transact, Sliq Pay handles those directly and bank-transfer-only apps don't. Before you pick one, compare the total cost, the speed, and which payout methods it supports.",
      evidenceIds: [
        requireFact(sliq, 'feature.scanToPay').id,
        requireFact(sliq, 'feature.sendPhoneEmail').id,
        requireFact(sliq, 'transferMethods').id,
      ],
    },
    {
      question: 'Can I send money to India via UPI from the USA?',
      answer:
        "Yes. Sliq Pay lets you send from the US straight to a UPI ID, or by scanning a UPI QR code, and the money lands within seconds. That's a key difference from other apps, which only deposit into bank accounts.",
      evidenceIds: [
        requireFact(sliq, 'feature.scanToPay').id,
        requireFact(sliq, 'feature.sendPhoneEmail').id,
        requireFact(sliq, 'speed').id,
      ],
    },
    {
      question: "What's the cheapest way to send money to India, and how do I avoid hidden fees?",
      answer:
        'The real cost of a transfer is the upfront fee plus the margin built into the exchange rate, and that margin is usually where the hidden fees are. To compare two services fairly, look at the final rupee amount your recipient gets, not just the advertised fee. Sliq Pay is fully transparent, offers mid-market (Google) FX rate, and shows you the rate and fees before you confirm, so you know the exact details in advance.',
      evidenceIds: [
        requireFact(sliq, 'hiddenCharges').id,
        requireFact(sliq, 'exchangeRate').id,
        requireFact(sliq, 'transferFee').id,
      ],
    },
    {
      question: 'How long does it take to send money to India?',
      answer:
        'Instantly through Sliq Pay. Send to anyone in India and the money reaches your recipient in seconds, not days. Other services usually take several business days to settle.',
      evidenceIds: [requireFact(sliq, 'speed').id],
    },
    {
      question: 'Is it safe to send money to India with Sliq Pay?',
      answer:
        'Yes. Sliq Pay is a registered Money Service Business with FinCEN in the USA, and is RBI-compliant in India. Every transfer is encrypted from end to end, every login uses biometric verification, and an AI fraud system checks more than 50 device, behavioral, and network signals on each transaction.',
      evidenceIds: [requireFact(sliq, 'compliance').id, requireFact(sliq, 'security').id],
    },
  ];
}

export function assembleComparePageDocument(input: {
  slug: string;
  competitorBundles: ProviderEvidenceBundle[];
  sliqBundle: ProviderEvidenceBundle;
  corridor?: Partial<Corridor>;
}): ComparePageDocument {
  const corridor = {
    sendCurrency: 'USD',
    receiveCurrency: 'INR',
    payinRail: 'ACH',
    payoutRail: 'UPI',
    receiveAmount: 100,
    ...input.corridor,
  };
  const bundles = [...input.competitorBundles, input.sliqBundle];
  const evidence = buildEvidenceMap(bundles);
  const providerNames = bundles.map((bundle) => bundle.name);
  const currentYear = new Date().getFullYear();

  return {
    slug: input.slug,
    meta: {
      title: `${input.competitorBundles.map((bundle) => bundle.name).join(' vs ')} vs Sliq Pay: USD to INR Comparison`,
      description: `Compare ${providerNames.join(', ')} for USD to INR transfers using source-backed pricing, speed, feature, security, and support data.`,
      robots: 'index, follow',
    },
    hero: {
      heading: `${input.competitorBundles.map((bundle) => bundle.name).join(' vs ')} vs Sliq pay: USD to INR Comparison ${currentYear}`,
    },
    corridor,
    competitorComparison: {
      rows: [...COMPARISON_ROWS],
      providers: bundles.map(buildComparisonProvider),
      mobileDefaults: {
        leftId: input.competitorBundles[0]?.id ?? 'wise',
        rightId: 'sliq',
      },
    },
    speedComparison: {
      rows: [input.sliqBundle, ...input.competitorBundles].map(buildSpeedRow),
    },
    priceSection: {
      heading: 'Compare Costs\nBefore You Send',
      description:
        'Tell us how much you want them to receive and instantly see the rate, every fee and exactly what it costs you. Side by side with everyone else so you can see who\'s the cheapest. No fine print, no surprises.',
    },
    priceComparison: {
      heading: 'Compare Costs\nBefore You Send',
      description:
        'Compare provider costs for the selected USD to INR corridor using verified pricing evidence collected before publication.',
      inputs: corridor,
      rows: [...PRICE_ROWS],
      providers: bundles.map(buildPriceProvider),
    },
    featureComparison: {
      heading: 'Sliq Pay offers more than a simple transfer',
      description:
        'Every app can send money to a bank account. Sliq Pay sets your money free with all the features you might ever need!',
      features: [...FEATURES],
      providers: bundles.map(buildFeatureProvider),
    },
    securityCompliance: {
      heading: 'Security & Compliance',
      description:
        'Using a payments app means trusting it with your money and your data. Sliq Pay is built to earn your trust with compliance, encryption, and risk monitoring controls.',
      bullets: [
        {
          text: 'Registered Money Service Business with FinCEN',
          evidenceIds: [requireFact(input.sliqBundle, 'compliance').id],
        },
        {
          text: 'Operates in compliance with RBI & FEMA guidelines',
          evidenceIds: [requireFact(input.sliqBundle, 'compliance').id],
        },
        {
          text: "Partnered with world's leading banks",
          evidenceIds: [requireFact(input.sliqBundle, 'transferMethods').id],
        },
        {
          text: 'Real-time AI fraud detection reading device, behavioral, and network signals',
          evidenceIds: [requireFact(input.sliqBundle, 'security').id],
        },
        {
          text: 'End-to-end encryption and biometric verification',
          evidenceIds: [requireFact(input.sliqBundle, 'security').id],
        },
      ],
    },
    supportComparison: {
      columns: bundles.map(buildSupportColumn),
    },
    faq: {
      heading: 'Frequently asked questions',
      items: buildFaqItems(bundles),
    },
    guidelines: {
      paragraphs: [
        'The information on this page is based on publicly available information and product details as of the date of publication. Features, pricing, exchange rates, supported regions, and service offerings may change over time and can vary. While we aim to keep this comparison accurate, we make no representations or warranties as to the accuracy or completeness of third-party information, and nothing here should be relied upon as financial, legal, regulatory, or tax advice. For the most accurate and up-to-date details, please refer to each provider\'s official website.',
        'Other brands mentioned are trademarks of their respective owners. Sliq Pay is not affiliated with, endorsed by, or sponsored by any company referenced on this page; their names and marks are used solely for identification and comparison purposes. Sliq Pay is a trademark of Sliq Pay Inc. All other marks are the property of their respective owners.',
      ],
    },
    evidence,
    validation: {
      generatedAt: new Date().toISOString(),
      requiredEvidenceCount: Object.keys(evidence).length,
      sourceCoverage: Object.fromEntries(
        bundles.map((bundle) => [bundle.id, bundle.evidence.length])
      ),
    },
  };
}
