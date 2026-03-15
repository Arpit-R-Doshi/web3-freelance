import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { broadcast } from "@/lib/sse-store";

function getPayload(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7));
}

// PATCH /api/disputes/[disputeId]/resolve — admin manually resolves with custom text
export async function PATCH(
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
      project: { include: { workers: { select: { workerId: true } } } },
    },
  });
  if (!dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  if (dispute.status === "resolved") {
    return NextResponse.json({ error: "Dispute is already resolved" }, { status: 400 });
  }

  const body = await req.json();
  const { outcome, resolutionText } = body as { outcome: string; resolutionText?: string };
  if (!["for_client", "for_worker"].includes(outcome)) {
    return NextResponse.json({ error: "Invalid outcome" }, { status: 400 });
  }

  const updated = await db.disputeRequest.update({
    where: { id: disputeId },
    data: {
      status: "resolved",
      outcome,
      resolutionText: resolutionText ?? null,
      resolvedAt: new Date(),
    },
  });

  // Apply reputation side-effects for for_client outcome
  if (outcome === "for_client") {
    for (const assignment of dispute.project.workers) {
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
          projectId: dispute.project.id,
          title: "Dispute Resolved Against You",
          message:
            resolutionText
              ? `Jury decision: ${resolutionText}`
              : "The jury found in the client's favor. Your reputation score has been adjusted.",
          type: "warning",
        },
      });
    }
    await db.notification.create({
      data: {
        userId: dispute.project.ownerId,
        projectId: dispute.project.id,
        title: "Dispute Resolved — In Your Favor",
        message:
          resolutionText
            ? `Jury decision: ${resolutionText}`
            : "The jury has resolved the dispute in your favor.",
        type: "success",
      },
    });
  } else {
    for (const assignment of dispute.project.workers) {
      await db.notification.create({
        data: {
          userId: assignment.workerId,
          projectId: dispute.project.id,
          title: "Dispute Resolved In Your Favor",
          message:
            resolutionText
              ? `Jury decision: ${resolutionText}`
              : "The jury found the dispute in your favor. No reputation change.",
          type: "success",
        },
      });
    }
    await db.notification.create({
      data: {
        userId: dispute.project.ownerId,
        projectId: dispute.project.id,
        title: "Dispute Resolved — In Worker's Favor",
        message:
          resolutionText
            ? `Jury decision: ${resolutionText}`
            : "The jury reviewed the dispute and found in favor of the worker.",
        type: "info",
      },
    });
  }

  broadcast(dispute.project.id, { type: "dispute_resolved", outcome, disputeId });

  return NextResponse.json({ dispute: updated });
}
