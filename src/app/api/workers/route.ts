import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/workers?skills=React,Node.js   — recommended workers
// GET /api/workers?email=user@example.com — search by email
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const skillsParam = searchParams.get("skills");
  const email = searchParams.get("email");

  function formatWorker(w: any, matchScore = 0) {
    return {
      id: w.id,
      name: w.name,
      email: w.email,
      walletAddress: w.walletAddress,
      subRole: w.workerProfile?.subRole,
      skills: JSON.parse(w.workerProfile?.skills ?? "[]"),
      githubId: w.workerProfile?.githubId,
      reputationScore: w.workerProfile?.reputationScore ?? 0,
      completedProjectsCount: w.workerProfile?.completedProjectsCount ?? 0,
      disputeCount: w.workerProfile?.disputeCount ?? 0,
      matchScore,
    };
  }

  try {
    if (email) {
      const user = await db.user.findFirst({
        where: { email: { contains: email }, role: "worker" },
        include: { workerProfile: true },
      });
      if (!user) return NextResponse.json({ workers: [] });
      return NextResponse.json({ workers: [formatWorker(user)] });
    }

    if (skillsParam) {
      const requested = skillsParam
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const workers = await db.user.findMany({
        where: { role: "worker" },
        include: { workerProfile: true },
      });

      const scored = workers
        .map((w) => {
          const wSkills: string[] = JSON.parse(w.workerProfile?.skills ?? "[]").map((s: string) =>
            s.toLowerCase()
          );
          const matches = requested.filter((r) =>
            wSkills.some((ws) => ws.includes(r) || r.includes(ws))
          ).length;
          return { ...formatWorker(w, matches), matchScore: matches };
        })
        .filter((w) => w.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 10);

      return NextResponse.json({ workers: scored });
    }

    // No params — return all workers
    const all = await db.user.findMany({
      where: { role: "worker" },
      include: { workerProfile: true },
      take: 20,
    });
    return NextResponse.json({ workers: all.map((w) => formatWorker(w)) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
