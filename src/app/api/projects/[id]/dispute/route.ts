import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { broadcast } from "@/lib/sse-store";

function getPayload(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7));
}

// POST /api/projects/[id]/dispute — client raises a dispute or revision request
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const payload = getPayload(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { workers: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.ownerId !== payload.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (project.status !== "active" || project.escrowStatus !== "locked") {
    return NextResponse.json(
      { error: "Disputes can only be raised on active projects with locked escrow" },
      { status: 400 }
    );
  }

  const existing = await db.disputeRequest.findFirst({
    where: { projectId, status: "open" },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A dispute or revision is already open for this project" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { type, answers } = body as { type: string; answers: Record<string, string> };

  if (!["dispute", "revision"].includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  if (!answers || typeof answers !== "object") {
    return NextResponse.json({ error: "Answers required" }, { status: 400 });
  }

  const dispute = await db.disputeRequest.create({
    data: {
      projectId,
      raisedByClientId: payload.userId,
      type,
      answers: JSON.stringify(answers),
    },
  });

  // Notify assigned workers
  for (const assignment of project.workers) {
    await db.notification.create({
      data: {
        userId: assignment.workerId,
        projectId,
        title: type === "dispute" ? "Dispute Raised" : "Revision Request Filed",
        message: `The client has opened a ${type} on project "${project.name}". Please await jury review.`,
        type: "warning",
      },
    });
  }

  // Notify all admins
  const admins = await db.user.findMany({ where: { role: "admin" } });
  for (const admin of admins) {
    await db.notification.create({
      data: {
        userId: admin.id,
        projectId,
        title: type === "dispute" ? "New Dispute Needs Review" : "New Revision Request",
        message: `A ${type} has been filed on project "${project.name}". Review it in the Admin Dashboard.`,
        type: "warning",
      },
    });
  }

  broadcast(projectId, { type: "dispute_raised", disputeType: type, disputeId: dispute.id });

  return NextResponse.json({ dispute });
}

// GET /api/projects/[id]/dispute — get the latest dispute/revision for a project
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const payload = getPayload(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { workers: { select: { workerId: true } } },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const isOwner = project.ownerId === payload.userId;
  const isWorker = project.workers.some((w) => w.workerId === payload.userId);
  const isAdmin = payload.role === "admin";

  if (!isOwner && !isWorker && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dispute = await db.disputeRequest.findFirst({
    where: { projectId },
    include: {
      votes: {
        include: { voter: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ dispute: dispute ?? null });
}
