import type { BuiltForSegment, CompareStatus } from './comparePageTypes';

// Section 1 fields governed by the closed-vocabulary rules.
export const GOVERNED_FIELDS = [
  'builtFor',
  'transferMethods',
  'cost',
  'fxRate',
  'speed',
  'security',
  'compliance',
] as const;

export type GovernedField = (typeof GOVERNED_FIELDS)[number];

// Sliq's cells for these fields are always these exact strings — never generated.
export const SLIQ_CANONICAL_TEXT: Record<GovernedField, string> = {
  builtFor: 'Expats, tourists, businesses, freelancers',
  transferMethods: 'ACH, Credit Card, Debit Card, Wire, NEFT, RTGS, IMPS, UPI',
  cost: '0.3-0.5% fees for instant transfer',
  fxRate: 'Best FX rate at mid-market (google) exchange rates. No markup or hidden charges.',
  speed: 'All transfers are instant',
  security: 'Advanced data security best practices; AI fraud detection',
  compliance: 'Licensed and regulated',
};

export const BUILT_FOR_SEGMENTS: readonly BuiltForSegment[] = ['Expats', 'Businesses', 'Freelancers'];

// Master set for Transfer Methods, in canonical display order. UPI is
// reserved for Sliq — competitors never show it, even if their own site
// mentions it.
export const TRANSFER_METHOD_ITEMS = [
  'ACH',
  'Credit Card',
  'Debit Card',
  'Wire',
  'NEFT',
  'RTGS',
  'IMPS',
  'UPI',
] as const;
export type TransferMethodItem = (typeof TRANSFER_METHOD_ITEMS)[number];

export const COST_VALUES = [
  'Low (1%)',
  'Low (1-2%)',
  'Medium (2-3%)',
  'High (3-4%)',
  'High (4%+)',
] as const;

export const FX_RATE_VALUES = [
  'Mid-market exchange rate (no mark-ups) in most cases',
  'Charges maybe hidden in FX rate',
] as const;

export const SPEED_VALUES = [
  'Transfers are usually same day',
  'Most transfers clear in 1-2 days',
  'Transfers usually take 3-5 days',
  'Transfers usually take 7+ days',
] as const;

export const SECURITY_VALUES = [
  'Standard data security best practices',
  'Uncertain data security measures',
] as const;

export const COMPLIANCE_VALUES = [
  'Licensed and regulated',
  'Potentially risky compliance practices',
  'Uncertain regulatory compliance',
] as const;

