import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { addCollaborator } from "@/lib/github";

function getPayload(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7));
}

// POST /api/projects/[id]/workers  — add a worker to the project
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = getPayload(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workerId } = await req.json();
  if (!workerId) return NextResponse.json({ error: "workerId required" }, { status: 400 });

  try {
    const record = await db.projectWorker.create({ data: { projectId: id, workerId } });

    // Try to add as GitHub collaborator
    const project = await db.project.findUnique({ where: { id } });
    if (project?.repoName) {
      const wp = await db.workerProfile.findUnique({ where: { userId: workerId } });
      if (wp?.githubId) await addCollaborator(project.repoName, wp.githubId);
    }

    return NextResponse.json({ record }, { status: 201 });
  } catch (err: any) {
    if (err.code === "P2002") return NextResponse.json({ error: "Worker already added" }, { status: 409 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/workers  — remove worker
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = getPayload(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workerId } = await req.json();
  await db.projectWorker.deleteMany({ where: { projectId: id, workerId } });
  return NextResponse.json({ ok: true });
}
