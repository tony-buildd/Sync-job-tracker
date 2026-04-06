import { z } from "zod";
import type { MatchStatus, MatchConfidence } from "./job-matching";

// ---------------------------------------------------------------------------
// Zod schemas – input validation
// ---------------------------------------------------------------------------

export const checkRequestSchema = z.object({
  url: z.url().min(1, "URL must not be empty"),
});

export const markAppliedRequestSchema = z.object({
  originalUrl: z.url().min(1, "URL must not be empty"),
  companyName: z.string().optional(),
  jobTitle: z.string().optional(),
  jobLocation: z.string().optional(),
  externalJobId: z.string().optional(),
  matchedJobId: z.string().optional(),
  resumeVersion: z.string().optional(),
  profileLabel: z.string().optional(),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// TypeScript types – shared between API routes and extension
// ---------------------------------------------------------------------------

export type CheckRequest = z.infer<typeof checkRequestSchema>;

/**
 * Compact parsed job for the extension – excludes internal normalization fields
 * (normalizedCompany, normalizedTitle, normalizedLocation,
 *  primaryCanonicalKey, fallbackCanonicalKey).
 */
export type ExtensionParsedJob = {
  originalUrl: string;
  companyName: string | null;
  jobTitle: string | null;
  jobLocation: string | null;
  externalJobId: string | null;
};

export type MatchedJob = {
  id: string;
  companyName: string;
  jobTitle: string | null;
  jobLocation: string | null;
  externalJobId: string | null;
  sourceUrls: string[];
};

export type ApplicationSummary = {
  id: string;
  appliedAt: number;
  resumeVersion: string | null;
  profileLabel: string | null;
  notes: string | null;
  userName: string;
  userEmail: string | null;
};

export type CheckResponse = {
  status: MatchStatus;
  confidence: MatchConfidence;
  parsedJob: ExtensionParsedJob;
  matchedJob: MatchedJob | null;
  applications: ApplicationSummary[];
  reasons: string[];
};

export type MarkAppliedRequest = z.infer<typeof markAppliedRequestSchema>;

export type MarkAppliedResponse = {
  jobId: string;
  companyName: string;
  jobTitle: string | null;
  jobLocation: string | null;
  externalJobId: string | null;
  applications: ApplicationSummary[];
};

export type ErrorResponse = {
  error: string;
};
