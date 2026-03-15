"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, AlertCircle, Zap, FlaskConical } from "lucide-react";

export type MilestoneNodeData = {
  id: string;
  title: string;
  description: string;
  simpleExplanation: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  progress: number;
  testsPassed: number;
  testsTotal: number;
  testCases: { name: string; description: string }[];
  dependencies: string[];
  lastCommitMsg?: string | null;
  selected?: boolean;
};

const S = {
  pending: {
    bg: "linear-gradient(145deg, rgba(15,23,42,0.97) 0%, rgba(30,41,59,0.95) 100%)",
    border: "rgba(100,116,139,0.3)",
    glow: "0 8px 32px rgba(0,0,0,0.5)",
    accent: "#64748b",
    accentRgb: "100,116,139",
    light: "#94a3b8",
    bar: ["#475569", "#64748b"],
    icon: Clock,
    label: "Pending",
    badge: "rgba(100,116,139,0.12)",
    stripe: "linear-gradient(90deg, #475569, #64748b, transparent)",
  },
  in_progress: {
    bg: "linear-gradient(145deg, rgba(10,15,40,0.98) 0%, rgba(23,37,90,0.96) 100%)",
    border: "rgba(99,102,241,0.85)",
    glow: "0 0 30px rgba(99,102,241,0.45), 0 0 60px rgba(59,130,246,0.2), 0 8px 32px rgba(0,0,0,0.5)",
    accent: "#6366f1",
    accentRgb: "99,102,241",
    light: "#a5b4fc",
    bar: ["#6366f1", "#06b6d4"],
    icon: Zap,
    label: "In Progress",
    badge: "rgba(99,102,241,0.15)",
    stripe: "linear-gradient(90deg, #6366f1, #06b6d4, transparent)",
  },
  completed: {
    bg: "linear-gradient(145deg, rgba(10,20,18,0.98) 0%, rgba(6,40,30,0.96) 100%)",
    border: "rgba(16,185,129,0.7)",
    glow: "0 0 24px rgba(16,185,129,0.4), 0 0 48px rgba(52,211,153,0.15), 0 8px 32px rgba(0,0,0,0.5)",
    accent: "#10b981",
    accentRgb: "16,185,129",
    light: "#6ee7b7",
    bar: ["#10b981", "#34d399"],
    icon: CheckCircle2,
    label: "Completed",
    badge: "rgba(16,185,129,0.12)",
    stripe: "linear-gradient(90deg, #10b981, #34d399, transparent)",
  },
  failed: {
    bg: "linear-gradient(145deg, rgba(20,10,10,0.98) 0%, rgba(50,15,15,0.96) 100%)",
    border: "rgba(239,68,68,0.55)",
    glow: "0 0 20px rgba(239,68,68,0.3), 0 8px 32px rgba(0,0,0,0.5)",
    accent: "#ef4444",
    accentRgb: "239,68,68",
    light: "#fca5a5",
    bar: ["#ef4444", "#f97316"],
    icon: AlertCircle,
    label: "Failed",
    badge: "rgba(239,68,68,0.12)",
    stripe: "linear-gradient(90deg, #ef4444, #f97316, transparent)",
  },
};

function ProgressRing({ progress, status }: { progress: number; status: string }) {
  const cfg = S[status as keyof typeof S] ?? S.pending;
  const r = 17;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, progress)) / 100);
  return (
    <div className="relative w-11 h-11 shrink-0">
      <svg width="44" height="44" viewBox="0 0 44 44">
        {/* Track */}
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
        {/* Arc */}
        <circle
          cx="22" cy="22" r={r}
          fill="none"
          stroke={cfg.accent}
          strokeWidth="3.5"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 22 22)"
          style={{
            transition: "stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)",
            filter: status !== "pending" ? `drop-shadow(0 0 5px ${cfg.accent})` : "none",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold" style={{ color: cfg.light }}>{progress}%</span>
      </div>
    </div>
  );
}

