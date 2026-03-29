import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseJobUrl } from "@/lib/fingerprint";

/**
 * GET /api/jobs/check?url=<encoded-url>
 *
 * Checks whether a job URL has already been tracked.
 * Returns { exists: false } or { exists: true, job: Job }.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url query param is required" }, { status: 400 });
  }

  let fingerprint: string;
  try {
    ({ fingerprint } = parseJobUrl(url));
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const job = await prisma.job.findUnique({ where: { fingerprint } });

  if (job) {
    return NextResponse.json({ exists: true, job });
  }

  return NextResponse.json({ exists: false });
}
