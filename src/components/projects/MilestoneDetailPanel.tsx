"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X, CheckCircle2, Circle, AlertCircle, Clock, Loader2,
  Lightbulb, FlaskConical, GitCommit, ThumbsUp,
} from "lucide-react";
import type { MilestoneForLayout } from "@/lib/milestone-layout";

type TestCase = { name: string; description: string };

type Props = {
  milestone: MilestoneForLayout | null;
  onClose: () => void;
  recentCommits?: { id: string; message: string; aiSummary?: string | null; createdAt: string }[];
  isClient?: boolean;
  onApproveRequest?: (milestoneId: string) => void;
};

const STATUS_META = {
  pending: { label: "Pending", icon: Clock, color: "text-slate-500", bg: "bg-slate-50", border: "border-slate-200" },
  in_progress: { label: "In Progress", icon: Loader2, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  completed: { label: "Completed", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  failed: { label: "Failed", icon: AlertCircle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
};

function parseTests(raw: unknown): TestCase[] {
  if (Array.isArray(raw)) return raw as TestCase[];
  try { return JSON.parse(raw as string) as TestCase[]; } catch { return []; }
}

export default function MilestoneDetailPanel({ milestone, onClose, recentCommits = [], isClient, onApproveRequest }: Props) {
  return (
    <AnimatePresence>
      {milestone && (
        <MilestonePanelInner
          milestone={milestone}
          onClose={onClose}
          recentCommits={recentCommits}
          isClient={isClient}
          onApproveRequest={onApproveRequest}
        />
      )}
    </AnimatePresence>
  );
}

type InnerProps = { milestone: MilestoneForLayout; onClose: () => void; recentCommits: NonNullable<Props["recentCommits"]>; isClient?: boolean; onApproveRequest?: (milestoneId: string) => void };

function MilestonePanelInner({ milestone, onClose, recentCommits, isClient, onApproveRequest }: InnerProps) {
  const testCases = parseTests(milestone.testCases);
  const canApprove = isClient && milestone.status === "completed" && milestone.reviewStatus !== "approved";
  const isApproved = milestone.reviewStatus === "approved";

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="h-full flex flex-col bg-white border-l border-slate-100 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-slate-100 shrink-0">
        <div className="flex-1 min-w-0 pr-3">
          <StatusBadge status={milestone.status} />
          <h2 className="font-extrabold text-slate-900 mt-2 leading-tight">{milestone.title}</h2>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Non-technical explanation */}
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb size={14} className="text-amber-500 shrink-0" />
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">What this means</p>
          </div>
          <p className="text-sm text-amber-900 leading-relaxed">{milestone.simpleExplanation}</p>
        </div>

        {/* Progress Ring */}
        <div className="flex items-center gap-5">
          <ProgressRing progress={milestone.progress} status={milestone.status} />
          <div>
            <p className="text-2xl font-extrabold text-slate-900">{milestone.progress}%</p>
            <p className="text-sm text-slate-500">Complete</p>
            <p className="text-xs text-slate-400 mt-1">
              {milestone.testsPassed} / {milestone.testsTotal} tests passing
            </p>
          </div>
        </div>

        {/* Technical description */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Technical Details</p>
          <p className="text-sm text-slate-700 leading-relaxed">{milestone.description}</p>
        </div>

        {/* Test cases */}
        {testCases.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FlaskConical size={14} className="text-slate-400" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Validation Tests</p>
            </div>
            <div className="space-y-2">
              {testCases.map((tc, i) => {
                const isPassed = i < milestone.testsPassed;
                return (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-3 rounded-xl border ${isPassed ? "bg-emerald-50/50 border-emerald-100" : "bg-slate-50 border-slate-100"}`}
                  >
                    {isPassed ? (
                      <CheckCircle2 size={15} className="text-emerald-500 mt-0.5 shrink-0" />
                    ) : (
                      <Circle size={15} className="text-slate-300 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className={`text-xs font-bold ${isPassed ? "text-emerald-800" : "text-slate-600"}`}>
                        {tc.name}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{tc.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent commits */}
        {recentCommits.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <GitCommit size={14} className="text-slate-400" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recent Activity</p>
            </div>
            <div className="space-y-2">
              {recentCommits.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-start gap-2.5 p-3 bg-slate-50 rounded-xl">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-700 font-medium line-clamp-1">
                      {c.aiSummary || c.message}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(c.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last commit message */}
        {milestone.lastCommitMsg && (
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-bold">Last Commit</p>
            <p className="text-xs text-slate-600 font-mono line-clamp-2">{milestone.lastCommitMsg}</p>
          </div>
        )}

        {/* Client: Approve / Already Approved */}
        {isApproved && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-emerald-800">Milestone Approved</p>
              {milestone.tokenRelease && (
                <p className="text-[10px] text-emerald-600">{milestone.tokenRelease} tokens released to worker</p>
              )}
            </div>
          </div>
        )}
        {canApprove && (
          <button
            onClick={() => onApproveRequest?.(milestone.id)}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold text-sm transition-all shadow-md"
          >
            <ThumbsUp size={14} /> Approve &amp; Release Payment
          </button>
        )}
      </div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as keyof typeof STATUS_META] ?? STATUS_META.pending;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${meta.bg} ${meta.color} ${meta.border}`}>
      <Icon size={11} className={status === "in_progress" ? "animate-spin" : ""} />
      {meta.label}
    </span>
  );
}

function ProgressRing({ progress, status }: { progress: number; status: string }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const dash = (progress / 100) * circ;
  const color = status === "completed" ? "#10b981" : status === "failed" ? "#ef4444" : "#3b82f6";

  return (
    <svg width="80" height="80" className="shrink-0">
      <circle cx="40" cy="40" r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
      <circle
        cx="40" cy="40" r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 40 40)"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    </svg>
  );
}
