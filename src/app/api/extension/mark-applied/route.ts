import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { markAppliedRequestSchema } from "../../../../../shared/extension-api";
import { isAllowedEmail } from "../../../../../shared/access";
import type {
  MarkAppliedResponse,
  ApplicationSummary,
} from "../../../../../shared/extension-api";

type ConvexApplicationResult = {
  id: string;
  appliedAt: number;
  resumeVersion?: string | null;
  profileLabel?: string | null;
  notes?: string | null;
  userName: string;
  userEmail?: string | null;
};

function mapApplications(
  apps: ConvexApplicationResult[],
): ApplicationSummary[] {
  return apps.map((app) => ({
    id: app.id,
    appliedAt: app.appliedAt,
    resumeVersion: app.resumeVersion ?? null,
    profileLabel: app.profileLabel ?? null,
    notes: app.notes ?? null,
    userName: app.userName,
    userEmail: app.userEmail ?? null,
  }));
}

export async function POST(request: Request): Promise<Response> {
  // 1. Authenticate via Clerk server auth
  const { userId, sessionClaims, getToken } = await auth();

  if (!userId) {
    return Response.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const email = sessionClaims?.email as string | undefined;
  if (!isAllowedEmail(email, process.env.ALLOWED_EMAILS)) {
    return Response.json(
      { error: "Your account is not authorized to access this resource" },
      { status: 403 },
    );
  }

  // 2. Parse and validate input body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = markAppliedRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const {
    originalUrl,
    companyName,
    jobTitle,
    jobLocation,
    externalJobId,
    matchedJobId,
    resumeVersion,
    profileLabel,
    notes,
  } = parsed.data;

  // 3. Trim override fields and normalize whitespace-only metadata to undefined
  const trimmedOverrides: Record<string, string | undefined> = {};
  if (companyName !== undefined) {
    const trimmed = companyName.trim();
    trimmedOverrides.companyName = trimmed || undefined;
  }
  if (jobTitle !== undefined) {
    const trimmed = jobTitle.trim();
    trimmedOverrides.jobTitle = trimmed || undefined;
  }
  if (jobLocation !== undefined) {
    const trimmed = jobLocation.trim();
    trimmedOverrides.jobLocation = trimmed || undefined;
  }
  if (externalJobId !== undefined) {
    const trimmed = externalJobId.trim();
    trimmedOverrides.externalJobId = trimmed || undefined;
  }

  // Whitespace-only metadata treated as undefined (Convex stores as null)
  const trimmedResume = resumeVersion?.trim() || undefined;
  const trimmedProfile = profileLabel?.trim() || undefined;
  const trimmedNotes = notes?.trim() || undefined;

  // 4. Build mutation args
  const mutationArgs: Record<string, unknown> = {
    originalUrl,
    ...trimmedOverrides,
    ...(trimmedResume !== undefined && { resumeVersion: trimmedResume }),
    ...(trimmedProfile !== undefined && { profileLabel: trimmedProfile }),
    ...(trimmedNotes !== undefined && { notes: trimmedNotes }),
  };

  // matchedJobId: pass through if provided; Convex will validate as Id<"jobs">
  // If invalid, Convex will throw and we catch gracefully below
  if (matchedJobId !== undefined && matchedJobId.trim() !== "") {
    mutationArgs.matchedJobId = matchedJobId.trim();
  }

  // 5. Get Clerk JWT and call Convex markApplied mutation
  try {
    const token = await getToken({ template: "convex" });
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    client.setAuth(token!);

    const result = await client.mutation(api.jobs.markApplied, mutationArgs);

    // 6. Map response to MarkAppliedResponse shape (strip workspaceId if present)
    const response: MarkAppliedResponse = {
      jobId: result.jobId,
      companyName: result.companyName,
      jobTitle: result.jobTitle ?? null,
      jobLocation: result.jobLocation ?? null,
      externalJobId: result.externalJobId ?? null,
      applications: mapApplications(result.applications),
    };

    return Response.json(response, { status: 200 });
  } catch (error) {
    // Handle Convex ConvexError (structured errors) vs generic errors
    // ConvexError from insufficient identity fields should return 400
    const message =
      error instanceof Error ? error.message : "Internal server error";

    // If it's a ConvexError about insufficient identity, return 400
    if (
      message.includes("stable job ID") ||
      message.includes("company, title, and location")
    ) {
      return Response.json({ error: message }, { status: 400 });
    }

    // Invalid matchedJobId: Convex throws when the ID format is invalid
    // Fall through gracefully by retrying without matchedJobId
    if (
      matchedJobId !== undefined &&
      (message.includes("Invalid ID") ||
        message.includes("Could not find") ||
        message.includes("is not a valid ID"))
    ) {
      try {
        const token = await getToken({ template: "convex" });
        const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
        client.setAuth(token!);

        // Retry without matchedJobId — let canonical key lookup handle it
        const retryArgs = { ...mutationArgs };
        delete retryArgs.matchedJobId;

        const result = await client.mutation(
          api.jobs.markApplied,
          retryArgs,
        );

        const response: MarkAppliedResponse = {
          jobId: result.jobId,
          companyName: result.companyName,
          jobTitle: result.jobTitle ?? null,
          jobLocation: result.jobLocation ?? null,
          externalJobId: result.externalJobId ?? null,
          applications: mapApplications(result.applications),
        };

        return Response.json(response, { status: 200 });
      } catch (retryError) {
        const retryMessage =
          retryError instanceof Error
            ? retryError.message
            : "Internal server error";

        if (
          retryMessage.includes("stable job ID") ||
          retryMessage.includes("company, title, and location")
        ) {
          return Response.json({ error: retryMessage }, { status: 400 });
        }

        return Response.json({ error: retryMessage }, { status: 500 });
      }
    }

    return Response.json({ error: message }, { status: 500 });
  }
}
