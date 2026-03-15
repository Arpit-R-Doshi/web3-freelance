import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

function getPayload(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7));
}

// POST /api/projects/[id]/complete
// Marks project as completed, escrow as released.
// The on-chain releasePayment tx is done client-side; this route only updates the DB.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const payload = getPayload(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { milestones: true, workers: true },
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (project.ownerId !== payload.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (project.status === "completed") {
      return NextResponse.json({ error: "Project already completed" }, { status: 400 });
    }

    // Mark all remaining milestone tokens as released
    const remaining = (project.budget ?? 0) - project.tokenReleased;

    const updated = await db.project.update({
      where: { id: projectId },
      data: {
        status: "completed",
        escrowStatus: "released",
        tokenReleased: project.budget ?? project.tokenReleased,
      },
    });

    // Update reputation for all workers assigned to this project
    for (const assignment of project.workers) {
      const workerProfile = await db.workerProfile.findUnique({
        where: { userId: assignment.workerId },
      });
      if (!workerProfile) continue;

      const newCompleted = workerProfile.completedProjectsCount + 1;
      const disputes = workerProfile.disputeCount;
      // Reputation: 10 pts per completed project, -20 pts per dispute, capped 0–100
      const newReputation = Math.max(0, Math.min(100, newCompleted * 10 - disputes * 20));

      await db.workerProfile.update({
        where: { userId: assignment.workerId },
        data: {
          completedProjectsCount: newCompleted,
          reputationScore: newReputation,
        },
      });
    }

    return NextResponse.json({ project: updated, remaining });
  } catch (err: any) {
    console.error("[project-complete]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