// Manually pinned values, checked before any LLM signal is read. Adding a new
// pin (provider x field) is a one-line change here — no special-casing elsewhere.
const FIELD_VALUE_OVERRIDES: Record<string, Partial<Record<GovernedField, string>>> = {
  wise: { cost: 'Low (1-2%)' },
  remitly: { cost: 'Fees depends on speed. 1-2% for standard, 3-4% for express' },
  // Binance.US is a crypto exchange, not a remittance service — its site has
  // no audience-segment content to classify against. It does run dedicated
  // Institutions/OTC trading pages, so "Businesses" is the closest honest fit.
  // transferMethods: the 30 sampled pages (spot-trading pairs, compliance,
  // security, legal) never covered a deposit/funding-methods page, so
  // detection found nothing — same scoreUrlPriority page-budget gap noted
  // for PayPal below. ACH and debit card are Binance.US's well-documented,
  // publicly stated USD funding methods; not drawn from our own scrape.
  'binance-us': { builtFor: 'Businesses', transferMethods: 'ACH, Debit Card' },
  // Abound states no per-transfer fee percentage anywhere on its site (its
  // only concrete fees are a $9.99/mo subscription tier and a 1% TDS
  // deduction on some transfers) — its own headline claim is "Best Exchange
  // Rate Guaranteed," so "Low" is the best-supported reading, not a stated fact.
  'abound-times-club-tclub-inc': { cost: 'Low' },
  // PayPal's site has real audience-segment content — dedicated /business,
  // /in/business/accept-payments, /in/business/paypal-business-fees, and
  // /in/business/platforms-and-marketplaces pages alongside consumer
  // send-money pages — but scoreUrlPriority() (db/knowledgePages.ts) ranks
  // PayPal's 8+ legal/license/policy URLs above those in the 25-page budget
  // fed to metadata enrichment, so the LLM never saw them and returned all
  // audience_segments false. "Businesses" is the best-evidenced reading from
  // the pages that were actually scraped. TODO: scoreUrlPriority starves
  // builtFor-relevant pages on large, legal-heavy sites — consider having
  // enrichMetadata pull from getCompareKnowledgePages (field-targeted) like
  // the compare extractor already does, instead of getPrioritizedKnowledge.
  // Same root cause as builtFor above: PayPal's actual fee pages
  // (/in/business/paypal-business-fees, /fees, /in/digital-wallet/paypal-consumer-fees)
  // were scraped but crowded out of the 25-page metadata budget by legal
  // pages. The business-fees page that was scraped states "Get effective
  // fees as low as 1.9%.*" — the 1-2% bracket, which classifyCost() maps to
  // "Low".
  paypal: { builtFor: 'Businesses', cost: 'Low (1-2%)' },
  // Aspora's 25-page metadata sample (getPrioritizedKnowledge) missed the
  // /live-currency-rates/* pages, so audience/fx signals came back empty even
  // though the site states both clearly. builtFor: scraped copy reads "trusted
  // by 1 million+ NRIs" and targets "NRIs, OCI holders & PIOs" explicitly —
  // Expats is the only real segment mentioned. fxRate: every currency page
  // states "Aspora matches Google's exchange rates exactly — no hidden
  // markups," a direct mid-market claim. cost: no per-transfer % stated, but
  // paired with "$Xm+ saved by our users in forex fees" — same "Low, inferred
  // from marketing claim" reasoning as Abound below.
  'aspora-formerly-vance': {
    builtFor: 'Expats',
    cost: 'Low (1-2%)',
    fxRate: 'Mid-market exchange rate (no mark-ups) in most cases',
  },
  // Instarem's /fees page headline is "stay in control with transparent
  // pricing... keeping things simple, fast, and low-cost" — no explicit %,
  // but a direct low-cost/transparent-pricing self-claim, same class of
  // evidence as Abound's "Best Exchange Rate Guaranteed" below.
  'instarem-nium': { cost: 'Low (1-2%)' },
  // ICICI Money2India's wire-transfer page states "zero to low transfer
  // fees*" directly — a stated (asterisked) claim, not an inference.
  'icici-money2india': { cost: 'Low (1-2%)' },
  // MoneyGram's site (a client-rendered SPA; most routes return the same
  // shell) never surfaced a specific audience segment or fee %, even after
  // fixing the scraper bugs that were polluting its page budget (sitemap-index
  // files and locale-redirect farms were consuming the 100-page cap — see
  // scraper.ts NON_CONTENT_EXTENSIONS / EXCLUDED_PATH_PATTERNS '/r/'). Its
  // core product is P2P international transfer with a heavy send-money-to-India
  // corridor, so Expats is the closest honest fit (same reasoning as
  // Binance.US below). Its own marketing states "get great exchange rates,
  // low transfer fees" — a direct low-cost self-claim, same class of evidence
  // as Abound's below.
  moneygram: { builtFor: 'Expats', cost: 'Low (1-2%)' },
  // Payoneer's own /fees page states "1% (minimum fee of 1.00 USD)" / "fixed
  // fee or 1% fee" for currency conversion — a direct stated %, not an
  // inference. builtFor: site explicitly targets "freelancers" and
  // "businesses" ("freelance opportunities are everywhere" / "trusted by
  // millions of businesses worldwide").
  // Airwallex's site clearly states "credit card"/"debit card" support and
  // SWIFT/bank-transfer payouts, but doesn't use the bare word "wire" that
  // the pattern matcher looks for — real evidence, pattern-matcher gap.
  airwallex: { transferMethods: 'Credit Card, Debit Card, Wire' },
  payoneer: { builtFor: 'Businesses, Freelancers', cost: 'Low (1%)' },
  // Ria's site states "low flat fees, great exchange rates, and no hidden
  // costs" and "Ria offers competitive fees" — no exact %, same "Low,
  // inferred from marketing claim" reasoning as Abound. No clear audience-
  // segment content scraped; Ria's core product is P2P consumer remittance
  // for migrants/diaspora sending money home, same reasoning as MoneyGram.
  'ria-money-transfer': { builtFor: 'Expats', cost: 'Low (1-2%)' },
  // Western Union's own site shows "0₹ transfer fee* for your online
  // transfers" and "transfer money with no fee to bank accounts in certain
  // countries" — a stated (asterisked/conditional) claim, not an inference.
  'western-union': { cost: 'Low (1-2%)' },
  // Xe's site repeatedly states "zero transfer fees", "low fees starting at
  // $0", and "zero fees" for business customers — a direct, repeated claim.
  'xe-money-transfer': { cost: 'Low (1-2%)' },
  // Xoom's site states "Pay $0 Xoom transfer fees on eligible transactions"
  // — a direct claim. No clear audience-segment content scraped; Xoom
  // (PayPal's remittance product) is P2P consumer remittance for diaspora
  // sending money home, same reasoning as MoneyGram/Ria above.
  'xoom-paypal': { builtFor: 'Expats', cost: 'Low (1-2%)' },
  // xflow's site states "0.6% flat fee, 0% fx margin" directly, well below
  // the 1% bracket floor — classified at the lowest tier rather than
  // invented. builtFor: explicit "freelancers & agencies" and "7,000+
  // businesses" language on site.
  xflow: { builtFor: 'Businesses, Freelancers', cost: 'Low (1%)' },
  // Skydo markets "zero FX margin, flat fee" directly — a stated claim for
  // both cost and FX transparency, not an inference (LLM's 25-page metadata
  // sample missed it). builtFor: site states "enabled over 20,000+
  // businesses & freelancers in India to work with global clients."
  skydo: {
    builtFor: 'Businesses, Freelancers',
    cost: 'Low (1-2%)',
    fxRate: 'Mid-market exchange rate (no mark-ups) in most cases',
    // Site describes payouts to a "global bank account" — a wire-style
    // transfer; no ACH/card language found in the scraped pages.
    transferMethods: 'Wire',
  },
  // Boss Revolution's site states it "welcomes millions of tourists,
  // international students, expats, business travelers, and immigrants" —
  // real evidence for Expats. Cost: "low fees and exchange rate," "no fees
  // on your first three transfers" — same "Low, inferred from marketing
  // claim" reasoning as Abound.
  'boss-revolution-boss-money': { builtFor: 'Expats', cost: 'Low (1-2%)' },
  // Crobo's site states "Instant transfer, zero fees, best exchange rate"
  // and "send money to India at Google rates" — direct claims for both cost
  // and mid-market FX. No explicit audience-segment language scraped; its
  // core product is India-focused P2P remittance, same reasoning as
  // MoneyGram/Ria/Xoom above.
  crobo: {
    builtFor: 'Expats',
    cost: 'Low (1-2%)',
    fxRate: 'Mid-market exchange rate (no mark-ups) in most cases',
    // Site describes "instant transfer directly to any bank account in
    // India" — a wire-style bank deposit; no ACH/card language scraped.
    transferMethods: 'Wire',
  },
  // Currencies Direct's site states "great rates, no transfer fees" and
  // "for most transfers there are no fees" — a direct claim, not an
  // inference. builtFor/fxRate already have valid LLM-detected signals.
  'currencies-direct': { cost: 'Low (1-2%)' },
  // Cheq's LLM audience signal only set `tourists: true`, which
  // classifyBuiltFor() deliberately drops (reserved for Sliq). Real scraped
  // copy shows Cheq explicitly targets "foreigners & NRIs" with its wallet
  // product, and runs expat-focused content ("expatriate living in India")
  // — Expats is the well-evidenced segment once tourists is excluded. Cost
  // already has a valid LLM signal (2-3%), no override needed.
  cheq: { builtFor: 'Expats' },
  // Frex's site states "zero fees, better than Google exchange rates" — a
  // direct claim for both cost and FX transparency (beating a mid-market
  // benchmark implies at least matching it). builtFor already has a valid
  // LLM-detected signal (Expats).
  frex: {
    cost: 'Low (1-2%)',
    fxRate: 'Mid-market exchange rate (no mark-ups) in most cases',
  },
  // Hawala's site states "freelancers... digital nomads... Hawala fits the
  // way you live and work" — real evidence for Freelancers (not Expats,
  // which isn't mentioned). Cost: "a low, upfront fee of $1.00," a direct
  // claim. fxRate already has a valid LLM-detected signal (mid-market).
  'hawala-usehawala-com': { builtFor: 'Freelancers', cost: 'Low (1-2%)' },
  // LemFi's site states "zero fees," "flat fee," and "little to no fees" —
  // a direct claim. builtFor already has a valid LLM-detected signal
  // (Expats).
  // Site describes delivery "direct to bank accounts, mobile money, and
  // more" — a wire-style bank deposit is the clearly evidenced method; no
  // ACH/card language found for LemFi's own payment rails.
  lemfi: { cost: 'Low (1-2%)', transferMethods: 'Wire' },
  // Panda Remit's LLM audience signal only set `tourists: true`, which is
  // dropped (reserved for Sliq). Its core product is P2P remittance for
  // the Chinese diaspora sending money home, same reasoning as MoneyGram/
  // Ria/Xoom above. Cost: site states "zero transfer fees" and "low fees,"
  // a direct claim.
  'panda-remit': { builtFor: 'Expats', cost: 'Low (1-2%)' },
  // Pangea's site runs immigrant-focused content ("helpful mental health
  // resources for immigrants... coming to a new country") — real evidence
  // for Expats. Cost already has a valid LLM-detected signal (3-4%).
  'pangea-money-transfer': { builtFor: 'Expats' },
  // Paysend's site states it "celebrate[s] local diaspora communities" and
  // references "millions of immigrants and diaspora communities" — real
  // evidence for Expats. Cost: "fixed transaction fee of 1 GBP, or even
  // fee-free" — a direct claim.
  paysend: { builtFor: 'Expats', cost: 'Low (1-2%)' },
  // Convera's site states it helps "businesses of all sizes navigate...
  // global trade" — real evidence for Businesses. Cost: "no hidden fees" —
  // a direct claim.
  convera: { builtFor: 'Businesses', cost: 'Low (1-2%)' },
  // Remit2Any's site states "zero fees, best rates" for its NRI-focused
  // product — a direct claim. builtFor/fxRate already have valid
  // LLM-detected signals (Expats, mid-market).
  // Site describes money "credited to Indian bank account" — a wire-style
  // bank deposit; no ACH/card language found for Remit2Any's own rails.
  remit2any: { cost: 'Low (1-2%)', transferMethods: 'Wire' },
  // Sendwave's site states its mission is to help "migrants send money
  // home" — real evidence for Expats. Cost: "competitive exchange rates,
  // low fees and clear, upfront pricing" — a direct claim.
  'sendwave-chime-inc-d-b-a-sendwave': { builtFor: 'Expats', cost: 'Low (1-2%)' },
  // Skrill's site describes receiving money "from friends, family and
  // businesses" — Businesses is the only concrete segment mentioned. Cost
  // already has a valid LLM-detected signal (2-3%).
  skrill: { builtFor: 'Businesses' },
  // Taptap Send's site states its mission is to help "migrants send money
  // home on better terms" — real evidence for Expats. Cost: "we charge a
  // low fee," "zero fee for bank transfers" — a direct claim.
  'taptap-send': { builtFor: 'Expats', cost: 'Low (1-2%)' },
  // uLink's site states "$0 fee for transfers over $1,000, flat fee of
  // $3.99 for transfers up to $1,000" and "zero transfer fee promotions" —
  // a direct claim. builtFor already has a valid LLM-detected signal
  // (Businesses).
  ulink: { cost: 'Low (1-2%)' },
  // Viamericas' site states it "specializes in providing financial
  // services for migrants" — real evidence for Expats. Cost: "competitive
  // pricing" — same "Low, inferred from marketing claim" reasoning as
  // Abound.
  viamericas: { builtFor: 'Expats', cost: 'Low (1-2%)' },
  // Corpay's own homepage reads "The Corporate Payments Company... put
  // Corpay behind your business" — real evidence for Businesses. Cost:
  // "there are no fees for the use of our award-winning online [portal]" —
  // a direct claim.
  'corpay-cross-border': { builtFor: 'Businesses', cost: 'Low (1-2%)' },
  // Deel's site describes managing "global teams" for "40,000+ companies
  // from startups to enterprise" — real evidence for Businesses. Cost: "no
  // hidden fees... clear, upfront pricing" — a direct claim.
  deel: { builtFor: 'Businesses', cost: 'Low (1-2%)' },
  // Intermex explicitly serves "minority-owned businesses" and partners
  // with an immigrant-justice non-profit — real evidence for Expats
  // (diaspora remittance), same reasoning as MoneyGram/Ria above. Cost:
  // "low fees and competitive rates" — a direct claim.
  intermex: { builtFor: 'Expats', cost: 'Low (1-2%)' },
  // TransferMate's site targets "businesses" turning "currency volatility
  // into certainty" — real evidence for Businesses. Cost: "low fees for
  // moving money internationally" — a direct claim.
  transfermate: { builtFor: 'Businesses', cost: 'Low (1-2%)' },
  // ACE-FX states "competitive rates - no fees" and "no hidden extras" —
  // a direct claim. builtFor already has a valid LLM-detected signal
  // (Businesses).
  'ace-fx': { cost: 'Low (1-2%)' },
  // Dodo Payments' own customer testimonial states its fees are "low fees
  // (4-5%)" — using the stated number rather than the marketing spin
  // ("low") puts this at the High bracket, not Low.
  'dodo-payments': { cost: 'High (4%+)' },
  // Oyster states "no asterisks, no hidden fees" — a direct claim.
  // builtFor already has a valid LLM-detected signal (Businesses).
  oyster: { cost: 'Low (1-2%)' },
  // Remote states "transparent pricing, no guesswork, no hidden fees" — a
  // direct claim. builtFor already has a valid LLM-detected signal
  // (Businesses).
  // Site describes payroll/PEO delivery requiring a "U.S. bank account" —
  // a wire-style bank deposit; no ACH/card language for Remote's own rails.
  remote: { cost: 'Low (1-2%)', transferMethods: 'Wire' },
  // Skuad states "100% transparency in fee structure... won't break the
  // bank" and "no hidden costs" — a direct claim. builtFor already has a
  // valid LLM-detected signal (Businesses, Freelancers).
  skuad: { cost: 'Low (1-2%)' },
  // Tipalti states "transparent pricing so you can choose the most
  // cost-effective option" — a direct claim. builtFor already has a valid
  // LLM-detected signal (Businesses, Freelancers).
  tipalti: { cost: 'Low (1-2%)' },
  // Velocity Global states "transparent pricing... no hidden fees or
  // surprises" — a direct claim. builtFor already has a valid
  // LLM-detected signal (Businesses).
  // Site describes payroll delivery via "bank account and payroll
  // information" — a wire-style bank deposit; no ACH/card language for
  // Velocity Global's own rails.
  'velocity-global': { cost: 'Low (1-2%)', transferMethods: 'Wire' },
  // WorldFirst states "zero fees," "low fees," and "no hidden fees" across
  // multiple pages — a direct, repeated claim. builtFor already has a
  // valid LLM-detected signal (Businesses, Freelancers).
  worldfirst: { cost: 'Low (1-2%)' },
  // Al Ansari's site states "experience a fast-onboarding process with
  // zero fees" — a direct claim. builtFor already has a valid LLM-detected
  // signal (Businesses).
  'al-ansari-exchange': { cost: 'Low (1-2%)' },
  // BFC Forex's site states it serves "the fast growing expat community"
  // directly — real evidence for Expats. Cost: "great rates and low fees!
  // We... don't charge commission" — a direct claim.
  'bfc-forex-financial-services-pvt-ltd': { builtFor: 'Expats', cost: 'Low (1-2%)' },
  // Currency Solutions states "no hidden fees," "competitive rates," and
  // "zero transfer fees for amounts above a certain threshold" — a direct
  // claim. builtFor already has a valid LLM-detected signal (Businesses).
  'currency-solutions': { cost: 'Low (1-2%)' },
  // Delphi World Money's site states "fast and frictionless transactions
  // at competitive rates" and "cost-effective... solutions" — a direct
  // claim. builtFor: LLM signal only set tourists (dropped, reserved for
  // Sliq) alongside businesses; Businesses is the valid remaining segment.
  // Site describes delivery via "wire transfer," "bank account," and
  // "debit cards" — real evidence for both rails.
  'delphi-world-money': { builtFor: 'Businesses', cost: 'Low (1-2%)', transferMethods: 'Debit Card, Wire' },
  // EasySend's site states "szybkie, bezpieczne i tanie przelewy
  // międzynarodowe" ("fast, safe and cheap international transfers") — a
  // direct claim. builtFor: site explicitly lists "jednoosobowa
  // działalność gospodarcza/freelancer" (sole proprietorship/freelancer)
  // as a customer category.
  // Site describes bank-transfer ("przelew bankowy") delivery using SWIFT
  // account details — a wire-style bank deposit.
  easysend: { builtFor: 'Freelancers', cost: 'Low (1-2%)', transferMethods: 'Wire' },
  // EbixCash's LLM signal only set tourists (dropped, reserved for Sliq)
  // alongside businesses; Businesses is the valid remaining segment. Cost
  // already has a valid LLM-detected signal (2-3%).
  'ebixcash-ebixcash-world-money': { builtFor: 'Businesses' },
  // Ebury's site states "no hidden costs... transparent pricing — no setup
  // costs, hidden fees or unpleasant surprises" and "zero fees for early
  // repayment" — a direct, repeated claim. builtFor already has a valid
  // LLM-detected signal (Businesses).
  ebury: { cost: 'Low (1-2%)' },
  // England.pl (GBP-to-PLN transfers for the Polish community in the UK)
  // states "przelewy gratis" ("free transfers") and "stała opłata 2 funty"
  // ("flat fee of £2") — direct claims. builtFor: a customer review reads
  // "polecam wszystkim którzy chcą wysłać pieniądze do Polski" ("I
  // recommend to everyone who wants to send money to Poland") — real
  // evidence of a diaspora/expat customer base.
  // A customer review states funds arrived "na konto odbiorcy" ("to the
  // recipient's account") — a wire-style bank deposit.
  'england-pl': { builtFor: 'Expats', cost: 'Low (1-2%)', transferMethods: 'Wire' },
  // LuLu Money's site states it lets customers "reload wallet instantly at
  // best exchange rate and low fees" — a direct claim. builtFor already
  // has a valid LLM-detected signal (Businesses).
  'lulu-money': { cost: 'Low (1-2%)' },
  // OrbitRemit's site states "Send money home — your first transfer is
  // fee-free" and serves diaspora customers in Australia/NZ sending to
  // Philippines/India/etc. — real evidence for Expats. Cost: "fee-free,"
  // "low fees," "no hidden fees" — a direct, repeated claim.
  orbitremit: { builtFor: 'Expats', cost: 'Low (1-2%)' },
  // Site describes linking a "debit card" and "bank account" to a Paga
  // wallet, plus "wire transfer services" in its legal disclosures — real
  // evidence for both rails.
  // Site states "there are no hidden fees" and "affordable pricing for
  // your convenience" — a direct claim.
  paga: { cost: 'Low (1-2%)', transferMethods: 'Debit Card, Wire' },
  // Regency FX's beneficiary-details page instructs senders to "confirm
  // their bank details" for third-party payments — real evidence the
  // service pays out via bank transfer.
  // Homepage states "No hidden fees" and the getaquote page states "we'll
  // secure a competitive rate of exchange and don't charge you for transfer
  // fees or commission" — a direct, explicit no-fee claim.
  'regency-fx': { transferMethods: 'Wire', cost: 'Low' },
  // Transcorp's own outward-remittance page headlines "Send Money at
  // Competitive Exchange Rates" and its FX page claims "Swift Economic
  // Exchange Rates" — direct self-claims, no explicit %, same evidentiary
  // class as Abound's "Best Exchange Rate Guaranteed" -> Low above.
  'transcorp-international-ltd': { cost: 'Low' },
  // Homepage states "0% commission however you buy" and the travel-money-card
  // fees page states "No fee charged when you top up regardless of payment
  // method" — direct, explicit no-fee claims.
  'travelex-money-transfer': { cost: 'Low' },
  // Site is explicitly built for the Canada->India diaspora corridor:
  // "Purpose-built super app for your needs in Canada and back home" and
  // "NRI bank account not needed" — real evidence for Expats. Homepage/UPI
  // pages repeatedly state "Beacon service fee: $0, even for transfers under
  // $500" and "no hidden markups, no transfer fees, and no minimums" — a
  // direct, repeated no-fee claim for the core consumer product.
  'mybeacon-my-beacon-beacon-upi': { builtFor: 'Expats', cost: 'Low' },
};

