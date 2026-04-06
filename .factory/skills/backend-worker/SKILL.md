---
name: backend-worker
description: Implements Next.js API routes, shared types, and server-side logic with TDD
---

# Backend Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features involving:
- Next.js API route handlers (under `src/app/api/`)
- Next.js page routes (under `src/app/`)
- Shared TypeScript types and Zod schemas (in `shared/`)
- Server-side integration with Clerk auth and Convex backend
- Vitest tests for any of the above

## Required Skills

None.

## Work Procedure

### 1. Understand the Feature

Read the feature description, preconditions, expectedBehavior, and verificationSteps carefully. Read the referenced files in the codebase to understand existing patterns.

Key patterns to follow:
- Clerk auth in API routes: use `auth()` from `@clerk/nextjs/server` to get session, then `getToken({ template: "convex" })` for Convex JWT
- Convex server calls: use `ConvexHttpClient` from `convex/browser` with the JWT token
- Shared logic: pure functions in `shared/` (parseJobUrl, deriveCanonicalIdentity, isAllowedEmail)
- Input validation: use Zod schemas
- Error responses: return JSON with `{ error: string, code: string }` shape

### 2. Write Tests First (TDD)

Before any implementation:
1. Create or update test files following existing pattern (`*.test.ts` alongside source)
2. Write failing tests that cover the feature's expectedBehavior
3. For API route tests: mock Clerk auth context and Convex client calls
4. For shared logic tests: test pure functions directly (see `shared/job-matching.test.ts` for pattern)
5. Run `npm test` to confirm tests fail (red phase)

### 3. Implement

1. Create/modify source files to make tests pass
2. Follow existing code style (check adjacent files)
3. Use Zod for input validation in API routes
4. Keep API route handlers thin — delegate to shared logic and Convex calls
5. Run `npm test` after implementation to confirm tests pass (green phase)

### 4. Verify

Run ALL of these commands and fix any issues:
```
npm test
npx tsc --noEmit
npm run lint
```

If any fail, fix the issues before proceeding.

### 5. Commit

Commit each logical change separately with clear messages. The user requires frequent, granular commits.

```
git add -A
git commit -m "descriptive message"
```

## Example Handoff

```json
{
  "salientSummary": "Implemented POST /api/extension/check with Clerk auth, Convex proxy, and Zod input validation. Wrote 6 vitest tests covering auth success/failure, valid/invalid URLs, and response shape. All tests pass, typecheck clean, lint clean.",
  "whatWasImplemented": "POST /api/extension/check API route that authenticates via Clerk session cookie, validates input with Zod, calls Convex checkUrl action via ConvexHttpClient, and returns compact JSON response. Added shared Zod schemas for extension API types in shared/extension-api.ts.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npm test", "exitCode": 0, "observation": "10 tests pass (4 existing + 6 new)" },
      { "command": "npx tsc --noEmit", "exitCode": 0, "observation": "No type errors" },
      { "command": "npm run lint", "exitCode": 0, "observation": "No lint errors" }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "src/app/api/extension/check/__tests__/route.test.ts",
        "cases": [
          { "name": "returns check result for authenticated user with valid URL", "verifies": "happy path with correct response shape" },
          { "name": "returns 401 for unauthenticated request", "verifies": "auth gate rejects missing session" },
          { "name": "returns 403 for unauthorized email", "verifies": "allowlist check rejects non-allowed email" },
          { "name": "returns 400 for missing URL", "verifies": "input validation catches empty body" },
          { "name": "returns 400 for invalid URL format", "verifies": "input validation catches malformed URLs" },
          { "name": "returns unparseable status for non-job URL", "verifies": "graceful handling of URLs without job identity" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Convex function signatures or behavior differ from what the feature description assumes
- Clerk auth pattern doesn't work as expected (e.g., getToken returns null)
- A shared type or function needed by this feature doesn't exist yet and is listed as a precondition
- Test infrastructure needs changes that would affect other features
