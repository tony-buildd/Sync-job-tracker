# Changelog

All notable changes to Sync Job Tracker will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com).

## Unreleased

## 0.1.0 - 2026-03-28

### Added

- Next.js App Router app scaffold for Sync Job Tracker
- Clerk-based Google sign-in shell with shared household allowlist
- Convex schema for workspaces, users, jobs, and applications
- Shared job check flow with dialog-based results
- Applied-only persistence flow so unchecked jobs are not stored
- Canonical duplicate matching based on:
  - company + external job ID
  - fallback company + title + location
- Regression tests for Nutrien and Amgen duplicate-link cases
- Environment template and local setup documentation
- Product design spec in `docs/plans/2026-03-28-sync-job-tracker-design.md`

### Changed

- Replaced the placeholder repository README with app-specific setup and product documentation
- Set the project build script to use `next build --webpack` for stable local verification

### Fixed

- Build verification no longer depends on fetching remote Google Fonts
- Lint configuration now ignores generated Convex client files
- Matching logic handles tracking-parameter variants of the same job URL
