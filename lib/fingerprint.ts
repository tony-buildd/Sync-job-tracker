/**
 * URL Fingerprinting for Job Deduplication
 *
 * The same job posting can appear under different URLs depending on the source
 * (LinkedIn, direct company site, job boards, etc.). This module creates a
 * canonical "fingerprint" for a job URL so that duplicates can be detected.
 *
 * Strategy:
 * 1. Normalize the company domain (strip subdomains like "jobs.", "careers.", "www.")
 * 2. Extract numeric job IDs from the URL path:
 *    - Pure numeric path segments (e.g. /93284715648)
 *    - Leading digits from locale-suffixed segments (e.g. "30186-en_US" → 30186)
 * 3. Sort and join them to produce a stable fingerprint regardless of URL order.
 *
 * Examples:
 *   https://jobs.nutrien.com/.../30186-en_US/?feedId=...  →  nutrien.com:30186
 *   https://jobs.nutrien.com/.../Process-Engineer/30186-en_US/  →  nutrien.com:30186  ✓ same
 *
 *   https://careers.amgen.com/en/job/-/-/87/93284715648?src=Linkedin  →  amgen.com:87,93284715648
 *   https://careers.amgen.com/en/job/cambridge/.../87/93284715648      →  amgen.com:87,93284715648  ✓ same
 */

export interface ParsedJobUrl {
  fingerprint: string;
  domain: string;
  jobIds: string[];
}

/**
 * Normalizes a hostname by stripping common job-board subdomains and "www."
 * so that "jobs.nutrien.com" and "careers.nutrien.com" both map to "nutrien.com".
 */
export function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^(jobs|careers|career|work|apply|job|www)\./i, "");
}

/**
 * Extracts numeric job ID tokens from a URL path.
 *
 * Rules (applied per path segment after splitting on "/"):
 *  - A segment that is entirely digits   → include as-is
 *  - A segment matching <digits>-<alpha>_<ALPHA> (locale suffix, e.g. "30186-en_US") → include the digit prefix
 *  - All other segments are ignored
 */
export function extractJobIds(pathname: string): string[] {
  const segments = pathname.split("/").filter(Boolean);
  const ids: string[] = [];

  for (const seg of segments) {
    if (/^\d+$/.test(seg)) {
      // Pure numeric segment
      ids.push(seg);
    } else {
      // Locale-suffixed segment like "30186-en_US" or "30186-EN"
      const localeMatch = seg.match(/^(\d+)-[a-zA-Z]{2}[_-][a-zA-Z]{2}$/);
      if (localeMatch) {
        ids.push(localeMatch[1]);
      }
    }
  }

  return ids;
}

/**
 * Parses a job URL and returns its deduplication fingerprint along with
 * the extracted components.
 *
 * Throws if the URL is not valid.
 */
export function parseJobUrl(rawUrl: string): ParsedJobUrl {
  const url = new URL(rawUrl);
  const domain = normalizeHostname(url.hostname);
  const jobIds = extractJobIds(url.pathname);

  // Sort for stability regardless of URL structure variations
  const sortedIds = [...jobIds].sort();

  const fingerprint =
    sortedIds.length > 0
      ? `${domain}:${sortedIds.join(",")}`
      : `${domain}:${url.pathname}`;

  return { fingerprint, domain, jobIds: sortedIds };
}

/**
 * Attempts to derive a human-readable company name from the domain.
 * e.g. "nutrien.com" → "Nutrien"
 */
export function companyFromDomain(domain: string): string {
  const base = domain.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}
