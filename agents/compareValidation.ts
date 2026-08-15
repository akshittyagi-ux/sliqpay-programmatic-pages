import type { ComparePageDocument, EvidenceRef } from './comparePageTypes';
import {
  GOVERNED_FIELDS,
  SLIQ_CANONICAL_TEXT,
  allowedValuesFor,
  isValidBuiltForText,
  isValidTransferMethodsText,
} from './compareFieldRules';

const BANNED_RENDERED_TEXT_PATTERNS = [
  /supplied sources/i,
  /provided sources/i,
  /not stated/i,
  /not found/i,
  /could not be verified/i,
  /cannot be verified/i,
  /unable to verify/i,
  /no exact/i,
  /data gaps?/i,
  /placeholder/i,
];

function assert(condition: unknown, message: string, errors: string[]) {
  if (!condition) {
    errors.push(message);
  }
}

function collectStrings(value: unknown, pathName = 'page'): { path: string; value: string }[] {
  if (typeof value === 'string') return [{ path: pathName, value }];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectStrings(entry, `${pathName}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => collectStrings(entry, `${pathName}.${key}`));
  }
  return [];
}

function validateGovernedComparisonFields(page: ComparePageDocument, errors: string[]) {
  const rowIndexById = new Map(page.competitorComparison.rows.map((row, index) => [row.id, index]));

  for (const provider of page.competitorComparison.providers) {
    for (const field of GOVERNED_FIELDS) {
      const rowIndex = rowIndexById.get(field);
      if (rowIndex === undefined) continue;
      const cell = provider.cells[rowIndex];
      if (!cell) continue; // cell/row count mismatch is reported separately

      if (provider.id === 'sliq') {
        assert(
          cell.text === SLIQ_CANONICAL_TEXT[field],
          `sliq.${field} must be the canonical hardcoded text, got: "${cell.text}"`,
          errors
        );
        continue;
      }

      if (field === 'builtFor') {
        assert(
          !/\btourists?\b/i.test(cell.text),
          `${provider.id}.builtFor must never mention tourists (reserved for Sliq): "${cell.text}"`,
          errors
        );
        assert(
          isValidBuiltForText(cell.text),
          `${provider.id}.builtFor "${cell.text}" is not an ordered subset of Expats, Businesses, Freelancers`,
          errors
        );
        continue;
      }

      if (field === 'transferMethods') {
        assert(
          !/\bupi\b/i.test(cell.text),
          `${provider.id}.transferMethods must never mention UPI (reserved for Sliq): "${cell.text}"`,
          errors
        );
        assert(
          isValidTransferMethodsText(cell.text),
          `${provider.id}.transferMethods "${cell.text}" is not an ordered subset of the master transfer-method set`,
          errors
        );
        continue;
      }

      assert(
        allowedValuesFor(field, provider.id).has(cell.text),
        `${provider.id}.${field} "${cell.text}" is not in the allowed value set`,
        errors
      );
    }
  }
}

function validateEvidenceIds(
  evidenceIds: string[] | undefined,
  evidence: Record<string, EvidenceRef>,
  pathName: string,
  errors: string[]
) {
  assert(Array.isArray(evidenceIds) && evidenceIds.length > 0, `${pathName} has no evidence IDs`, errors);
  for (const id of evidenceIds ?? []) {
    assert(Boolean(evidence[id]), `${pathName} references missing evidence ID: ${id}`, errors);
  }
}

export function validateComparePageDocument(page: ComparePageDocument): void {
  const errors: string[] = [];
  const evidence = page.evidence ?? {};

  assert(page.slug, 'Missing slug', errors);
  assert(page.meta?.title, 'Missing meta.title', errors);
  assert(page.meta?.description, 'Missing meta.description', errors);
  assert(page.hero?.heading, 'Missing hero.heading', errors);
  assert(Object.keys(evidence).length > 0, 'Missing evidence map', errors);
  assert(page.competitorComparison?.providers?.length >= 3, 'Expected at least 3 comparison providers', errors);
  assert(page.priceComparison?.providers?.length >= 3, 'Expected at least 3 pricing providers', errors);

  const comparisonProviders = page.competitorComparison.providers;
  const sliqComparisonProvider = comparisonProviders[comparisonProviders.length - 1];
  assert(sliqComparisonProvider?.id === 'sliq', 'Sliq must be the last comparison provider', errors);
  assert(sliqComparisonProvider?.highlighted, 'Sliq comparison provider must be highlighted', errors);

  const expectedComparisonRows = page.competitorComparison.rows.length;
  for (const provider of comparisonProviders) {
    assert(
      provider.cells.length === expectedComparisonRows,
      `${provider.id} comparison cell count does not match row count`,
      errors
    );
    provider.cells.forEach((cell, index) => {
      validateEvidenceIds(cell.evidenceIds, evidence, `competitorComparison.${provider.id}.cells[${index}]`, errors);
    });
  }

  validateGovernedComparisonFields(page, errors);

  for (const row of page.speedComparison.rows) {
    validateEvidenceIds(row.evidenceIds, evidence, `speedComparison.${row.id}`, errors);
  }

  for (const provider of page.priceComparison.providers) {
    for (const [field, value] of Object.entries(provider.values)) {
      assert(Number.isFinite(value.value), `priceComparison.${provider.id}.${field} is not numeric`, errors);
      validateEvidenceIds(value.evidenceIds, evidence, `priceComparison.${provider.id}.${field}`, errors);
    }
  }

  for (const provider of page.featureComparison.providers) {
    for (const feature of page.featureComparison.features) {
      validateEvidenceIds(
        provider.evidenceIdsByFeature[feature.id],
        evidence,
        `featureComparison.${provider.id}.${feature.id}`,
        errors
      );
    }
  }

  for (const bullet of page.securityCompliance.bullets) {
    validateEvidenceIds(bullet.evidenceIds, evidence, `securityCompliance.${bullet.text}`, errors);
  }

  for (const column of page.supportComparison.columns) {
    validateEvidenceIds(column.evidenceIds, evidence, `supportComparison.${column.id}`, errors);
  }

  for (const item of page.faq.items) {
    validateEvidenceIds(item.evidenceIds, evidence, `faq.${item.question}`, errors);
  }

  const renderedStrings = collectStrings({
    meta: page.meta,
    hero: page.hero,
    competitorComparison: page.competitorComparison,
    speedComparison: page.speedComparison,
    priceSection: page.priceSection,
    priceComparison: page.priceComparison,
    featureComparison: page.featureComparison,
    securityCompliance: page.securityCompliance,
    supportComparison: page.supportComparison,
    faq: page.faq,
    guidelines: page.guidelines,
  });

  for (const entry of renderedStrings) {
    for (const pattern of BANNED_RENDERED_TEXT_PATTERNS) {
      if (pattern.test(entry.value)) {
        errors.push(`Banned uncertainty text at ${entry.path}: "${entry.value}"`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Compare page validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  }
}
