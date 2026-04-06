import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConvexError } from "convex/values";

// ---------------------------------------------------------------------------
// Mocks – Clerk auth and ConvexHttpClient
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

const mockMutation = vi.fn();
vi.mock("convex/browser", () => {
  return {
    ConvexHttpClient: class MockConvexHttpClient {
      setAuth() {}
      mutation(...args: unknown[]) {
        return mockMutation(...args);
      }
    },
  };
});

vi.mock("../../../../../../convex/_generated/api", () => ({
  api: { jobs: { markApplied: "jobs:markApplied" } },
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
    return new Request("http://localhost:3000/api/extension/mark-applied", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  }

  if (typeof body === "string") {
    return new Request("http://localhost:3000/api/extension/mark-applied", {
      method: "POST",
      headers: {
        "Content-Type": options?.contentType ?? "application/json",
      },
      body,
    });
  }

  return new Request("http://localhost:3000/api/extension/mark-applied", {
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

/** Standard Convex markApplied response shape */
function makeConvexMarkResponse(overrides?: {
  jobId?: string;
  companyName?: string;
  jobTitle?: string | null;
  jobLocation?: string | null;
  externalJobId?: string | null;
  applications?: Array<{
    id: string;
    appliedAt: number;
    resumeVersion: string | null;
    profileLabel: string | null;
    notes: string | null;
    userName: string;
    userEmail: string | null;
  }>;
}) {
  return {
    jobId: overrides?.jobId ?? "job-id-1",
    companyName: overrides?.companyName ?? "Nutrien",
    jobTitle: overrides?.jobTitle ?? "Process Engineer",
    jobLocation: overrides?.jobLocation ?? "North America",
    externalJobId: overrides?.externalJobId ?? "30186-en_US",
    applications: overrides?.applications ?? [
      {
        id: "app-id-1",
        appliedAt: 1700000000000,
        resumeVersion: null,
        profileLabel: null,
        notes: null,
        userName: "Alice",
        userEmail: "allowed@example.com",
      },
    ],
  };
}

beforeEach(() => {
  process.env.ALLOWED_EMAILS = "allowed@example.com,other@example.com";
  process.env.NEXT_PUBLIC_CONVEX_URL = "https://fake-convex.convex.cloud";

  mockAuth.mockReset();
  mockMutation.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/extension/mark-applied", () => {
  // =========================================================================
  // Authentication & Authorization (VAL-MARK-007)
  // =========================================================================

  describe("auth", () => {
    it("returns 401 for unauthenticated request (no session)", async () => {
      setUnauthenticated();
      const response = await POST(
        buildRequest({ originalUrl: "https://jobs.example.com/123" }),
      );
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body).toHaveProperty("error");
      expect(Object.keys(body)).toEqual(["error"]);
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("returns 403 for non-allowlisted email", async () => {
      setAuthenticatedUser("notallowed@example.com");
      const response = await POST(
        buildRequest({ originalUrl: "https://jobs.example.com/123" }),
      );
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
      const res401 = await POST(
        buildRequest({ originalUrl: "https://jobs.example.com/123" }),
      );
      const body401 = await res401.json();

      // Get 403 message
      setAuthenticatedUser("notallowed@example.com");
      const res403 = await POST(
        buildRequest({ originalUrl: "https://jobs.example.com/123" }),
      );
      const body403 = await res403.json();

      expect(body401.error).not.toBe(body403.error);
    });
  });

  // =========================================================================
  // Input Validation (VAL-MARK-008)
  // =========================================================================

  describe("input validation", () => {
    it("returns 400 for missing body", async () => {
      setAuthenticatedUser("allowed@example.com");
      const request = new Request(
        "http://localhost:3000/api/extension/mark-applied",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      const response = await POST(request);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    it("returns 400 for empty object body (missing originalUrl)", async () => {
      setAuthenticatedUser("allowed@example.com");
      const response = await POST(buildRequest({}));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    it("returns 400 for empty originalUrl", async () => {
      setAuthenticatedUser("allowed@example.com");
      const response = await POST(buildRequest({ originalUrl: "" }));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    it("returns 400 for malformed originalUrl (not-a-url)", async () => {
      setAuthenticatedUser("allowed@example.com");
      const response = await POST(buildRequest({ originalUrl: "not-a-url" }));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    it("returns 400 for invalid JSON body", async () => {
      setAuthenticatedUser("allowed@example.com");
      const response = await POST(buildRequest("{{{"));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
      expect(response.status).not.toBe(500);
    });

    it("returns 400 for raw text body", async () => {
      setAuthenticatedUser("allowed@example.com");
      const response = await POST(
        buildRequest("just some text", { contentType: "application/json" }),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });
  });

  // =========================================================================
  // Successful mark-applied (VAL-MARK-001)
  // =========================================================================

  describe("authenticated success – creates application and returns correct shape", () => {
    it("returns 200 with MarkAppliedResponse for valid request (VAL-MARK-001)", async () => {
      setAuthenticatedUser("allowed@example.com");
      mockMutation.mockResolvedValue(
        makeConvexMarkResponse({
          applications: [
            {
              id: "app-id-1",
              appliedAt: 1700000000000,
              resumeVersion: null,
              profileLabel: null,
              notes: null,
              userName: "Alice",
              userEmail: "allowed@example.com",
            },
          ],
        }),
      );

      const response = await POST(
        buildRequest({
          originalUrl:
            "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      // All expected top-level keys
      expect(body).toHaveProperty("jobId");
      expect(body).toHaveProperty("companyName");
      expect(body).toHaveProperty("jobTitle");
      expect(body).toHaveProperty("jobLocation");
      expect(body).toHaveProperty("externalJobId");
      expect(body).toHaveProperty("applications");

      // jobId is a non-empty string
      expect(typeof body.jobId).toBe("string");
      expect(body.jobId.length).toBeGreaterThan(0);

      // companyName is a string
      expect(typeof body.companyName).toBe("string");

      // applications is a non-empty array with correct shape
      expect(Array.isArray(body.applications)).toBe(true);
      expect(body.applications.length).toBeGreaterThanOrEqual(1);

      const app = body.applications[0];
      expect(app).toHaveProperty("id");
      expect(app).toHaveProperty("appliedAt");
      expect(app).toHaveProperty("resumeVersion");
      expect(app).toHaveProperty("profileLabel");
      expect(app).toHaveProperty("notes");
      expect(app).toHaveProperty("userName");
      expect(app).toHaveProperty("userEmail");

      // No workspaceId leaks
      const jsonStr = JSON.stringify(body);
      expect(jsonStr).not.toContain("workspaceId");
    });
  });

  // =========================================================================
  // Optional metadata fields (VAL-MARK-002)
  // =========================================================================

  describe("optional metadata fields", () => {
    it("stores and returns resumeVersion, profileLabel, and notes (VAL-MARK-002)", async () => {
      setAuthenticatedUser("allowed@example.com");
      mockMutation.mockResolvedValue(
        makeConvexMarkResponse({
          applications: [
            {
              id: "app-id-1",
              appliedAt: 1700000000000,
              resumeVersion: "v2.1",
              profileLabel: "Frontend",
              notes: "Applied via referral",
              userName: "Alice",
              userEmail: "allowed@example.com",
            },
          ],
        }),
      );

      const response = await POST(
        buildRequest({
          originalUrl:
            "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
          resumeVersion: "v2.1",
          profileLabel: "Frontend",
          notes: "Applied via referral",
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      const app = body.applications[0];
      expect(app.resumeVersion).toBe("v2.1");
      expect(app.profileLabel).toBe("Frontend");
      expect(app.notes).toBe("Applied via referral");

      // Verify mutation was called with metadata
      expect(mockMutation).toHaveBeenCalledTimes(1);
      const callArgs = mockMutation.mock.calls[0][1];
      expect(callArgs.resumeVersion).toBe("v2.1");
      expect(callArgs.profileLabel).toBe("Frontend");
      expect(callArgs.notes).toBe("Applied via referral");
    });

    it("treats whitespace-only metadata values as null/undefined (VAL-MARK-002)", async () => {
      setAuthenticatedUser("allowed@example.com");
      mockMutation.mockResolvedValue(
        makeConvexMarkResponse({
          applications: [
            {
              id: "app-id-1",
              appliedAt: 1700000000000,
              resumeVersion: null,
              profileLabel: null,
              notes: null,
              userName: "Alice",
              userEmail: "allowed@example.com",
            },
          ],
        }),
      );

      const response = await POST(
        buildRequest({
          originalUrl:
            "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
          resumeVersion: "   ",
          profileLabel: "  \t  ",
          notes: "   \n  ",
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);

      // Verify mutation was called WITHOUT whitespace-only metadata
      expect(mockMutation).toHaveBeenCalledTimes(1);
      const callArgs = mockMutation.mock.calls[0][1];
      expect(callArgs.resumeVersion).toBeUndefined();
      expect(callArgs.profileLabel).toBeUndefined();
      expect(callArgs.notes).toBeUndefined();

      // Response should show null
      const app = body.applications[0];
      expect(app.resumeVersion).toBeNull();
      expect(app.profileLabel).toBeNull();
      expect(app.notes).toBeNull();
    });
  });

  // =========================================================================
  // Override fields (VAL-MARK-003)
  // =========================================================================

  describe("override fields", () => {
    it("passes override fields to Convex, trimmed (VAL-MARK-003)", async () => {
      setAuthenticatedUser("allowed@example.com");
      mockMutation.mockResolvedValue(
        makeConvexMarkResponse({
          companyName: "Google",
          jobTitle: "Senior SWE",
          jobLocation: "Mountain View",
          externalJobId: "G-12345",
        }),
      );

      const response = await POST(
        buildRequest({
          originalUrl: "https://careers.google.com/jobs/12345",
          companyName: "  Google  ",
          jobTitle: "  Senior SWE  ",
          jobLocation: "  Mountain View  ",
          externalJobId: "  G-12345  ",
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);

      // Verify trimmed values were passed to Convex
      const callArgs = mockMutation.mock.calls[0][1];
      expect(callArgs.companyName).toBe("Google");
      expect(callArgs.jobTitle).toBe("Senior SWE");
      expect(callArgs.jobLocation).toBe("Mountain View");
      expect(callArgs.externalJobId).toBe("G-12345");

      // Response reflects the overrides
      expect(body.companyName).toBe("Google");
      expect(body.jobTitle).toBe("Senior SWE");
      expect(body.jobLocation).toBe("Mountain View");
      expect(body.externalJobId).toBe("G-12345");
    });
  });

  // =========================================================================
  // matchedJobId links to existing job (VAL-MARK-004)
  // =========================================================================

  describe("matchedJobId", () => {
    it("passes matchedJobId to Convex and returns matching jobId (VAL-MARK-004)", async () => {
      setAuthenticatedUser("allowed@example.com");
      const existingJobId = "existing-job-id-abc";
      mockMutation.mockResolvedValue(
        makeConvexMarkResponse({ jobId: existingJobId }),
      );

      const response = await POST(
        buildRequest({
          originalUrl:
            "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
          matchedJobId: existingJobId,
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.jobId).toBe(existingJobId);

      // Verify matchedJobId was passed to Convex
      const callArgs = mockMutation.mock.calls[0][1];
      expect(callArgs.matchedJobId).toBe(existingJobId);
    });

    it("invalid matchedJobId falls through gracefully, never 500 (VAL-MARK-010)", async () => {
      setAuthenticatedUser("allowed@example.com");

      // First call fails due to invalid ID
      mockMutation
        .mockRejectedValueOnce(new Error("Invalid ID: 'not-a-valid-id'"))
        // Retry without matchedJobId succeeds
        .mockResolvedValueOnce(makeConvexMarkResponse());

      const response = await POST(
        buildRequest({
          originalUrl:
            "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
          matchedJobId: "not-a-valid-id",
        }),
      );
      const body = await response.json();

      // Must be 200, never 500
      expect(response.status).toBe(200);
      expect(body).toHaveProperty("jobId");
      expect(response.status).not.toBe(500);

      // Second call should NOT have matchedJobId
      expect(mockMutation).toHaveBeenCalledTimes(2);
      const retryArgs = mockMutation.mock.calls[1][1];
      expect(retryArgs.matchedJobId).toBeUndefined();
    });

    it("non-existent matchedJobId falls through gracefully (VAL-MARK-010)", async () => {
      setAuthenticatedUser("allowed@example.com");

      // First call fails due to non-existent ID
      mockMutation
        .mockRejectedValueOnce(
          new Error("Could not find document with ID 'nonexistent123'"),
        )
        // Retry without matchedJobId succeeds
        .mockResolvedValueOnce(makeConvexMarkResponse());

      const response = await POST(
        buildRequest({
          originalUrl:
            "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
          matchedJobId: "nonexistent123",
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toHaveProperty("jobId");
      expect(response.status).not.toBe(500);
    });
  });

  // =========================================================================
  // Idempotent – same user+job (VAL-MARK-005)
  // =========================================================================

  describe("idempotency", () => {
    it("same user+job does not create duplicate application (VAL-MARK-005)", async () => {
      setAuthenticatedUser("allowed@example.com");
      const singleAppResponse = makeConvexMarkResponse({
        applications: [
          {
            id: "app-id-1",
            appliedAt: 1700000000000,
            resumeVersion: null,
            profileLabel: null,
            notes: null,
            userName: "Alice",
            userEmail: "allowed@example.com",
          },
        ],
      });

      // Both calls return the same single-application response (Convex handles idempotency)
      mockMutation.mockResolvedValue(singleAppResponse);

      const response1 = await POST(
        buildRequest({
          originalUrl:
            "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
        }),
      );
      const body1 = await response1.json();

      const response2 = await POST(
        buildRequest({
          originalUrl:
            "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
        }),
      );
      const body2 = await response2.json();

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Same jobId
      expect(body1.jobId).toBe(body2.jobId);

      // Only one application for this user
      const userApps = body2.applications.filter(
        (a: { userEmail: string }) => a.userEmail === "allowed@example.com",
      );
      expect(userApps.length).toBe(1);
    });
  });

  // =========================================================================
  // Re-mark does not overwrite existing metadata (VAL-MARK-011)
  // =========================================================================

  describe("re-mark metadata preservation", () => {
    it("re-mark does NOT update existing application metadata (VAL-MARK-011)", async () => {
      setAuthenticatedUser("allowed@example.com");

      // Convex preserves original metadata (idempotent insert)
      // First mark: v1 metadata
      mockMutation.mockResolvedValueOnce(
        makeConvexMarkResponse({
          applications: [
            {
              id: "app-id-1",
              appliedAt: 1700000000000,
              resumeVersion: "v1.0",
              profileLabel: "Original",
              notes: "First apply",
              userName: "Alice",
              userEmail: "allowed@example.com",
            },
          ],
        }),
      );

      const response1 = await POST(
        buildRequest({
          originalUrl:
            "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
          resumeVersion: "v1.0",
          profileLabel: "Original",
          notes: "First apply",
        }),
      );
      const body1 = await response1.json();
      expect(response1.status).toBe(200);
      expect(body1.applications[0].resumeVersion).toBe("v1.0");

      // Second mark: different metadata — Convex still returns the original
      mockMutation.mockResolvedValueOnce(
        makeConvexMarkResponse({
          applications: [
            {
              id: "app-id-1",
              appliedAt: 1700000000000,
              resumeVersion: "v1.0",
              profileLabel: "Original",
              notes: "First apply",
              userName: "Alice",
              userEmail: "allowed@example.com",
            },
          ],
        }),
      );

      const response2 = await POST(
        buildRequest({
          originalUrl:
            "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
          resumeVersion: "v2.0",
          profileLabel: "Updated",
          notes: "Second apply attempt",
        }),
      );
      const body2 = await response2.json();
      expect(response2.status).toBe(200);

      // Original metadata is preserved, NOT overwritten
      expect(body2.applications[0].resumeVersion).toBe("v1.0");
      expect(body2.applications[0].profileLabel).toBe("Original");
      expect(body2.applications[0].notes).toBe("First apply");
    });
  });

  // =========================================================================
  // Multiple users on same job (VAL-MARK-006)
  // =========================================================================

  describe("multiple users", () => {
    it("both users' applications are returned for the same job (VAL-MARK-006)", async () => {
      // User A marks
      setAuthenticatedUser("allowed@example.com");
      mockMutation.mockResolvedValueOnce(
        makeConvexMarkResponse({
          jobId: "shared-job-id",
          applications: [
            {
              id: "app-id-1",
              appliedAt: 1700000000000,
              resumeVersion: null,
              profileLabel: null,
              notes: null,
              userName: "Alice",
              userEmail: "allowed@example.com",
            },
          ],
        }),
      );

      const responseA = await POST(
        buildRequest({
          originalUrl:
            "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
        }),
      );
      expect(responseA.status).toBe(200);

      // User B marks same job
      setAuthenticatedUser("other@example.com");
      mockMutation.mockResolvedValueOnce(
        makeConvexMarkResponse({
          jobId: "shared-job-id",
          applications: [
            {
              id: "app-id-1",
              appliedAt: 1700000000000,
              resumeVersion: null,
              profileLabel: null,
              notes: null,
              userName: "Alice",
              userEmail: "allowed@example.com",
            },
            {
              id: "app-id-2",
              appliedAt: 1700000001000,
              resumeVersion: null,
              profileLabel: null,
              notes: null,
              userName: "Bob",
              userEmail: "other@example.com",
            },
          ],
        }),
      );

      const responseB = await POST(
        buildRequest({
          originalUrl:
            "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
        }),
      );
      const bodyB = await responseB.json();

      expect(responseB.status).toBe(200);
      expect(bodyB.applications).toHaveLength(2);

      const emails = bodyB.applications.map(
        (a: { userEmail: string }) => a.userEmail,
      );
      expect(emails).toContain("allowed@example.com");
      expect(emails).toContain("other@example.com");
    });
  });

  // =========================================================================
  // Insufficient identity fields (VAL-MARK-009)
  // =========================================================================

  describe("insufficient identity fields", () => {
    it("returns structured error for URL with no canonical keys and no overrides (VAL-MARK-009)", async () => {
      setAuthenticatedUser("allowed@example.com");

      // Convex throws ConvexError about insufficient identity (structured error, not plain Error)
      mockMutation.mockRejectedValue(
        new ConvexError(
          "This job needs either a stable job ID or an exact company, title, and location before it can be saved as applied.",
        ),
      );

      const response = await POST(
        buildRequest({ originalUrl: "https://example.com/" }),
      );
      const body = await response.json();

      // Must be 400, never 500
      expect(response.status).toBe(400);
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
      expect(response.status).not.toBe(500);
    });
  });

  // =========================================================================
  // First-use empty DB scenario (VAL-CROSS-007)
  // =========================================================================

  describe("first-use empty DB", () => {
    it("creates workspace, user, job, and application on fresh database (VAL-CROSS-007)", async () => {
      setAuthenticatedUser("allowed@example.com");

      // Convex ensureWorkspace + ensureUser + insert job + insert application
      // All happens within the mutation; we just get the response back
      mockMutation.mockResolvedValue(
        makeConvexMarkResponse({
          jobId: "fresh-job-id",
          companyName: "Nutrien",
          jobTitle: "Process Engineer",
          jobLocation: "North America",
          externalJobId: "30186-en_US",
          applications: [
            {
              id: "fresh-app-id",
              appliedAt: 1700000000000,
              resumeVersion: null,
              profileLabel: null,
              notes: null,
              userName: "Alice",
              userEmail: "allowed@example.com",
            },
          ],
        }),
      );

      const response = await POST(
        buildRequest({
          originalUrl:
            "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.jobId).toBe("fresh-job-id");
      expect(body.companyName).toBe("Nutrien");
      expect(body.applications).toHaveLength(1);
      expect(body.applications[0].userEmail).toBe("allowed@example.com");

      // Verify mutation was called with the URL
      expect(mockMutation).toHaveBeenCalledTimes(1);
      const callArgs = mockMutation.mock.calls[0][1];
      expect(callArgs.originalUrl).toBe(
        "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
      );
    });
  });

  // =========================================================================
  // Response does not leak workspaceId
  // =========================================================================

  describe("response shape – no leaks", () => {
    it("does not leak workspaceId or userId", async () => {
      setAuthenticatedUser("allowed@example.com");
      mockMutation.mockResolvedValue(makeConvexMarkResponse());

      const response = await POST(
        buildRequest({
          originalUrl:
            "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
        }),
      );
      const body = await response.json();
      const jsonStr = JSON.stringify(body);

      expect(response.status).toBe(200);
      expect(jsonStr).not.toContain("workspaceId");
    });
  });

  // =========================================================================
  // Convex error handling
  // =========================================================================

  describe("Convex error handling", () => {
    it("returns 500 with error message when Convex mutation fails with generic error", async () => {
      setAuthenticatedUser("allowed@example.com");
      mockMutation.mockRejectedValue(new Error("Convex mutation failed unexpectedly"));

      const response = await POST(
        buildRequest({
          originalUrl:
            "https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/",
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toHaveProperty("error");
    });
  });
});
