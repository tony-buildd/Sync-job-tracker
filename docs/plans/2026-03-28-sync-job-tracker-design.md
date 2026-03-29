# Sync Job Tracker Design

Date: 2026-03-28
Repository target: https://github.com/tony-buildd/Sync-job-tracker

## Goal

Build a shared job-tracking app that helps multiple people using the same resume/profile set avoid duplicate job applications.

The main workflow is:
- A user pastes a job URL from any source.
- The app determines whether the job is new, already applied, or a possible duplicate.
- The app shows who applied so the household does not re-apply the same job accidentally.

This is not just a spreadsheet replacement. The key product value is duplicate prevention across different job sources and different people sharing the same application process.

## Product Direction

Recommended MVP stack:
- Next.js frontend
- Clerk authentication with Google sign-in
- Convex for data storage and backend logic

Recommended result states:
- `new`
- `already applied`
- `possible duplicate`

Recommended behavior:
- Pasting a URL should immediately show the match result.
- The check flow should not require a confirmation step just to see status.
- The app should show whether the job exists already and who applied to it.

## Matching Strategy

The app should not use the full raw URL as the identity of a job because the same job can appear under:
- different path structures
- different tracking parameters
- different source pages

Recommended layered matching:

1. Primary match
- Use normalized `company + external_job_id`
- This is the strongest duplicate key when a stable job ID can be extracted

2. Secondary fallback
- Use normalized `company + title + location`
- This is used when no reliable external job ID is available

3. Confidence handling
- High-confidence primary match: show `already applied`
- Fallback match that is plausible but not definitive: show `possible duplicate`

This gives the safest MVP behavior for the stated goal: prevent duplicate applications without trusting unstable URLs.

## Example Interpretation

### Nutrien

These should resolve to the same canonical job:
- `https://jobs.nutrien.com/North-America/job/Augusta-Process-Engineer-GA-30903/30186-en_US/?feedId=349960&utm_source=LinkedInJobPostings&jr_id=69c8912ab773006330b7fb8d`
- `https://jobs.nutrien.com/North-America/job/Process-Engineer/30186-en_US/`

Reason:
- Both contain the stable posting identifier `30186-en_US`

### Amgen

These should resolve to the same canonical job:
- `https://careers.amgen.com/en/job/-/-/87/93284715648?src=Linkedin&jr_id=69c7ec581818a24cd84d24d5`
- `https://careers.amgen.com/en/job/cambridge/process-development-associate/87/93284715648`

Reason:
- Both contain the stable posting identifier `93284715648`

## User Flow

### Check Job

1. User signs in with Google through Clerk.
2. User pastes a job URL into the app.
3. The app parses the link and extracts candidate fields such as company, title, location, and external job ID.
4. The app queries Convex for matching canonical jobs.
5. The UI shows one of:
   - `New job`
   - `Already applied by Minh`
   - `Already applied by Girlfriend`
   - `Possible duplicate`

No confirmation is required just to check status.

### Application Tracking

After the match check, the app can later support marking the job as applied and attaching:
- who applied
- resume version
- profile/platform label
- notes

That step is separate from the duplicate check and should not block the main paste-and-check interaction.

## Data Model

### users

Purpose:
- store signed-in Clerk users
- support shared household/team access

Suggested fields:
- `clerkUserId`
- `email`
- `name`
- `workspaceId`

### workspaces

Purpose:
- allow both users to share one dataset

Suggested fields:
- `name`
- `createdBy`

### jobs

Purpose:
- canonical shared job postings

Suggested fields:
- `workspaceId`
- `companyName`
- `jobTitle`
- `jobLocation`
- `externalJobId`
- `canonicalKey`
- `normalizedCompany`
- `normalizedTitle`
- `normalizedLocation`
- `sourceUrls`
- `createdAt`
- `updatedAt`

### applications

Purpose:
- track who applied to which canonical job

Suggested fields:
- `workspaceId`
- `jobId`
- `userId`
- `appliedAt`
- `resumeVersion`
- `profileLabel`
- `notes`

## Canonical Job Rules

Rules:
- One canonical job can be linked to many source URLs.
- A single canonical job can have multiple application records.
- Duplicate checking should operate at the canonical job level, not the raw URL level.

Recommended canonical key generation:
- If `externalJobId` exists: build key from normalized company plus external job ID
- Otherwise: build a lower-confidence fallback key from normalized company, title, and location

## Parsing and Normalization

Normalization should include:
- lowercasing
- trimming whitespace
- collapsing repeated spaces
- removing URL tracking parameters from identity decisions
- standardizing common company/title/location formatting where safe

Parsing should attempt to extract:
- company name
- external job ID
- title
- location
- original source URL

If parsing fails:
- keep the raw URL
- expose manual correction fields for company/title/location
- lower the match confidence

## MVP Screens

### 1. Check Job
- URL input
- parsed preview
- match result badge
- existing application summary

### 2. Job History
- searchable canonical job list
- filter by company, applicant, status

### 3. Job Detail
- canonical job information
- linked source URLs
- applications by user
- resume/profile metadata

## Error Handling

### Unparseable URL
- show that the URL could not be reliably parsed
- allow manual entry of company/title/location

### Partial Parse
- use available fields
- reduce confidence
- prefer `possible duplicate` instead of overconfident matching

### Ambiguous Match
- show the closest existing match
- label it `possible duplicate`

### Multiple Applicants
- show every application tied to the same canonical job

## Testing Strategy

Unit tests:
- URL normalization
- company normalization
- external job ID extraction
- fallback key generation

Matching tests:
- same job with different tracking params
- same company with different jobs
- same title at same company with different IDs
- missing external ID using fallback match
- ambiguous fallback returning `possible duplicate`

Integration tests:
- sign in through Clerk
- paste URL
- receive duplicate result from Convex-backed query

Seed test cases should include the Nutrien and Amgen examples above.

## MVP Boundaries

Include:
- Google sign-in via Clerk
- shared workspace for two users
- paste URL and check duplicate status
- canonical jobs and application records
- job history

Do not include yet:
- browser automation
- deep ATS scraping
- external job board integrations
- aggressive fuzzy matching beyond the layered rules above

## Recommended Build Order

1. Scaffold Next.js with Clerk and Convex
2. Define Convex schema for workspaces, users, jobs, and applications
3. Implement URL parsing and normalization utilities
4. Implement duplicate check logic
5. Build the paste-and-check screen
6. Build the history and detail views
7. Add parsing and matching tests

## Open Follow-Up Decisions

These can be handled during implementation:
- how workspace membership is created for the second user
- exact normalization rules for company/title/location
- whether marking an application should happen from the check screen or detail screen
- whether resume/profile labels should be free text or pre-defined options

## Recommendation Summary

The recommended MVP is a shared Clerk-authenticated Next.js app backed by Convex, using layered duplicate detection:
- primary match on `company + external_job_id`
- fallback on `company + title + location`
- result states of `new`, `already applied`, and `possible duplicate`

This is the best fit for the goal of preventing duplicate job applications across different URLs and different users sharing the same application workflow.
