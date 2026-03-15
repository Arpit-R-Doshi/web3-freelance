"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ProjectCard, { type ProjectCardData } from "@/components/projects/ProjectCard";

export default function ClientProjectsPage() {
  const [projects, setProjects] = useState<ProjectCardData[]>([]);
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
    <div className="max-w-5xl mx-auto space-y-8 py-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-[#1A1A2E] uppercase tracking-tight">My Projects</h1>
          <p className="text-[#4A4A68] mt-1 font-bold">Manage your freelance projects and track development.</p>
        </div>
        <Link
          href="/client/projects/new"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black bg-[#3D5AFE] text-white uppercase tracking-wider text-sm border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] hover:shadow-[2px_2px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
        >
          <Plus size={18} /> New Project
        </Link>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-[#3D5AFE]" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl border-3 border-dashed border-[#1A1A2E]">
          <FolderOpen size={48} className="text-[#B0B0CC] mb-4" />
          <h3 className="font-black text-[#1A1A2E] mb-1 uppercase">No projects yet</h3>
          <p className="text-sm text-[#4A4A68] mb-6 font-bold">Create your first project and hire workers — AI handles the rest.</p>
          <Link
            href="/client/projects/new"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black bg-[#3D5AFE] text-white uppercase tracking-wider text-sm border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] hover:shadow-[2px_2px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
          >
            <Plus size={16} /> Create your first project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
