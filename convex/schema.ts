import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  workspaces: defineTable({
    slug: v.string(),
    name: v.string(),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),
  users: defineTable({
    workspaceId: v.id("workspaces"),
    clerkUserId: v.string(),
    email: v.string(),
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_workspace_email", ["workspaceId", "email"]),
  jobs: defineTable({
    workspaceId: v.id("workspaces"),
    companyName: v.string(),
    jobTitle: v.optional(v.string()),
    jobLocation: v.optional(v.string()),
    externalJobId: v.optional(v.string()),
    normalizedCompany: v.string(),
    normalizedTitle: v.optional(v.string()),
    normalizedLocation: v.optional(v.string()),
    canonicalKey: v.string(),
    sourceUrls: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace_canonical_key", ["workspaceId", "canonicalKey"])
    .index("by_workspace_company", ["workspaceId", "normalizedCompany"]),
  applications: defineTable({
    workspaceId: v.id("workspaces"),
    jobId: v.id("jobs"),
    userId: v.id("users"),
    appliedAt: v.number(),
    resumeVersion: v.optional(v.string()),
    profileLabel: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_workspace_job", ["workspaceId", "jobId"])
    .index("by_workspace_user", ["workspaceId", "userId"])
    .index("by_job_user", ["jobId", "userId"]),
});

