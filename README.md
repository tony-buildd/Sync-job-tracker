# Sync Job Tracker

Shared job application tracking for households or small teams that want to avoid duplicate applications across different job sources.

## Problem

Spreadsheet-based tracking is slow and easy to get wrong when more than one person is applying with the same resume set, profile, or platform accounts.

The main failure case is duplicate applications:
- the same job appears under different URLs
- the same posting is found from different sources
- one person applies without the other realizing it

## Product Goal

Paste a job URL and immediately answer:
- Is this job new?
- Has it already been applied to?
- Who applied to it?

The app should treat equivalent job links as the same posting even when the raw URLs differ.

## MVP

### Core flow

1. Sign in with Google
2. Paste a job URL
3. Parse the posting into a canonical job identity
4. Check for existing matches
5. Show one of:
   - `new`
   - `already applied`
   - `possible duplicate`

### Primary use case

Two people, such as a couple, share the same job-tracking workspace so they do not accidentally apply to the same role twice.

## Matching Model

The app should not use the full raw URL as the unique identity.

Recommended layered matching:

1. Primary match: normalized `company + external_job_id`
2. Fallback match: normalized `company + title + location`
3. Ambiguous fallback results should return `possible duplicate`

This handles cases like:
- tracking parameters changing
- source-specific path differences
- one posting appearing from multiple job boards or referrals

## Example

These links should resolve to the same job:

- `https://jobs.nutrien.com/North-America/job/Augusta-Process-Engineer-GA-30903/30186-en_US/?feedId=349960&utm_source=LinkedInJobPostings&jr_id=69c8912ab773006330b7fb8d`
- `https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/`

Because the stable job identifier is the same: `30186-en_US`

These links should also resolve to the same job:

- `https://careers.amgen.com/en/job/-/-/87/93284715648?src=Linkedin&jr_id=69c7ec581818a24cd84d24d5`
- `https://careers.amgen.com/en/job/cambridge/process-development-associate/87/93284715648`

Because the stable job identifier is the same: `93284715648`

## Planned Stack

- Next.js
- Clerk with Google sign-in
- Convex

## Data Model

Core entities:
- `workspaces`
- `users`
- `jobs`
- `applications`

Suggested canonical job fields:
- `companyName`
- `jobTitle`
- `jobLocation`
- `externalJobId`
- `canonicalKey`
- `sourceUrls`

Suggested application fields:
- `jobId`
- `userId`
- `appliedAt`
- `resumeVersion`
- `profileLabel`
- `notes`

## Repository Notes

The approved product design is documented in:

- `docs/plans/2026-03-28-sync-job-tracker-design.md`
