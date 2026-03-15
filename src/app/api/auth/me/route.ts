import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = verifyToken(auth.slice(7));
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: payload.userId },
    include: { clientProfile: true, workerProfile: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    walletAddress: user.walletAddress,
    kycVerified: user.kycVerified,
    kycVerifiedAt: user.kycVerifiedAt,
    createdAt: user.createdAt,
    clientProfile: user.clientProfile
      ? {
          type: user.clientProfile.type,
          orgName: user.clientProfile.orgName,
          taxNumber: user.clientProfile.taxNumber,
        }
      : null,
    workerProfile: user.workerProfile
      ? {
          subRole: user.workerProfile.subRole,
          githubId: user.workerProfile.githubId,
          skills: JSON.parse(user.workerProfile.skills || "[]"),
          reputationScore: user.workerProfile.reputationScore,
          completedProjectsCount: user.workerProfile.completedProjectsCount,
          disputeCount: user.workerProfile.disputeCount,
        }
      : null,
  });
}
