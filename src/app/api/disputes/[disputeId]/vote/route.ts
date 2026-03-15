import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { broadcast } from "@/lib/sse-store";

const JURY_THRESHOLD = 1; // First vote auto-resolves

function getPayload(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7));
}

async function applyResolution(
  disputeId: string,
  outcome: string,
  projectId: string,
  ownerId: string,
  workers: { workerId: string }[]
) {
  if (outcome === "for_client") {
    for (const assignment of workers) {
      const wp = await db.workerProfile.findUnique({ where: { userId: assignment.workerId } });
      if (!wp) continue;
      const newDisputes = wp.disputeCount + 1;
      const newRep = Math.max(0, Math.min(100, wp.completedProjectsCount * 10 - newDisputes * 20));
      await db.workerProfile.update({
        where: { userId: assignment.workerId },
        data: { disputeCount: newDisputes, reputationScore: newRep },
      });
      await db.notification.create({
        data: {
          userId: assignment.workerId,
          projectId,
          title: "Dispute Resolved Against You",
          message: "The jury found in the client's favor. Your reputation score has been adjusted.",
          type: "warning",
        },
      });
    }
    await db.notification.create({
      data: {
        userId: ownerId,
        projectId,
        title: "Dispute Resolved — In Your Favor",
        message: "The jury has resolved the dispute in your favor. The worker's reputation has been adjusted.",
        type: "success",
      },
    });
  } else {
    // for_worker
    for (const assignment of workers) {
      await db.notification.create({
        data: {
          userId: assignment.workerId,
          projectId,
          title: "Dispute Resolved In Your Favor",
          message: "The jury found the dispute in your favor. No reputation change.",
          type: "success",
        },
      });
    }
    await db.notification.create({
      data: {
        userId: ownerId,
        projectId,
        title: "Dispute Resolved — In Worker's Favor",
        message: "The jury reviewed the dispute and found in favor of the worker. The project continues.",
        type: "info",
      },
    });
  }

  broadcast(projectId, { type: "dispute_resolved", outcome, disputeId });
}

// POST /api/disputes/[disputeId]/vote
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ disputeId: string }> }
) {
  const { disputeId } = await params;
  const payload = getPayload(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (payload.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const dispute = await db.disputeRequest.findUnique({
    where: { id: disputeId },
    include: {
      project: {
        include: { workers: { select: { workerId: true } } },
      },
      votes: true,
    },
  });
  if (!dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  if (dispute.status !== "open") {
    return NextResponse.json({ error: "Dispute is already resolved" }, { status: 400 });
  }

  const alreadyVoted = dispute.votes.some((v) => v.voterId === payload.userId);
  if (alreadyVoted) {
    return NextResponse.json({ error: "You have already voted on this dispute" }, { status: 400 });
  }

  const body = await req.json();
  const { vote, reason } = body as { vote: string; reason?: string };
  if (!["for_client", "for_worker"].includes(vote)) {
    return NextResponse.json({ error: "Invalid vote value" }, { status: 400 });
  }

  const newVote = await db.juryVote.create({
    data: { disputeId, voterId: payload.userId, vote, reason: reason ?? null },
  });

  const allVotes = [...dispute.votes, newVote];
  const totalVotes = allVotes.length;

  let updatedDispute = dispute;

  if (totalVotes >= JURY_THRESHOLD) {
    const forClient = allVotes.filter((v) => v.vote === "for_client").length;
    const forWorker = allVotes.filter((v) => v.vote === "for_worker").length;
    const outcome = forClient >= forWorker ? "for_client" : "for_worker";

    updatedDispute = await db.disputeRequest.update({
      where: { id: disputeId },
      data: { status: "resolved", outcome, resolvedAt: new Date() },
      include: { votes: { include: { voter: { select: { name: true } } } } },
    }) as any;

    await applyResolution(
      disputeId,
      outcome,
      dispute.project.id,
      dispute.project.ownerId,
      dispute.project.workers
    );
  }

  return NextResponse.json({ vote: newVote, dispute: updatedDispute });
}
