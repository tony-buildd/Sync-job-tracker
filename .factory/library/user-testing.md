# User Testing

Testing surface discovery, required tools, and resource cost classification.

---

## Validation Surface

### Surface 1: API Routes (automated)
- **What:** POST /api/extension/check, POST /api/extension/mark-applied
- **Tool:** vitest (unit tests with mocked auth/Convex) + curl (integration with running dev server)
- **Setup:** Dev server on port 3000, Convex dev running
- **Auth:** Requires signed-in Clerk session or mocked auth context

### Surface 2: Web Fallback Page (semi-automated)
- **What:** GET /extension/check?url=...
- **Tool:** agent-browser or manual browser navigation
- **Setup:** Dev server on port 3000
- **Auth:** Tests both signed-in and signed-out states

### Surface 3: Chrome Extension (manual)
- **What:** Extension popup, background service worker, keyboard shortcut
- **Tool:** Manual testing by user (load unpacked extension in Chrome)
- **Setup:** Build extension (`cd extension && npm run build`), load unpacked from `extension/dist/`
- **Auth:** User must be signed into the web app at localhost:3000
- **Note:** Chrome extension testing cannot be automated with agent-browser or curl

## Validation Concurrency

**Machine specs:** 24GB RAM, 12 CPU cores
**Baseline usage:** ~6GB RAM used by system processes

### API Routes surface
- Each vitest instance: ~100MB RAM
- Dev server: ~300MB RAM
- **Max concurrent validators: 5** (total ~800MB, well within budget)

### Web Fallback surface
- agent-browser instance: ~300MB RAM
- Dev server: shared with API surface
- **Max concurrent validators: 5** (total ~1.8GB, within budget)

### Chrome Extension surface
- Manual only, no concurrent validators
- **Max concurrent validators: 1** (manual)

## Flow Validator Guidance: vitest

Vitest tests validate API route behavior through unit tests with mocked Clerk auth and ConvexHttpClient. Each test is completely isolated — no shared state or concurrency concerns.

**Isolation rules:**
- Each test file uses `vi.mock()` to mock external deps (Clerk, Convex)
- Tests reset mocks via `beforeEach`
- No shared database, filesystem, or network state
- Multiple vitest runs can safely execute in parallel

**Running tests:**
- `cd /Users/minhthiennguyen/Desktop/job-tracker && npm test` runs all tests
- Each test file name pattern maps to specific assertions (see test files for `VAL-*` comments)

**Mapping test files to assertions:**
- `src/app/api/extension/check/__tests__/route.test.ts` → VAL-CHECK-001 through VAL-CHECK-010, VAL-CROSS-006
- `src/app/api/extension/mark-applied/__tests__/route.test.ts` → VAL-MARK-001 through VAL-MARK-011, VAL-CROSS-007
- `src/app/extension/check/__tests__/page.test.ts` → VAL-FALLBACK-001 through VAL-FALLBACK-006 (server-side rendering)

## Flow Validator Guidance: agent-browser

Agent-browser tests validate the web fallback page through real browser interaction.

**Isolation rules:**
- Each agent-browser session uses a unique session ID
- Agent-browser opens real pages against a running Next.js dev server on port 3000
- Clerk auth state is per-browser session

**Prerequisites:**
- Next.js dev server must be running on port 3000
- Convex dev must be connected (for API routes to function)
- Test scenarios that need authentication require Clerk sign-in

**Constraints:**
- agent-browser can navigate to pages and inspect elements
- Signing into Clerk via agent-browser may not be feasible without stored credentials
- For signed-out assertions (VAL-FALLBACK-002), agent-browser can verify without auth
- For signed-in assertions (VAL-FALLBACK-001, 003, 004, 005), Clerk auth is required

**Resolved Issue (api-layer round 1 → round 2):**
- ~~Dev server returns 500 on all pages due to Clerk error: "clerkMiddleware() was not run"~~
- FIXED: middleware.ts moved from project root to src/middleware.ts (commit 244b9f5). Dev server now returns 200 on all pages.

**Known Issue (api-layer round 2):**
- Clerk development/keyless mode authentication is blocked by Cloudflare Turnstile CAPTCHA in headless/automated browsers.
- The Turnstile widget detects the automated browser environment, returns error 300030, and hangs indefinitely.
- Sign-up fails with HTTP 400 because the CAPTCHA token is never generated.
- No pre-existing test user account exists in the Clerk development instance.
- This blocks all agent-browser assertions requiring authenticated state (VAL-FALLBACK-001, VAL-FALLBACK-003, VAL-FALLBACK-004).
- Workaround: Server-side rendering verified via vitest (component receives correct props). Client-side behavior (auto-check, result rendering, mark-applied button) cannot be verified without authenticated browser session.
- Potential fix: Pre-create a test user in Clerk dashboard, or configure Clerk to bypass Turnstile in test environments.

## Flow Validator Guidance: manual (Chrome Extension)

Chrome extension popup, service worker, and keyboard shortcuts require loading the extension as unpacked in Chrome (`chrome://extensions`). These cannot be automated with agent-browser or curl.

**What can be code-verified (without Chrome):**
- VAL-EXT-001: manifest.json inspection confirms MV3, minimal permissions, commands section
- VAL-EXT-002: popup.html inspection confirms no inline scripts, `<script src="popup.js" type="module">`
- VAL-EXT-004: Build command succeeds, dist/ contains all required files
- VAL-EXT-005: api-client.ts code inspection confirms `credentials: 'include'` and correct origin
- VAL-EXT-007: api-client.ts has TIMEOUT_MS = 10000 and TimeoutError handling

**What requires real Chrome interaction:**
- VAL-EXT-003: Keyboard shortcut behavior
- VAL-EXT-006: chrome.storage.local caching behavior
- All VAL-POPUP-* assertions: Popup UI state rendering
- All VAL-CROSS-* assertions: Full flow interactions

**Isolation:** Manual testing has no concurrency concerns — single user in Chrome.
