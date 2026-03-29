export type MatchStatus =
  | "new"
  | "already_applied"
  | "possible_duplicate"
  | "unparseable";

export type MatchConfidence = "high" | "medium" | "low";

export type ParsedJob = {
  originalUrl: string;
  companyName: string | null;
  jobTitle: string | null;
  jobLocation: string | null;
  externalJobId: string | null;
  normalizedCompany: string | null;
  normalizedTitle: string | null;
  normalizedLocation: string | null;
  primaryCanonicalKey: string | null;
  fallbackCanonicalKey: string | null;
};

type PathCandidate = {
  idIndex: number;
  value: string;
};

const GENERIC_PATH_SEGMENTS = new Set([
  "job",
  "jobs",
  "careers",
  "career",
  "position",
  "positions",
  "listing",
  "listings",
  "opening",
  "openings",
  "detail",
  "details",
  "posting",
  "postings",
  "role",
  "roles",
  "-",
]);

const COMPANY_SUBDOMAINS = new Set(["jobs", "careers", "www", "boards", "apply"]);

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function titleize(value: string | null) {
  if (!value) {
    return null;
  }

  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return normalized || null;
}

function normalizeId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase();
}

function buildPrimaryCanonicalKey(
  normalizedCompany: string | null,
  externalJobId: string | null,
) {
  if (!normalizedCompany || !externalJobId) {
    return null;
  }

  return `primary:${normalizedCompany}::${normalizeId(externalJobId)}`;
}

function buildFallbackCanonicalKey(
  normalizedCompany: string | null,
  normalizedTitle: string | null,
  normalizedLocation: string | null,
) {
  if (!normalizedCompany || !normalizedTitle || !normalizedLocation) {
    return null;
  }

  return `fallback:${normalizedCompany}::${normalizedTitle}::${normalizedLocation}`;
}

function extractCompanyFromHostname(hostname: string) {
  const labels = hostname
    .split(".")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);

  if (labels.length === 0) {
    return null;
  }

  const rootIndex = Math.max(labels.length - 2, 0);
  const companyLabel =
    labels
      .slice(0, rootIndex)
      .reverse()
      .find((segment) => !COMPANY_SUBDOMAINS.has(segment)) ?? labels[rootIndex];

  return titleize(normalizeText(companyLabel));
}

function isExternalIdCandidate(segment: string) {
  const value = segment.trim();
  if (!value) {
    return false;
  }

  return (
    /^\d{4,}$/.test(value) ||
    /^\d{4,}-[a-z]{2}_[a-z]{2}$/i.test(value) ||
    /^\d{4,}-[a-z0-9_]+$/i.test(value)
  );
}

function findExternalId(pathSegments: string[]): PathCandidate | null {
  for (let index = pathSegments.length - 1; index >= 0; index -= 1) {
    const segment = pathSegments[index];
    if (isExternalIdCandidate(segment)) {
      return { idIndex: index, value: segment };
    }
  }

  return null;
}

function cleanSegmentForDisplay(value: string) {
  return titleize(
    normalizeText(
      value
        .replace(/[-_]+/g, " ")
        .replace(/\b[a-z]{2}_[a-z]{2}\b/gi, "")
        .trim(),
    ),
  );
}

function isUsableSegment(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return false;
  }

  return !GENERIC_PATH_SEGMENTS.has(normalized) && /[a-z]/i.test(value);
}

function extractTitleAndLocation(pathSegments: string[], idIndex: number) {
  let title: string | null = null;
  let location: string | null = null;
  let titleIndex = -1;

  for (let index = idIndex - 1; index >= 0; index -= 1) {
    const segment = safeDecode(pathSegments[index]);
    if (!isUsableSegment(segment) || isExternalIdCandidate(segment)) {
      continue;
    }

    title = cleanSegmentForDisplay(segment);
    titleIndex = index;
    break;
  }

  if (titleIndex > 0) {
    const segment = safeDecode(pathSegments[titleIndex - 1]);
    if (isUsableSegment(segment)) {
      location = cleanSegmentForDisplay(segment);
    }
  }

  return { title, location };
}

export function deriveCanonicalIdentity(input: {
  companyName?: string | null;
  jobTitle?: string | null;
  jobLocation?: string | null;
  externalJobId?: string | null;
}) {
  const normalizedCompany = normalizeText(input.companyName);
  const normalizedTitle = normalizeText(input.jobTitle);
  const normalizedLocation = normalizeText(input.jobLocation);
  const externalJobId = input.externalJobId?.trim() || null;

  return {
    normalizedCompany,
    normalizedTitle,
    normalizedLocation,
    externalJobId,
    primaryCanonicalKey: buildPrimaryCanonicalKey(normalizedCompany, externalJobId),
    fallbackCanonicalKey: buildFallbackCanonicalKey(
      normalizedCompany,
      normalizedTitle,
      normalizedLocation,
    ),
  };
}

export function parseJobUrl(rawUrl: string): ParsedJob {
  const url = new URL(rawUrl);
  const pathSegments = url.pathname
    .split("/")
    .map((segment) => safeDecode(segment.trim()))
    .filter(Boolean);

  const idCandidate = findExternalId(pathSegments);
  const companyName = extractCompanyFromHostname(url.hostname);
  const { title, location } = idCandidate
    ? extractTitleAndLocation(pathSegments, idCandidate.idIndex)
    : { title: null, location: null };

  const identity = deriveCanonicalIdentity({
    companyName,
    jobTitle: title,
    jobLocation: location,
    externalJobId: idCandidate?.value ?? null,
  });

  return {
    originalUrl: url.toString(),
    companyName,
    jobTitle: title,
    jobLocation: location,
    externalJobId: idCandidate?.value ?? null,
    normalizedCompany: identity.normalizedCompany,
    normalizedTitle: identity.normalizedTitle,
    normalizedLocation: identity.normalizedLocation,
    primaryCanonicalKey: identity.primaryCanonicalKey,
    fallbackCanonicalKey: identity.fallbackCanonicalKey,
  };
}
