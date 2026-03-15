import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

function getPayload(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7));
}

// GET /api/worker/disputes — worker fetches disputes on their assigned projects
export async function GET(req: NextRequest) {
  const payload = getPayload(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assignments = await db.projectWorker.findMany({
    where: { workerId: payload.userId },
    select: { projectId: true },
  });

  if (assignments.length === 0) {
    return NextResponse.json({ disputes: [] });
  }

  const projectIds = assignments.map((a) => a.projectId);

  const disputes = await db.disputeRequest.findMany({
    where: { projectId: { in: projectIds } },
    include: {
      project: { select: { id: true, name: true } },
      raisedByClient: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ disputes });
}
