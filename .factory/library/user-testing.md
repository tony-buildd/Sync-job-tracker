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
