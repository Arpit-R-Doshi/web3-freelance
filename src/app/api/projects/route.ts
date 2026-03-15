import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { generateMilestones } from "@/lib/ai";
import { createRepo, addCollaborator, setupWebhook } from "@/lib/github";

function getPayload(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7));
}

// ─── GET /api/projects ─── list user's projects
export async function GET(req: NextRequest) {
  const payload = getPayload(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let projects;

    if (payload.role === "worker") {
      // Workers see their assigned projects
      const assignments = await db.projectWorker.findMany({
        where: { workerId: payload.userId },
        include: {
          project: {
            include: {
              milestones: { select: { status: true } },
              workers: { include: { worker: { select: { id: true, name: true } } } },
              commits: { select: { id: true } },
            },
          },
        },
      });
      projects = assignments.map((a) => a.project);
    } else {
      // Clients see owned projects
      projects = await db.project.findMany({
        where: { ownerId: payload.userId },
        include: {
          milestones: { select: { status: true } },
          workers: { include: { worker: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    return NextResponse.json({ projects });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST /api/projects ─── create project
export async function POST(req: NextRequest) {
  const payload = getPayload(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (payload.role !== "client")
    return NextResponse.json({ error: "Only clients can create projects" }, { status: 403 });

  try {
    const { name, description, skills = [], workerIds = [], budget, budgetCurrency = "USD" } = await req.json();
    if (!name?.trim() || !description?.trim())
      return NextResponse.json({ error: "name and description are required" }, { status: 400 });

    // 1. Create project record
    const project = await db.project.create({
      data: {
        name: name.trim(),
        description: description.trim(),
        ownerId: payload.userId,
        skills: JSON.stringify(skills),
        status: "setup",
        budget: budget ? Number(budget) : null,
        budgetCurrency: budget ? budgetCurrency : null,
      },
    });

    // 2. Generate milestones with AI
    const milestoneInputs = await generateMilestones(name, description, skills);

    // Build title→id map for dependency resolution
    const titleToId: Record<string, string> = {};
    const createdMilestones = [];

    for (let i = 0; i < milestoneInputs.length; i++) {
      const mi = milestoneInputs[i];
      const deps = (mi.dependsOnTitles ?? [])
        .map((t: string) => titleToId[t])
        .filter(Boolean);

      const m = await db.milestone.create({
        data: {
          projectId: project.id,
          title: mi.title,
          description: mi.description,
          simpleExplanation: mi.simpleExplanation,
          orderIndex: i,
          dependencies: JSON.stringify(deps),
          testCases: JSON.stringify(mi.testCases ?? []),
          testsTotal: (mi.testCases ?? []).length || 2,
          // First milestone starts in_progress automatically
          status: i === 0 ? "in_progress" : "pending",
        },
      });

      titleToId[mi.title] = m.id;
      createdMilestones.push(m);
    }

    // 3. Create GitHub repo
    const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60);
    const repoName = `wwt-${project.id.slice(0, 8)}-${safeName}`;
    const repo = await createRepo(repoName, `${name} — WeWorkTogether Project`);

    if (repo) {
      await db.project.update({
        where: { id: project.id },
        data: { repoUrl: repo.html_url, repoName: repo.name, status: "active" },
      });

      // Setup webhook
      const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://example.com"}/api/webhooks/github`;
      await setupWebhook(repo.name, webhookUrl, process.env.GITHUB_WEBHOOK_SECRET ?? "");
    } else {
      await db.project.update({ where: { id: project.id }, data: { status: "active" } });
    }

    // 4. Add workers
    for (const workerId of workerIds) {
      try {
        await db.projectWorker.create({ data: { projectId: project.id, workerId } });
        if (repo) {
          const workerProfile = await db.workerProfile.findUnique({ where: { userId: workerId } });
          if (workerProfile?.githubId) {
            await addCollaborator(repo.name, workerProfile.githubId);
          }
        }
      } catch {}
    }

    // Return full project
    const full = await db.project.findUnique({
      where: { id: project.id },
      include: {
        milestones: { orderBy: { orderIndex: "asc" } },
        workers: { include: { worker: { select: { id: true, name: true, email: true, walletAddress: true } } } },
      },
    });

    return NextResponse.json({ project: full }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/projects]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
