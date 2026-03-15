/**
 * Semi-real commit validator.
 * - Finds the first in_progress milestone (or promotes the first pending one).
 * - Each commit adds progress based on keyword matches + a fixed increment.
 * - When a milestone reaches 100%, it completes and unlocks the next one.
 */

export type TestCase = { name: string; description: string };

export type MilestoneRow = {
  id: string;
  title: string;
  status: string;
  progress: number;
  orderIndex: number;
  dependencies: string; // JSON string[]
  testCases: string;    // JSON TestCase[]
  testsPassed: number;
  testsTotal: number;
};

export type MilestoneUpdate = {
  milestoneId: string;
  newStatus: string;
  newProgress: number;
  newTestsPassed: number;
  testsTotal: number;
};

const BASE_INCREMENT = 22; // progress per commit

function keywordScore(message: string, tests: TestCase[]): number {
  if (!tests.length) return 0;
  const lower = message.toLowerCase();
  const scored = tests.filter((t) => {
    const keywords = t.description.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    return keywords.some((kw) => lower.includes(kw));
  });
  return Math.round((scored.length / tests.length) * 100);
}

export function validateCommit(
  milestones: MilestoneRow[],
  commitMessage: string
): MilestoneUpdate[] {
  const sorted = [...milestones].sort((a, b) => a.orderIndex - b.orderIndex);
  const updates: MilestoneUpdate[] = [];

  // Find active (in_progress) milestone or the first unlocked pending one
  let activeMilestone = sorted.find((m) => m.status === "in_progress");

  if (!activeMilestone) {
    // Find first pending milestone whose all deps are completed
    const completedIds = new Set(sorted.filter((m) => m.status === "completed").map((m) => m.id));
    activeMilestone = sorted.find((m) => {
      if (m.status !== "pending") return false;
      const deps: string[] = JSON.parse(m.dependencies || "[]");
      return deps.every((d) => completedIds.has(d));
    });
    if (!activeMilestone && sorted.some((m) => m.status === "pending")) {
      // No deps satisfied yet — start first pending milestone anyway
      activeMilestone = sorted.find((m) => m.status === "pending");
    }
  }

  if (!activeMilestone) return []; // all done

  const tests: TestCase[] = JSON.parse(activeMilestone.testCases || "[]");
  const bonus = Math.min(keywordScore(commitMessage, tests), 40);
  const rawIncrement = BASE_INCREMENT + bonus;
  const newProgress = Math.min(100, activeMilestone.progress + rawIncrement);

  // Tests: proportional to progress
  const total = activeMilestone.testsTotal || tests.length || 1;
  const passed = Math.min(total, Math.round((newProgress / 100) * total));
  const newStatus = newProgress >= 100 ? "completed" : "in_progress";

  updates.push({
    milestoneId: activeMilestone.id,
    newStatus,
    newProgress,
    newTestsPassed: passed,
    testsTotal: total,
  });

  // If this milestone just completed, unlock the next one
  if (newStatus === "completed") {
    const completedIds = new Set([
      ...sorted.filter((m) => m.status === "completed").map((m) => m.id),
      activeMilestone.id,
    ]);

    const nextMilestone = sorted.find((m) => {
      if (m.status !== "pending" || m.id === activeMilestone!.id) return false;
      const deps: string[] = JSON.parse(m.dependencies || "[]");
      return deps.every((d) => completedIds.has(d)) || deps.length === 0;
    });

    if (nextMilestone) {
      updates.push({
        milestoneId: nextMilestone.id,
        newStatus: "in_progress",
        newProgress: 0,
        newTestsPassed: 0,
        testsTotal: nextMilestone.testsTotal || 1,
      });
    }
  }

  return updates;
}
