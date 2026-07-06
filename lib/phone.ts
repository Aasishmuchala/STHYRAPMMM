// Phone-number normalization for the WhatsApp Cloud API.
//
// Meta's Messages endpoint wants the recipient identifier in E.164 form as bare
// digits (country code + subscriber number, no "+", no spaces, no leading zero).
// Profile phone numbers are stored loosely (see app/settings/actions.ts — only
// `[^\d+]` is stripped), so a single person may be saved as "9876543210",
// "+91 98765-43210" or "919876543210". We normalize all reasonable forms to the
// same canonical string and return `null` for anything we can't confidently send
// — the caller must skip (never blindly send) a number that doesn't normalize.

// Bare local numbers have no country code, so we assume a default. The app is
// India-first (INR, IST, en-IN everywhere), so 91 is the sensible default; it is
// overridable for future non-Indian staff without a code change.
function defaultCountryCode(): string {
  const cc = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE?.trim().replace(/[^\d]/g, "");
  return cc || "91";
}

// E.164 allows up to 15 digits including the country code; a real number needs at
// least ~8. We keep the gate loose but reject obvious junk.
const MIN_DIGITS = 10;
const MAX_DIGITS = 15;

/**
 * Normalize a stored phone number to WhatsApp Cloud API form: country code +
 * number as bare digits (e.g. "919876543210"). Returns `null` when the input is
 * empty or cannot be confidently interpreted as a dialable number.
 */
export function normalizeWhatsAppNumber(
  raw: string | null | undefined,
  countryCode: string = defaultCountryCode(),
): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hadPlus = trimmed.startsWith("+");
  // Keep digits only. "00" is the international dialing prefix → treat like "+".
  let digits = trimmed.replace(/[^\d]/g, "");
  const hadIntlPrefix = !hadPlus && digits.startsWith("00");
  if (hadIntlPrefix) digits = digits.slice(2);
  if (!digits) return null;

  const cc = countryCode.replace(/[^\d]/g, "") || "91";

  let normalized: string;
  if (hadPlus || hadIntlPrefix) {
    // Explicitly international: the digits already include the country code.
    normalized = digits;
  } else if (digits.length === 10) {
    // Bare local subscriber number → prepend the default country code.
    normalized = cc + digits;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    // National trunk-prefixed form ("0" + 10 digits) → drop trunk, add code.
    normalized = cc + digits.slice(1);
  } else if (digits.startsWith(cc) && digits.length >= cc.length + MIN_DIGITS) {
    // Already carries the country code (e.g. "919876543210").
    normalized = digits;
  } else if (digits.length >= MIN_DIGITS && digits.length <= MAX_DIGITS) {
    // Some other already-international number; trust it as-is.
    normalized = digits;
  } else {
    return null;
  }

  if (normalized.length < MIN_DIGITS || normalized.length > MAX_DIGITS) return null;
  return normalized;
}
