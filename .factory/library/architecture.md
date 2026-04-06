# Chrome Extension V1 — Architecture

## 1. System Overview

### What exists today

A **Next.js web app** that lets members of a shared household paste job URLs and check whether anyone has already applied. The stack:

- **Next.js** — Server-rendered pages, Clerk middleware for auth
- **Clerk** — Google OAuth, session cookies, JWT issuance
- **Convex** — Backend-as-a-service for data storage, queries, mutations, and actions
- **shared/** — Pure-TypeScript matching and access logic, imported by both the web app and Convex functions

The web app exposes a single page (`/`) with a `JobChecker` component. Users paste a URL, the app calls a Convex action (`checkUrl`) to match against known jobs, and optionally calls a Convex mutation (`markApplied`) to persist an application record.

### What's being added

A **Chrome Manifest V3 extension** that acts as a thin capture layer on top of the existing backend. It reads the active tab URL, checks it via new Next.js API routes, and lets the user mark it as applied — all without leaving the job listing page.

New pieces:

| Component | Location | Purpose |
|---|---|---|
| Extension package | `extension/` | Popup UI, background worker, API client |
| API routes | `src/app/api/extension/` | Authenticated HTTP bridge to Convex |
| Web fallback page | `src/app/extension/` | Prefilled check UI for signed-out users |
| Shared API types | `shared/` | Request/response schemas shared by routes and extension |

No new Convex functions are introduced. The API routes proxy to existing `checkUrl` and `markApplied`.

---

## 2. Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      Chrome Browser                      │
│                                                          │
│  ┌──────────────┐    Clerk session cookie                │
│  │  Extension    │─────────────────────────┐             │
│  │  (popup +     │                         │             │
│  │   background) │                         ▼             │
│  └──────────────┘              ┌───────────────────────┐ │
│                                │   Next.js App         │ │
│  ┌──────────────┐              │                       │ │
│  │  Web UI      │◄────────────►│  /api/extension/check │ │
│  │  (/)         │   Convex     │  /api/extension/      │ │
│  │  JobChecker  │   React SDK  │     mark-applied      │ │
│  └──────────────┘              │  /extension/check     │ │
│                                │     (fallback page)   │ │
│                                └───────────┬───────────┘ │
└────────────────────────────────────────────┼─────────────┘
                                             │
                                 ConvexHttpClient (server-side)
                                             │
                                             ▼
                                ┌────────────────────────┐
                                │   Convex Backend       │
                                │                        │
                                │  checkUrl    (action)  │
                                │  markApplied (mutation) │
                                │                        │
                                │  Tables:               │
                                │   workspaces           │
                                │   users                │
                                │   jobs                 │
                                │   applications         │
                                └────────────────────────┘
```

Key relationships:

- The **web UI** talks to Convex directly via the Convex React SDK + Clerk JWT.
- The **extension** talks to Convex indirectly through Next.js API routes + Clerk session cookie.
- Both paths hit the same Convex functions and the same data.

---

## 3. Data Flow: Check URL

```
Extension popup                Next.js API route             Convex
─────────────                  ─────────────────             ──────

1. reads active tab URL
2. POST /api/extension/check
   { url }
   (credentials: include)
          ───────────────────►
                               3. Clerk middleware validates
                                  session cookie → identity
                               4. Checks email against
                                  ALLOWED_EMAILS
                               5. ConvexHttpClient.action(
                                    "jobs:checkUrl", { url })
                                          ──────────────────►
                                                              6. parseJobUrl(url)
                                                              7. Primary key lookup
                                                              8. Fallback key lookup
                                                              9. Return status + match
                                          ◄──────────────────
                               10. Return JSON response
          ◄───────────────────
11. Render result in popup
```

Response statuses: `already_applied` | `possible_duplicate` | `new` | `unparseable`

---

## 4. Data Flow: Mark Applied

```
Extension popup                Next.js API route             Convex
─────────────                  ─────────────────             ──────

1. User clicks "Mark as applied"
   (with optional form fields)
2. POST /api/extension/mark-applied
   { originalUrl, companyName?,
     jobTitle?, ... }
          ───────────────────►
                               3. Validate session + allowlist
                               4. Validate input schema
                               5. ConvexHttpClient.mutation(
                                    "jobs:markApplied", args)
                                          ──────────────────►
                                                              6. ensureWorkspace()
                                                              7. ensureUser()
                                                              8. Find or create job record
                                                              9. Insert application record
                                                              10. Return job + applications
                                          ◄──────────────────
                               11. Return JSON response
          ◄───────────────────
12. Show success confirmation
```

The mutation is idempotent per (job, user) pair — calling it twice for the same job and user does not create a duplicate application.

---

## 5. Data Flow: Web Fallback

When the extension cannot authenticate (user not signed into the web app), it falls back to the web UI:

```
Extension popup                       Next.js Web App
─────────────                         ───────────────

1. POST /api/extension/check → 401
2. Show "Open in app" button
3. User clicks button
4. chrome.tabs.create(
     /extension/check?url=<encoded-url>)
          ─────────────────────────►
                                      5. Clerk middleware checks session
                                      6a. If signed in → render page with
                                          prefilled URL, auto-run check
                                          via existing JobChecker component
                                      6b. If signed out → redirect to
                                          Clerk sign-in, then back to
                                          /extension/check?url=...
```

The fallback page reuses the existing `JobChecker` component — no new matching UI is built.

---

## 6. Auth Flow

```
┌──────────┐   session cookie    ┌──────────────┐    JWT     ┌────────┐
│  Browser  │───────────────────►│  Next.js API  │──────────►│ Convex │
│  (Clerk)  │                    │  Route        │           │        │
└──────────┘                     └──────────────┘            └────────┘
      │
      │ same cookie (same origin)
      ▼
┌──────────┐
│ Extension │
│ (popup)   │
└──────────┘
```

1. **Clerk session cookie** is set on the app's domain when the user signs in via the web app.
2. The extension's `fetch` calls use `credentials: 'include'`, which attaches the cookie because the API route is on the same origin as the web app (host permission in manifest).
3. The Next.js API route uses Clerk's server-side auth to extract the user identity from the cookie.
4. The route checks the identity's email against the `ALLOWED_EMAILS` environment variable using `shared/access.ts`.
5. The route creates a `ConvexHttpClient` authenticated with a Clerk-issued JWT to call Convex functions, which run their own `requireAllowedIdentity` check.

The extension **never stores credentials**. Auth depends entirely on the browser's existing Clerk session.

---

## 7. Matching Model

Duplicate detection uses a two-tier canonical key system defined in `shared/job-matching.ts`:

| Tier | Key format | Fields | Confidence |
|---|---|---|---|
| **Primary** | `primary:{company}::{jobId}` | normalized company + external job ID | High |
| **Fallback** | `fallback:{company}::{title}::{location}` | normalized company + title + location | Medium |

Resolution order:

1. Parse the URL → extract company (from hostname), job ID (numeric path segment), title, location
2. Look up by primary key → if found → `already_applied` (high confidence)
3. Look up by fallback key → if found → `possible_duplicate` (medium confidence)
4. Neither key matches → `new` or `unparseable`

All normalization and key derivation lives exclusively in `shared/job-matching.ts`. Both the web app (via Convex) and the extension (via API routes that call Convex) use this single implementation.

---

## 8. Extension Architecture

```
extension/
├── manifest.json          # MV3 manifest
├── popup.html             # Popup entry point
├── popup.ts               # Popup logic (auto-check, render, save)
├── background.ts          # Service worker (minimal)
├── api-client.ts          # Typed fetch wrapper for API routes
├── styles.css             # Popup styles
└── build config           # esbuild bundling
```

### Manifest

- **Manifest V3**
- **Permissions:** `activeTab`, `storage`, `commands`
- **Host permission:** App origin only (e.g., `http://localhost:3000/*`)
- **No content scripts**, no broad host permissions

### Popup

- Opens on extension icon click or keyboard shortcut
- Reads the active tab URL via `chrome.tabs.query`
- Auto-triggers a check against `/api/extension/check`
- Renders the result (new / applied / duplicate / unparseable / error)
- Provides a "Mark as applied" form for new jobs
- Falls back to "Open in app" on auth failure

### Background Worker

- Minimal service worker for extension lifecycle
- No auto-checking, no polling, no content injection

### API Client

- Thin typed wrapper around `fetch`
- All calls use `credentials: 'include'` for cookie auth
- Uses shared request/response types from `shared/`
- Distinguishes 401 (not signed in) from 403 (not in allowlist) for UI branching

### Local Storage

- `chrome.storage.local` caches the last-checked URL and result
- Used only for popup UX continuity — not a source of truth

---

## 9. Key Invariants

1. **Extension never stores credentials.** Auth relies entirely on the browser's Clerk session cookie.

2. **All writes go through Convex.** The extension and API routes are read/write proxies — Convex is the sole system of record.

3. **Matching logic lives only in `shared/`.** Both the Convex backend and API routes import from `shared/job-matching.ts`. No matching logic is duplicated in the extension.

4. **Access control is enforced at every layer.** The API route checks the allowlist, and the Convex function checks it again independently. Neither layer trusts the other.

5. **The extension adds no new Convex functions.** API routes call existing `checkUrl` (action) and `markApplied` (mutation) — no schema or backend changes.

6. **Existing web app behavior is unchanged.** The extension is additive. The web UI at `/` continues to work exactly as before.

7. **The fallback page uses a dedicated client component.** `/extension/check?url=...` renders `ExtensionJobChecker` (not the main `JobChecker`), because the fallback page uses `fetch` to call API routes while `JobChecker` uses the Convex React SDK directly. The two components share visual patterns and utility logic but are separate implementations.

8. **Application records are idempotent.** Marking the same (job, user) pair as applied twice does not create duplicate application records.
