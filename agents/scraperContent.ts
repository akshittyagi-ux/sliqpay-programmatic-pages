import {
  ERROR_PAGE_TEXT_PATTERNS,
  ERROR_PAGE_TITLE_PATTERNS,
} from './scraperPaths';

export function isErrorPage(title: string, cleanText: string): boolean {
  const normalizedTitle = title.trim();
  if (normalizedTitle && ERROR_PAGE_TITLE_PATTERNS.some((pattern) => pattern.test(normalizedTitle))) {
    return true;
  }

  const sample = cleanText.slice(0, 1200);
  return ERROR_PAGE_TEXT_PATTERNS.some((pattern) => pattern.test(sample));
}
