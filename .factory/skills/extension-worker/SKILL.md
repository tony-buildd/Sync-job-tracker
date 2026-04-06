---
name: extension-worker
description: Implements Chrome Manifest V3 extension code — manifest, popup, background, API client, build config
---

# Extension Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features involving:
- Chrome extension manifest.json and build configuration
- Extension popup UI (HTML, CSS, TypeScript)
- Extension background service worker
- Extension API client module
- Chrome APIs (tabs, storage, commands, action)
- esbuild bundling for extension TypeScript

## Required Skills

None.

## Work Procedure

### 1. Understand the Feature

Read the feature description, preconditions, expectedBehavior, and verificationSteps. Read existing extension files to understand the current state.

Key patterns:
- Extension lives in `extension/` at repo root
- TypeScript source in `extension/src/`
- Built output in `extension/dist/`
- Uses esbuild for bundling (see `extension/package.json` scripts)
- Shared types imported from `../shared/` (relative paths in esbuild)
- API client uses `fetch` with `credentials: 'include'` to call `http://localhost:3000`
- Chrome MV3: service worker (not background page), `chrome.action` (not `chrome.browserAction`)

### 2. Write Tests First (TDD)

For testable modules (API client, state management, utility functions):
1. Create test files in the extension using vitest
2. Write failing tests first
3. Mock Chrome APIs and fetch for unit tests
4. Run tests to confirm they fail (red phase)

For UI/Chrome-API-dependent code that can't be unit tested:
- Document what manual verification the user should perform in the handoff

### 3. Implement

1. Write TypeScript source files in `extension/src/`
2. Keep the popup UI simple — plain HTML + CSS + TypeScript (no framework)
3. Use the shared types from `../shared/` for API response shapes
4. For Chrome APIs, use the `chrome.*` namespace directly
5. Build the extension: `cd extension && npm run build`
6. Verify the build succeeds and `extension/dist/` contains the expected files (manifest.json, popup.html, popup.js, background.js)

### 4. Verify

Run ALL of these commands:
```
cd extension && npm run build
cd /Users/minhthiennguyen/Desktop/job-tracker && npm test
npx tsc --noEmit
npm run lint
```

Also verify:
- `extension/dist/manifest.json` exists and is valid JSON
- `extension/dist/popup.html` exists
- `extension/dist/popup.js` exists  
- `extension/dist/background.js` exists (if background worker feature)

### 5. Commit

Commit each logical change separately with clear messages. The user requires frequent, granular commits.

```
git add -A
git commit -m "descriptive message"
```

## Example Handoff

```json
{
  "salientSummary": "Built the extension popup UI with all 6 states (loading, new, applied, duplicate, manual, fallback). Popup reads active tab URL on open, calls check API, and renders the appropriate state. Build succeeds, dist/ contains all expected files.",
  "whatWasImplemented": "Extension popup (popup.html + popup.ts + popup.css) with state machine handling: loading spinner during API call, new job card with mark-applied button, already-applied card with applicant info, possible-duplicate warning, needs-manual-details form, and auth-failure fallback button. Each state has distinct visual treatment and appropriate action buttons.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "cd extension && npm run build", "exitCode": 0, "observation": "Build succeeds, dist/ has manifest.json, popup.html, popup.js, popup.css, background.js" },
      { "command": "npm test", "exitCode": 0, "observation": "All tests pass" },
      { "command": "npx tsc --noEmit", "exitCode": 0, "observation": "No type errors" },
      { "command": "npm run lint", "exitCode": 0, "observation": "No lint errors" }
    ],
    "interactiveChecks": [
      { "action": "Verified popup.html links to popup.js and popup.css correctly", "observed": "Script and style tags reference correct built files" },
      { "action": "Verified manifest.json declares popup.html as default_popup", "observed": "action.default_popup points to popup.html" }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "extension/src/__tests__/api-client.test.ts",
        "cases": [
          { "name": "checkUrl sends POST with credentials include", "verifies": "API client sends correct request format" },
          { "name": "checkUrl returns parsed response on success", "verifies": "Response is correctly typed" },
          { "name": "checkUrl throws AuthError on 401", "verifies": "Auth failure detection" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- The API routes the extension calls don't exist yet or return unexpected shapes
- Shared types referenced by the extension don't exist in `shared/`
- esbuild can't resolve imports from `../shared/` (path resolution issue)
- Chrome API behavior differs from MV3 documentation (e.g., service worker limitations)
- The extension build config needs changes that would affect the main app's build
