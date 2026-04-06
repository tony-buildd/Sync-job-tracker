/**
 * Sync Job Tracker – Popup Entry Point
 *
 * Reads the active tab URL, checks it via the API, and renders the
 * appropriate state. Handles mark-applied flow, chrome.storage caching,
 * and error states.
 */

import {
  checkUrl,
  markApplied,
  AuthError,
  ForbiddenError,
  NetworkError,
  TimeoutError,
} from "./api-client";

import type {
  CheckResponse,
  MarkAppliedResponse,
  ApplicationSummary,
} from "../../shared/extension-api";

// ---------------------------------------------------------------------------
// Cache helpers (chrome.storage.local)
// ---------------------------------------------------------------------------

interface CachedResult {
  url: string;
  result: CheckResponse;
  timestamp: number;
}

async function getCachedResult(url: string): Promise<CachedResult | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(url, (data) => {
      const cached = data[url] as CachedResult | undefined;
      resolve(cached ?? null);
    });
  });
}

async function setCachedResult(
  url: string,
  result: CheckResponse
): Promise<void> {
  const entry: CachedResult = { url, result, timestamp: Date.now() };
  return new Promise((resolve) => {
    chrome.storage.local.set({ [url]: entry }, resolve);
  });
}

async function updateCacheToApplied(
  url: string,
  markResponse: MarkAppliedResponse
): Promise<void> {
  const appliedResult: CheckResponse = {
    status: "already_applied",
    confidence: "high",
    parsedJob: {
      originalUrl: url,
      companyName: markResponse.companyName,
      jobTitle: markResponse.jobTitle,
      jobLocation: markResponse.jobLocation,
      externalJobId: markResponse.externalJobId,
    },
    matchedJob: {
      id: markResponse.jobId,
      companyName: markResponse.companyName,
      jobTitle: markResponse.jobTitle,
      jobLocation: markResponse.jobLocation,
      externalJobId: markResponse.externalJobId,
      sourceUrls: [url],
    },
    applications: markResponse.applications,
    reasons: ["matched_primary_key"],
  };
  await setCachedResult(url, appliedResult);
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function show(id: string): void {
  $(id).classList.remove("hidden");
}

function hide(id: string): void {
  $(id).classList.add("hidden");
}

function setText(id: string, text: string): void {
  $(id).textContent = text;
}

function setBadge(text: string, className: string): void {
  const badge = $("status-badge");
  badge.textContent = text;
  badge.className = `badge ${className}`;
}

function hideAllStates(): void {
  const stateIds = [
    "state-loading",
    "state-new",
    "state-applied",
    "state-duplicate",
    "state-manual",
    "state-unparseable",
    "state-unsupported",
    "state-auth-401",
    "state-auth-403",
    "state-network-error",
  ];
  stateIds.forEach(hide);
}

function showState(id: string): void {
  hideAllStates();
  show(id);
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// State renderers
// ---------------------------------------------------------------------------

function renderNew(data: CheckResponse): void {
  const job = data.parsedJob;
  setText("new-company", job.companyName || "—");
  setText("new-title", job.jobTitle || "—");
  setText("new-location", job.jobLocation || "—");

  // Pre-fill optional correction fields
  (document.getElementById("opt-company") as HTMLInputElement).value =
    job.companyName || "";
  (document.getElementById("opt-title") as HTMLInputElement).value =
    job.jobTitle || "";
  (document.getElementById("opt-location") as HTMLInputElement).value =
    job.jobLocation || "";
  (document.getElementById("opt-job-id") as HTMLInputElement).value =
    job.externalJobId || "";

  setBadge("New", "badge-new");
  showState("state-new");
}

function renderApplied(data: CheckResponse): void {
  const job = data.parsedJob;
  setText("applied-company", job.companyName || "—");
  setText("applied-title", job.jobTitle || "—");

  const historyEl = $("applied-history");
  historyEl.innerHTML = "";

  data.applications.forEach((app: ApplicationSummary) => {
    const div = document.createElement("div");
    div.className = "app-entry";
    const date = new Date(app.appliedAt).toLocaleDateString();
    div.innerHTML = `<span class="app-entry-user">${escapeHtml(app.userName)}</span><span class="app-entry-date">${escapeHtml(date)}</span>`;
    historyEl.appendChild(div);
  });

  setBadge("Applied", "badge-applied");
  showState("state-applied");
}

function renderDuplicate(data: CheckResponse): void {
  const matched = data.matchedJob;
  setText("dup-company", matched?.companyName || data.parsedJob.companyName || "—");
  setText("dup-title", matched?.jobTitle || data.parsedJob.jobTitle || "—");

  setBadge("Possible Duplicate", "badge-duplicate");
  showState("state-duplicate");
}

function renderManual(data: CheckResponse): void {
  const job = data.parsedJob;
  (document.getElementById("manual-company") as HTMLInputElement).value =
    job.companyName || "";
  (document.getElementById("manual-title") as HTMLInputElement).value =
    job.jobTitle || "";
  (document.getElementById("manual-location") as HTMLInputElement).value =
    job.jobLocation || "";
  (document.getElementById("manual-job-id") as HTMLInputElement).value =
    job.externalJobId || "";

  setBadge("Needs Details", "badge-manual");
  showState("state-manual");
}

function renderUnparseable(): void {
  setBadge("Not a Job", "badge-neutral");
  showState("state-unparseable");
}

function renderUnsupported(): void {
  setBadge("Unsupported", "badge-neutral");
  showState("state-unsupported");
}

function renderAuth401(): void {
  setBadge("Sign In", "badge-error");
  showState("state-auth-401");
}

function renderAuth403(): void {
  setBadge("Unauthorized", "badge-error");
  showState("state-auth-403");
}

function renderNetworkError(detail?: string): void {
  if (detail) {
    setText("network-error-detail", detail);
  }
  setBadge("Error", "badge-error");
  showState("state-network-error");
}

// ---------------------------------------------------------------------------
// Render a check result into the correct state
// ---------------------------------------------------------------------------

function renderCheckResult(data: CheckResponse): void {
  switch (data.status) {
    case "already_applied":
      renderApplied(data);
      break;
    case "possible_duplicate":
      renderDuplicate(data);
      break;
    case "new": {
      // Determine if we need manual details:
      // needs company + (jobId OR title+location)
      const job = data.parsedJob;
      const hasCompany = !!job.companyName;
      const hasJobId = !!job.externalJobId;
      const hasTitleAndLocation = !!job.jobTitle && !!job.jobLocation;

      if (hasCompany && (hasJobId || hasTitleAndLocation)) {
        renderNew(data);
      } else {
        renderManual(data);
      }
      break;
    }
    case "unparseable":
      renderUnparseable();
      break;
    default:
      renderUnparseable();
  }
}

// ---------------------------------------------------------------------------
// HTML escape
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Mark-applied flow
// ---------------------------------------------------------------------------

let currentUrl = "";
let currentCheckData: CheckResponse | null = null;

function getOptionalFields(prefix: string): {
  resumeVersion?: string;
  profileLabel?: string;
  notes?: string;
  companyName?: string;
  jobTitle?: string;
  jobLocation?: string;
  externalJobId?: string;
} {
  const fields: Record<string, string | undefined> = {};
  const resume = (document.getElementById(`${prefix}-resume`) as HTMLInputElement | null)?.value.trim();
  const profile = (document.getElementById(`${prefix}-profile`) as HTMLInputElement | null)?.value.trim();
  const notes = (document.getElementById(`${prefix}-notes`) as HTMLTextAreaElement | null)?.value.trim();
  const company = (document.getElementById(`${prefix}-company`) as HTMLInputElement | null)?.value.trim();
  const title = (document.getElementById(`${prefix}-title`) as HTMLInputElement | null)?.value.trim();
  const location = (document.getElementById(`${prefix}-location`) as HTMLInputElement | null)?.value.trim();
  const jobId = (document.getElementById(`${prefix}-job-id`) as HTMLInputElement | null)?.value.trim();

  if (resume) fields.resumeVersion = resume;
  if (profile) fields.profileLabel = profile;
  if (notes) fields.notes = notes;
  if (company) fields.companyName = company;
  if (title) fields.jobTitle = title;
  if (location) fields.jobLocation = location;
  if (jobId) fields.externalJobId = jobId;

  return fields;
}

async function handleMarkApplied(
  btnId: string,
  errorId: string,
  successId: string,
  optionalPrefix: string,
  matchedJobId?: string
): Promise<void> {
  const btn = $(btnId) as HTMLButtonElement;
  const errorEl = $(errorId);
  const successEl = $(successId);

  btn.disabled = true;
  errorEl.classList.add("hidden");
  successEl.classList.add("hidden");

  try {
    const optFields = getOptionalFields(optionalPrefix);
    const response = await markApplied({
      originalUrl: currentUrl,
      matchedJobId,
      ...optFields,
    });

    // Show success
    successEl.classList.remove("hidden");
    btn.classList.add("hidden");

    // Update cache
    await updateCacheToApplied(currentUrl, response);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to mark as applied";
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
    btn.disabled = false;
  }
}

async function handleManualSubmit(): Promise<void> {
  const company = (document.getElementById("manual-company") as HTMLInputElement).value.trim();
  const title = (document.getElementById("manual-title") as HTMLInputElement).value.trim();
  const location = (document.getElementById("manual-location") as HTMLInputElement).value.trim();
  const jobId = (document.getElementById("manual-job-id") as HTMLInputElement).value.trim();
  const validationError = $("manual-validation-error");

  // Validation: company required + (jobId OR title+location)
  if (!company || (!jobId && !(title && location))) {
    validationError.classList.remove("hidden");
    return;
  }
  validationError.classList.add("hidden");

  const btn = $("btn-manual-submit") as HTMLButtonElement;
  const errorEl = $("manual-mark-error");
  const successEl = $("manual-mark-success");

  btn.disabled = true;
  errorEl.classList.add("hidden");
  successEl.classList.add("hidden");

  try {
    const resume = (document.getElementById("manual-resume") as HTMLInputElement).value.trim();
    const profile = (document.getElementById("manual-profile") as HTMLInputElement).value.trim();
    const notes = (document.getElementById("manual-notes") as HTMLTextAreaElement).value.trim();

    const response = await markApplied({
      originalUrl: currentUrl,
      ...(company ? { companyName: company } : {}),
      ...(title ? { jobTitle: title } : {}),
      ...(location ? { jobLocation: location } : {}),
      ...(jobId ? { externalJobId: jobId } : {}),
      ...(resume ? { resumeVersion: resume } : {}),
      ...(profile ? { profileLabel: profile } : {}),
      ...(notes ? { notes } : {}),
    });

    successEl.classList.remove("hidden");
    btn.classList.add("hidden");
    await updateCacheToApplied(currentUrl, response);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to mark as applied";
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

async function runCheck(url: string): Promise<void> {
  showState("state-loading");
  setBadge("Loading…", "badge-loading");

  try {
    const result = await checkUrl(url);
    currentCheckData = result;
    renderCheckResult(result);
    await setCachedResult(url, result);
  } catch (err) {
    if (err instanceof AuthError) {
      renderAuth401();
    } else if (err instanceof ForbiddenError) {
      renderAuth403();
    } else if (err instanceof NetworkError || err instanceof TimeoutError) {
      renderNetworkError(
        err instanceof TimeoutError
          ? "The request timed out. The app may be slow or unreachable."
          : "Check that the Sync Job Tracker app is running."
      );
    } else {
      renderNetworkError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Read active tab URL
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    const url = tab?.url || "";

    currentUrl = url;
    setText("current-url", url || "No URL available");

    // Non-HTTP URLs: skip API call
    if (!url || !isHttpUrl(url)) {
      renderUnsupported();
      return;
    }

    // Show cached result immediately if available
    const cached = await getCachedResult(url);
    if (cached) {
      currentCheckData = cached.result;
      renderCheckResult(cached.result);
    }

    // Always re-check in background (even if cached)
    await runCheck(url);
  });

  // ---- Event listeners ----

  // Mark as Applied (new job state)
  $("btn-mark-applied").addEventListener("click", () => {
    handleMarkApplied(
      "btn-mark-applied",
      "mark-error",
      "mark-success",
      "opt",
      undefined
    );
  });

  // Mark Anyway (duplicate state)
  $("btn-mark-anyway").addEventListener("click", () => {
    const matchedJobId = currentCheckData?.matchedJob?.id;
    handleMarkApplied(
      "btn-mark-anyway",
      "dup-mark-error",
      "dup-mark-success",
      "dup-opt",
      matchedJobId
    );
  });

  // Manual submit
  $("btn-manual-submit").addEventListener("click", () => {
    handleManualSubmit();
  });

  // Open in App (401 fallback)
  $("btn-open-app").addEventListener("click", () => {
    const encoded = encodeURIComponent(currentUrl);
    chrome.tabs.create({
      url: `http://localhost:3000/extension/check?url=${encoded}`,
    });
  });

  // Retry (network error)
  $("btn-retry").addEventListener("click", () => {
    if (currentUrl && isHttpUrl(currentUrl)) {
      runCheck(currentUrl);
    }
  });
});
