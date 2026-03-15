"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User, Mail, Wallet, Code2, Bug, Palette, Github,
  ShieldCheck, Calendar, ArrowLeft, Loader2, Tag, Star, CheckSquare, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

type WorkerProfileData = {
  id: string;
  name: string;
  email: string;
  role: string;
  walletAddress: string | null;
  kycVerified: boolean;
  kycVerifiedAt: string | null;
  createdAt: string;
  workerProfile: {
    subRole: "developer" | "debugger" | "ui_ux_designer";
    githubId: string | null;
    skills: string[];
    reputationScore: number;
    completedProjectsCount: number;
    disputeCount: number;
  } | null;
};

const SUB_ROLE_META = {
  developer: { label: "Developer", icon: Code2, color: "indigo" },
  debugger: { label: "Debugger", icon: Bug, color: "red" },
  ui_ux_designer: { label: "UI/UX Designer", icon: Palette, color: "gold" },
} as const;

const colorMap = {
  indigo: { badge: "bg-[#E8EAF6] text-[#3D5AFE] border-[#3D5AFE]", icon: "text-[#3D5AFE]", grad: "bg-[#3D5AFE]" },
  red:    { badge: "bg-[#FCE4EC] text-[#FF1744] border-[#FF1744]", icon: "text-[#FF1744]", grad: "bg-[#FF1744]" },
  gold:   { badge: "bg-[#FFF8E1] text-[#F9A825] border-[#FFD600]", icon: "text-[#F9A825]", grad: "bg-[#FFD600]" },
};

