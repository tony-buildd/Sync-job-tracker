import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DELETE /api/jobs/[id] - remove a job
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const existing = await prisma.job.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.job.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

// PATCH /api/jobs/[id] - update a job (status or notes)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.job.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const job = await prisma.job.update({
    where: { id },
    data: {
      ...(body.status !== undefined && { status: body.status }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.title !== undefined && { title: body.title }),
      ...(body.company !== undefined && { company: body.company }),
    },
  });

  return NextResponse.json(job);
}
