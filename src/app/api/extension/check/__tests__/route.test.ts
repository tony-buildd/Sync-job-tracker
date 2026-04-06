import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks – Clerk auth and ConvexHttpClient
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

const mockAction = vi.fn();
vi.mock("convex/browser", () => {
  return {
    ConvexHttpClient: class MockConvexHttpClient {
      setAuth() {}
      action(...args: unknown[]) {
        return mockAction(...args);
      }
    },
  };
});

vi.mock("../../../../../../convex/_generated/api", () => ({
  api: { jobs: { checkUrl: "jobs:checkUrl" } },
}));

// ---------------------------------------------------------------------------
// Import the handler AFTER mocks are set up
// ---------------------------------------------------------------------------

import { POST } from "../route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(body?: unknown, options?: { contentType?: string }): Request {
  if (body === undefined) {
    return new Request("http://localhost:3000/api/extension/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  }

  if (typeof body === "string") {
    return new Request("http://localhost:3000/api/extension/check", {
      method: "POST",
      headers: {
        "Content-Type": options?.contentType ?? "application/json",
      },
      body,
    });
  }

  return new Request("http://localhost:3000/api/extension/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setAuthenticatedUser(email: string) {
  mockAuth.mockResolvedValue({
    userId: "user_123",
    sessionClaims: { email },
    getToken: vi.fn().mockResolvedValue("fake-convex-jwt"),
  });
}

function setUnauthenticated() {
  mockAuth.mockResolvedValue({
    userId: null,
    sessionClaims: null,
    getToken: vi.fn().mockResolvedValue(null),
  });
}

/** Full Convex response shape (includes internal fields) */
function makeConvexCheckResponse(overrides: {
  status: "new" | "already_applied" | "possible_duplicate" | "unparseable";
  confidence: "high" | "medium" | "low";
  reasons: string[];
  matchedJob?: {
    id: string;
    companyName: string;
    jobTitle: string | null;
    jobLocation: string | null;
    externalJobId: string | null;
    sourceUrls: string[];
  } | null;
  applications?: Array<{
    id: string;
    appliedAt: number;
    resumeVersion: string | null;
    profileLabel: string | null;
    notes: string | null;
    userName: string;
    userEmail: string | null;
  }>;
  parsedJob?: Partial<{
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
  }>;
}) {
  return {
    status: overrides.status,
    confidence: overrides.confidence,
    reasons: overrides.reasons,
    parsedJob: {
      originalUrl: "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
      companyName: "Nutrien",
      jobTitle: "Process Engineer",
      jobLocation: "North America",
      externalJobId: "30186-en_US",
      // Internal fields the route MUST strip
      normalizedCompany: "nutrien",
      normalizedTitle: "process engineer",
      normalizedLocation: "north america",
      primaryCanonicalKey: "primary:nutrien::30186-en_us",
      fallbackCanonicalKey: "fallback:nutrien::process engineer::north america",
      ...overrides.parsedJob,
    },
    matchedJob: overrides.matchedJob ?? null,
    applications: overrides.applications ?? [],
  };
}

beforeEach(() => {
  // Set env vars
  process.env.ALLOWED_EMAILS = "allowed@example.com,other@example.com";
  process.env.NEXT_PUBLIC_CONVEX_URL = "https://fake-convex.convex.cloud";

  // Reset mocks
  mockAuth.mockReset();
  mockAction.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/extension/check", () => {
  // =========================================================================
  // Authentication & Authorization (VAL-CHECK-006)
  // =========================================================================

  describe("auth", () => {
    it("returns 401 for unauthenticated request (no session)", async () => {
      setUnauthenticated();
      const response = await POST(buildRequest({ url: "https://jobs.example.com/123" }));
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body).toHaveProperty("error");
      expect(Object.keys(body)).toEqual(["error"]);
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("returns 403 for non-allowlisted email", async () => {
      setAuthenticatedUser("notallowed@example.com");
      const response = await POST(buildRequest({ url: "https://jobs.example.com/123" }));
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body).toHaveProperty("error");
      expect(Object.keys(body)).toEqual(["error"]);
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("returns DISTINCT error messages for 401 vs 403", async () => {
      // Get 401 message
      setUnauthenticated();
      const res401 = await POST(buildRequest({ url: "https://jobs.example.com/123" }));
      const body401 = await res401.json();

      // Get 403 message
      setAuthenticatedUser("notallowed@example.com");
      const res403 = await POST(buildRequest({ url: "https://jobs.example.com/123" }));
      const body403 = await res403.json();

      expect(body401.error).not.toBe(body403.error);
    });
  });

  // =========================================================================
  // Input Validation (VAL-CHECK-007, VAL-CHECK-010)
  // =========================================================================

  describe("input validation", () => {
    it("returns 400 for missing body", async () => {
      setAuthenticatedUser("allowed@example.com");
      const request = new Request("http://localhost:3000/api/extension/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    it("returns 400 for empty object body (missing url field)", async () => {
      setAuthenticatedUser("allowed@example.com");
      const response = await POST(buildRequest({}));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    it("returns 400 for empty URL", async () => {
      setAuthenticatedUser("allowed@example.com");
      const response = await POST(buildRequest({ url: "" }));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    it("returns 400 for malformed URL (not-a-url)", async () => {
      setAuthenticatedUser("allowed@example.com");
      const response = await POST(buildRequest({ url: "not-a-url" }));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    it("returns 400 for invalid JSON body (VAL-CHECK-010)", async () => {
      setAuthenticatedUser("allowed@example.com");
      const response = await POST(buildRequest("{{{"));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
      // Must never be 500
      expect(response.status).not.toBe(500);
    });

    it("returns 400 for raw text body", async () => {
      setAuthenticatedUser("allowed@example.com");
      const response = await POST(buildRequest("just some text", { contentType: "application/json" }));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });
  });

  // =========================================================================
  // Successful responses for all 4 status values (VAL-CHECK-001..005)
  // =========================================================================

  describe("authenticated success – all 4 status values", () => {
    it("returns 'already_applied' with high confidence for primary key match (VAL-CHECK-002)", async () => {
      setAuthenticatedUser("allowed@example.com");
      mockAction.mockResolvedValue(
        makeConvexCheckResponse({
          status: "already_applied",
          confidence: "high",
          reasons: ["matched_primary_key"],
          matchedJob: {
            id: "job-id-1",
            companyName: "Nutrien",
            jobTitle: "Process Engineer",
            jobLocation: "North America",
            externalJobId: "30186-en_US",
            sourceUrls: ["https://jobs.nutrien.com/job/30186-en_US/"],
          },
          applications: [
            {
              id: "app-id-1",
              appliedAt: 1700000000000,
              resumeVersion: "v2.0",
              profileLabel: "Engineering",
              notes: "Applied via referral",
              userName: "Jane Doe",
              userEmail: "jane@example.com",
            },
          ],
        }),
      );

      const response = await POST(
        buildRequest({ url: "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/" }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("already_applied");
      expect(body.confidence).toBe("high");
      expect(body.reasons).toContain("matched_primary_key");
      expect(body.matchedJob).not.toBeNull();
      expect(body.matchedJob.id).toBe("job-id-1");
      expect(body.matchedJob.companyName).toBe("Nutrien");
      expect(body.applications).toHaveLength(1);
      expect(body.applications[0].userName).toBe("Jane Doe");
    });

    it("returns 'possible_duplicate' with medium confidence for fallback key match (VAL-CHECK-003)", async () => {
      setAuthenticatedUser("allowed@example.com");
      mockAction.mockResolvedValue(
        makeConvexCheckResponse({
          status: "possible_duplicate",
          confidence: "medium",
          reasons: ["matched_fallback_key"],
          matchedJob: {
            id: "job-id-2",
            companyName: "Acme Corp",
            jobTitle: "Software Engineer",
            jobLocation: "Remote",
            externalJobId: null,
            sourceUrls: ["https://careers.acme.com/job/Software-Engineer/"],
          },
          applications: [],
        }),
      );

      const response = await POST(
        buildRequest({ url: "https://careers.acme.com/job/Software-Engineer/" }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("possible_duplicate");
      expect(body.confidence).toBe("medium");
      expect(body.reasons).toContain("matched_fallback_key");
    });

    it("returns 'new' with low confidence for no existing match (VAL-CHECK-004)", async () => {
      setAuthenticatedUser("allowed@example.com");
      mockAction.mockResolvedValue(
        makeConvexCheckResponse({
          status: "new",
          confidence: "low",
          reasons: ["no_existing_match"],
        }),
      );

      const response = await POST(
        buildRequest({ url: "https://jobs.example.com/posting/99999/" }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("new");
      expect(body.confidence).toBe("low");
      expect(body.reasons).toContain("no_existing_match");
      expect(body.matchedJob).toBeNull();
      expect(body.applications).toEqual([]);
    });

    it("returns 'unparseable' with low confidence for non-job URL (VAL-CHECK-005)", async () => {
      setAuthenticatedUser("allowed@example.com");
      mockAction.mockResolvedValue(
        makeConvexCheckResponse({
          status: "unparseable",
          confidence: "low",
          reasons: ["insufficient_identity_fields"],
          parsedJob: {
            originalUrl: "https://example.com/",
            companyName: "Example",
            jobTitle: null,
            jobLocation: null,
            externalJobId: null,
            normalizedCompany: "example",
            normalizedTitle: null,
            normalizedLocation: null,
            primaryCanonicalKey: null,
            fallbackCanonicalKey: null,
          },
        }),
      );

      const response = await POST(
        buildRequest({ url: "https://example.com/" }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("unparseable");
      expect(body.confidence).toBe("low");
      expect(body.reasons).toContain("insufficient_identity_fields");
      expect(body.matchedJob).toBeNull();
      expect(body.applications).toEqual([]);
    });
  });

  // =========================================================================
  // Response shape validation (VAL-CHECK-001)
  // =========================================================================

  describe("response shape", () => {
    it("has exactly the correct top-level keys (VAL-CHECK-001)", async () => {
      setAuthenticatedUser("allowed@example.com");
      mockAction.mockResolvedValue(
        makeConvexCheckResponse({
          status: "new",
          confidence: "low",
          reasons: ["no_existing_match"],
        }),
      );

      const response = await POST(
        buildRequest({ url: "https://jobs.example.com/posting/12345/" }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      // Six top-level keys
      expect(Object.keys(body).sort()).toEqual(
        ["applications", "confidence", "matchedJob", "parsedJob", "reasons", "status"].sort(),
      );
      // Status from allowed enum
      expect(["new", "already_applied", "possible_duplicate", "unparseable"]).toContain(body.status);
      // Confidence from allowed enum
      expect(["high", "medium", "low"]).toContain(body.confidence);
      // Reasons is a non-empty string array
      expect(Array.isArray(body.reasons)).toBe(true);
      expect(body.reasons.length).toBeGreaterThan(0);
      body.reasons.forEach((r: unknown) => expect(typeof r).toBe("string"));
    });

    it("parsedJob contains exactly 5 public fields, no internal fields", async () => {
      setAuthenticatedUser("allowed@example.com");
      mockAction.mockResolvedValue(
        makeConvexCheckResponse({
          status: "new",
          confidence: "low",
          reasons: ["no_existing_match"],
        }),
      );

      const response = await POST(
        buildRequest({ url: "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/" }),
      );
      const body = await response.json();

      // Must have exactly 5 public fields
      expect(Object.keys(body.parsedJob).sort()).toEqual(
        ["companyName", "externalJobId", "jobLocation", "jobTitle", "originalUrl"].sort(),
      );

      // Must NOT have internal fields
      expect(body.parsedJob).not.toHaveProperty("normalizedCompany");
      expect(body.parsedJob).not.toHaveProperty("normalizedTitle");
      expect(body.parsedJob).not.toHaveProperty("normalizedLocation");
      expect(body.parsedJob).not.toHaveProperty("primaryCanonicalKey");
      expect(body.parsedJob).not.toHaveProperty("fallbackCanonicalKey");
    });

    it("does not leak workspaceId or userId", async () => {
      setAuthenticatedUser("allowed@example.com");
      mockAction.mockResolvedValue(
        makeConvexCheckResponse({
          status: "new",
          confidence: "low",
          reasons: ["no_existing_match"],
        }),
      );

      const response = await POST(
        buildRequest({ url: "https://jobs.example.com/posting/12345/" }),
      );
      const body = await response.json();
      const jsonStr = JSON.stringify(body);

      expect(jsonStr).not.toContain("workspaceId");
      expect(jsonStr).not.toContain("userId");
    });
  });

  // =========================================================================
  // URL with query params and fragments (VAL-CHECK-008)
  // =========================================================================

  describe("URL parsing edge cases", () => {
    it("URL with query params and fragments parsed correctly (VAL-CHECK-008)", async () => {
      setAuthenticatedUser("allowed@example.com");
      const urlWithParams =
        "https://jobs.nutrien.com/North-America/job/Augusta-Process-Engineer-GA-30903/30186-en_US/?utm_source=LinkedIn&ref=abc#section";

      mockAction.mockResolvedValue(
        makeConvexCheckResponse({
          status: "new",
          confidence: "low",
          reasons: ["no_existing_match"],
          parsedJob: {
            originalUrl: urlWithParams,
            externalJobId: "30186-en_US",
          },
        }),
      );

      const response = await POST(buildRequest({ url: urlWithParams }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.parsedJob.externalJobId).toBe("30186-en_US");
    });
  });

  // =========================================================================
  // Very long URL handling (VAL-CHECK-009)
  // =========================================================================

  describe("very long URL handling", () => {
    it("returns 200 or 400 for URL >2048 chars, never 500 (VAL-CHECK-009)", async () => {
      setAuthenticatedUser("allowed@example.com");
      const longUrl = "https://jobs.example.com/posting/" + "a".repeat(2100);

      mockAction.mockResolvedValue(
        makeConvexCheckResponse({
          status: "unparseable",
          confidence: "low",
          reasons: ["insufficient_identity_fields"],
          parsedJob: {
            originalUrl: longUrl,
            companyName: "Example",
            jobTitle: null,
            jobLocation: null,
            externalJobId: null,
            normalizedCompany: "example",
            normalizedTitle: null,
            normalizedLocation: null,
            primaryCanonicalKey: null,
            fallbackCanonicalKey: null,
          },
        }),
      );

      const response = await POST(buildRequest({ url: longUrl }));

      // Must be 200 or 400, never 500
      expect([200, 400]).toContain(response.status);
      expect(response.status).not.toBe(500);
    });
  });

  // =========================================================================
  // Primary key precedence over fallback key (VAL-CROSS-006)
  // =========================================================================

  describe("primary key precedence", () => {
    it("primary key match takes precedence over fallback key match (VAL-CROSS-006)", async () => {
      setAuthenticatedUser("allowed@example.com");

      // Convex checkUrl resolves primary key first, returning already_applied
      mockAction.mockResolvedValue(
        makeConvexCheckResponse({
          status: "already_applied",
          confidence: "high",
          reasons: ["matched_primary_key"],
          matchedJob: {
            id: "primary-job-id",
            companyName: "Nutrien",
            jobTitle: "Process Engineer",
            jobLocation: "North America",
            externalJobId: "30186-en_US",
            sourceUrls: ["https://jobs.nutrien.com/job/30186-en_US/"],
          },
          applications: [
            {
              id: "app-1",
              appliedAt: 1700000000000,
              resumeVersion: null,
              profileLabel: null,
              notes: null,
              userName: "Alice",
              userEmail: "alice@example.com",
            },
          ],
        }),
      );

      const response = await POST(
        buildRequest({ url: "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/" }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("already_applied");
      expect(body.confidence).toBe("high");
      expect(body.reasons).toContain("matched_primary_key");
      expect(body.reasons).not.toContain("matched_fallback_key");
      expect(body.matchedJob.id).toBe("primary-job-id");
    });
  });

  // =========================================================================
  // Convex error handling
  // =========================================================================

  describe("Convex error handling", () => {
    it("returns 500 with error message when Convex action fails", async () => {
      setAuthenticatedUser("allowed@example.com");
      mockAction.mockRejectedValue(new Error("Convex action failed"));

      const response = await POST(
        buildRequest({ url: "https://jobs.example.com/posting/12345/" }),
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toHaveProperty("error");
    });
  });
});
