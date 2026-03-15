import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

function getPayload(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7));
}

// GET /api/disputes — admin fetches all disputes (open + resolved)
export async function GET(req: NextRequest) {
  const payload = getPayload(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (payload.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const disputes = await db.disputeRequest.findMany({
    include: {
      project: {
        select: {
          id: true,
          name: true,
          workers: {
            include: { worker: { select: { id: true, name: true, email: true } } },
          },
        },
      },
      raisedByClient: { select: { id: true, name: true, email: true } },
      votes: { include: { voter: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ disputes });
}