function MilestoneNode({ data, selected }: NodeProps) {
  const d = data as MilestoneNodeData;
  const cfg = S[d.status] ?? S.pending;
  const Icon = cfg.icon;
  const progress = Math.min(100, Math.max(0, d.progress));
  const isActive = d.status === "in_progress";
  const isDone = d.status === "completed";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
      whileHover={{ scale: 1.035, transition: { duration: 0.15 } }}
      className="relative w-[278px] cursor-pointer select-none"
      style={{
        borderRadius: "18px",
        boxShadow: selected
          ? `0 0 0 2px ${cfg.accent}, 0 0 0 5px rgba(${cfg.accentRgb},0.2), ${cfg.glow}`
          : cfg.glow,
      }}
    >
      {/* Pulsing outer ring — in_progress only */}
      {isActive && (
        <motion.div
          className="absolute pointer-events-none"
          style={{
            inset: -3,
            borderRadius: 21,
            border: `1.5px solid rgba(${cfg.accentRgb},0.6)`,
          }}
          animate={{ opacity: [0.3, 0.9, 0.3], scale: [1, 1.008, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Secondary ring pulse — in_progress */}
      {isActive && (
        <motion.div
          className="absolute pointer-events-none"
          style={{
            inset: -8,
            borderRadius: 26,
            border: `1px solid rgba(${cfg.accentRgb},0.25)`,
          }}
          animate={{ opacity: [0, 0.6, 0], scale: [0.96, 1.02, 1.06] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
        />
      )}

      {/* Corner sparkle dots — completed only */}
      {isDone &&
        [[-5, -5], [283, -5], [-5, 113], [283, 113]].map(([lx, ty], i) => (
          <motion.div
            key={i}
            className="absolute w-2.5 h-2.5 rounded-full pointer-events-none"
            style={{
              left: lx,
              top: ty,
              background: cfg.accent,
              boxShadow: `0 0 8px 2px ${cfg.accent}`,
            }}
            animate={{ scale: [0.7, 1.2, 0.7], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2 + i * 0.35, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
          />
        ))}

      {/* Card body */}
      <div
        style={{
          background: cfg.bg,
          border: `1.5px solid ${cfg.border}`,
          borderRadius: 18,
          overflow: "hidden",
          backdropFilter: "blur(16px)",
        }}
      >
        {/* Top accent stripe */}
        <div style={{ height: 3, background: cfg.stripe }} />

        <div className="px-4 pt-3.5 pb-3">
          {/* React Flow handles */}
          <Handle
            type="target"
            position={Position.Left}
            style={{
              background: cfg.accent,
              width: 11,
              height: 11,
              left: -6,
              border: `2px solid rgba(${cfg.accentRgb},0.3)`,
              boxShadow: `0 0 8px ${cfg.accent}`,
            }}
          />
          <Handle
            type="source"
            position={Position.Right}
            style={{
              background: cfg.accent,
              width: 11,
              height: 11,
              right: -6,
              border: `2px solid rgba(${cfg.accentRgb},0.3)`,
              boxShadow: `0 0 8px ${cfg.accent}`,
            }}
          />

          {/* Header row: icon + text + ring */}
          <div className="flex items-start gap-2.5 mb-3">
            {/* Icon orb */}
            <motion.div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
              style={{
                background: `rgba(${cfg.accentRgb},0.14)`,
                border: `1px solid rgba(${cfg.accentRgb},0.3)`,
                boxShadow: `0 0 12px rgba(${cfg.accentRgb},0.2)`,
              }}
              animate={isActive ? { boxShadow: [`0 0 8px rgba(${cfg.accentRgb},0.2)`, `0 0 20px rgba(${cfg.accentRgb},0.5)`, `0 0 8px rgba(${cfg.accentRgb},0.2)`] } : {}}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            >
              <motion.div
                animate={isActive ? { rotate: [0, 5, -5, 0] } : isDone ? { scale: [1, 1.15, 1] } : {}}
                transition={ isActive
                  ? { duration: 2.5, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                }
              >
                <Icon size={17} style={{ color: cfg.light }} />
              </motion.div>
            </motion.div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p
                className="font-bold text-[13px] leading-tight truncate"
                style={{ color: "#f1f5f9", textShadow: `0 0 16px rgba(${cfg.accentRgb},0.5)` }}
              >
                {d.title}
              </p>
              <p className="text-[11px] mt-0.5 line-clamp-2 leading-snug" style={{ color: "rgba(148,163,184,0.78)" }}>
                {d.simpleExplanation}
              </p>
            </div>

            {/* Progress ring */}
            <ProgressRing progress={progress} status={d.status} />
          </div>

          {/* Progress bar */}
          <div className="relative h-[5px] w-full rounded-full overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.05)" }}>
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
              style={{
                background: `linear-gradient(90deg, ${cfg.bar[0]}, ${cfg.bar[1]})`,
                boxShadow: `0 0 10px ${cfg.accent}`,
              }}
            />
            {/* Shimmer sweep — active only */}
            {isActive && progress > 0 && (
              <motion.div
                className="absolute inset-y-0 w-10 rounded-full"
                style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)" }}
                animate={{ x: [-40, 300] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "linear", repeatDelay: 0.7 }}
              />
            )}
          </div>

          {/* Footer row */}
          <div className="flex items-center justify-between">
            {/* Test badge */}
            <div
              className="flex items-center gap-1.5 text-[10px] px-2 py-[3px] rounded-full"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <FlaskConical size={10} style={{ color: "rgba(148,163,184,0.6)" }} />
              <span style={{ color: cfg.light, fontWeight: 700 }}>{d.testsPassed}</span>
              <span style={{ color: "rgba(100,116,139,0.7)" }}>/ {d.testsTotal} tests</span>
            </div>

            {/* Status badge */}
            <motion.div
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-[3px] rounded-full"
              style={{
                background: cfg.badge,
                color: cfg.light,
                border: `1px solid rgba(${cfg.accentRgb},0.22)`,
              }}
              animate={isActive ? { boxShadow: [`0 0 0px rgba(${cfg.accentRgb},0)`, `0 0 8px rgba(${cfg.accentRgb},0.4)`, `0 0 0px rgba(${cfg.accentRgb},0)`] } : {}}
              transition={{ duration: 1.8, repeat: Infinity }}
            >
              {isActive && (
                <motion.div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: cfg.accent, boxShadow: `0 0 4px ${cfg.accent}` }}
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ duration: 0.9, repeat: Infinity }}
                />
              )}
              {cfg.label}
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default memo(MilestoneNode);
