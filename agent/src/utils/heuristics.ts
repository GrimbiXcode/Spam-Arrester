export function looksSpam(text: string): boolean {
  if (!text) return false;

  const lower = text.toLowerCase();

  // Links and invites
  const hasLink = /\bhttps?:\/\/|t\.me\/|telegram\.me\/|bit\.ly\/|tinyurl\.com\/|wa\.me\/|chat\.whatsapp\.com\//i.test(text);

  // Mentions or handles
  const hasHandle = /@[a-z0-9_]{3,}/i.test(text);

  // Phone patterns
  const hasPhone = /\+?\d[\d\s().-]{7,}/.test(text);

  // Obfuscated/encoded URLs
  const hasObfuscatedUrl = /\b(hxxp|htxx|https?:\/\/)\b|[\w-]+\s*dot\s*[\w-]+/i.test(text);

  // Common scam keywords
  const hasScamKeywords = /\b(verify|verification|confirm|account (?:suspended|locked|limited)|password|login|credentials|bank|wallet|seed|private key|2fa|otp|pin)\b/i.test(lower);

  // Money/crypto/investment bait
  const hasMoneyBait = /\b(crypto|bitcoin|btc|eth|usdt|airdrop|giveaway|bonus|profit|roi|investment|forex|binary option|double your|free money|earn)\b/i.test(lower);

  // Delivery and parcel phishing
  const hasDeliveryPhish = /\b(dhl|fedex|ups|usps|parcel|shipment|delivery|customs|track(?:ing)?)\b.*\b(link|fee|pay|confirm|click)\b/i.test(lower);

  // Job scam indicators
  const hasJobScam = /\b(job offer|work from home|remote job|easy money|no experience|required|hiring now|weekly pay|salary)\b/i.test(lower);

  // Adult or explicit bait
  const hasAdultBait = /\b(nude|nudes|sex|cam|onlyfans|escort|hookup)\b/i.test(lower);

  // Urgency or pressure language
  const hasUrgency = /\b(urgent|act now|limited time|last chance|immediately|asap|final notice|suspended)\b/i.test(lower);

  // Excessive symbols or shouting
  const hasExcessPunct = /[!?]{3,}/.test(text);
  const hasAllCaps = text.length >= 20 && /[A-Z]/.test(text) && text.replace(/[^A-Z]/g, '').length / text.replace(/[^A-Za-z]/g, '').length > 0.6;

  // Contact me bait combined with handle or phone
  const hasContactBait = /\b(contact|dm|message|reply)\b/i.test(lower) && (hasHandle || hasPhone);

  // Very short messages are often low-effort spam
  const trimmed = text.trim();
  const isVeryShort = trimmed.length > 0 && trimmed.length <= 3;

  const strongSignals = [
    hasLink,
    hasHandle,
    hasPhone,
    hasObfuscatedUrl,
    hasScamKeywords,
    hasMoneyBait,
    hasDeliveryPhish,
    hasJobScam,
    hasAdultBait,
    hasUrgency,
    hasExcessPunct,
    hasAllCaps,
    hasContactBait,
    isVeryShort,
  ];

  // If at least two indicators or any one high-risk pattern is present, flag as spam.
  const highRisk = hasDeliveryPhish || hasScamKeywords || hasMoneyBait || hasObfuscatedUrl;
  const indicators = strongSignals.filter(Boolean).length;

  return highRisk || indicators >= 2;
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
