import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { validateCommit } from "@/lib/commit-validator";
import { summarizeCommit } from "@/lib/ai";
import { broadcast } from "@/lib/sse-store";
import { randomBytes } from "crypto";

function getPayload(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const payload = getPayload(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { message, workerId } = await req.json();
    if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

    // Load milestones
    const milestones = await db.milestone.findMany({
      where: { projectId },
      orderBy: { orderIndex: "asc" },
    });

    // Run semi-real validation
    const updates = validateCommit(milestones, message);

    // Persist milestone updates
    for (const u of updates) {
      await db.milestone.update({
        where: { id: u.milestoneId },
        data: {
          status: u.newStatus,
          progress: u.newProgress,
          testsPassed: u.newTestsPassed,
          lastCommitMsg: message,
        },
      });
    }

    // AI summary (non-blocking best-effort)
    const aiSummary = await summarizeCommit(message).catch(() => message);

    // Save commit
    const commit = await db.projectCommit.create({
      data: {
        projectId,
        hash: randomBytes(4).toString("hex"),
        message,
        authorId: workerId ?? payload.userId,
        aiSummary,
        milestoneUpdates: JSON.stringify(updates),
      },
    });

    // Broadcast SSE to all subscribers
    const updatedMilestones = await db.milestone.findMany({
      where: { projectId },
      orderBy: { orderIndex: "asc" },
    });

    broadcast(projectId, {
      type: "milestone_update",
      milestones: updatedMilestones,
      commit: { id: commit.id, message, aiSummary, createdAt: commit.createdAt },
    });

    return NextResponse.json({ updates, commit });
  } catch (err: any) {
    console.error("[commit]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
