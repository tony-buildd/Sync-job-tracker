# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Required Environment Variables

| Variable | Purpose | Where Used |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend key | Next.js client |
| `CLERK_SECRET_KEY` | Clerk backend key | Next.js API routes |
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL | Convex client + ConvexHttpClient |
| `CLERK_JWT_ISSUER_DOMAIN` | Clerk JWT issuer for Convex auth | convex/auth.config.ts |
| `ALLOWED_EMAILS` | Comma-separated email allowlist | shared/access.ts, convex/jobs.ts |
| `HOUSEHOLD_SLUG` | Workspace identifier slug | convex/jobs.ts |
| `HOUSEHOLD_NAME` | Display name for workspace | convex/jobs.ts |

## External Dependencies

- **Clerk** — Authentication provider. Manages user sessions, JWT tokens. The web app uses Clerk session cookies for auth.
- **Convex** — Hosted backend. All data (jobs, applications, workspaces, users) lives in Convex. The app calls Convex actions/mutations either directly (React hooks) or via ConvexHttpClient (server-side API routes).

## Notes

- `.env.local` is gitignored. It contains all secrets.
- The Chrome extension does NOT store any secrets — it relies on the web app's Clerk session cookies.
- Convex environment variables (ALLOWED_EMAILS, HOUSEHOLD_SLUG, HOUSEHOLD_NAME) must be set in both `.env.local` and the Convex dashboard.
