import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const payload = token ? verifyToken(token) : null;

  // Also allow unauthenticated PATCH from the escrow flow (called from client-side after wallet tx)
  // so we don't gate this strictly — just validate the project exists
  try {
    const { onChainId, escrowStatus } = await req.json();

    const project = await db.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    // Only owner or unauthenticated (from post-tx callback) can update
    if (payload && payload.userId !== project.ownerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await db.project.update({
      where: { id },
      data: {
        ...(onChainId !== undefined && { onChainId: Number(onChainId) }),
        ...(escrowStatus !== undefined && { escrowStatus }),
      },
    });

    return NextResponse.json({ project: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
