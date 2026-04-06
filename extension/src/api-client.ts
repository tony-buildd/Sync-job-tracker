/**
 * Sync Job Tracker – Extension API Client
 *
 * Typed fetch wrapper for calling the Next.js API routes.
 * All calls use credentials: 'include' to attach Clerk session cookies.
 */

import type {
  CheckResponse,
  MarkAppliedRequest,
  MarkAppliedResponse,
  ErrorResponse,
} from "../../shared/extension-api";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_ORIGIN = "http://localhost:3000";
const TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  readonly status: 401;
  constructor(message: string, status: 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export class TimeoutError extends Error {
  constructor(message: string = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout<T>(
  url: string,
  options: RequestInit,
  handler: (response: Response) => Promise<T>,
  timeoutMs: number = TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return await handler(response);
  } catch (err: unknown) {
    clearTimeout(timer);

    if (
      err instanceof AuthError ||
      err instanceof ForbiddenError ||
      err instanceof ApiError ||
      err instanceof TimeoutError
    ) {
      throw err;
    }

    if (err instanceof DOMException && err.name === "AbortError") {
      throw new TimeoutError();
    }

    if (err instanceof TypeError) {
      // fetch throws TypeError for network failures
      throw new NetworkError(err.message || "Network error");
    }

    throw new NetworkError(
      err instanceof Error ? err.message : "Unknown network error"
    );
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    const body = (await response.json().catch(() => ({
      error: "Authentication required",
    }))) as ErrorResponse;
    throw new AuthError(body.error || "Authentication required", 401);
  }

  if (response.status === 403) {
    const body = (await response.json().catch(() => ({
      error: "Not authorized",
    }))) as ErrorResponse;
    throw new ForbiddenError(body.error || "Not authorized");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({
      error: `HTTP ${response.status}`,
    }))) as ErrorResponse;
    throw new ApiError(body.error || `HTTP ${response.status}`, response.status);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check a URL against the job database.
 */
export async function checkUrl(url: string): Promise<CheckResponse> {
  return fetchWithTimeout<CheckResponse>(
    `${API_ORIGIN}/api/extension/check`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ url }),
    },
    (res) => handleResponse<CheckResponse>(res)
  );
}

/**
 * Mark a job as applied.
 */
export async function markApplied(
  data: MarkAppliedRequest
): Promise<MarkAppliedResponse> {
  return fetchWithTimeout<MarkAppliedResponse>(
    `${API_ORIGIN}/api/extension/mark-applied`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    },
    (res) => handleResponse<MarkAppliedResponse>(res)
  );
}
