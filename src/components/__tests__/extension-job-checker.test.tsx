/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExtensionJobChecker } from "../extension-job-checker";
import type {
  CheckResponse,
  MarkAppliedResponse,
} from "../../../shared/extension-api";

// ---------------------------------------------------------------------------
// Mock lucide-react icons to avoid SVG rendering issues in happy-dom
// ---------------------------------------------------------------------------

vi.mock("lucide-react", () => ({
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="icon-alert-triangle" {...props} />,
  BadgeCheck: (props: Record<string, unknown>) => <span data-testid="icon-badge-check" {...props} />,
  LoaderCircle: (props: Record<string, unknown>) => <span data-testid="icon-loader-circle" {...props} />,
  Search: (props: Record<string, unknown>) => <span data-testid="icon-search" {...props} />,
  ShieldCheck: (props: Record<string, unknown>) => <span data-testid="icon-shield-check" {...props} />,
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  viewerName: "Test User",
  viewerEmail: "test@example.com",
};

function makeCheckResponse(overrides: Partial<CheckResponse> = {}): CheckResponse {
  return {
    status: "new",
    confidence: "low",
    parsedJob: {
      originalUrl: "https://jobs.example.com/posting/12345",
      companyName: "Example Corp",
      jobTitle: "Software Engineer",
      jobLocation: "Remote",
      externalJobId: "12345",
    },
    matchedJob: null,
    applications: [],
    reasons: ["no_existing_match"],
    ...overrides,
  };
}

function makeAlreadyAppliedResponse(): CheckResponse {
  return makeCheckResponse({
    status: "already_applied",
    confidence: "high",
    reasons: ["matched_primary_key"],
    matchedJob: {
      id: "job-id-1",
      companyName: "Example Corp",
      jobTitle: "Software Engineer",
      jobLocation: "Remote",
      externalJobId: "12345",
      sourceUrls: ["https://jobs.example.com/posting/12345"],
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
  });
}

function makePossibleDuplicateResponse(): CheckResponse {
  return makeCheckResponse({
    status: "possible_duplicate",
    confidence: "medium",
    reasons: ["matched_fallback_key"],
    matchedJob: {
      id: "job-id-2",
      companyName: "Example Corp",
      jobTitle: "Software Engineer",
      jobLocation: "Remote",
      externalJobId: null,
      sourceUrls: ["https://jobs.example.com/posting/99"],
    },
    applications: [],
  });
}

function makeUnparseableResponse(): CheckResponse {
  return makeCheckResponse({
    status: "unparseable",
    confidence: "low",
    reasons: ["insufficient_identity_fields"],
    parsedJob: {
      originalUrl: "https://example.com/",
      companyName: null,
      jobTitle: null,
      jobLocation: null,
      externalJobId: null,
    },
    matchedJob: null,
    applications: [],
  });
}

function makeMarkAppliedResponse(): MarkAppliedResponse {
  return {
    jobId: "job-id-new",
    companyName: "Example Corp",
    jobTitle: "Software Engineer",
    jobLocation: "Remote",
    externalJobId: "12345",
    applications: [
      {
        id: "app-id-new",
        appliedAt: Date.now(),
        resumeVersion: null,
        profileLabel: null,
        notes: null,
        userName: "Test User",
        userEmail: "test@example.com",
      },
    ],
  };
}

function mockFetchSuccess(responseData: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(responseData),
  });
}

function mockFetchSequence(responses: Array<{ data: unknown; status?: number }>) {
  const fn = vi.fn();
  for (const resp of responses) {
    const status = resp.status ?? 200;
    fn.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(resp.data),
    });
  }
  return fn;
}

