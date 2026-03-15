import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password, role, walletAddress, clientProfile, workerProfile } = body;

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    if (walletAddress) {
      const existingWallet = await db.user.findUnique({ where: { walletAddress: walletAddress.toLowerCase() } });
      if (existingWallet) {
        return NextResponse.json({ error: "Wallet already registered" }, { status: 409 });
      }
    }

    const hashed = await hashPassword(password);

    const user = await db.user.create({
      data: {
        name,
        email,
        password: hashed,
        role,
        walletAddress: walletAddress ? walletAddress.toLowerCase() : null,
        kycVerified: true,
        kycVerifiedAt: new Date(),
        ...(role === "client" && clientProfile
          ? {
              clientProfile: {
                create: {
                  type: clientProfile.type,
                  orgName: clientProfile.orgName || null,
                  taxNumber: clientProfile.taxNumber || null,
                },
              },
            }
          : {}),
        ...(role === "worker" && workerProfile
          ? {
              workerProfile: {
                create: {
                  subRole: workerProfile.subRole,
                  githubId: workerProfile.githubId || null,
                  skills: JSON.stringify(workerProfile.skills || []),
                },
              },
            }
          : {}),
      },
    });

    const token = signToken({ userId: user.id, email: user.email, role: user.role, name: user.name });

    return NextResponse.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err: any) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
