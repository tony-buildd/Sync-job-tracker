const EMAIL_SPLIT_REGEX = /\s*,\s*/;

export function parseAllowedEmails(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(EMAIL_SPLIT_REGEX)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(
  email: string | null | undefined,
  rawAllowedEmails: string | undefined,
): boolean {
  if (!email) {
    return false;
  }

  const allowedEmails = parseAllowedEmails(rawAllowedEmails);
  return allowedEmails.includes(email.trim().toLowerCase());
}
