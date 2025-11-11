export function looksSpam(text: string): boolean {
  if (!text) return false;
  // URL or t.me link
  const hasLink = /\bhttps?:\/\/|t\.me\//i.test(text);
  // Mention or handle
  const hasHandle = /@[a-z0-9_]{3,}/i.test(text);
  // Phone patterns
  const hasPhone = /\+?\d[\d\s().-]{7,}/.test(text);
  return hasLink || hasHandle || hasPhone;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/[\w./%-]+/gi, '')
    .replace(/t\.me\/[\w_/.-]+/gi, '')
    .replace(/\+?\d[\d\s().-]{7,}/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