function mockFetchNetworkError() {
  return vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExtensionJobChecker", () => {
  // =========================================================================
  // Auto-trigger check on mount with prefillUrl
  // =========================================================================

  describe("auto-trigger check on mount with prefillUrl", () => {
    it("automatically triggers check when prefillUrl is a valid URL", async () => {
      const checkResponse = makeCheckResponse();
      globalThis.fetch = mockFetchSuccess(checkResponse);

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith("/api/extension/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://jobs.example.com/posting/12345" }),
        });
      });
    });

    it("shows loading state then result after auto-trigger", async () => {
      let resolveCheck!: (value: unknown) => void;
      const fetchPromise = new Promise((resolve) => {
        resolveCheck = resolve;
      });

      globalThis.fetch = vi.fn().mockReturnValue(
        fetchPromise.then((data) => ({
          ok: true,
          status: 200,
          json: () => Promise.resolve(data),
        })),
      );

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      // Loading state should show
      await waitFor(() => {
        expect(screen.getByText("Checking the job link…")).toBeTruthy();
      });

      // Resolve the fetch
      await act(async () => {
        resolveCheck(makeCheckResponse());
      });

      // Result should show after loading — use getAllByText since status label shows in both badge and description area
      await waitFor(() => {
        expect(screen.getAllByText("New job").length).toBeGreaterThan(0);
      });
    });

    it("pre-fills URL input when prefillUrl is provided", async () => {
      globalThis.fetch = mockFetchSuccess(makeCheckResponse());

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      const input = screen.getByPlaceholderText("https://careers.company.com/en/job/...");
      expect((input as HTMLInputElement).value).toBe("https://jobs.example.com/posting/12345");

      // Wait for the auto-triggered fetch to complete
      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });
    });

    it("does NOT auto-trigger when prefillUrl is not provided", () => {
      globalThis.fetch = vi.fn();

      render(<ExtensionJobChecker {...defaultProps} />);

      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("does NOT auto-trigger when prefillUrl is an invalid URL", () => {
      globalThis.fetch = vi.fn();

      render(
        <ExtensionJobChecker {...defaultProps} prefillUrl="not-a-url" />,
      );

      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("only triggers auto-check once (not on re-render)", async () => {
      const checkResponse = makeCheckResponse();
      globalThis.fetch = mockFetchSuccess(checkResponse);

      const { rerender } = render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      });

      // Re-render with same props
      rerender(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      // Should still be only 1 call
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // All result states rendering
  // =========================================================================

  describe("result states rendering", () => {
    it("renders 'New job' state with mark-applied button", async () => {
      globalThis.fetch = mockFetchSuccess(makeCheckResponse());

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getAllByText("New job").length).toBeGreaterThan(0);
      });

      // Company name should appear in the result heading
      expect(screen.getAllByText("Example Corp").length).toBeGreaterThan(0);
      expect(screen.getByText("Mark as applied")).toBeTruthy();
    });

    it("renders 'Already applied' state with application details", async () => {
      globalThis.fetch = mockFetchSuccess(makeAlreadyAppliedResponse());

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getAllByText("Already applied").length).toBeGreaterThan(0);
      });

      // Application info shown
      expect(screen.getByText("Jane Doe")).toBeTruthy();
      expect(screen.getByText("jane@example.com")).toBeTruthy();

      // No mark-applied button for already_applied status
      expect(screen.queryByText("Mark as applied")).toBeNull();
    });

    it("renders 'Possible duplicate' state with mark-applied option", async () => {
      globalThis.fetch = mockFetchSuccess(makePossibleDuplicateResponse());

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getAllByText("Possible duplicate").length).toBeGreaterThan(0);
      });

      // Mark as applied should be available for possible_duplicate
      expect(screen.getByText("Mark as applied")).toBeTruthy();
    });

    it("renders 'Needs manual details' state for unparseable URLs", async () => {
      globalThis.fetch = mockFetchSuccess(makeUnparseableResponse());

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://example.com/"
        />,
      );

      await waitFor(() => {
        expect(screen.getAllByText("Needs manual details").length).toBeGreaterThan(0);
      });

      // Should show mark-applied section with editable fields
      expect(screen.getByText("Mark as applied")).toBeTruthy();
    });

    it("displays parsed fields labels in results", async () => {
      globalThis.fetch = mockFetchSuccess(makeCheckResponse());

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Parsed fields")).toBeTruthy();
      });

      // Check parsed fields labels
      expect(screen.getByText("Company")).toBeTruthy();
      expect(screen.getByText("Title")).toBeTruthy();
      expect(screen.getByText("Location")).toBeTruthy();
      expect(screen.getByText("Job ID")).toBeTruthy();
    });

    it("shows application metadata (resume version, profile label, notes) when present", async () => {
      globalThis.fetch = mockFetchSuccess(makeAlreadyAppliedResponse());

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getAllByText("Already applied").length).toBeGreaterThan(0);
      });

      expect(screen.getByText("Resume version: v2.0")).toBeTruthy();
      expect(screen.getByText("Profile label: Engineering")).toBeTruthy();
      expect(screen.getByText("Notes: Applied via referral")).toBeTruthy();
    });

    it("shows 'No one has saved this job as applied yet' for zero applications", async () => {
      globalThis.fetch = mockFetchSuccess(makeCheckResponse());

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("No one has saved this job as applied yet.")).toBeTruthy();
      });
    });

    it("displays source link URL in results", async () => {
      globalThis.fetch = mockFetchSuccess(makeCheckResponse());

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("https://jobs.example.com/posting/12345")).toBeTruthy();
      });
    });
  });

  // =========================================================================
  // Error handling (network, auth)
  // =========================================================================

  describe("error handling", () => {
    it("shows error message on network failure", async () => {
      globalThis.fetch = mockFetchNetworkError();

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Failed to fetch")).toBeTruthy();
      });
    });

    it("shows error message from API error response (401)", async () => {
      globalThis.fetch = mockFetchSuccess(
        { error: "Authentication required" },
        401,
      );

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Authentication required")).toBeTruthy();
      });
    });

    it("shows error message from API error response (403)", async () => {
      globalThis.fetch = mockFetchSuccess(
        { error: "Access denied: email not in allowlist" },
        403,
      );

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Access denied: email not in allowlist")).toBeTruthy();
      });
    });

    it("shows error message from API error response (500)", async () => {
      globalThis.fetch = mockFetchSuccess(
        { error: "Internal server error" },
        500,
      );

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Internal server error")).toBeTruthy();
      });
    });

    it("shows fallback error when JSON parsing fails on error response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error("Invalid JSON")),
      });

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      // When json() fails, the catch returns { error: "Unknown error" },
      // so the thrown error uses that fallback message
      await waitFor(() => {
        expect(screen.getByText("Unknown error")).toBeTruthy();
      });
    });

    it("disables Check button when URL is not a valid URL format", () => {
      globalThis.fetch = vi.fn();

      render(<ExtensionJobChecker {...defaultProps} prefillUrl="not-a-url" />);

      const button = screen.getByText("Check job");
      expect((button as HTMLButtonElement).disabled).toBe(true);

      // fetch should not have been called
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("clears error when a new successful check is performed", async () => {
      // First call fails, second succeeds
      globalThis.fetch = mockFetchSequence([
        { data: { error: "Server error" }, status: 500 },
        { data: makeCheckResponse(), status: 200 },
      ]);

      const user = userEvent.setup();

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      // Wait for error from auto-trigger
      await waitFor(() => {
        expect(screen.getByText("Server error")).toBeTruthy();
      });

      // Click check again
      const button = screen.getByText("Check job");
      await user.click(button);

      // Error should be cleared, result should show
      await waitFor(() => {
        expect(screen.getAllByText("New job").length).toBeGreaterThan(0);
      });

      expect(screen.queryByText("Server error")).toBeNull();
    });
  });

  // =========================================================================
  // Mark-applied form submission
  // =========================================================================

  describe("mark-applied form submission", () => {
    it("calls mark-applied API with parsed data on button click", async () => {
      const checkResponse = makeCheckResponse();
      const markResponse = makeMarkAppliedResponse();

      globalThis.fetch = mockFetchSequence([
        { data: checkResponse, status: 200 },
        { data: markResponse, status: 200 },
      ]);

      const user = userEvent.setup();

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Mark as applied")).toBeTruthy();
      });

      await user.click(screen.getByText("Mark as applied"));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      });

      const secondCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(secondCall[0]).toBe("/api/extension/mark-applied");
      expect(secondCall[1].method).toBe("POST");

      const body = JSON.parse(secondCall[1].body);
      expect(body.originalUrl).toBe("https://jobs.example.com/posting/12345");
      expect(body.companyName).toBe("Example Corp");
      expect(body.jobTitle).toBe("Software Engineer");
      expect(body.jobLocation).toBe("Remote");
      expect(body.externalJobId).toBe("12345");
    });

    it("shows success message after successful mark-applied", async () => {
      globalThis.fetch = mockFetchSequence([
        { data: makeCheckResponse(), status: 200 },
        { data: makeMarkAppliedResponse(), status: 200 },
      ]);

      const user = userEvent.setup();

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Mark as applied")).toBeTruthy();
      });

      await user.click(screen.getByText("Mark as applied"));

      // After successful mark, the component transitions to "already_applied"
      // status which hides the mark-applied section. The "Already applied" badge
      // serves as the success indicator.
      await waitFor(() => {
        expect(screen.getAllByText("Already applied").length).toBeGreaterThan(0);
      });

      // The mark button should be gone (already_applied hides it)
      expect(screen.queryByText("Mark as applied")).toBeNull();

      // The API should have been called with correct data
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it("transitions to 'Already applied' state after successful mark", async () => {
      globalThis.fetch = mockFetchSequence([
        { data: makeCheckResponse(), status: 200 },
        { data: makeMarkAppliedResponse(), status: 200 },
      ]);

      const user = userEvent.setup();

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getAllByText("New job").length).toBeGreaterThan(0);
      });

      await user.click(screen.getByText("Mark as applied"));

      await waitFor(() => {
        expect(screen.getAllByText("Already applied").length).toBeGreaterThan(0);
      });

      // Mark button should be gone after transition to already_applied
      expect(screen.queryByText("Mark as applied")).toBeNull();
    });

    it("shows save error message on mark-applied API failure", async () => {
      globalThis.fetch = mockFetchSequence([
        { data: makeCheckResponse(), status: 200 },
        { data: { error: "Save failed: insufficient identity fields" }, status: 400 },
      ]);

      const user = userEvent.setup();

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Mark as applied")).toBeTruthy();
      });

      await user.click(screen.getByText("Mark as applied"));

      await waitFor(() => {
        expect(
          screen.getByText("Save failed: insufficient identity fields"),
        ).toBeTruthy();
      });

      // Mark button should still be available for retry
      expect(screen.getByText("Mark as applied")).toBeTruthy();
    });

    it("shows save error on network failure during mark-applied", async () => {
      const fetchFn = vi.fn();
      // First call succeeds (check)
      fetchFn.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(makeCheckResponse()),
      });
      // Second call fails (mark-applied network error)
      fetchFn.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      globalThis.fetch = fetchFn;

      const user = userEvent.setup();

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Mark as applied")).toBeTruthy();
      });

      await user.click(screen.getByText("Mark as applied"));

      await waitFor(() => {
        expect(screen.getByText("Failed to fetch")).toBeTruthy();
      });
    });

    it("disables mark button when save form lacks required fields (unparseable)", async () => {
      globalThis.fetch = mockFetchSuccess(makeUnparseableResponse());

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://example.com/"
        />,
      );

      await waitFor(() => {
        expect(screen.getAllByText("Needs manual details").length).toBeGreaterThan(0);
      });

      const markButton = screen.getByText("Mark as applied");
      expect((markButton as HTMLButtonElement).disabled).toBe(true);

      // Should show helper text about required fields
      expect(
        screen.getByText(
          "To save without a job ID, enter an exact company, title, and location.",
        ),
      ).toBeTruthy();
    });

    it("enables mark button when user fills required fields for unparseable URL", async () => {
      globalThis.fetch = mockFetchSuccess(makeUnparseableResponse());

      const user = userEvent.setup();

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://example.com/"
        />,
      );

      await waitFor(() => {
        expect(screen.getAllByText("Needs manual details").length).toBeGreaterThan(0);
      });

      // Fill in company name and external job ID (primary key path)
      const companyInput = screen.getByPlaceholderText("Company name");
      const jobIdInput = screen.getByPlaceholderText("External job ID");
      await user.type(companyInput, "Google");
      await user.type(jobIdInput, "JOB-123");

      const markButton = screen.getByText("Mark as applied");
      expect((markButton as HTMLButtonElement).disabled).toBe(false);
    });

    it("sends optional metadata fields (resumeVersion, profileLabel, notes)", async () => {
      globalThis.fetch = mockFetchSequence([
        { data: makeCheckResponse(), status: 200 },
        { data: makeMarkAppliedResponse(), status: 200 },
      ]);

      const user = userEvent.setup();

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getAllByText("New job").length).toBeGreaterThan(0);
      });

      // Fill optional fields
      const resumeInput = screen.getByPlaceholderText("Resume version (optional)");
      const profileInput = screen.getByPlaceholderText("Profile label (optional)");
      const notesInput = screen.getByPlaceholderText("Notes (optional)");

      await user.type(resumeInput, "v3.0");
      await user.type(profileInput, "Senior");
      await user.type(notesInput, "Applied via referral");

      await user.click(screen.getByText("Mark as applied"));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      });

      const secondCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
      const body = JSON.parse(secondCall[1].body);
      expect(body.resumeVersion).toBe("v3.0");
      expect(body.profileLabel).toBe("Senior");
      expect(body.notes).toBe("Applied via referral");
    });

    it("sends matchedJobId when a matched job exists (possible duplicate)", async () => {
      const duplicateResponse = makePossibleDuplicateResponse();
      globalThis.fetch = mockFetchSequence([
        { data: duplicateResponse, status: 200 },
        { data: makeMarkAppliedResponse(), status: 200 },
      ]);

      const user = userEvent.setup();

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getAllByText("Possible duplicate").length).toBeGreaterThan(0);
      });

      await user.click(screen.getByText("Mark as applied"));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      });

      const secondCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
      const body = JSON.parse(secondCall[1].body);
      expect(body.matchedJobId).toBe("job-id-2");
    });
  });

  // =========================================================================
  // Loading state transitions
  // =========================================================================

  describe("loading state transitions", () => {
    it("shows loading spinner during check", async () => {
      let resolveCheck!: (value: unknown) => void;
      const fetchPromise = new Promise((resolve) => {
        resolveCheck = resolve;
      });

      globalThis.fetch = vi.fn().mockReturnValue(
        fetchPromise.then((data) => ({
          ok: true,
          status: 200,
          json: () => Promise.resolve(data),
        })),
      );

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      // Loading state
      await waitFor(() => {
        expect(screen.getByText("Checking the job link…")).toBeTruthy();
      });

      // Check job button should show "Checking..." and be disabled
      const button = screen.getByText("Checking...");
      expect((button as HTMLButtonElement).disabled).toBe(true);

      // Resolve the check
      await act(async () => {
        resolveCheck(makeCheckResponse());
      });

      // Loading state should be gone
      await waitFor(() => {
        expect(screen.queryByText("Checking the job link…")).toBeNull();
      });

      // Button should be re-enabled
      expect(screen.getByText("Check job")).toBeTruthy();
    });

    it("shows 'Saving applied job...' during mark-applied", async () => {
      let resolveMarkApplied!: (value: unknown) => void;
      const markPromise = new Promise((resolve) => {
        resolveMarkApplied = resolve;
      });

      const fetchFn = vi.fn();
      // First call: check succeeds immediately
      fetchFn.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(makeCheckResponse()),
      });
      // Second call: mark-applied hangs until resolved
      fetchFn.mockReturnValueOnce(
        markPromise.then((data) => ({
          ok: true,
          status: 200,
          json: () => Promise.resolve(data),
        })),
      );
      globalThis.fetch = fetchFn;

      const user = userEvent.setup();

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Mark as applied")).toBeTruthy();
      });

      await user.click(screen.getByText("Mark as applied"));

      // Should show saving state
      await waitFor(() => {
        expect(screen.getByText("Saving applied job...")).toBeTruthy();
      });

      // The saving button should be disabled
      const savingButton = screen.getByText("Saving applied job...");
      expect((savingButton as HTMLButtonElement).disabled).toBe(true);

      // Resolve the mark-applied call
      await act(async () => {
        resolveMarkApplied(makeMarkAppliedResponse());
      });

      // Should no longer be saving
      await waitFor(() => {
        expect(screen.queryByText("Saving applied job...")).toBeNull();
      });
    });

    it("does not show loading card when result already exists and re-checking", async () => {
      const fetchFn = vi.fn();

      // First call succeeds
      fetchFn.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(makeCheckResponse()),
      });

      // Second call (manual re-check) takes time
      let resolveRecheck!: (value: unknown) => void;
      const recheckPromise = new Promise((resolve) => {
        resolveRecheck = resolve;
      });
      fetchFn.mockReturnValueOnce(
        recheckPromise.then((data) => ({
          ok: true,
          status: 200,
          json: () => Promise.resolve(data),
        })),
      );

      globalThis.fetch = fetchFn;
      const user = userEvent.setup();

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      // Wait for first result
      await waitFor(() => {
        expect(screen.getAllByText("New job").length).toBeGreaterThan(0);
      });

      // Trigger re-check manually
      const checkButton = screen.getByText("Check job");
      await user.click(checkButton);

      // The button should say "Checking..." but the loading card should NOT appear
      await waitFor(() => {
        expect(screen.getByText("Checking...")).toBeTruthy();
      });

      // Loading card should not show when result is already displayed
      expect(screen.queryByText("Checking the job link…")).toBeNull();

      // Resolve
      await act(async () => {
        resolveRecheck(makeCheckResponse());
      });
    });
  });

  // =========================================================================
  // UI without prefillUrl
  // =========================================================================

  describe("no prefillUrl - manual interaction", () => {
    it("shows instructional 'How to use' section when no URL and no result", () => {
      globalThis.fetch = vi.fn();

      render(<ExtensionJobChecker {...defaultProps} />);

      expect(screen.getByText("How to use")).toBeTruthy();
      expect(screen.getByText("Extension fallback")).toBeTruthy();
    });

    it("displays viewer info card", () => {
      globalThis.fetch = vi.fn();

      render(<ExtensionJobChecker {...defaultProps} />);

      expect(screen.getAllByText("Test User").length).toBeGreaterThan(0);
      expect(screen.getAllByText("test@example.com").length).toBeGreaterThan(0);
    });

    it("allows manual URL input and check submission", async () => {
      globalThis.fetch = mockFetchSuccess(makeCheckResponse());
      const user = userEvent.setup();

      render(<ExtensionJobChecker {...defaultProps} />);

      const input = screen.getByPlaceholderText("https://careers.company.com/en/job/...");
      await user.type(input, "https://jobs.example.com/posting/12345");

      const button = screen.getByText("Check job");
      expect((button as HTMLButtonElement).disabled).toBe(false);

      await user.click(button);

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith("/api/extension/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://jobs.example.com/posting/12345" }),
        });
      });

      await waitFor(() => {
        expect(screen.getAllByText("New job").length).toBeGreaterThan(0);
      });
    });

    it("disables Check button when URL is empty", () => {
      globalThis.fetch = vi.fn();

      render(<ExtensionJobChecker {...defaultProps} />);

      const button = screen.getByText("Check job");
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });

    it("hides instruction section after check result is displayed", async () => {
      globalThis.fetch = mockFetchSuccess(makeCheckResponse());
      const user = userEvent.setup();

      render(<ExtensionJobChecker {...defaultProps} />);

      expect(screen.getByText("How to use")).toBeTruthy();

      const input = screen.getByPlaceholderText("https://careers.company.com/en/job/...");
      await user.type(input, "https://jobs.example.com/posting/12345");
      await user.click(screen.getByText("Check job"));

      await waitFor(() => {
        expect(screen.getAllByText("New job").length).toBeGreaterThan(0);
      });

      // Instruction section should be gone
      expect(screen.queryByText("How to use")).toBeNull();
    });
  });

  // =========================================================================
  // Form field editing
  // =========================================================================

  describe("save form field editing", () => {
    it("allows editing company name in save form", async () => {
      globalThis.fetch = mockFetchSequence([
        { data: makeCheckResponse(), status: 200 },
        { data: makeMarkAppliedResponse(), status: 200 },
      ]);

      const user = userEvent.setup();

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getAllByText("New job").length).toBeGreaterThan(0);
      });

      const companyInput = screen.getByPlaceholderText("Company name") as HTMLInputElement;
      expect(companyInput.value).toBe("Example Corp");

      // Clear and type new value
      await user.clear(companyInput);
      await user.type(companyInput, "New Company");

      await user.click(screen.getByText("Mark as applied"));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      });

      const body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body,
      );
      expect(body.companyName).toBe("New Company");
    });

    it("trims empty fields to undefined in mark-applied request", async () => {
      // Response with minimal parsed data
      const checkResponse = makeCheckResponse({
        parsedJob: {
          originalUrl: "https://jobs.example.com/posting/12345",
          companyName: "Example Corp",
          jobTitle: null,
          jobLocation: null,
          externalJobId: "12345",
        },
      });

      globalThis.fetch = mockFetchSequence([
        { data: checkResponse, status: 200 },
        { data: makeMarkAppliedResponse(), status: 200 },
      ]);

      const user = userEvent.setup();

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      await waitFor(() => {
        expect(screen.getAllByText("New job").length).toBeGreaterThan(0);
      });

      await user.click(screen.getByText("Mark as applied"));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      });

      const body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body,
      );
      // Empty strings should be trimmed to undefined
      expect(body.jobTitle).toBeUndefined();
      expect(body.jobLocation).toBeUndefined();
    });
  });

  // =========================================================================
  // Prefill URL description text variations
  // =========================================================================

  describe("description text", () => {
    it("shows prefill description when prefillUrl is provided", async () => {
      globalThis.fetch = mockFetchSuccess(makeCheckResponse());

      render(
        <ExtensionJobChecker
          {...defaultProps}
          prefillUrl="https://jobs.example.com/posting/12345"
        />,
      );

      expect(
        screen.getByText(
          "The URL has been pre-filled from the extension. The check runs automatically.",
        ),
      ).toBeTruthy();

      // Wait for fetch to complete to avoid act warnings
      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });
    });

    it("shows manual description when prefillUrl is not provided", () => {
      globalThis.fetch = vi.fn();

      render(<ExtensionJobChecker {...defaultProps} />);

      expect(
        screen.getByText(
          "Paste a job URL below to check whether someone already applied.",
        ),
      ).toBeTruthy();
    });
  });
});
