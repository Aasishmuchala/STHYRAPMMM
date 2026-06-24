const ALLOWED_EMAIL_DOMAINS = ["sthyra.com", "sthyra.in"] as const;
const ALLOWED_EMAILS = ["aasishmuchala@gmail.com"] as const;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isCompanyEmail(email: string | null | undefined) {
  const normalized = normalizeEmail(email ?? "");
  return (
    ALLOWED_EMAILS.includes(normalized as (typeof ALLOWED_EMAILS)[number]) ||
    ALLOWED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`))
  );
}

export function companyEmailMessage() {
  return "Use your approved Sthyra email to access Sthyra.";
}

export function companyEmailDomain() {
  return ALLOWED_EMAIL_DOMAINS[0];
}
