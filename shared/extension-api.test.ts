import { describe, it, expect } from "vitest";
import {
  checkRequestSchema,
  markAppliedRequestSchema,
  type CheckResponse,
  type MarkAppliedResponse,
  type ErrorResponse,
  type ExtensionParsedJob,
  type MatchedJob,
  type ApplicationSummary,
} from "./extension-api";

describe("checkRequestSchema", () => {
  it("accepts a valid URL", () => {
    const result = checkRequestSchema.safeParse({
      url: "https://jobs.example.com/posting/12345",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe("https://jobs.example.com/posting/12345");
    }
  });

  it("rejects an empty string", () => {
    const result = checkRequestSchema.safeParse({ url: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-URL string", () => {
    const result = checkRequestSchema.safeParse({ url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing url field", () => {
    const result = checkRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a non-string url", () => {
    const result = checkRequestSchema.safeParse({ url: 12345 });
    expect(result.success).toBe(false);
  });

  it("accepts a URL with query params and fragments", () => {
    const result = checkRequestSchema.safeParse({
      url: "https://jobs.example.com/posting/12345?utm_source=LinkedIn&ref=abc#section",
    });
    expect(result.success).toBe(true);
  });
});

describe("markAppliedRequestSchema", () => {
  it("accepts a minimal request with just originalUrl", () => {
    const result = markAppliedRequestSchema.safeParse({
      originalUrl: "https://jobs.example.com/posting/12345",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.originalUrl).toBe(
        "https://jobs.example.com/posting/12345",
      );
    }
  });

  it("accepts a request with all optional fields", () => {
    const result = markAppliedRequestSchema.safeParse({
      originalUrl: "https://jobs.example.com/posting/12345",
      companyName: "Acme Corp",
      jobTitle: "Software Engineer",
      jobLocation: "San Francisco, CA",
      externalJobId: "12345",
      matchedJobId: "abc123",
      resumeVersion: "v2.1",
      profileLabel: "Frontend",
      notes: "Applied via referral",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companyName).toBe("Acme Corp");
      expect(result.data.resumeVersion).toBe("v2.1");
    }
  });

  it("rejects an empty originalUrl", () => {
    const result = markAppliedRequestSchema.safeParse({ originalUrl: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-URL originalUrl", () => {
    const result = markAppliedRequestSchema.safeParse({
      originalUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing originalUrl", () => {
    const result = markAppliedRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a missing body entirely", () => {
    const result = markAppliedRequestSchema.safeParse(undefined);
    expect(result.success).toBe(false);
  });
});

describe("extension API type shapes", () => {
  it("ExtensionParsedJob has exactly the public fields (no internal fields)", () => {
    const parsedJob: ExtensionParsedJob = {
      originalUrl: "https://example.com/job/123",
      companyName: "Example",
      jobTitle: "Engineer",
      jobLocation: "Remote",
      externalJobId: "123",
    };

    // Verify all expected fields are present
    expect(parsedJob).toHaveProperty("originalUrl");
    expect(parsedJob).toHaveProperty("companyName");
    expect(parsedJob).toHaveProperty("jobTitle");
    expect(parsedJob).toHaveProperty("jobLocation");
    expect(parsedJob).toHaveProperty("externalJobId");

    // Verify no internal fields exist
    expect(parsedJob).not.toHaveProperty("normalizedCompany");
    expect(parsedJob).not.toHaveProperty("normalizedTitle");
    expect(parsedJob).not.toHaveProperty("normalizedLocation");
    expect(parsedJob).not.toHaveProperty("primaryCanonicalKey");
    expect(parsedJob).not.toHaveProperty("fallbackCanonicalKey");
  });

  it("CheckResponse has correct shape", () => {
    const response: CheckResponse = {
      status: "new",
      confidence: "low",
      parsedJob: {
        originalUrl: "https://example.com/job/123",
        companyName: "Example",
        jobTitle: "Engineer",
        jobLocation: "Remote",
        externalJobId: "123",
      },
      matchedJob: null,
      applications: [],
      reasons: ["no_existing_match"],
    };

    expect(response.status).toBe("new");
    expect(response.confidence).toBe("low");
    expect(response.parsedJob.originalUrl).toBe("https://example.com/job/123");
    expect(response.matchedJob).toBeNull();
    expect(response.applications).toEqual([]);
    expect(response.reasons).toContain("no_existing_match");
  });

  it("CheckResponse with matchedJob and applications has correct shape", () => {
    const response: CheckResponse = {
      status: "already_applied",
      confidence: "high",
      parsedJob: {
        originalUrl: "https://example.com/job/123",
        companyName: "Example",
        jobTitle: "Engineer",
        jobLocation: "Remote",
        externalJobId: "123",
      },
      matchedJob: {
        id: "job-id-1",
        companyName: "Example",
        jobTitle: "Engineer",
        jobLocation: "Remote",
        externalJobId: "123",
        sourceUrls: ["https://example.com/job/123"],
      },
      applications: [
        {
          id: "app-id-1",
          appliedAt: 1700000000000,
          resumeVersion: "v2.0",
          profileLabel: "Frontend",
          notes: "Referral from John",
          userName: "Jane Doe",
          userEmail: "jane@example.com",
        },
      ],
      reasons: ["matched_primary_key"],
    };

    expect(response.status).toBe("already_applied");
    expect(response.matchedJob).not.toBeNull();
    expect(response.matchedJob!.id).toBe("job-id-1");
    expect(response.applications).toHaveLength(1);
    expect(response.applications[0].userName).toBe("Jane Doe");
  });

  it("MarkAppliedResponse has correct shape", () => {
    const response: MarkAppliedResponse = {
      jobId: "job-id-1",
      companyName: "Acme Corp",
      jobTitle: "Software Engineer",
      jobLocation: "San Francisco, CA",
      externalJobId: "12345",
      applications: [
        {
          id: "app-id-1",
          appliedAt: 1700000000000,
          resumeVersion: null,
          profileLabel: null,
          notes: null,
          userName: "Alice",
          userEmail: "alice@example.com",
        },
      ],
    };

    expect(response.jobId).toBe("job-id-1");
    expect(response.companyName).toBe("Acme Corp");
    expect(response.applications).toHaveLength(1);
  });

  it("ErrorResponse has correct shape", () => {
    const response: ErrorResponse = {
      error: "Authentication required",
    };

    expect(response.error).toBe("Authentication required");
    expect(Object.keys(response)).toEqual(["error"]);
  });

  it("MatchedJob type has all expected fields", () => {
    const matched: MatchedJob = {
      id: "job-id-1",
      companyName: "Test Corp",
      jobTitle: null,
      jobLocation: null,
      externalJobId: null,
      sourceUrls: [],
    };

    expect(matched).toHaveProperty("id");
    expect(matched).toHaveProperty("companyName");
    expect(matched).toHaveProperty("jobTitle");
    expect(matched).toHaveProperty("jobLocation");
    expect(matched).toHaveProperty("externalJobId");
    expect(matched).toHaveProperty("sourceUrls");
  });

  it("ApplicationSummary type has all expected fields", () => {
    const summary: ApplicationSummary = {
      id: "app-1",
      appliedAt: Date.now(),
      resumeVersion: "v1",
      profileLabel: "Backend",
      notes: "Applied online",
      userName: "Bob",
      userEmail: "bob@example.com",
    };

    expect(summary).toHaveProperty("id");
    expect(summary).toHaveProperty("appliedAt");
    expect(summary).toHaveProperty("resumeVersion");
    expect(summary).toHaveProperty("profileLabel");
    expect(summary).toHaveProperty("notes");
    expect(summary).toHaveProperty("userName");
    expect(summary).toHaveProperty("userEmail");
  });
});
