const COMPANY_EMAIL_DOMAIN = "sthyra.com";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isCompanyEmail(email: string | null | undefined) {
  return normalizeEmail(email ?? "").endsWith(`@${COMPANY_EMAIL_DOMAIN}`);
}

export function companyEmailMessage() {
  return `Use your @${COMPANY_EMAIL_DOMAIN} email to access Sthyra.`;
}

export function companyEmailDomain() {
  return COMPANY_EMAIL_DOMAIN;
}
