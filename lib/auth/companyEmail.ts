// The authoritative source of "which emails can sign in" is the
// `invite_allowlist` table — owners add a row before sending a signup link.
// Domain-based fast-path: any address at one of the company domains is
// pre-approved. To bootstrap a new super-admin, add their email to the
// invite_allowlist table via the service role from `docs/super-admin-bootstrap.md`.
const ALLOWED_EMAIL_DOMAINS = [
  "sthyra.com",
  "sthyra.in",
  "sthyradigital.com",
  "abhignaconstructions.com",
] as const;

// Extra individual addresses allowed beyond the company domains. Sourced from
// the NEXT_PUBLIC_ALLOWED_EMAILS env var (comma-separated) so NO personal email
// is hardcoded in source (audit 1.6). When the var is unset this is empty and
// only company-domain addresses can sign in. Use it to bootstrap an owner /
// super-admin whose address is not on a company domain — set it as a deploy/CI
// secret, not in committed code.
const ALLOWED_EMAILS: readonly string[] = (process.env.NEXT_PUBLIC_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

// On signup, a new member is auto-added to the company (division) that matches
// their email domain. Slugs map to rows in the `divisions` table:
//   sthyra.com               -> studios      (Sthyra Studios)
//   sthyradigital.com        -> digital      (Sthyra Digital)
//   abhignaconstructions.com -> abhigna_constructions (Abhigna Constructions)
const DOMAIN_TO_DIVISION_SLUG: Record<string, string> = {
  "sthyra.com": "studios",
  "sthyradigital.com": "digital",
  "abhignaconstructions.com": "abhigna_constructions",
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isCompanyEmail(email: string | null | undefined) {
  const normalized = normalizeEmail(email ?? "");
  if (!normalized) return false;
  if (ALLOWED_EMAILS.includes(normalized)) return true;
  return ALLOWED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
}

/** Division slug a newly-signed-up email should join, or null if none maps. */
export function divisionSlugForEmail(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email ?? "");
  const at = normalized.lastIndexOf("@");
  if (at < 0) return null;
  const domain = normalized.slice(at + 1);
  return DOMAIN_TO_DIVISION_SLUG[domain] ?? null;
}

export function companyEmailMessage() {
  return "Use your approved company email (@sthyra.com, @sthyradigital.com or @abhignaconstructions.com) to access Sthyra.";
}

export function companyEmailDomain() {
  return ALLOWED_EMAIL_DOMAINS[0];
}

export function getAllowedDomains(): readonly string[] {
  return ALLOWED_EMAIL_DOMAINS;
}