export default function WorkerProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<WorkerProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("wwt_token");
    if (!token) { router.push("/"); return; }

    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { toast.error(data.error); router.push("/"); return; }
        setProfile(data);
      })
      .catch(() => toast.error("Failed to load profile"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#3D5AFE] animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  const wp = profile.workerProfile;
  const subRoleMeta = wp ? SUB_ROLE_META[wp.subRole] : null;
  const cm = subRoleMeta ? colorMap[subRoleMeta.color] : colorMap.indigo;
  const SubRoleIcon = subRoleMeta?.icon ?? Code2;

  const joinDate = new Date(profile.createdAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });
  const kycDate = profile.kycVerifiedAt
    ? new Date(profile.kycVerifiedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const hasGithub = wp?.githubId;
  const hasSkills = wp?.skills && wp.skills.length > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6 px-4">
      {/* Back button */}
      <button
        onClick={() => router.push("/worker")}
        className="flex items-center gap-2 text-[#4A4A68] hover:text-[#1A1A2E] font-black text-sm uppercase tracking-wider transition-colors"
      >
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      {/* Hero Card */}
      <div className="bg-white rounded-xl border-3 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] overflow-hidden">
        <div className={`h-24 ${cm.grad}`} />
        <div className="px-8 pb-8 -mt-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="flex items-end gap-4">
            <div className={`w-20 h-20 rounded-xl ${cm.grad} border-4 border-white shadow-[3px_3px_0px_#1A1A2E] flex items-center justify-center`}>
              <SubRoleIcon className="w-9 h-9 text-white" />
            </div>
            <div className="mb-1">
              <h1 className="text-2xl font-black text-[#1A1A2E]">{profile.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                {subRoleMeta && (
                  <span className={`text-xs font-black uppercase tracking-widest px-2.5 py-0.5 rounded-lg border-2 ${cm.badge}`}>
                    {subRoleMeta.label}
                  </span>
                )}
                {profile.kycVerified && (
                  <span className="flex items-center gap-1 text-xs font-black text-[#00C853] bg-[#E8F5E9] px-2.5 py-0.5 rounded-lg border-2 border-[#00C853]">
                    <ShieldCheck size={12} /> KYC Verified
                  </span>
                )}
              </div>
            </div>
          </div>
          <p className="text-xs text-[#4A4A68] font-bold mb-1">Member since {joinDate}</p>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <InfoCard icon={User} label="Full Name" value={profile.name} />
        <InfoCard icon={Mail} label="Email Address" value={profile.email} />

        {profile.walletAddress && (
          <InfoCard
            icon={Wallet}
            label="Wallet Address"
            value={`${profile.walletAddress.slice(0, 10)}...${profile.walletAddress.slice(-6)}`}
            mono
          />
        )}

        {subRoleMeta && (
          <InfoCard icon={SubRoleIcon} label="Specialisation" value={subRoleMeta.label} />
        )}

        {hasGithub && (
          <InfoCard icon={Github} label="GitHub Username" value={wp!.githubId!} mono />
        )}

        {kycDate && (
          <InfoCard icon={ShieldCheck} label="KYC Verified On" value={kycDate} accent="emerald" />
        )}

        <InfoCard icon={Calendar} label="Member Since" value={joinDate} />
      </div>

      {/* Reputation Section */}
      {wp && (
        <div className="bg-white rounded-xl border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-[#FFF8E1] border-2 border-[#FFD600] flex items-center justify-center">
              <Star className="w-4 h-4 text-[#F9A825]" size={18} />
            </div>
            <p className="font-black text-[#1A1A2E] uppercase tracking-wide">Reputation</p>
            <span className="ml-auto text-2xl font-black text-[#1A1A2E]">
              {wp.reputationScore.toFixed(0)}
              <span className="text-sm font-bold text-[#4A4A68]">/100</span>
            </span>
          </div>

          {/* Score bar */}
          <div className="h-3 bg-[#F5F0E8] rounded-lg overflow-hidden mb-5 border-2 border-[#1A1A2E]">
            <div
              className={`h-full transition-all duration-700 ${
                wp.reputationScore >= 70
                  ? "bg-[#00C853]"
                  : wp.reputationScore >= 40
                  ? "bg-[#FFD600]"
                  : "bg-[#FF1744]"
              }`}
              style={{ width: `${wp.reputationScore}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 bg-[#E8F5E9] rounded-xl p-3 border-2 border-[#00C853]">
              <CheckSquare className="w-5 h-5 text-[#00C853] shrink-0" />
              <div>
                <p className="text-xs text-[#00C853] font-black uppercase tracking-wider">Completed</p>
                <p className="text-xl font-black text-[#1A1A2E]">{wp.completedProjectsCount}</p>
                <p className="text-[10px] text-[#4A4A68] font-bold">Projects</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-[#FCE4EC] rounded-xl p-3 border-2 border-[#FF1744]">
              <AlertTriangle className="w-5 h-5 text-[#FF1744] shrink-0" />
              <div>
                <p className="text-xs text-[#FF1744] font-black uppercase tracking-wider">Disputes</p>
                <p className="text-xl font-black text-[#1A1A2E]">{wp.disputeCount}</p>
                <p className="text-[10px] text-[#4A4A68] font-bold">Raised against you</p>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-[#4A4A68] mt-4 font-bold">
            Score formula: +10 per completed project, −20 per dispute. Capped 0–100.
          </p>
        </div>
      )}

      {/* Skills Section */}
      {hasSkills && (
        <div className="bg-white rounded-xl border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-[#F5F0E8] border-2 border-[#1A1A2E] flex items-center justify-center">
              <Tag className="w-4 h-4 text-[#4A4A68]" size={18} />
            </div>
            <p className="font-black text-[#1A1A2E] uppercase tracking-wide">Skills</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {wp!.skills.map((skill) => (
              <span
                key={skill}
                className={`px-3 py-1.5 rounded-lg text-xs font-black border-2 ${cm.badge}`}
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* GitHub Card */}
      {hasGithub && (
        <a
          href={`https://github.com/${wp!.githubId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 bg-[#1A1A2E] hover:bg-black text-white rounded-xl px-6 py-4 transition-all border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#3D5AFE] hover:shadow-[2px_2px_0px_#3D5AFE] hover:translate-x-[2px] hover:translate-y-[2px]"
        >
          <Github className="w-8 h-8 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm uppercase tracking-wider">GitHub Profile</p>
            <p className="text-gray-400 text-xs font-mono mt-0.5">github.com/{wp!.githubId}</p>
          </div>
          <ArrowLeft className="w-4 h-4 rotate-180 text-gray-400" />
        </a>
      )}

      {/* KYC Banner */}
      {profile.kycVerified && (
        <div className="flex items-center gap-4 bg-[#E8F5E9] border-3 border-[#00C853] rounded-xl px-6 py-4 shadow-[4px_4px_0px_#00C853]">
          <div className="w-10 h-10 rounded-lg bg-white border-2 border-[#00C853] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-[#00C853]" />
          </div>
          <div>
            <p className="font-black text-[#1A1A2E] text-sm">Identity Verified via Didit</p>
            <p className="text-xs text-[#4A4A68] mt-0.5 font-bold">
              Your identity has been verified and this account is fully authenticated.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({
  icon: Icon, label, value, mono = false, accent,
}: {
  icon: any; label: string; value: string; mono?: boolean; accent?: string;
}) {
  const accentColor = accent === "emerald" ? "text-[#00C853]" : "text-[#1A1A2E]";
  return (
    <div className="bg-white rounded-xl border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] p-5 flex items-start gap-4">
      <div className="w-9 h-9 rounded-lg bg-[#F5F0E8] border-2 border-[#1A1A2E] flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-[#4A4A68]" size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-black text-[#4A4A68] uppercase tracking-wider mb-1">{label}</p>
        <p className={`font-bold text-sm break-all ${mono ? "font-mono" : ""} ${accentColor}`}>{value}</p>
      </div>
    </div>
  );
}
