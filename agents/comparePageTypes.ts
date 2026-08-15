export const MULTI_PROVIDER_COMPARE_PAGE_TYPE = {
  id: 'multi-provider-comparison',
  promptFile: 'multi-provider-compare.txt',
} as const;

export type EvidenceMethod =
  | 'officialPage'
  | 'officialQuoteApi'
  | 'managerSheet'
  | 'structuredMetadata'
  | 'sliqCanonicalFacts'
  | 'llmClassifiedSignal';

export type BuiltForSegment = 'Expats' | 'Businesses' | 'Freelancers';

export type EvidenceConfidence = 'high' | 'medium' | 'low';

export type EvidenceRef = {
  id: string;
  providerId: string;
  field: string;
  value: string | number | boolean;
  displayValue?: string;
  source: {
    url: string;
    title?: string;
    quote: string;
    retrievedAt: string;
  };
  confidence: EvidenceConfidence;
  method: EvidenceMethod;
};

export type CompareStatus = 'positive' | 'negative' | 'neutral';

export type CompareCell = {
  text: string;
  icon: CompareStatus;
  iconVariant?: 'alt';
  emphasized?: boolean;
  evidenceIds: string[];
};

export type CompareProvider = {
  id: string;
  name: string;
  iconSrc: string;
  logoType: 'wordmark' | 'brand';
  iconWidth: number;
  iconHeight: number;
  iconSize: number;
  highlighted: boolean;
  showStoreButtons?: boolean;
  cells: CompareCell[];
};

export type CompetitorComparison = {
  mobileDefaults: { leftId: string; rightId: string };
  rows: { id: string; label: string; mobileHeight: number; desktopHeight: number }[];
  providers: CompareProvider[];
};

export type SpeedComparison = {
  rows: {
    id: string;
    barSrc: string;
    logoSrc: string;
    logoAlt: string;
    evidenceIds: string[];
    copy: {
      type: 'highlight' | 'timeframe';
      prefix: string;
      highlight: string;
      suffix?: string;
    };
  }[];
};

export type PriceComparison = {
  heading: string;
  description: string;
  inputs: {
    sendCurrency: string;
    receiveCurrency: string;
    payinRail: string;
    payoutRail: string;
    receiveAmount: number;
  };
  rows: { id: string; label: string; currency: string }[];
  providers: {
    id: string;
    name: string;
    logoSrc: string;
    highlighted: boolean;
    badge?: string;
    values: Record<
      'recipientGets' | 'exchangeRate' | 'hiddenCharges' | 'transferFee' | 'totalTransferCost',
      { value: number; displayValue: string; evidenceIds: string[] }
    >;
  }[];
};

export type FeatureComparison = {
  heading: string;
  description: string;
  features: { id: string; label: string }[];
  providers: {
    id: string;
    name: string;
    iconSrc: string;
    highlighted: boolean;
    cells: CompareStatus[];
    evidenceIdsByFeature: Record<string, string[]>;
  }[];
};

export type SecurityCompliance = {
  heading: string;
  description: string;
  bullets: { text: string; evidenceIds: string[] }[];
};

export type SupportComparison = {
  columns: {
    id: string;
    name: string;
    iconSrc: string;
    tagline: string;
    subtitle?: string;
    backgroundPattern: string;
    gradientBackground?: string;
    highlighted: boolean;
    showVerifyBadge?: boolean;
    showStoreButtons?: boolean;
    evidenceIds: string[];
  }[];
};

export type ComparePageDocument = {
  slug: string;
  meta: { title: string; description: string; robots?: string };
  hero: { heading: string };
  corridor: {
    sendCurrency: string;
    receiveCurrency: string;
    payinRail: string;
    payoutRail: string;
    receiveAmount: number;
  };
  competitorComparison: CompetitorComparison;
  speedComparison: SpeedComparison;
  priceSection: { heading: string; description: string };
  priceComparison: PriceComparison;
  featureComparison: FeatureComparison;
  securityCompliance: SecurityCompliance;
  supportComparison: SupportComparison;
  faq: { heading: string; items: { question: string; answer: string; evidenceIds?: string[] }[] };
  guidelines: { paragraphs: string[] };
  evidence: Record<string, EvidenceRef>;
  validation: {
    generatedAt: string;
    requiredEvidenceCount: number;
    sourceCoverage: Record<string, number>;
  };
};

export type ProviderEvidenceBundle = {
  id: string;
  name: string;
  evidence: EvidenceRef[];
  facts: Record<string, EvidenceRef>;
};
