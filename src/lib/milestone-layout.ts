import { MarkerType, type Node, type Edge } from "@xyflow/react";

export type MilestoneForLayout = {
  id: string;
  title: string;
  description: string;
  simpleExplanation: string;
  status: string;
  progress: number;
  orderIndex: number;
  dependencies: string; // JSON string[]
  testCases: string;    // JSON []
  testsPassed: number;
  testsTotal: number;
  lastCommitMsg?: string | null;
  reviewStatus?: string | null;  // "pending" | "approved" | "rejected"
  tokenRelease?: number | null;
};

const NODE_W = 270;
const NODE_H = 160;
const H_GAP = 120;
const V_GAP = 60;

export function layoutMilestones(milestones: MilestoneForLayout[]): {
  nodes: Node[];
  edges: Edge[];
} {
  if (!milestones.length) return { nodes: [], edges: [] };

  // 1. Build id-based structure
  const byId = new Map(milestones.map((m) => [m.id, m]));

  // 2. Assign levels via BFS/topological sort
  const levels = new Map<string, number>();
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>(); // id -> ids that depend on it

  milestones.forEach((m) => {
    const deps: string[] = JSON.parse(m.dependencies || "[]");
    inDegree.set(m.id, deps.length);
    deps.forEach((depId) => {
      if (!children.has(depId)) children.set(depId, []);
      children.get(depId)!.push(m.id);
    });
  });

  // Roots = milestones with no dependencies
  const queue: string[] = [];
  milestones.forEach((m) => {
    if ((inDegree.get(m.id) ?? 0) === 0) {
      levels.set(m.id, 0);
      queue.push(m.id);
    }
  });

  while (queue.length) {
    const id = queue.shift()!;
    const myLevel = levels.get(id) ?? 0;
    (children.get(id) ?? []).forEach((childId) => {
      const newLevel = myLevel + 1;
      const existing = levels.get(childId) ?? 0;
      levels.set(childId, Math.max(existing, newLevel));
      const deg = (inDegree.get(childId) ?? 1) - 1;
      inDegree.set(childId, deg);
      if (deg === 0) queue.push(childId);
    });
  }

  // Fallback: anything not leveled keeps orderIndex
  milestones.forEach((m) => {
    if (!levels.has(m.id)) levels.set(m.id, m.orderIndex);
  });

  // 3. Group by level and assign row positions
  const levelGroups = new Map<number, string[]>();
  milestones.forEach((m) => {
    const lvl = levels.get(m.id) ?? 0;
    if (!levelGroups.has(lvl)) levelGroups.set(lvl, []);
    levelGroups.get(lvl)!.push(m.id);
  });

  // Build nodes
  const nodes: Node[] = milestones.map((m) => {
    const lvl = levels.get(m.id) ?? 0;
    const row = levelGroups.get(lvl)!.indexOf(m.id);
    const colCount = levelGroups.get(lvl)!.length;
    const totalHeight = colCount * (NODE_H + V_GAP) - V_GAP;
    const startY = -totalHeight / 2;

    return {
      id: m.id,
      type: "milestoneNode",
      position: {
        x: lvl * (NODE_W + H_GAP),
        y: startY + row * (NODE_H + V_GAP),
      },
      data: {
        ...m,
        testCases: JSON.parse(m.testCases || "[]"),
        dependencies: JSON.parse(m.dependencies || "[]"),
      },
    };
  });

  // Build edges
  const edges: Edge[] = [];
  milestones.forEach((m) => {
    const deps: string[] = JSON.parse(m.dependencies || "[]");
    deps.forEach((depId) => {
      if (byId.has(depId)) {
        const source = byId.get(depId)!;
        const isCompleted = source.status === "completed";
        const isActive = m.status === "in_progress" || source.status === "in_progress";

        const color = isCompleted
          ? "#10b981"
          : isActive
          ? "#6366f1"
          : "rgba(100,116,139,0.5)";

        const glowFilter = isCompleted
          ? "drop-shadow(0 0 5px rgba(16,185,129,0.8)) drop-shadow(0 0 12px rgba(16,185,129,0.4))"
          : isActive
          ? "drop-shadow(0 0 6px rgba(99,102,241,0.9)) drop-shadow(0 0 14px rgba(99,102,241,0.4))"
          : "none";

        edges.push({
          id: `${depId}->${m.id}`,
          source: depId,
          target: m.id,
          animated: isActive && !isCompleted,
          style: {
            stroke: color,
            strokeWidth: isCompleted ? 3 : isActive ? 2.5 : 1.5,
            strokeDasharray: !isCompleted && !isActive ? "6 4" : undefined,
            filter: glowFilter,
          },
          type: "smoothstep",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 18,
            height: 18,
          },
        });
      }
    });
  });

  return { nodes, edges };
}
