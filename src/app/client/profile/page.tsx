"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User, Mail, Wallet, Building2, FileText, ShieldCheck,
  Calendar, ArrowLeft, Loader2, Badge, Hash,
} from "lucide-react";
import { toast } from "sonner";

type ClientProfileData = {
  id: string;
  name: string;
  email: string;
  role: string;
  walletAddress: string | null;
  kycVerified: boolean;
  kycVerifiedAt: string | null;
  createdAt: string;
  clientProfile: {
    type: "individual" | "organisation";
    orgName: string | null;
    taxNumber: string | null;
  } | null;
};

export default function ClientProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ClientProfileData | null>(null);
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

  const isOrg = profile.clientProfile?.type === "organisation";
  const joinDate = new Date(profile.createdAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });
  const kycDate = profile.kycVerifiedAt
    ? new Date(profile.kycVerifiedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6 px-4">
      {/* Back button */}
      <button
        onClick={() => router.push("/client")}
        className="flex items-center gap-2 text-[#4A4A68] hover:text-[#1A1A2E] font-black text-sm uppercase tracking-wider transition-colors"
      >
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      {/* Hero Card */}
      <div className="bg-white rounded-xl border-3 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] overflow-hidden">
        <div className="h-24 bg-[#3D5AFE]" />
        <div className="px-8 pb-8 -mt-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="flex items-end gap-4">
            <div className="w-20 h-20 rounded-xl bg-[#3D5AFE] border-4 border-white shadow-[3px_3px_0px_#1A1A2E] flex items-center justify-center">
              {isOrg ? (
                <Building2 className="w-9 h-9 text-white" />
              ) : (
                <User className="w-9 h-9 text-white" />
              )}
            </div>
            <div className="mb-1">
              <h1 className="text-2xl font-black text-[#1A1A2E]">{profile.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-black uppercase tracking-widest text-[#3D5AFE] bg-[#E8EAF6] px-2.5 py-0.5 rounded-lg border-2 border-[#3D5AFE]">
                  {isOrg ? "Organisation" : "Individual"} Client
                </span>
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

        <InfoCard
          icon={Badge}
          label="Account Type"
          value={isOrg ? "Organisation" : "Individual"}
        />

        {isOrg && profile.clientProfile?.orgName && (
          <InfoCard icon={Building2} label="Organisation Name" value={profile.clientProfile.orgName} />
        )}

        {isOrg && profile.clientProfile?.taxNumber && (
          <InfoCard icon={Hash} label="Tax Number / GST" value={profile.clientProfile.taxNumber} />
        )}

        {kycDate && (
          <InfoCard icon={ShieldCheck} label="KYC Verified On" value={kycDate} accent="emerald" />
        )}

        <InfoCard icon={Calendar} label="Member Since" value={joinDate} />
      </div>

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
