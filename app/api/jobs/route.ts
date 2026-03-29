import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseJobUrl } from "@/lib/fingerprint";

// GET /api/jobs - list all jobs (newest first)
export async function GET() {
  const jobs = await prisma.job.findMany({ orderBy: { appliedAt: "desc" } });
  return NextResponse.json(jobs);
}

// POST /api/jobs - create a new job application
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { url, title, company, appliedBy, notes, status } = body;

  if (!url || !title || !appliedBy) {
    return NextResponse.json(
      { error: "url, title, and appliedBy are required" },
      { status: 400 }
    );
  }

  let fingerprint: string;
  try {
    ({ fingerprint } = parseJobUrl(url));
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const existing = await prisma.job.findUnique({ where: { fingerprint } });
  if (existing) {
    return NextResponse.json(
      { error: "duplicate", job: existing },
      { status: 409 }
    );
  }

  const job = await prisma.job.create({
    data: {
      url,
      fingerprint,
      title,
      company: company || "",
      appliedBy,
      notes: notes || null,
      status: status || "Applied",
    },
  });

  return NextResponse.json(job, { status: 201 });
}
