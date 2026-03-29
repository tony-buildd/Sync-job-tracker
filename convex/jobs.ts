import { ConvexError, v } from "convex/values";
import {
  type ActionCtx,
  type DatabaseReader,
  type MutationCtx,
  action,
  internalQuery,
  mutation,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { deriveCanonicalIdentity, parseJobUrl } from "../shared/job-matching";
import { isAllowedEmail } from "../shared/access";

type WorkspaceDoc = Doc<"workspaces">;
type UserDoc = Doc<"users">;
type JobDoc = Doc<"jobs">;
type ApplicationDoc = Doc<"applications">;

function getHouseholdConfig() {
  return {
    slug: process.env.HOUSEHOLD_SLUG || "default-household",
    name: process.env.HOUSEHOLD_NAME || "Shared Job Space",
  };
}

async function requireAllowedIdentity(ctx: {
  auth: ActionCtx["auth"] | MutationCtx["auth"];
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.email) {
    throw new ConvexError("You must be signed in with Google to use this app.");
  }

  if (!isAllowedEmail(identity.email, process.env.ALLOWED_EMAILS)) {
    throw new ConvexError("This account is not allowed to access the shared workspace.");
  }

  return identity;
}

async function buildApplicationSummary(
  ctx: {
    db: Pick<DatabaseReader, "get">;
  },
  applications: ApplicationDoc[],
) {
  return Promise.all(
    applications.map(async (application) => {
      const user = await ctx.db.get(application.userId);
      return {
        id: application._id,
        appliedAt: application.appliedAt,
        resumeVersion: application.resumeVersion ?? null,
        profileLabel: application.profileLabel ?? null,
        notes: application.notes ?? null,
        userName: user?.name ?? user?.email ?? "Unknown user",
        userEmail: user?.email ?? null,
      };
    }),
  );
}

export const checkUrl = action({
  args: {
    url: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAllowedIdentity(ctx);

    const parsed = parseJobUrl(args.url);
    const workspace = await ctx.runQuery(internal.jobs.getWorkspaceBySlug, {
      slug: getHouseholdConfig().slug,
    });

    let matchedRecord:
      | {
          job: JobDoc;
          applications: Awaited<ReturnType<typeof buildApplicationSummary>>;
        }
      | null = null;

    if (workspace && parsed.primaryCanonicalKey) {
      matchedRecord = await ctx.runQuery(internal.jobs.findMatchByCanonicalKey, {
        workspaceId: workspace._id,
        canonicalKey: parsed.primaryCanonicalKey,
      });
    }

    if (matchedRecord) {
      return {
        status: "already_applied" as const,
        confidence: "high" as const,
        reasons: ["matched_primary_key"],
        parsedJob: parsed,
        matchedJob: {
          id: matchedRecord.job._id,
          companyName: matchedRecord.job.companyName,
          jobTitle: matchedRecord.job.jobTitle ?? null,
          jobLocation: matchedRecord.job.jobLocation ?? null,
          externalJobId: matchedRecord.job.externalJobId ?? null,
          sourceUrls: matchedRecord.job.sourceUrls,
        },
        applications: matchedRecord.applications,
      };
    }

    if (workspace && parsed.fallbackCanonicalKey) {
      matchedRecord = await ctx.runQuery(internal.jobs.findMatchByCanonicalKey, {
        workspaceId: workspace._id,
        canonicalKey: parsed.fallbackCanonicalKey,
      });
    }

    if (matchedRecord) {
      return {
        status: "possible_duplicate" as const,
        confidence: "medium" as const,
        reasons: ["matched_fallback_key"],
        parsedJob: parsed,
        matchedJob: {
          id: matchedRecord.job._id,
          companyName: matchedRecord.job.companyName,
          jobTitle: matchedRecord.job.jobTitle ?? null,
          jobLocation: matchedRecord.job.jobLocation ?? null,
          externalJobId: matchedRecord.job.externalJobId ?? null,
          sourceUrls: matchedRecord.job.sourceUrls,
        },
        applications: matchedRecord.applications,
      };
    }

    const hasEnoughDataToCheck = Boolean(
      parsed.primaryCanonicalKey || parsed.fallbackCanonicalKey,
    );

    return {
      status: hasEnoughDataToCheck ? ("new" as const) : ("unparseable" as const),
      confidence: hasEnoughDataToCheck ? ("low" as const) : ("low" as const),
      reasons: hasEnoughDataToCheck
        ? (["no_existing_match"] as const)
        : (["insufficient_identity_fields"] as const),
      parsedJob: parsed,
      matchedJob: null,
      applications: [],
    };
  },
});

export const markApplied = mutation({
  args: {
    originalUrl: v.string(),
    companyName: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    jobLocation: v.optional(v.string()),
    externalJobId: v.optional(v.string()),
    matchedJobId: v.optional(v.id("jobs")),
    resumeVersion: v.optional(v.string()),
    profileLabel: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAllowedIdentity(ctx);
    const now = Date.now();
    const workspace = await ensureWorkspace(ctx, now);
    const user = await ensureUser(ctx, workspace._id, identity, now);

    const parsed = parseJobUrl(args.originalUrl);
    const merged = {
      companyName: args.companyName?.trim() || parsed.companyName,
      jobTitle: args.jobTitle?.trim() || parsed.jobTitle,
      jobLocation: args.jobLocation?.trim() || parsed.jobLocation,
      externalJobId: args.externalJobId?.trim() || parsed.externalJobId,
    };
    const identityFields = deriveCanonicalIdentity(merged);

    let job: JobDoc | null = null;

    if (args.matchedJobId) {
      const matched = await ctx.db.get(args.matchedJobId);
      if (matched && matched.workspaceId === workspace._id) {
        job = matched;
      }
    }

    if (!job) {
      const canonicalKey =
        identityFields.primaryCanonicalKey ?? identityFields.fallbackCanonicalKey;

      if (!canonicalKey || !identityFields.normalizedCompany) {
        throw new ConvexError(
          "This job needs either a stable job ID or an exact company, title, and location before it can be saved as applied.",
        );
      }

      job =
        (await ctx.db
          .query("jobs")
          .withIndex("by_workspace_canonical_key", (query) =>
            query.eq("workspaceId", workspace._id).eq("canonicalKey", canonicalKey),
          )
          .unique()) ?? null;

      if (!job) {
        const jobId = await ctx.db.insert("jobs", {
          workspaceId: workspace._id,
          companyName: merged.companyName ?? "Unknown Company",
          jobTitle: merged.jobTitle ?? undefined,
          jobLocation: merged.jobLocation ?? undefined,
          externalJobId: merged.externalJobId ?? undefined,
          normalizedCompany: identityFields.normalizedCompany,
          normalizedTitle: identityFields.normalizedTitle ?? undefined,
          normalizedLocation: identityFields.normalizedLocation ?? undefined,
          canonicalKey,
          sourceUrls: [args.originalUrl],
          createdAt: now,
          updatedAt: now,
        });
        job = await ctx.db.get(jobId);
      }
    }

    if (!job) {
      throw new ConvexError("Unable to create or locate the canonical job record.");
    }

    const nextUrls = job.sourceUrls.includes(args.originalUrl)
      ? job.sourceUrls
      : [...job.sourceUrls, args.originalUrl];

    await ctx.db.patch(job._id, {
      companyName: merged.companyName ?? job.companyName,
      jobTitle: merged.jobTitle ?? job.jobTitle,
      jobLocation: merged.jobLocation ?? job.jobLocation,
      externalJobId: merged.externalJobId ?? job.externalJobId,
      sourceUrls: nextUrls,
      updatedAt: now,
    });

    const existingApplication = await ctx.db
      .query("applications")
      .withIndex("by_job_user", (query) =>
        query.eq("jobId", job._id).eq("userId", user._id),
      )
      .unique();

    if (!existingApplication) {
      await ctx.db.insert("applications", {
        workspaceId: workspace._id,
        jobId: job._id,
        userId: user._id,
        appliedAt: now,
        resumeVersion: args.resumeVersion?.trim() || undefined,
        profileLabel: args.profileLabel?.trim() || undefined,
        notes: args.notes?.trim() || undefined,
      });
    }

    const applications = await ctx.db
      .query("applications")
      .withIndex("by_workspace_job", (query) =>
        query.eq("workspaceId", workspace._id).eq("jobId", job._id),
      )
      .collect();

    return {
      jobId: job._id,
      companyName: merged.companyName ?? job.companyName,
      jobTitle: merged.jobTitle ?? job.jobTitle ?? null,
      jobLocation: merged.jobLocation ?? job.jobLocation ?? null,
      externalJobId: merged.externalJobId ?? job.externalJobId ?? null,
      applications: await buildApplicationSummary(ctx, applications),
    };
  },
});

async function ensureWorkspace(
  ctx: Pick<MutationCtx, "db">,
  now: number,
) {
  const { slug, name } = getHouseholdConfig();
  let workspace = await ctx.db
    .query("workspaces")
    .withIndex("by_slug", (query) => query.eq("slug", slug))
    .unique();

  if (!workspace) {
    const workspaceId = await ctx.db.insert("workspaces", {
      slug,
      name,
      createdAt: now,
    });
    workspace = await ctx.db.get(workspaceId);
  }

  if (!workspace) {
    throw new ConvexError("Unable to initialize the shared workspace.");
  }

  return workspace as WorkspaceDoc;
}

async function ensureUser(
  ctx: Pick<MutationCtx, "db">,
  workspaceId: Id<"workspaces">,
  identity: { subject: string; email?: string; name?: string },
  now: number,
) {
  const existingUser = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (query) =>
      query.eq("clerkUserId", identity.subject),
    )
    .unique();

  const email = identity.email?.trim().toLowerCase() ?? "unknown@example.com";
  const name = identity.name?.trim() || email;

  if (existingUser) {
    await ctx.db.patch(existingUser._id, {
      email,
      name,
      updatedAt: now,
    });
    return (await ctx.db.get(existingUser._id)) as UserDoc;
  }

  const userId = await ctx.db.insert("users", {
    workspaceId,
    clerkUserId: identity.subject,
    email,
    name,
    createdAt: now,
    updatedAt: now,
  });

  return (await ctx.db.get(userId)) as UserDoc;
}

export const getWorkspaceBySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (query) => query.eq("slug", args.slug))
      .unique();
  },
});

export const findMatchByCanonicalKey = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    canonicalKey: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_workspace_canonical_key", (query) =>
        query.eq("workspaceId", args.workspaceId).eq("canonicalKey", args.canonicalKey),
      )
      .unique();

    if (!job) {
      return null;
    }

    const applications = await ctx.db
      .query("applications")
      .withIndex("by_workspace_job", (query) =>
        query.eq("workspaceId", args.workspaceId).eq("jobId", job._id),
      )
      .collect();

    return {
      job,
      applications: await buildApplicationSummary(ctx, applications),
    };
  },
});
