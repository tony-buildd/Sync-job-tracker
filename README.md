# 🔁 Sync Job Tracker

A shared job application tracker for multiple people using the same resume/profile. Paste a job URL to instantly check if it's already been applied — even if the link looks different depending on the source (LinkedIn, direct company site, job boards, etc.).

## Features

- **URL Deduplication** – The same job posting found on different platforms is recognized as the same job via fingerprinting of the company domain and numeric job IDs embedded in the URL.
- **Instant Check** – Paste any job URL and immediately see "New – not applied yet" or "Already Applied (by who, when)".
- **Application Tracker** – Log job applications with title, company, status (Applied, Interviewing, Offer, Rejected, Withdrawn), applied-by name, and optional notes.
- **Shared & Collaborative** – Multiple people can use the same tracker to avoid applying to the same job twice.
- **Filter & Search** – Filter applications by status or search by title, company, or applicant name.

## How URL Deduplication Works

The same job can appear at different URLs:

| Source | URL |
|--------|-----|
| LinkedIn | `https://jobs.nutrien.com/.../Augusta-Process-Engineer-GA-30903/30186-en_US/?feedId=349960&utm_source=LinkedInJobPostings` |
| Direct | `https://jobs.nutrien.com/.../Process-Engineer/30186-en_US/` |

Both resolve to the same fingerprint: **`nutrien.com:30186`**

The algorithm:
1. Strips common subdomains (`jobs.`, `careers.`, `www.`) to normalize the company domain.
2. Extracts numeric job IDs from the URL path (pure numeric segments and locale-prefixed segments like `30186-en_US`).
3. Sorts and combines them into a stable fingerprint.

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
# Install dependencies
npm install

# Set up the database
npm run db:migrate

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

Copy `.env.example` to `.env` (the defaults work out of the box with SQLite):

```
DATABASE_URL="file:./prisma/dev.db"
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/jobs` | List all tracked jobs |
| `POST` | `/api/jobs` | Add a new job application |
| `GET` | `/api/jobs/check?url=<url>` | Check if a URL has already been applied |
| `PATCH` | `/api/jobs/:id` | Update status/notes for a job |
| `DELETE` | `/api/jobs/:id` | Remove a job from the tracker |

## Tech Stack

- [Next.js 16](https://nextjs.org/) – React framework with App Router
- [Prisma 7](https://www.prisma.io/) – Type-safe ORM with SQLite via `@prisma/adapter-better-sqlite3`
- [Tailwind CSS 4](https://tailwindcss.com/) – Utility-first CSS
- [TypeScript](https://www.typescriptlang.org/) – Type safety throughout
- [Jest](https://jestjs.io/) + [ts-jest](https://kulshekhar.github.io/ts-jest/) – Unit tests for the fingerprinting logic

## Running Tests

```bash
npm test
```

The test suite covers the URL fingerprinting algorithm including the exact examples from the problem statement (Nutrien and Amgen URLs).
