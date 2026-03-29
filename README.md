# Sync Job Tracker

Shared duplicate prevention for household job applications.

## What it does

- Sign in with Google through Clerk
- Paste a job URL from any source
- Parse the posting into a canonical identity
- Show whether the job is:
  - `new`
  - `already applied`
  - `possible duplicate`
- Save only applied jobs to the shared workspace

Unchecked jobs are not stored.

## Matching model

Primary identity:
- normalized `company + external_job_id`

Fallback identity:
- normalized `company + title + location`

Rules:
- the raw URL is never the canonical identity
- tracking parameters are ignored
- fallback matches stay conservative and surface as `possible duplicate`

Examples covered by tests:
- Nutrien `30186-en_US`
- Amgen `93284715648`

## Stack

- Next.js App Router
- Clerk
- Convex
- Tailwind CSS
- Vitest

## Local setup

1. Install dependencies

```bash
npm install
```

2. Copy the environment template

```bash
cp .env.example .env.local
```

3. Fill in the required values

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CONVEX_URL`
- `CLERK_JWT_ISSUER_DOMAIN`
- `ALLOWED_EMAILS`
- `HOUSEHOLD_SLUG`
- `HOUSEHOLD_NAME`

4. Start Convex

```bash
npx convex dev
```

5. Start Next.js

```bash
npm run dev
```

## Scripts

- `npm run dev`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run convex:dev`
- `npm run convex:codegen`

## Notes

- The current implementation supports one shared household workspace in v1.
- Access is restricted by the `ALLOWED_EMAILS` allowlist.
- Convex was configured locally during implementation, but you still need your real Clerk issuer domain and app keys for full auth.

## Design doc

- `docs/plans/2026-03-28-sync-job-tracker-design.md`
