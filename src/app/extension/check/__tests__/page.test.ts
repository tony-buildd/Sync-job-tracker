import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — Clerk
// ---------------------------------------------------------------------------

const mockCurrentUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  currentUser: () => mockCurrentUser(),
}));

vi.mock("../sign-in-prompt-button", () => ({
  SignInPromptButton: ({ redirectUrl }: { redirectUrl: string }) => ({
    $$type: "SignInPromptButton",
    redirectUrl,
  }),
}));

// Mock the ExtensionJobChecker so it doesn't need DOM or React hooks
vi.mock("@/components/extension-job-checker", () => ({
  ExtensionJobChecker: (props: Record<string, unknown>) => ({
    $$type: "ExtensionJobChecker",
    ...props,
  }),
}));

// ---------------------------------------------------------------------------
// Import the page handler AFTER mocks
// ---------------------------------------------------------------------------

import ExtensionCheckPage from "../page";

// ---------------------------------------------------------------------------
// Helpers for inspecting React element trees
// ---------------------------------------------------------------------------

type ReactElement = {
  $$typeof?: symbol;
  type?: string | ((...args: unknown[]) => unknown);
  props?: Record<string, unknown>;
  _owner?: unknown;
};

function makeSearchParams(
  params: Record<string, string | string[] | undefined> = {},
): Promise<Record<string, string | string[] | undefined>> {
  return Promise.resolve(params);
}

function makeUser(overrides: {
  email?: string;
  firstName?: string | null;
  fullName?: string | null;
} = {}) {
  const email = overrides.email ?? "allowed@example.com";
  return {
    id: "user_123",
    primaryEmailAddress: { emailAddress: email },
    emailAddresses: [{ emailAddress: email }],
    firstName: overrides.firstName === undefined ? "Test" : overrides.firstName,
    fullName: overrides.fullName === undefined ? "Test User" : overrides.fullName,
  };
}

/**
 * Gets the function name of the React element's type (for locally-defined components).
 * For server components that return function references, the type is the function itself.
 */
function getElementTypeName(el: ReactElement): string {
  if (typeof el.type === "function") return el.type.name || "anonymous";
  if (typeof el.type === "string") return el.type;
  return "unknown";
}

/**
 * Find a child element by its type function name within the tree.
 * Returns the element (with type and props) if found.
 */
function findChildByType(node: unknown, typeName: string): ReactElement | null {
  if (!node || typeof node !== "object") return null;

  const el = node as ReactElement;
  if (getElementTypeName(el) === typeName) return el;

  if (el.props) {
    for (const value of Object.values(el.props)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = findChildByType(item, typeName);
          if (found) return found;
        }
      } else if (typeof value === "object" && value !== null) {
        const found = findChildByType(value, typeName);
        if (found) return found;
      }
    }
  }
  return null;
}

/**
 * Serializes the tree to string for text content checks.
 * Handles circular references by tracking visited objects.
 */
