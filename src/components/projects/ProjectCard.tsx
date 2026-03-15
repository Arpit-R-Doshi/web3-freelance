"use client";

import { useRouter } from "next/navigation";
import { Github, Users, CheckCircle2, Clock, Zap, ArrowRight } from "lucide-react";

export type ProjectCardData = {
  id: string;
  name: string;
  description: string;
  status: string;
  repoUrl?: string | null;
  skills: string; // JSON
  createdAt: string;
  milestones: { status: string }[];
  workers: { worker: { id: string; name: string } }[];
};

const STATUS_BADGE = {
  setup:     { label: "Setting Up", color: "text-[#F9A825] bg-[#FFF8E1] border-2 border-[#FFD600]" },
  active:    { label: "Active",     color: "text-[#3D5AFE] bg-[#E8EAF6] border-2 border-[#3D5AFE]" },
  completed: { label: "Completed",  color: "text-[#00C853] bg-[#E8F5E9] border-2 border-[#00C853]" },
};

export default function ProjectCard({ project }: { project: ProjectCardData }) {
  const router = useRouter();
  const total = project.milestones.length;
  const done = project.milestones.filter((m) => m.status === "completed").length;
  const inProg = project.milestones.filter((m) => m.status === "in_progress").length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const skills: string[] = JSON.parse(project.skills || "[]");
  const badge = STATUS_BADGE[project.status as keyof typeof STATUS_BADGE] ?? STATUS_BADGE.active;

  return (
    <div
      onClick={() => router.push(`/client/projects/${project.id}`)}
      className="group cursor-pointer bg-white rounded-xl border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] hover:shadow-[6px_6px_0px_#3D5AFE] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all p-5 relative overflow-hidden"
    >
      {/* Status stripe */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${
        project.status === "completed" ? "bg-[#00C853]" :
        project.status === "active"    ? "bg-[#3D5AFE]"  : "bg-[#FFD600]"
      }`} />

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 pr-3">
          <h3 className="font-black text-text-primary text-base truncate group-hover:text-[#3D5AFE] transition-colors uppercase">
            {project.name}
          </h3>
          <p className="text-xs text-text-muted mt-0.5 line-clamp-1 font-bold">{project.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg ${badge.color}`}>
            {badge.label}
          </span>
          {project.repoUrl && (
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-text-muted hover:text-[#1A1A2E] transition-colors"
            >
              <Github size={15} />
            </a>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-text-muted font-bold uppercase tracking-wider">Progress</span>
          <span className="font-black text-text-secondary">{progress}%</span>
        </div>
        <div className="h-2.5 bg-[#F5F0E8] border-2 border-[#1A1A2E] rounded-sm overflow-hidden">
          <div
            className={`h-full rounded-sm transition-all duration-700 ${
              project.status === "completed" ? "bg-[#00C853]" : "bg-[#3D5AFE]"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-4 mb-3 text-xs text-text-muted font-bold">
        <span className="flex items-center gap-1">
          <CheckCircle2 size={11} className="text-[#00C853]" />
          <span className="font-black">{done}/{total}</span> milestones
        </span>
        {inProg > 0 && (
          <span className="flex items-center gap-1">
            <Zap size={11} className="text-[#3D5AFE]" />
            <span className="font-black">{inProg}</span> active
          </span>
        )}
        <span className="flex items-center gap-1">
          <Users size={11} />
          <span>{project.workers.length} worker{project.workers.length !== 1 ? "s" : ""}</span>
        </span>
        <span className="flex items-center gap-1 ml-auto">
          <Clock size={11} />
          {new Date(project.createdAt).toLocaleDateString()}
        </span>
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.slice(0, 5).map((s) => (
            <span key={s} className="text-[10px] font-black text-text-muted bg-[#F5F0E8] border-2 border-[#1A1A2E] px-2 py-0.5 rounded-lg uppercase tracking-wider">
              {s}
            </span>
          ))}
          {skills.length > 5 && (
            <span className="text-[10px] font-black text-text-muted px-1">+{skills.length - 5}</span>
          )}
        </div>
      )}

      {/* Arrow */}
      <ArrowRight size={15} className="absolute bottom-4 right-4 text-[#B0B0CC] group-hover:text-[#3D5AFE] transition-colors" />
    </div>
  );
}