export function overrideFor(providerId: string, field: GovernedField): string | undefined {
  return FIELD_VALUE_OVERRIDES[providerId]?.[field];
}

export function allowedValuesFor(field: GovernedField, providerId: string): Set<string> {
  const base: readonly string[] =
    field === 'cost'
      ? COST_VALUES
      : field === 'fxRate'
        ? FX_RATE_VALUES
        : field === 'speed'
          ? SPEED_VALUES
          : field === 'security'
            ? SECURITY_VALUES
            : field === 'compliance'
              ? COMPLIANCE_VALUES
              : [];
  const values = new Set(base);
  const override = overrideFor(providerId, field);
  if (override) values.add(override);
  return values;
}

export function isValidBuiltForText(text: string): boolean {
  const tokens = text.split(', ');
  if (tokens.length === 0 || tokens.length > BUILT_FOR_SEGMENTS.length) return false;
  let lastIndex = -1;
  for (const token of tokens) {
    const index = BUILT_FOR_SEGMENTS.indexOf(token as BuiltForSegment);
    if (index === -1 || index <= lastIndex) return false;
    lastIndex = index;
  }
  return true;
}

type SpeedSignal = 'fast_transfer' | 'same_or_next_business_day' | 'standard_3_5_days' | 'not_mentioned';
type FeePctSignal = '1%' | '1-2%' | '2-3%' | '3-4%' | '4%+';

