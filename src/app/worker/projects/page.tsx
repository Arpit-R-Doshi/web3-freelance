"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Github, Loader2, FolderOpen, CheckCircle2, Zap, Clock } from "lucide-react";
import { toast } from "sonner";

type WorkerProject = {
  id: string; name: string; description: string;
  status: string; repoUrl?: string | null;
  milestones: { status: string }[];
  workers: { worker: { id: string; name: string } }[];
  commits?: { id: string }[];
};

export default function WorkerProjectsPage() {
  const [projects, setProjects] = useState<WorkerProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("wwt_token");
    if (!token) { setLoading(false); return; }

    fetch("/api/projects", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (d.projects) setProjects(d.projects); })
      .catch(() => toast.error("Failed to load projects"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6 px-4">
      <div>
        <h1 className="text-2xl font-black text-[#1A1A2E] uppercase tracking-tight">My Assignments</h1>
        <p className="text-[#4A4A68] mt-1 text-sm font-bold">Projects you have been added to as a collaborator.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-[#3D5AFE]" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 bg-white rounded-xl border-3 border-dashed border-[#1A1A2E]">
          <FolderOpen size={36} className="text-[#B0B0CC] mb-3" />
          <p className="font-black text-[#1A1A2E] uppercase">No assignments yet</p>
          <p className="text-sm text-[#4A4A68] mt-1 font-bold">A client needs to add you to a project first.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => {
            const total = p.milestones.length;
            const done = p.milestones.filter((m) => m.status === "completed").length;
            const active = p.milestones.filter((m) => m.status === "in_progress").length;
            const progress = total > 0 ? Math.round((done / total) * 100) : 0;

            return (
              <div key={p.id} className="bg-white rounded-xl border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0 pr-4">
                    <h3 className="font-black text-[#1A1A2E] text-base truncate uppercase">{p.name}</h3>
                    <p className="text-sm text-[#4A4A68] mt-0.5 line-clamp-1 font-bold">{p.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border-2 ${
                      p.status === "active" ? "bg-[#E8EAF6] text-[#3D5AFE] border-[#3D5AFE]"
                      : p.status === "completed" ? "bg-[#E8F5E9] text-[#00C853] border-[#00C853]"
                      : "bg-[#FFF8E1] text-[#F9A825] border-[#FFD600]"
                    }`}>
                      {p.status}
                    </span>
                    {p.repoUrl && (
                      <a href={p.repoUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[#4A4A68] hover:text-[#1A1A2E] transition-colors">
                        <Github size={16} />
                      </a>
                    )}
                  </div>
                </div>

                {/* Progress */}
                <div className="mb-3">
                  <div className="h-2 bg-[#F5F0E8] rounded-lg border-2 border-[#1A1A2E] overflow-hidden">
                    <div
                      className="h-full bg-[#3D5AFE] transition-all duration-700"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs text-[#4A4A68] font-bold">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 size={11} className="text-[#00C853]" />
                      {done}/{total} done
                    </span>
                    {active > 0 && (
                      <span className="flex items-center gap-1">
                        <Zap size={11} className="text-[#3D5AFE]" />
                        {active} in progress
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {(p.commits?.length ?? 0)} commits
                    </span>
                  </div>
                  <Link
                    href={`/client/projects/${p.id}`}
                    className="text-xs font-black text-[#3D5AFE] bg-[#E8EAF6] border-2 border-[#3D5AFE] px-3 py-1.5 rounded-lg hover:bg-[#3D5AFE] hover:text-white transition-all uppercase tracking-wider"
                  >
                    View Milestones →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
