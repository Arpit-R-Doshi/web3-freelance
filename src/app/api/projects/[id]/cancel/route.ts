import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

function getPayload(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7));
}

// POST /api/projects/[id]/cancel
// Called after the client signs the on-chain cancelProject tx.
// Updates the DB: status → "cancelled", escrowStatus → "none"
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const payload = getPayload(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (project.ownerId !== payload.userId)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (project.status === "cancelled" || project.status === "completed")
      return NextResponse.json({ error: "Project already ended" }, { status: 400 });

    const updated = await db.project.update({
      where: { id: projectId },
      data: { status: "cancelled", escrowStatus: "none" },
    });

    return NextResponse.json({ project: updated });
  } catch (err: any) {
    console.error("[project-cancel]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