function serializeTree(tree: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(tree, (_key, value) => {
    if (typeof value === "symbol") return value.toString();
    if (typeof value === "function") return `[Function:${value.name || "anonymous"}]`;
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.ALLOWED_EMAILS = "allowed@example.com,other@example.com";
  mockCurrentUser.mockReset();
});

describe("GET /extension/check page", () => {
  // =========================================================================
  // VAL-FALLBACK-002: Signed-out user sees sign-in prompt
  // =========================================================================

  describe("signed-out user", () => {
    it("renders SignInPrompt when user is not authenticated", async () => {
      mockCurrentUser.mockResolvedValue(null);
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: "https://jobs.example.com/posting/123" }),
      }) as ReactElement;

      // The page returns a SignInPrompt function component element
      expect(getElementTypeName(tree)).toBe("SignInPrompt");
    });

    it("passes URL to SignInPrompt for redirect preservation", async () => {
      mockCurrentUser.mockResolvedValue(null);
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: "https://jobs.example.com/posting/123" }),
      }) as ReactElement;

      expect(tree.props?.url).toBe("https://jobs.example.com/posting/123");
    });

    it("renders SignInPrompt without URL when param is missing", async () => {
      mockCurrentUser.mockResolvedValue(null);
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({}),
      }) as ReactElement;

      expect(getElementTypeName(tree)).toBe("SignInPrompt");
      expect(tree.props?.url).toBeUndefined();
    });

    it("does not render ExtensionJobChecker for signed-out users", async () => {
      mockCurrentUser.mockResolvedValue(null);
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: "https://jobs.example.com/posting/123" }),
      });

      const checker = findChildByType(tree, "ExtensionJobChecker");
      expect(checker).toBeNull();
    });
  });

  // =========================================================================
  // VAL-FALLBACK-004 precondition: Signed-in non-allowlisted user sees access denied
  // =========================================================================

  describe("signed-in but not allowlisted user", () => {
    it("renders AccessDenied for non-allowlisted email", async () => {
      mockCurrentUser.mockResolvedValue(
        makeUser({ email: "notallowed@example.com" }),
      );
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: "https://jobs.example.com/posting/123" }),
      }) as ReactElement;

      expect(getElementTypeName(tree)).toBe("AccessDenied");
    });

    it("passes email to AccessDenied component", async () => {
      mockCurrentUser.mockResolvedValue(
        makeUser({ email: "notallowed@example.com" }),
      );
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: "https://jobs.example.com/posting/123" }),
      }) as ReactElement;

      expect(tree.props?.email).toBe("notallowed@example.com");
    });

    it("does not render ExtensionJobChecker for non-allowlisted users", async () => {
      mockCurrentUser.mockResolvedValue(
        makeUser({ email: "notallowed@example.com" }),
      );
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: "https://jobs.example.com/posting/123" }),
      });

      const checker = findChildByType(tree, "ExtensionJobChecker");
      expect(checker).toBeNull();
    });
  });

  // =========================================================================
  // VAL-FALLBACK-001: Signed-in allowlisted user with valid URL
  // =========================================================================

  describe("signed-in allowlisted user with valid URL", () => {
    it("renders main layout with ExtensionJobChecker", async () => {
      mockCurrentUser.mockResolvedValue(makeUser());
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: "https://jobs.example.com/posting/123" }),
      }) as ReactElement;

      // Top-level element is <main>
      expect(getElementTypeName(tree)).toBe("main");

      // ExtensionJobChecker is rendered as a child
      const checker = findChildByType(tree, "ExtensionJobChecker");
      expect(checker).not.toBeNull();
    });

    it("passes prefillUrl to ExtensionJobChecker", async () => {
      mockCurrentUser.mockResolvedValue(makeUser());
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: "https://jobs.example.com/posting/123" }),
      });

      const checker = findChildByType(tree, "ExtensionJobChecker");
      expect(checker).not.toBeNull();
      expect(checker!.props?.prefillUrl).toBe("https://jobs.example.com/posting/123");
    });

    it("passes viewerEmail to ExtensionJobChecker", async () => {
      mockCurrentUser.mockResolvedValue(makeUser());
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: "https://jobs.example.com/posting/123" }),
      });

      const checker = findChildByType(tree, "ExtensionJobChecker");
      expect(checker).not.toBeNull();
      expect(checker!.props?.viewerEmail).toBe("allowed@example.com");
    });

    it("passes viewer name from user firstName", async () => {
      mockCurrentUser.mockResolvedValue(
        makeUser({ firstName: "Alice", fullName: "Alice Smith" }),
      );
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: "https://jobs.example.com/posting/123" }),
      });

      const checker = findChildByType(tree, "ExtensionJobChecker");
      expect(checker).not.toBeNull();
      expect(checker!.props?.viewerName).toBe("Alice");
    });

    it("falls back to fullName when firstName is null", async () => {
      mockCurrentUser.mockResolvedValue(
        makeUser({ firstName: null, fullName: "Full Name User" }),
      );
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: "https://jobs.example.com/posting/123" }),
      });

      const checker = findChildByType(tree, "ExtensionJobChecker");
      expect(checker).not.toBeNull();
      expect(checker!.props?.viewerName).toBe("Full Name User");
    });

    it("falls back to email when firstName and fullName are null", async () => {
      mockCurrentUser.mockResolvedValue(
        makeUser({ firstName: null, fullName: null }),
      );
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: "https://jobs.example.com/posting/123" }),
      });

      const checker = findChildByType(tree, "ExtensionJobChecker");
      expect(checker).not.toBeNull();
      expect(checker!.props?.viewerName).toBe("allowed@example.com");
    });

    it("includes header with extension check text", async () => {
      mockCurrentUser.mockResolvedValue(makeUser());
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: "https://jobs.example.com/posting/123" }),
      });

      expect(serializeTree(tree)).toContain("Extension check");
    });

    it("includes a link back to the main app", async () => {
      mockCurrentUser.mockResolvedValue(makeUser());
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: "https://jobs.example.com/posting/123" }),
      });

      expect(serializeTree(tree)).toContain("Open main app");
    });
  });

  // =========================================================================
  // VAL-FALLBACK-006: Missing or invalid URL parameter
  // =========================================================================

  describe("missing or invalid URL parameter", () => {
    it("renders without crash when URL parameter is missing", async () => {
      mockCurrentUser.mockResolvedValue(makeUser());
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({}),
      });

      const checker = findChildByType(tree, "ExtensionJobChecker");
      expect(checker).not.toBeNull();
      expect(checker!.props?.prefillUrl).toBeUndefined();
    });

    it("renders without crash when URL is not-a-url (treats as missing)", async () => {
      mockCurrentUser.mockResolvedValue(makeUser());
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: "not-a-url" }),
      });

      const checker = findChildByType(tree, "ExtensionJobChecker");
      expect(checker).not.toBeNull();
      // Invalid URL treated as missing — no prefill
      expect(checker!.props?.prefillUrl).toBeUndefined();
    });

    it("renders without crash when URL parameter is empty string", async () => {
      mockCurrentUser.mockResolvedValue(makeUser());
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: "" }),
      });

      const checker = findChildByType(tree, "ExtensionJobChecker");
      expect(checker).not.toBeNull();
      expect(checker!.props?.prefillUrl).toBeUndefined();
    });

    it("renders without crash when URL parameter is an array (non-string)", async () => {
      mockCurrentUser.mockResolvedValue(makeUser());
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: ["https://a.com", "https://b.com"] }),
      });

      // Array params should be handled gracefully (typeof !== "string")
      const checker = findChildByType(tree, "ExtensionJobChecker");
      expect(checker).not.toBeNull();
      expect(checker!.props?.prefillUrl).toBeUndefined();
    });

    it("does not crash on completely missing searchParams keys", async () => {
      mockCurrentUser.mockResolvedValue(makeUser());
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({}),
      });

      expect(tree).toBeTruthy();
      const checker = findChildByType(tree, "ExtensionJobChecker");
      expect(checker).not.toBeNull();
    });
  });

  // =========================================================================
  // URL encoding round-trip
  // =========================================================================

  describe("URL encoding", () => {
    it("preserves complex URLs with query params and fragments", async () => {
      mockCurrentUser.mockResolvedValue(makeUser());
      const complexUrl =
        "https://jobs.nutrien.com/North-America/job/30186-en_US/?utm_source=LinkedIn&ref=abc#section";
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: complexUrl }),
      });

      const checker = findChildByType(tree, "ExtensionJobChecker");
      expect(checker).not.toBeNull();
      expect(checker!.props?.prefillUrl).toBe(complexUrl);
    });

    it("preserves URLs with encoded characters", async () => {
      mockCurrentUser.mockResolvedValue(makeUser());
      const specialUrl = "https://jobs.example.com/posting/123?q=hello%20world&lang=en";
      const tree = await ExtensionCheckPage({
        searchParams: makeSearchParams({ url: specialUrl }),
      });

      const checker = findChildByType(tree, "ExtensionJobChecker");
      expect(checker).not.toBeNull();
      expect(checker!.props?.prefillUrl).toBe(specialUrl);
    });
  });
});
