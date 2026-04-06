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

**Known Issue (api-layer round 1):**
- Dev server returns 500 on all pages due to Clerk error: "clerkMiddleware() was not run, your middleware or proxy file might be misplaced. Move your middleware or proxy file to ./src/middleware.ts. Currently located at ./middleware.ts"
- This blocks ALL agent-browser testing. The middleware file is at `./middleware.ts` (project root) but Clerk 7.0.7 expects it at `./src/middleware.ts`.
- AGENTS.md marks middleware.ts as off-limits, so this cannot be fixed by workers.
- Workaround: Fall back to vitest server component tests which mock Clerk auth.
