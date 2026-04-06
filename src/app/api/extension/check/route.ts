import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { checkRequestSchema } from "../../../../../shared/extension-api";
import { isAllowedEmail } from "../../../../../shared/access";
import type { CheckResponse, ExtensionParsedJob } from "../../../../../shared/extension-api";

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

  const parsed = checkRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const { url } = parsed.data;

  // 3. Get Clerk JWT and call Convex checkUrl action
  try {
    const token = await getToken({ template: "convex" });
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    client.setAuth(token!);

    const result = await client.action(api.jobs.checkUrl, { url });

    // 4. Map response to CheckResponse shape, stripping internal fields from parsedJob
    const parsedJob: ExtensionParsedJob = {
      originalUrl: result.parsedJob.originalUrl,
      companyName: result.parsedJob.companyName,
      jobTitle: result.parsedJob.jobTitle,
      jobLocation: result.parsedJob.jobLocation,
      externalJobId: result.parsedJob.externalJobId,
    };

    const response: CheckResponse = {
      status: result.status,
      confidence: result.confidence,
      parsedJob,
      matchedJob: result.matchedJob,
      applications: result.applications,
      reasons: result.reasons,
    };

    return Response.json(response, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
