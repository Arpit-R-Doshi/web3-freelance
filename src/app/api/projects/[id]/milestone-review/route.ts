import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

function getPayload(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7));
}

// POST /api/projects/[id]/milestone-review
// Body: { milestoneId, action: "approve" | "reject", tokenRelease: number }
// The on-chain releaseMilestonePayment tx is done client-side; this route only updates the DB.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const payload = getPayload(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { milestoneId, action, tokenRelease } = await req.json();

    if (!milestoneId || !action) {
      return NextResponse.json({ error: "milestoneId and action are required" }, { status: 400 });
    }
    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
    }

    // Load project + verify ownership
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { milestones: true },
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (project.ownerId !== payload.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Load the milestone
    const milestone = project.milestones.find((m) => m.id === milestoneId);
    if (!milestone) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    if (milestone.status !== "completed") {
      return NextResponse.json({ error: "Milestone is not yet completed" }, { status: 400 });
    }
    if (milestone.reviewStatus === "approved") {
      return NextResponse.json({ error: "Milestone already approved" }, { status: 400 });
    }

    const reviewStatus = action === "approve" ? "approved" : "rejected";
    const relAmount = action === "approve" ? (tokenRelease ?? 0) : 0;

    // Update milestone
    const updatedMilestone = await db.milestone.update({
      where: { id: milestoneId },
      data: {
        reviewStatus,
        tokenRelease: action === "approve" ? relAmount : null,
      },
    });

    // If approving, increment project.tokenReleased
    if (action === "approve" && relAmount > 0) {
      await db.project.update({
        where: { id: projectId },
        data: { tokenReleased: { increment: relAmount } },
      });
    }

    // Check if all milestones are now approved → auto status note
    const approvedCount = project.milestones.filter(
      (m) => m.id === milestoneId ? reviewStatus === "approved" : m.reviewStatus === "approved"
    ).length;

    return NextResponse.json({
      milestone: updatedMilestone,
      allApproved: approvedCount === project.milestones.length,
    });
  } catch (err: any) {
    console.error("[milestone-review]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