export type ClassificationSignals = {
  audienceSegments: Record<'expats' | 'businesses' | 'freelancers' | 'tourists', boolean>;
  audienceQuote: string;
  feePctSignal: FeePctSignal | null;
  feeQuote: string;
  midMarketMentioned: boolean;
  midMarketQuote: string;
  speedSignal: SpeedSignal;
  speedQuote: string;
  securityMentioned: boolean;
  securityQuote: string;
  fincenMentioned: boolean;
  cryptoMentioned: boolean;
  regulatoryQuote: string;
};

const FEE_PCT_SIGNALS: readonly FeePctSignal[] = ['1%', '1-2%', '2-3%', '3-4%', '4%+'];
const SPEED_SIGNALS: readonly SpeedSignal[] = [
  'fast_transfer',
  'same_or_next_business_day',
  'standard_3_5_days',
  'not_mentioned',
];

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asQuote(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function readClassificationSignals(raw: Record<string, unknown>): ClassificationSignals {
  const audience = (raw.audience_segments ?? {}) as Record<string, unknown>;
  const regulatory = (raw.regulatory_signal ?? {}) as Record<string, unknown>;
  const feeSignal = raw.fee_pct_signal;
  const speedSignal = raw.speed_signal;

  return {
    audienceSegments: {
      expats: asBoolean(audience.expats),
      businesses: asBoolean(audience.businesses),
      freelancers: asBoolean(audience.freelancers),
      tourists: asBoolean(audience.tourists),
    },
    audienceQuote: asQuote(raw.audience_segments_quote),
    feePctSignal: FEE_PCT_SIGNALS.includes(feeSignal as FeePctSignal) ? (feeSignal as FeePctSignal) : null,
    feeQuote: asQuote(raw.fee_pct_quote),
    midMarketMentioned: asBoolean(raw.mid_market_rate_mentioned),
    midMarketQuote: asQuote(raw.mid_market_rate_quote),
    speedSignal: SPEED_SIGNALS.includes(speedSignal as SpeedSignal)
      ? (speedSignal as SpeedSignal)
      : 'not_mentioned',
    speedQuote: asQuote(raw.speed_quote),
    securityMentioned: asBoolean(raw.security_mentioned),
    securityQuote: asQuote(raw.security_quote),
    fincenMentioned: asBoolean(regulatory.fincen_or_nmls_or_mtl_mentioned),
    cryptoMentioned: asBoolean(regulatory.crypto_or_stablecoin_mentioned),
    regulatoryQuote: asQuote(raw.regulatory_quote),
  };
}

export type GovernedFieldResult = {
  value: string;
  quote: string;
  origin: 'override' | 'signal';
};

export function formatBuiltFor(segments: readonly BuiltForSegment[]): string {
  return BUILT_FOR_SEGMENTS.filter((segment) => segments.includes(segment)).join(', ');
}

export function classifyBuiltFor(signals: ClassificationSignals): BuiltForSegment[] {
  const segments: BuiltForSegment[] = [];
  if (signals.audienceSegments.expats) segments.push('Expats');
  if (signals.audienceSegments.businesses) segments.push('Businesses');
  if (signals.audienceSegments.freelancers) segments.push('Freelancers');
  // `tourists` is intentionally dropped: reserved for Sliq, never rendered for competitors.
  return segments;
}

// Transfer Methods: competitors get whichever master-set items were detected
// on their site, in canonical order — UPI is never included for them.
export function formatTransferMethods(found: Partial<Record<TransferMethodItem, boolean>>): string {
  return TRANSFER_METHOD_ITEMS.filter((item) => item !== 'UPI' && found[item]).join(', ');
}

export function isValidTransferMethodsText(text: string): boolean {
  const tokens = text.split(', ');
  if (tokens.length === 0 || tokens.length > TRANSFER_METHOD_ITEMS.length) return false;
  let lastIndex = -1;
  for (const token of tokens) {
    const index = TRANSFER_METHOD_ITEMS.indexOf(token as TransferMethodItem);
    if (index === -1 || index <= lastIndex) return false;
    lastIndex = index;
  }
  return true;
}

function classifyCost(signals: ClassificationSignals): string {
  switch (signals.feePctSignal) {
    case '1%':
      return 'Low (1%)';
    case '1-2%':
      return 'Low (1-2%)';
    case '2-3%':
      return 'Medium (2-3%)';
    case '3-4%':
      return 'High (3-4%)';
    case '4%+':
      return 'High (4%+)';
    default:
      throw new Error(
        'No fee percentage signal found — add a FIELD_VALUE_OVERRIDES entry for this provider or re-run metadata enrichment.'
      );
  }
}

function classifyFxRate(signals: ClassificationSignals): string {
  return signals.midMarketMentioned
    ? 'Mid-market exchange rate (no mark-ups) in most cases'
    : 'Charges maybe hidden in FX rate';
}

function classifySpeed(signals: ClassificationSignals): string {
  switch (signals.speedSignal) {
    case 'fast_transfer':
      return 'Transfers are usually same day';
    case 'same_or_next_business_day':
      return 'Most transfers clear in 1-2 days';
    case 'standard_3_5_days':
      return 'Transfers usually take 3-5 days';
    default:
      return 'Transfers usually take 7+ days';
  }
}

function classifySecurity(signals: ClassificationSignals): string {
  return signals.securityMentioned
    ? 'Standard data security best practices'
    : 'Uncertain data security measures';
}

function classifyCompliance(signals: ClassificationSignals): string {
  // Crypto/stablecoin exposure outranks licensing, even when both are mentioned.
  if (signals.cryptoMentioned) return 'Potentially risky compliance practices';
  if (signals.fincenMentioned) return 'Licensed and regulated';
  return 'Uncertain regulatory compliance';
}

// Deterministic icon per canonical value: positive = affirmatively good,
// neutral = descriptive or unknown, negative = affirmatively bad. Values not
// listed (e.g. manual overrides) render neutral.
export function statusForGovernedValue(field: GovernedField, value: string): CompareStatus {
  switch (field) {
    case 'builtFor':
    case 'transferMethods':
      return 'neutral';
    case 'cost':
      if (value.startsWith('Low')) return 'positive';
      if (value.startsWith('High')) return 'negative';
      return 'neutral';
    case 'fxRate':
      return value === 'Mid-market exchange rate (no mark-ups) in most cases' ? 'positive' : 'negative';
    case 'speed':
      if (value === 'Transfers are usually same day') return 'positive';
      if (value === 'Most transfers clear in 1-2 days') return 'neutral';
      return 'negative';
    case 'security':
      return value === 'Standard data security best practices' ? 'positive' : 'neutral';
    case 'compliance':
      if (value === 'Licensed and regulated') return 'positive';
      if (value === 'Potentially risky compliance practices') return 'negative';
      return 'neutral';
  }
}

export function classifyGovernedField(
  providerId: string,
  field: GovernedField,
  rawMetadata: Record<string, unknown>
): GovernedFieldResult {
  const override = overrideFor(providerId, field);
  if (override) {
    return { value: override, quote: 'Manually curated canonical value.', origin: 'override' };
  }

  const signals = readClassificationSignals(rawMetadata);

  switch (field) {
    case 'builtFor': {
      const segments = classifyBuiltFor(signals);
      if (segments.length === 0) {
        throw new Error(
          `No audience segments detected for ${providerId} — add a FIELD_VALUE_OVERRIDES entry or re-run metadata enrichment.`
        );
      }
      return { value: formatBuiltFor(segments), quote: signals.audienceQuote, origin: 'signal' };
    }
    case 'cost': {
      try {
        return { value: classifyCost(signals), quote: signals.feeQuote, origin: 'signal' };
      } catch (error) {
        throw new Error(`${providerId}.cost: ${(error as Error).message}`);
      }
    }
    case 'fxRate':
      return { value: classifyFxRate(signals), quote: signals.midMarketQuote, origin: 'signal' };
    case 'speed':
      return { value: classifySpeed(signals), quote: signals.speedQuote, origin: 'signal' };
    case 'security':
      return { value: classifySecurity(signals), quote: signals.securityQuote, origin: 'signal' };
    case 'compliance':
      return { value: classifyCompliance(signals), quote: signals.regulatoryQuote, origin: 'signal' };
    case 'transferMethods':
      // Handled by transferMethodsEvidence() in compareEvidenceExtractor.ts —
      // it needs to scan scraped page text, not just structured metadata.
      throw new Error('transferMethods must be classified via transferMethodsEvidence(), not classifyGovernedField()');
  }
}

// Section 4 (feature grid): status is derived from whether evidence of the
// feature was found on the competitor's site, with hard overrides that ignore
// the evidence entirely (scanToPay is Sliq-only; sendBank is universal;
// easyToUse is subjective, so competitors always show the neutral "?" rather
// than us asserting a yes or no).
export function classifyFeatureStatus(
  providerId: string,
  featureId: string,
  mentioned: boolean
): CompareStatus {
  if (providerId === 'sliq') return 'positive';
  if (featureId === 'easyToUse') return 'neutral';
  if (featureId === 'scanToPay') return 'negative';
  if (featureId === 'sendBank') return 'positive';
  return mentioned ? 'neutral' : 'negative';
}

// Section 6 (support channels): master set is Email, Chat, Call. Sliq's
// tagline is fully hardcoded elsewhere and never goes through this function.
export type SupportChannels = {
  email: boolean;
  chat: boolean;
  call: boolean;
};

const SUPPORT_CHANNEL_LABELS: readonly (keyof SupportChannels)[] = ['email', 'chat', 'call'];
const SUPPORT_CHANNEL_DISPLAY: Record<keyof SupportChannels, string> = {
  email: 'Email',
  chat: 'Chat',
  call: 'Call',
};

// Empty string means no channel was detected — callers should fall back to a
// generic sentence rather than splice this into a "supports X" template.
export function formatSupportChannels(found: SupportChannels): string {
  return SUPPORT_CHANNEL_LABELS.filter((channel) => found[channel])
    .map((channel) => SUPPORT_CHANNEL_DISPLAY[channel])
    .join(', ');
}
