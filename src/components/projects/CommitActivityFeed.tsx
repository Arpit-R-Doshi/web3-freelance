"use client";

import { motion, AnimatePresence } from "framer-motion";
import { GitCommit, Zap } from "lucide-react";

export type CommitEntry = {
  id: string;
  message: string;
  aiSummary?: string | null;
  createdAt: string;
};

type Props = {
  commits: CommitEntry[];
};

export default function CommitActivityFeed({ commits }: Props) {
  if (!commits.length) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center">
        <GitCommit size={24} className="text-slate-300 mb-2" />
        <p className="text-sm text-slate-400 font-medium">No commits yet</p>
        <p className="text-xs text-slate-300 mt-1">Simulate a commit to see updates</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 overflow-y-auto max-h-[340px] pr-1">
      <AnimatePresence initial={false}>
        {commits.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, delay: i === 0 ? 0 : 0 }}
            className={`flex items-start gap-3 p-3 rounded-xl ${i === 0 ? "bg-blue-50/80 border border-blue-100" : "bg-slate-50 border border-transparent"}`}
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${i === 0 ? "bg-blue-100" : "bg-slate-100"}`}>
              {i === 0 ? <Zap size={13} className="text-blue-500" /> : <GitCommit size={13} className="text-slate-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold leading-snug ${i === 0 ? "text-blue-800" : "text-slate-700"}`}>
                {c.aiSummary || c.message}
              </p>
              {c.aiSummary && c.message !== c.aiSummary && (
                <p className="text-[10px] text-slate-400 font-mono mt-0.5 line-clamp-1">{c.message}</p>
              )}
              <p className="text-[10px] text-slate-400 mt-1">
                {new Date(c.createdAt).toLocaleString()}
              </p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
