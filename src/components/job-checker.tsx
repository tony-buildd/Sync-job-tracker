"use client";

import { useAction, useConvexAuth, useMutation } from "convex/react";
import { AlertTriangle, BadgeCheck, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { api } from "../../convex/_generated/api";
import type { MatchConfidence, MatchStatus } from "../../shared/job-matching";

type ApplicationSummary = {
  id: string;
  appliedAt: number;
  resumeVersion: string | null;
  profileLabel: string | null;
  notes: string | null;
  userName: string;
  userEmail: string | null;
};

type ParsedJob = {
  originalUrl: string;
  companyName: string | null;
  jobTitle: string | null;
  jobLocation: string | null;
  externalJobId: string | null;
  primaryCanonicalKey: string | null;
  fallbackCanonicalKey: string | null;
};

type CheckResult = {
  status: MatchStatus;
  confidence: MatchConfidence;
  reasons: string[];
  parsedJob: ParsedJob;
  matchedJob: {
    id: string;
    companyName: string;
    jobTitle: string | null;
    jobLocation: string | null;
    externalJobId: string | null;
    sourceUrls: string[];
  } | null;
  applications: ApplicationSummary[];
};

type SaveFormState = {
  companyName: string;
  jobTitle: string;
  jobLocation: string;
  externalJobId: string;
  resumeVersion: string;
  profileLabel: string;
  notes: string;
};

const STATUS_COPY: Record<
  MatchStatus,
  { label: string; description: string; tone: string; icon: typeof BadgeCheck }
> = {
  new: {
    label: "New job",
    description: "No applied record exists yet. This check will not be stored unless you mark it as applied.",
    tone: "border-emerald-500/30 bg-emerald-500/12 text-emerald-100",
    icon: BadgeCheck,
  },
  already_applied: {
    label: "Already applied",
    description: "This canonical job already exists in the shared applied list.",
    tone: "border-rose-500/30 bg-rose-500/12 text-rose-100",
    icon: ShieldCheck,
  },
  possible_duplicate: {
    label: "Possible duplicate",
    description: "The match came from fallback identity fields, so it needs human judgment.",
    tone: "border-amber-400/30 bg-amber-400/12 text-amber-50",
    icon: AlertTriangle,
  },
  unparseable: {
    label: "Needs manual details",
    description: "The link did not expose enough identity fields to compare confidently.",
    tone: "border-sky-400/30 bg-sky-400/12 text-sky-50",
    icon: AlertTriangle,
  },
};

function buildInitialSaveForm(parsedJob: ParsedJob): SaveFormState {
  return {
    companyName: parsedJob.companyName ?? "",
    jobTitle: parsedJob.jobTitle ?? "",
    jobLocation: parsedJob.jobLocation ?? "",
    externalJobId: parsedJob.externalJobId ?? "",
    resumeVersion: "",
    profileLabel: "",
    notes: "",
  };
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function canSaveAppliedJob(form: SaveFormState) {
  const hasPrimaryKey = Boolean(form.companyName.trim() && form.externalJobId.trim());
  const hasFallbackKey = Boolean(
    form.companyName.trim() && form.jobTitle.trim() && form.jobLocation.trim(),
  );

  return hasPrimaryKey || hasFallbackKey;
}

export function JobChecker({
  viewerName,
  viewerEmail,
}: {
  viewerName: string;
  viewerEmail: string;
}) {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [saveForm, setSaveForm] = useState<SaveFormState | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isChecking, startCheckTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();
  const { isAuthenticated, isLoading } = useConvexAuth();

  const checkJob = useAction(api.jobs.checkUrl);
  const markApplied = useMutation(api.jobs.markApplied);

  const readyToCheck = useMemo(() => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }, [url]);

  const saveEnabled = saveForm ? canSaveAppliedJob(saveForm) : false;
  const statusMeta = result ? STATUS_COPY[result.status] : null;

  async function handleCheckSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!readyToCheck) {
      setError("Paste a full job URL before checking.");
      return;
    }

    setError(null);
    setSaveError(null);
    setSaveSuccess(null);

    startCheckTransition(async () => {
      try {
        const nextResult = (await checkJob({ url })) as CheckResult;
        setResult(nextResult);
        setSaveForm(buildInitialSaveForm(nextResult.parsedJob));
        setDialogOpen(true);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "The job link could not be checked right now.",
        );
      }
    });
  }

  function closeDialog() {
    setDialogOpen(false);
    setSaveError(null);
    setSaveSuccess(null);
  }

  async function handleMarkApplied() {
    if (!result || !saveForm) {
      return;
    }

    setSaveError(null);
    setSaveSuccess(null);

    startSaveTransition(async () => {
      try {
        const saved = await markApplied({
          originalUrl: result.parsedJob.originalUrl,
          companyName: saveForm.companyName.trim() || undefined,
          jobTitle: saveForm.jobTitle.trim() || undefined,
          jobLocation: saveForm.jobLocation.trim() || undefined,
          externalJobId: saveForm.externalJobId.trim() || undefined,
          matchedJobId: result.matchedJob?.id as never,
          resumeVersion: saveForm.resumeVersion.trim() || undefined,
          profileLabel: saveForm.profileLabel.trim() || undefined,
          notes: saveForm.notes.trim() || undefined,
        });

        const updatedResult: CheckResult = {
          status: "already_applied",
          confidence: result.matchedJob?.id ? result.confidence : "high",
          reasons: result.matchedJob?.id ? result.reasons : ["saved_new_application"],
          parsedJob: result.parsedJob,
          matchedJob: {
            id: saved.jobId as string,
            companyName: saved.companyName,
            jobTitle: saved.jobTitle,
            jobLocation: saved.jobLocation,
            externalJobId: saved.externalJobId,
            sourceUrls: result.matchedJob?.sourceUrls ?? [result.parsedJob.originalUrl],
          },
          applications: saved.applications as ApplicationSummary[],
        };

        setResult(updatedResult);
        setSaveSuccess("Saved as an applied job in the shared workspace.");
      } catch (caughtError) {
        setSaveError(
          caughtError instanceof Error
            ? caughtError.message
            : "This job could not be saved as applied.",
        );
      }
    });
  }

  if (isLoading || !isAuthenticated) {
    return (
      <section className="flex min-h-[28rem] items-center justify-center rounded-[2rem] border border-white/12 bg-black/25 p-10 text-sm text-white/70 shadow-2xl shadow-black/20 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <LoaderCircle className="size-4 animate-spin" />
          <span>Connecting the shared workspace…</span>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-[2rem] border border-white/12 bg-black/35 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <span className="inline-flex rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/60">
                Shared duplicate shield
              </span>
              <div className="space-y-2">
                <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
                  Paste a job link and see whether someone already used it.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
                  The app only stores applied jobs. Unapplied checks disappear after the dialog closes.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm text-white/80">
              <div className="font-medium text-white">{viewerName}</div>
              <div className="text-white/55">{viewerEmail}</div>
            </div>
          </div>

          <form className="mt-10 space-y-4" onSubmit={handleCheckSubmit}>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white/80">Job URL</span>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/35" />
                  <input
                    className="h-14 w-full rounded-2xl border border-white/12 bg-white/8 pl-11 pr-4 text-sm text-white outline-none transition focus:border-[var(--ring)] focus:bg-white/10"
                    placeholder="https://careers.company.com/en/job/..."
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isChecking || !readyToCheck}
                  className="inline-flex h-14 items-center justify-center rounded-2xl bg-[var(--accent)] px-6 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isChecking ? "Checking..." : "Check job"}
                </button>
              </div>
            </label>
            {error ? (
              <p className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </p>
            ) : null}
          </form>
        </div>

        <aside className="rounded-[2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8">
          <div className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/45">Decision rules</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">How matching works</h2>
            </div>
            <ul className="space-y-3 text-sm leading-6 text-white/72">
              <li>`already applied` uses the strongest identity: company + extracted job ID.</li>
              <li>`possible duplicate` uses conservative company + title + location fallback.</li>
              <li>The raw URL is evidence only. Tracking parameters are ignored for identity.</li>
            </ul>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/72">
              Saving is optional and only happens when you mark a job as applied.
            </div>
          </div>
        </aside>
      </section>

      {dialogOpen && result && saveForm && statusMeta ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#09070fcc]/90 p-4 backdrop-blur-md">
          <div className="w-full max-w-3xl rounded-[2rem] border border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(142,255,217,0.18),transparent_36%),linear-gradient(180deg,rgba(20,19,29,0.98),rgba(9,9,13,0.98))] p-6 text-white shadow-[0_30px_120px_rgba(0,0,0,0.55)] sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-4">
                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${statusMeta.tone}`}>
                  <statusMeta.icon className="size-4" />
                  <span>{statusMeta.label}</span>
                </div>
                <div>
                  <h3 className="text-2xl font-semibold tracking-[-0.03em] text-white">
                    {result.parsedJob.companyName ?? "Unknown company"}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
                    {statusMeta.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-full border border-white/12 px-3 py-1 text-sm text-white/70 transition hover:bg-white/8 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
              <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-black/22 p-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/45">Parsed fields</p>
                  <dl className="mt-4 space-y-3 text-sm text-white/78">
                    <div className="flex justify-between gap-4">
                      <dt className="text-white/45">Company</dt>
                      <dd>{saveForm.companyName || "Not found"}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-white/45">Title</dt>
                      <dd className="text-right">{saveForm.jobTitle || "Not found"}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-white/45">Location</dt>
                      <dd className="text-right">{saveForm.jobLocation || "Not found"}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-white/45">Job ID</dt>
                      <dd className="text-right">{saveForm.externalJobId || "Not found"}</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-2xl border border-white/8 bg-white/4 p-4 text-xs leading-6 text-white/58">
                  Source link: <span className="break-all text-white/72">{result.parsedJob.originalUrl}</span>
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-[1.5rem] border border-white/10 bg-black/22 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/45">Prior applicants</p>
                  {result.applications.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {result.applications.map((application) => (
                        <div
                          key={application.id}
                          className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <div className="font-medium text-white">{application.userName}</div>
                              <div className="text-xs text-white/50">
                                {application.userEmail ?? "Shared workspace member"}
                              </div>
                            </div>
                            <div className="text-xs text-white/55">
                              {formatDate(application.appliedAt)}
                            </div>
                          </div>
                          {application.resumeVersion || application.profileLabel || application.notes ? (
                            <div className="mt-3 grid gap-2 text-xs text-white/65">
                              {application.resumeVersion ? (
                                <div>Resume version: {application.resumeVersion}</div>
                              ) : null}
                              {application.profileLabel ? (
                                <div>Profile label: {application.profileLabel}</div>
                              ) : null}
                              {application.notes ? <div>Notes: {application.notes}</div> : null}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-white/65">
                      No one has saved this job as applied yet.
                    </p>
                  )}
                </div>

                {result.status !== "already_applied" ? (
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/22 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-white/45">
                          Mark applied
                        </p>
                        <p className="mt-2 text-sm leading-6 text-white/68">
                          Save only the applied job identity and optional resume metadata.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <input
                        className="h-12 rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white outline-none transition focus:border-[var(--ring)]"
                        placeholder="Company name"
                        value={saveForm.companyName}
                        onChange={(event) =>
                          setSaveForm((current) =>
                            current ? { ...current, companyName: event.target.value } : current,
                          )
                        }
                      />
                      <input
                        className="h-12 rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white outline-none transition focus:border-[var(--ring)]"
                        placeholder="External job ID"
                        value={saveForm.externalJobId}
                        onChange={(event) =>
                          setSaveForm((current) =>
                            current ? { ...current, externalJobId: event.target.value } : current,
                          )
                        }
                      />
                      <input
                        className="h-12 rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white outline-none transition focus:border-[var(--ring)]"
                        placeholder="Job title"
                        value={saveForm.jobTitle}
                        onChange={(event) =>
                          setSaveForm((current) =>
                            current ? { ...current, jobTitle: event.target.value } : current,
                          )
                        }
                      />
                      <input
                        className="h-12 rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white outline-none transition focus:border-[var(--ring)]"
                        placeholder="Location"
                        value={saveForm.jobLocation}
                        onChange={(event) =>
                          setSaveForm((current) =>
                            current ? { ...current, jobLocation: event.target.value } : current,
                          )
                        }
                      />
                      <input
                        className="h-12 rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white outline-none transition focus:border-[var(--ring)]"
                        placeholder="Resume version (optional)"
                        value={saveForm.resumeVersion}
                        onChange={(event) =>
                          setSaveForm((current) =>
                            current ? { ...current, resumeVersion: event.target.value } : current,
                          )
                        }
                      />
                      <input
                        className="h-12 rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white outline-none transition focus:border-[var(--ring)]"
                        placeholder="Profile label (optional)"
                        value={saveForm.profileLabel}
                        onChange={(event) =>
                          setSaveForm((current) =>
                            current ? { ...current, profileLabel: event.target.value } : current,
                          )
                        }
                      />
                    </div>
                    <textarea
                      className="mt-3 min-h-28 w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--ring)]"
                      placeholder="Notes (optional)"
                      value={saveForm.notes}
                      onChange={(event) =>
                        setSaveForm((current) =>
                          current ? { ...current, notes: event.target.value } : current,
                        )
                      }
                    />

                    {!saveEnabled ? (
                      <p className="mt-3 text-xs leading-5 text-amber-100/80">
                        To save without a job ID, enter an exact company, title, and location.
                      </p>
                    ) : null}
                    {saveError ? (
                      <p className="mt-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                        {saveError}
                      </p>
                    ) : null}
                    {saveSuccess ? (
                      <p className="mt-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                        {saveSuccess}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      onClick={handleMarkApplied}
                      disabled={!saveEnabled || isSaving}
                      className="mt-4 inline-flex h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSaving ? "Saving applied job..." : "Mark as applied"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
