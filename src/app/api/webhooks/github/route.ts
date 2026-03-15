import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { validateCommit } from "@/lib/commit-validator";
import { summarizeCommit } from "@/lib/ai";
import { broadcast } from "@/lib/sse-store";

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
    const sig = req.headers.get("x-hub-signature-256") ?? "";
    const rawBody = await req.text();

    // Validate signature if secret is configured
    if (secret) {
      const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
      if (sig !== expected) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const event = req.headers.get("x-github-event");
    if (event !== "push") return NextResponse.json({ ok: true, skipped: true });

    const payload = JSON.parse(rawBody);
    const repoName: string = payload.repository?.name ?? "";
    const commits: Array<{ id: string; message: string; author?: { name?: string } }> =
      payload.commits ?? [];

    if (!repoName || !commits.length) return NextResponse.json({ ok: true });

    // Find the project by repo name
    const project = await db.project.findFirst({ where: { repoName } });
    if (!project) return NextResponse.json({ ok: true, skipped: "no project found" });

    // Process the most recent commit
    const latest = commits[commits.length - 1];
    const milestones = await db.milestone.findMany({
      where: { projectId: project.id },
      orderBy: { orderIndex: "asc" },
    });

    const updates = validateCommit(milestones, latest.message);

    for (const u of updates) {
      await db.milestone.update({
        where: { id: u.milestoneId },
        data: {
          status: u.newStatus,
          progress: u.newProgress,
          testsPassed: u.newTestsPassed,
          lastCommitMsg: latest.message,
        },
      });
    }

    const aiSummary = await summarizeCommit(latest.message).catch(() => latest.message);

    const commit = await db.projectCommit.create({
      data: {
        projectId: project.id,
        hash: latest.id ?? randomBytes(4).toString("hex"),
        message: latest.message,
        aiSummary,
        milestoneUpdates: JSON.stringify(updates),
      },
    });

    const updatedMilestones = await db.milestone.findMany({
      where: { projectId: project.id },
      orderBy: { orderIndex: "asc" },
    });

    broadcast(project.id, {
      type: "milestone_update",
      milestones: updatedMilestones,
      commit: { id: commit.id, message: latest.message, aiSummary, createdAt: commit.createdAt },
    });

    return NextResponse.json({ ok: true, updates });
  } catch (err: any) {
    console.error("[webhook/github]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
