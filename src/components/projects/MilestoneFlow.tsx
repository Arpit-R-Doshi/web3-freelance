"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutMilestones, type MilestoneForLayout } from "@/lib/milestone-layout";
import MilestoneNode from "./MilestoneNode";
import { toast } from "sonner";

const nodeTypes = { milestoneNode: MilestoneNode };

type Props = {
  projectId: string;
  initialMilestones: MilestoneForLayout[];
  token: string;
  onNodeSelect: (milestone: MilestoneForLayout | null) => void;
  onCommitReceived?: (commit: { message: string; aiSummary: string; createdAt: string }) => void;
  onMilestoneUpdate?: (milestones: MilestoneForLayout[]) => void;
};

function MilestoneFlowInner({ projectId, initialMilestones, token, onNodeSelect, onCommitReceived, onMilestoneUpdate }: Props) {
  const { nodes: initNodes, edges: initEdges } = layoutMilestones(initialMilestones);
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const milestonesRef = useRef<MilestoneForLayout[]>(initialMilestones);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Keep milestones ref in sync
  useEffect(() => {
    milestonesRef.current = initialMilestones;
  }, [initialMilestones]);

  // SSE subscription
  useEffect(() => {
    if (!projectId) return;

    const es = new EventSource(`/api/projects/${projectId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        if (data.type === "milestone_update") {
          const updatedMilestones: MilestoneForLayout[] = data.milestones;
          milestonesRef.current = updatedMilestones;

          const { nodes: newNodes, edges: newEdges } = layoutMilestones(updatedMilestones);

          setNodes((prev) =>
            newNodes.map((n) => {
              const existing = prev.find((p) => p.id === n.id);
              return { ...n, position: existing?.position ?? n.position };
            })
          );
          setEdges(newEdges);
          onMilestoneUpdate?.(updatedMilestones);

          if (data.commit) {
            onCommitReceived?.(data.commit);
            toast.success(`Commit received: ${data.commit.aiSummary || data.commit.message}`);
          }
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [projectId]);

  const handleNodeClick: NodeMouseHandler<Node> = useCallback(
    (_, node) => {
      const milestone = milestonesRef.current.find((m) => m.id === node.id) ?? null;
      setSelectedId(node.id);

      // Update selected state visually
      setNodes((prev) =>
        prev.map((n) => ({
          ...n,
          data: { ...n.data, selected: n.id === node.id },
        }))
      );

      onNodeSelect(milestone);
    },
    [onNodeSelect, setNodes]
  );

  const handlePaneClick = useCallback(() => {
    setSelectedId(null);
    setNodes((prev) => prev.map((n) => ({ ...n, data: { ...n.data, selected: false } })));
    onNodeSelect(null);
  }, [onNodeSelect, setNodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      fitView
      fitViewOptions={{ padding: 0.15, minZoom: 0.85 }}
      minZoom={0.25}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      style={{ background: "transparent" }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        color="rgba(99,102,241,0.18)"
        gap={28}
        size={1.5}
      />
      <MiniMap
        nodeColor={(n) => {
          const s = (n.data as { status?: string }).status ?? "pending";
          if (s === "completed") return "#10b981";
          if (s === "in_progress") return "#6366f1";
          if (s === "failed") return "#ef4444";
          return "#334155";
        }}
        maskColor="rgba(5,11,24,0.75)"
        style={{
          background: "rgba(10,15,30,0.9)",
          border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 12,
        }}
        className="!rounded-xl"
      />
      <Controls
        style={{
          background: "rgba(10,15,30,0.9)",
          border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 12,
        }}
        className="!rounded-xl [&>button]:!bg-transparent [&>button]:!border-0 [&>button]:!text-slate-400 [&>button:hover]:!text-white"
      />
    </ReactFlow>
  );
}

export default function MilestoneFlow(props: Props) {
  return (
    <ReactFlowProvider>
      <MilestoneFlowInner {...props} />
    </ReactFlowProvider>
  );
}
