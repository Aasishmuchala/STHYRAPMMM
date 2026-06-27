// The authoritative source of "which emails can sign in" is the
// `invite_allowlist` table — owners add a row before sending a signup link.
// Domain-based fast-path: any address at one of the company domains is
// pre-approved. To bootstrap a new super-admin, add their email to the
// invite_allowlist table via the service role from `docs/super-admin-bootstrap.md`.
const ALLOWED_EMAIL_DOMAINS = ["sthyra.com", "sthyra.in"] as const;

// Kept for unit-test backwards compatibility but empty — no hardcoded
// backdoor emails in source. The previous personal-gmail allowlist was a
// security finding (audit 1.6); admins should use the invite_allowlist table.
const ALLOWED_EMAILS: readonly string[] = [];

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
