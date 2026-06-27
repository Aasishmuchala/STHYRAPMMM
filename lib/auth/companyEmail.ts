// The authoritative source of "which emails can sign in" is the
// `invite_allowlist` table — owners add a row before sending a signup link.
// Domain-based fast-path: any address at one of the company domains is
// pre-approved. To bootstrap a new super-admin, add their email to the
// invite_allowlist table via the service role from `docs/super-admin-bootstrap.md`.
const ALLOWED_EMAIL_DOMAINS = ["sthyra.com", "sthyra.in"] as const;

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

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isCompanyEmail(email: string | null | undefined) {
  const normalized = normalizeEmail(email ?? "");
  if (!normalized) return false;
  if (ALLOWED_EMAILS.includes(normalized)) return true;
  return ALLOWED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
}

export function companyEmailMessage() {
  return "Use your approved Sthyra email to access Sthyra.";
}

export function companyEmailDomain() {
  return ALLOWED_EMAIL_DOMAINS[0];
}

export function getAllowedDomains(): readonly string[] {
  return ALLOWED_EMAIL_DOMAINS;
}
