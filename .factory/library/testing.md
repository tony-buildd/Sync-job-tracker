# Testing

Testing setup, libraries, and known gotchas.

**What belongs here:** Testing library setup, environment quirks, configuration patterns.
**What does NOT belong here:** Test strategy decisions (see AGENTS.md).

---

## Client Component Testing

Dev dependencies available for testing React/client components:

- `@testing-library/react` — render, screen, fireEvent, waitFor, act
- `@testing-library/user-event` — userEvent for realistic interactions
- `happy-dom` — DOM environment for vitest

### Environment Directive

Client component tests must use the `happy-dom` vitest environment. Add this comment at the top of the test file:

```typescript
/** @vitest-environment happy-dom */
```

The project's `vitest.config.ts` uses the default `node` environment. Per-file overrides are used for DOM tests.

### Why happy-dom (not jsdom)

jsdom does not work with Node.js ESM modules (Node 22+). The project uses ESM, so jsdom will produce import/compatibility errors. Use `happy-dom` instead — it's ESM-compatible and faster.

---

## Convex Error Classification in API Routes

`convex/jobs.ts` throws multiple `ConvexError` instances, all with plain string `data`. Different error types (auth, validation, server) are **not distinguishable by type alone** — they all produce `ConvexError` with `typeof error.data === 'string'`.

To correctly classify Convex errors in API routes:

1. Use `instanceof ConvexError` to distinguish Convex business errors from network/runtime errors
2. **Also check `error.data` content** to distinguish between different business error types (e.g., insufficient identity vs. server-side creation failure)

Example pattern:
```typescript
if (error instanceof ConvexError && typeof error.data === 'string') {
  // Must also check error.data content to distinguish error types
  if (error.data.includes('stable job ID') || error.data.includes('company, title, and location')) {
    // Insufficient identity → 400
  } else {
    // Other ConvexError (server failure) → 500
  }
}
```

Do NOT match `instanceof ConvexError` alone without content checks — it will incorrectly classify server errors as client errors.
