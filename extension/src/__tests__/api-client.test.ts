/**
 * API Client Tests
 *
 * Tests the typed fetch wrapper for correct request format,
 * typed responses, auth error detection, timeout handling,
 * and network error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkUrl,
  markApplied,
  AuthError,
  ForbiddenError,
  NetworkError,
  TimeoutError,
  ApiError,
} from "../api-client";

import type { CheckResponse, MarkAppliedResponse } from "../../../shared/extension-api";

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// checkUrl
// ---------------------------------------------------------------------------

describe("checkUrl", () => {
  const sampleCheckResponse: CheckResponse = {
    status: "new",
    confidence: "low",
    parsedJob: {
      originalUrl: "https://example.com/job/123",
      companyName: "Example Corp",
      jobTitle: "Engineer",
      jobLocation: "Remote",
      externalJobId: "123",
    },
    matchedJob: null,
    applications: [],
    reasons: ["no_existing_match"],
  };

  it("sends POST with correct URL and credentials: include", async () => {
    mockFetch(async () => jsonResponse(sampleCheckResponse));

    await checkUrl("https://example.com/job/123");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/extension/check");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ url: "https://example.com/job/123" });
  });

  it("returns parsed CheckResponse on success", async () => {
    mockFetch(async () => jsonResponse(sampleCheckResponse));

    const result = await checkUrl("https://example.com/job/123");

    expect(result).toEqual(sampleCheckResponse);
    expect(result.status).toBe("new");
    expect(result.parsedJob.companyName).toBe("Example Corp");
  });

  it("throws AuthError with status 401 on unauthenticated response", async () => {
    mockFetch(async () =>
      jsonResponse({ error: "Authentication required" }, 401)
    );

    try {
      await checkUrl("https://example.com/job/123");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(401);
      expect((err as AuthError).message).toBe("Authentication required");
    }
  });

  it("throws ForbiddenError on 403 response", async () => {
    mockFetch(async () =>
      jsonResponse({ error: "Not authorized" }, 403)
    );

    try {
      await checkUrl("https://example.com/job/123");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as ForbiddenError).message).toBe("Not authorized");
    }
  });

  it("throws ApiError on other HTTP errors (e.g. 400, 500)", async () => {
    mockFetch(async () =>
      jsonResponse({ error: "Bad request" }, 400)
    );

    try {
      await checkUrl("https://example.com/job/123");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(400);
      expect((err as ApiError).message).toBe("Bad request");
    }
  });

  it("throws TimeoutError when request exceeds timeout", async () => {
    // Mock fetch that respects AbortSignal
    mockFetch((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }
      });
    });

    // Use fake timers for this test
    vi.useFakeTimers();
    const promise = checkUrl("https://example.com/job/123");
    await vi.advanceTimersByTimeAsync(11_000);

    try {
      await promise;
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TimeoutError);
      expect((err as TimeoutError).message).toBe("Request timed out");
    }

    vi.useRealTimers();
  });

  it("throws NetworkError on fetch TypeError (e.g. network failure)", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    try {
      await checkUrl("https://example.com/job/123");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(NetworkError);
      expect((err as NetworkError).message).toBe("Failed to fetch");
    }
  });
});

// ---------------------------------------------------------------------------
// markApplied
// ---------------------------------------------------------------------------

describe("markApplied", () => {
  const sampleMarkResponse: MarkAppliedResponse = {
    jobId: "job_123",
    companyName: "Example Corp",
    jobTitle: "Engineer",
    jobLocation: "Remote",
    externalJobId: "123",
    applications: [
      {
        id: "app_1",
        appliedAt: Date.now(),
        resumeVersion: null,
        profileLabel: null,
        notes: null,
        userName: "Test User",
        userEmail: "test@example.com",
      },
    ],
  };

  it("sends POST with correct body and credentials: include", async () => {
    mockFetch(async () => jsonResponse(sampleMarkResponse));

    const requestData = {
      originalUrl: "https://example.com/job/123",
      companyName: "Override Corp",
      resumeVersion: "v2",
    };

    await markApplied(requestData);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/extension/mark-applied");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual(requestData);
  });

  it("returns parsed MarkAppliedResponse on success", async () => {
    mockFetch(async () => jsonResponse(sampleMarkResponse));

    const result = await markApplied({
      originalUrl: "https://example.com/job/123",
    });

    expect(result).toEqual(sampleMarkResponse);
    expect(result.jobId).toBe("job_123");
    expect(result.applications).toHaveLength(1);
  });

  it("throws AuthError on 401", async () => {
    mockFetch(async () =>
      jsonResponse({ error: "Authentication required" }, 401)
    );

    try {
      await markApplied({ originalUrl: "https://example.com/job/123" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
    }
  });

  it("throws ForbiddenError on 403", async () => {
    mockFetch(async () =>
      jsonResponse({ error: "Not authorized" }, 403)
    );

    try {
      await markApplied({ originalUrl: "https://example.com/job/123" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
    }
  });

  it("throws TimeoutError when request exceeds timeout", async () => {
    mockFetch((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }
      });
    });

    vi.useFakeTimers();
    const promise = markApplied({ originalUrl: "https://example.com/job/123" });
    await vi.advanceTimersByTimeAsync(11_000);

    try {
      await promise;
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TimeoutError);
    }

    vi.useRealTimers();
  });

  it("throws NetworkError on network failure", async () => {
    mockFetch(async () => {
      throw new TypeError("Network request failed");
    });

    try {
      await markApplied({ originalUrl: "https://example.com/job/123" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(NetworkError);
    }
  });

  it("throws ApiError on 500 server error", async () => {
    mockFetch(async () =>
      jsonResponse({ error: "Internal server error" }, 500)
    );

    try {
      await markApplied({ originalUrl: "https://example.com/job/123" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(500);
    }
  });
});

// ---------------------------------------------------------------------------
// Error type differentiation
// ---------------------------------------------------------------------------

describe("error type differentiation", () => {
  it("401 and 403 produce different error types", async () => {
    mockFetch(async () =>
      jsonResponse({ error: "Authentication required" }, 401)
    );

    let error401: unknown;
    try {
      await checkUrl("https://example.com/job/1");
    } catch (e) {
      error401 = e;
    }

    mockFetch(async () =>
      jsonResponse({ error: "Not authorized" }, 403)
    );

    let error403: unknown;
    try {
      await checkUrl("https://example.com/job/2");
    } catch (e) {
      error403 = e;
    }

    expect(error401).toBeInstanceOf(AuthError);
    expect(error403).toBeInstanceOf(ForbiddenError);
    expect((error401 as AuthError).status).toBe(401);
    expect((error401 as Error).message).not.toBe((error403 as Error).message);
  });

  it("network errors and timeout errors are different types", async () => {
    // Network error
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });

    let netError: unknown;
    try {
      await checkUrl("https://example.com/job/1");
    } catch (e) {
      netError = e;
    }

    // Timeout error
    mockFetch((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }
      });
    });

    vi.useFakeTimers();
    const promise = checkUrl("https://example.com/job/2");
    await vi.advanceTimersByTimeAsync(11_000);

    let timeoutError: unknown;
    try {
      await promise;
    } catch (e) {
      timeoutError = e;
    }
    vi.useRealTimers();

    expect(netError).toBeInstanceOf(NetworkError);
    expect(timeoutError).toBeInstanceOf(TimeoutError);
    expect(netError).not.toBeInstanceOf(TimeoutError);
    expect(timeoutError).not.toBeInstanceOf(NetworkError);
  });
});

// ---------------------------------------------------------------------------
// Malformed JSON response fallback paths
// ---------------------------------------------------------------------------

describe("handleResponse .catch() fallback for non-JSON bodies", () => {
  function textResponse(body: string, status: number): Response {
    return new Response(body, {
      status,
      headers: { "Content-Type": "text/plain" },
    });
  }

  it("401 with non-JSON body falls back to default AuthError message", async () => {
    mockFetch(async () => textResponse("Unauthorized", 401));

    try {
      await checkUrl("https://example.com/job/123");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(401);
      expect((err as AuthError).message).toBe("Authentication required");
    }
  });

  it("403 with non-JSON body falls back to default ForbiddenError message", async () => {
    mockFetch(async () => textResponse("Forbidden", 403));

    try {
      await checkUrl("https://example.com/job/123");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as ForbiddenError).message).toBe("Not authorized");
    }
  });

  it("non-ok status with non-JSON body falls back to HTTP status ApiError", async () => {
    mockFetch(async () => textResponse("Bad Request", 400));

    try {
      await checkUrl("https://example.com/job/123");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(400);
      expect((err as ApiError).message).toBe("HTTP 400");
    }
  });

  it("500 with HTML error page falls back to HTTP status ApiError", async () => {
    mockFetch(async () =>
      new Response("<html><body>Internal Server Error</body></html>", {
        status: 500,
        headers: { "Content-Type": "text/html" },
      })
    );

    try {
      await markApplied({ originalUrl: "https://example.com/job/123" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(500);
      expect((err as ApiError).message).toBe("HTTP 500");
    }
  });

  it("401 with malformed JSON body falls back to default message", async () => {
    mockFetch(async () =>
      new Response("{{{invalid json", {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );

    try {
      await checkUrl("https://example.com/job/123");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(401);
      expect((err as AuthError).message).toBe("Authentication required");
    }
  });

  it("403 with malformed JSON body falls back to default message", async () => {
    mockFetch(async () =>
      new Response("{not valid json}", {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    );

    try {
      await markApplied({ originalUrl: "https://example.com/job/123" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as ForbiddenError).message).toBe("Not authorized");
    }
  });

  it("non-ok with empty response body falls back to HTTP status", async () => {
    mockFetch(async () => new Response("", { status: 502 }));

    try {
      await checkUrl("https://example.com/job/123");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(502);
      expect((err as ApiError).message).toBe("HTTP 502");
    }
  });
});
