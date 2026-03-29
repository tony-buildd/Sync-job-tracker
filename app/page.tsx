"use client";

import { useState, useEffect, useCallback } from "react";

interface Job {
  id: string;
  url: string;
  fingerprint: string;
  company: string;
  title: string;
  status: string;
  appliedBy: string;
  appliedAt: string;
  notes: string | null;
}

type CheckResult =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "new"; url: string }
  | { state: "duplicate"; job: Job }
  | { state: "error"; message: string };

const STATUS_OPTIONS = ["Applied", "Interviewing", "Offer", "Rejected", "Withdrawn"];

const STATUS_COLORS: Record<string, string> = {
  Applied: "bg-blue-100 text-blue-800",
  Interviewing: "bg-yellow-100 text-yellow-800",
  Offer: "bg-green-100 text-green-800",
  Rejected: "bg-red-100 text-red-800",
  Withdrawn: "bg-gray-100 text-gray-700",
};

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [checkResult, setCheckResult] = useState<CheckResult>({ state: "idle" });

  // Add-job form fields
  const [addTitle, setAddTitle] = useState("");
  const [addCompany, setAddCompany] = useState("");
  const [addAppliedBy, setAddAppliedBy] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addStatus, setAddStatus] = useState("Applied");
  const [adding, setAdding] = useState(false);

  // Filter
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");

  const fetchJobs = useCallback(async () => {
    const res = await fetch("/api/jobs");
    if (res.ok) setJobs(await res.json());
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  async function checkUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setCheckResult({ state: "checking" });
    try {
      const res = await fetch(`/api/jobs/check?url=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) {
        setCheckResult({ state: "error", message: data.error ?? "Check failed" });
        return;
      }
      if (data.exists) {
        setCheckResult({ state: "duplicate", job: data.job });
      } else {
        setCheckResult({ state: "new", url: trimmed });
        // Pre-fill company from domain
        try {
          const domain = new URL(trimmed).hostname.replace(/^(jobs|careers|career|www)\./, "");
          setAddCompany((prev) => prev || domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1));
        } catch { /* ignore */ }
      }
    } catch {
      setCheckResult({ state: "error", message: "Network error" });
    }
  }

  async function addJob() {
    if (!addTitle || !addAppliedBy) return;
    const url = checkResult.state === "new" ? checkResult.url : urlInput.trim();
    setAdding(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          title: addTitle,
          company: addCompany,
          appliedBy: addAppliedBy,
          notes: addNotes,
          status: addStatus,
        }),
      });
      if (res.status === 409) {
        const data = await res.json();
        setCheckResult({ state: "duplicate", job: data.job });
      } else if (res.ok) {
        // Reset form
        setUrlInput("");
        setCheckResult({ state: "idle" });
        setAddTitle("");
        setAddCompany("");
        setAddAppliedBy("");
        setAddNotes("");
        setAddStatus("Applied");
        await fetchJobs();
      }
    } finally {
      setAdding(false);
    }
  }

  async function deleteJob(id: string) {
    if (!confirm("Remove this job from the tracker?")) return;
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated: Job = await res.json();
      setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
    }
  }

  const filteredJobs = jobs.filter((job) => {
    const matchText =
      !filterText ||
      job.title.toLowerCase().includes(filterText.toLowerCase()) ||
      job.company.toLowerCase().includes(filterText.toLowerCase()) ||
      job.appliedBy.toLowerCase().includes(filterText.toLowerCase());
    const matchStatus = filterStatus === "All" || job.status === filterStatus;
    return matchText && matchStatus;
  });

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-10">
      {/* Header */}
      <header className="text-center space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">🔁 Sync Job Tracker</h1>
        <p className="text-gray-500 text-sm">
          Paste a job URL to instantly check if it&apos;s already been applied — even if the link looks different.
        </p>
      </header>

      {/* URL Checker */}
      <section className="bg-white border rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">Check a Job URL</h2>
        <div className="flex gap-2">
          <input
            type="url"
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="https://careers.company.com/jobs/12345"
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              setCheckResult({ state: "idle" });
            }}
            onKeyDown={(e) => e.key === "Enter" && checkUrl()}
          />
          <button
            onClick={checkUrl}
            disabled={checkResult.state === "checking" || !urlInput.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {checkResult.state === "checking" ? "Checking…" : "Check"}
          </button>
        </div>

        {/* Result banner */}
        {checkResult.state === "duplicate" && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-1">
            <p className="font-semibold text-amber-800">⚠️ Already Applied</p>
            <p className="text-sm text-amber-700">
              <strong>{checkResult.job.title}</strong> at{" "}
              <strong>{checkResult.job.company}</strong> was applied by{" "}
              <strong>{checkResult.job.appliedBy}</strong> on{" "}
              {new Date(checkResult.job.appliedAt).toLocaleDateString()}.
            </p>
            <p className="text-xs text-amber-600">
              Status: <span className="font-medium">{checkResult.job.status}</span>
            </p>
          </div>
        )}

        {checkResult.state === "error" && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            ❌ {checkResult.message}
          </div>
        )}

        {/* Add job form – shown only when URL is new */}
        {checkResult.state === "new" && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-4 space-y-4">
            <p className="font-semibold text-green-800">✅ New Job – Not applied yet!</p>
            <p className="text-xs text-green-700">Fill in the details and add it to the tracker.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Job Title <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Process Engineer"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Nutrien"
                  value={addCompany}
                  onChange={(e) => setAddCompany(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Applied By <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Your name"
                  value={addAppliedBy}
                  onChange={(e) => setAddAppliedBy(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  value={addStatus}
                  onChange={(e) => setAddStatus(e.target.value)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  rows={2}
                  placeholder="Optional notes…"
                  value={addNotes}
                  onChange={(e) => setAddNotes(e.target.value)}
                />
              </div>
            </div>
            <button
              onClick={addJob}
              disabled={adding || !addTitle || !addAppliedBy}
              className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {adding ? "Adding…" : "Add to Tracker"}
            </button>
          </div>
        )}
      </section>

      {/* Job List */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <h2 className="text-lg font-semibold">
            Applications{" "}
            <span className="text-gray-400 font-normal text-sm">({filteredJobs.length})</span>
          </h2>
          <div className="flex gap-2 flex-wrap">
            <input
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
              placeholder="Search…"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
            <select
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="All">All Statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredJobs.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-12">
            No applications tracked yet. Paste a job URL above to get started.
          </p>
        ) : (
          <ul className="space-y-3">
            {filteredJobs.map((job) => (
              <li
                key={job.id}
                className="bg-white border rounded-2xl shadow-sm p-4 flex flex-col sm:flex-row sm:items-start gap-3"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        STATUS_COLORS[job.status] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {job.status}
                    </span>
                    <span className="text-xs text-gray-400">
                      by <strong>{job.appliedBy}</strong> ·{" "}
                      {new Date(job.appliedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900 truncate">{job.title}</p>
                  {job.company && (
                    <p className="text-sm text-gray-500">{job.company}</p>
                  )}
                  {job.notes && (
                    <p className="text-xs text-gray-400 italic">{job.notes}</p>
                  )}
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline truncate block max-w-xs"
                  >
                    {job.url}
                  </a>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    className="border rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={job.status}
                    onChange={(e) => updateStatus(job.id, e.target.value)}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => deleteJob(job.id)}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
