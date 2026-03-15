"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Code2, Bug, Palette, ArrowRight, ArrowLeft, Loader2, CheckCircle, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

type SubRole = "developer" | "debugger" | "ui_ux_designer" | "";

const SUB_ROLES = [
  { id: "developer",      label: "Developer",      desc: "Full-stack / backend / frontend", icon: Code2,    color: "indigo" },
  { id: "debugger",       label: "Debugger",        desc: "Code review & bug hunting",       icon: Bug,      color: "red"    },
  { id: "ui_ux_designer", label: "UI/UX Designer",  desc: "Design & user experience",        icon: Palette,  color: "gold"   },
] as const;

const colorMap = {
  indigo: { selected: "border-[#3D5AFE] bg-[#E8EAF6] shadow-[3px_3px_0px_#3D5AFE]", icon: "text-[#3D5AFE]", check: "text-[#3D5AFE]" },
  red:    { selected: "border-[#FF1744] bg-[#FCE4EC] shadow-[3px_3px_0px_#FF1744]", icon: "text-[#FF1744]", check: "text-[#FF1744]" },
  gold:   { selected: "border-[#FFD600] bg-[#FFF8E1] shadow-[3px_3px_0px_#FFD600]", icon: "text-[#F9A825]", check: "text-[#F9A825]" },
};

export default function WorkerOnboarding() {
  const router = useRouter();
  const { address } = useAccount();

  const [isMounted, setIsMounted] = useState(false);
  const [pendingReg, setPendingReg] = useState<{ name: string; role: string; walletAddress?: string } | null>(null);

  const [subRole, setSubRole] = useState<SubRole>("");
  const [githubId, setGithubId] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const needsGithub = subRole === "developer" || subRole === "debugger";
  const totalSteps = needsGithub ? 3 : 2;

  useEffect(() => {
    setIsMounted(true);
    const raw = localStorage.getItem("wwt_pending_registration");
    if (!raw) {
      toast.error("Session expired. Please register again.");
      router.push("/");
      return;
    }
    const reg = JSON.parse(raw);
    if (reg.role !== "worker") { router.push("/onboarding/client"); return; }
    setPendingReg(reg);
  }, [router]);

  if (!isMounted || !pendingReg) return null;

  const addSkill = () => {
    const trimmed = skillInput.trim();
    if (!trimmed) return;
    if (skills.includes(trimmed)) return toast.error("Skill already added");
    setSkills((prev) => [...prev, trimmed]);
    setSkillInput("");
  };

  const removeSkill = (skill: string) => setSkills((prev) => prev.filter((s) => s !== skill));

  const handleStep1Next = () => {
    if (!subRole) return toast.error("Please select your role");
    setStep(needsGithub ? 2 : 2);
  };

  const handleStep2Next = () => {
    if (needsGithub) {
      if (!githubId.trim()) return toast.error("Please enter your GitHub ID");
      if (skills.length === 0) return toast.error("Please add at least one skill");
      setStep(3);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!email.trim()) return toast.error("Please enter your email");
    if (!password) return toast.error("Please enter a password");
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirmPassword) return toast.error("Passwords do not match");

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: pendingReg.name,
          email: email.trim(),
          password,
          role: "worker",
          walletAddress: address || pendingReg.walletAddress,
          workerProfile: {
            subRole,
            githubId: needsGithub ? githubId.trim() : undefined,
            skills: needsGithub ? skills : [],
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      localStorage.setItem("wwt_token", data.token);
      localStorage.setItem("wwt_user", JSON.stringify(data.user));
      localStorage.removeItem("wwt_pending_registration");

      toast.success(`Welcome to WeWorkTogether, ${data.user.name}!`);
      setTimeout(() => router.push("/worker"), 800);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#FFFDF5] p-6 relative overflow-hidden">
      {/* Geometric bg shapes */}
      <div className="absolute top-16 right-16 w-40 h-40 bg-[#3D5AFE] border-3 border-[#1A1A2E] -rotate-12 -z-10 opacity-20 rounded-full" />
      <div className="absolute bottom-16 left-16 w-32 h-32 bg-[#FF1744] border-3 border-[#1A1A2E] rotate-6 -z-10 opacity-15" />
      <div className="absolute top-1/3 left-10 w-20 h-20 bg-[#FFD600] border-3 border-[#1A1A2E] rotate-45 -z-10 opacity-20" />

      <div className="w-full max-w-md bg-white border-3 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] p-8 rounded-xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[#3D5AFE] rounded-lg flex items-center justify-center border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-black text-[#3D5AFE] uppercase tracking-widest">Worker Onboarding</p>
              <h1 className="text-xl font-black text-[#1A1A2E]">Set up your profile</h1>
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-2 flex-1 rounded-lg border-2 border-[#1A1A2E] overflow-hidden transition-all ${i < step ? "bg-[#3D5AFE]" : "bg-[#F5F0E8]"}`}
              />
            ))}
          </div>
          <p className="text-xs text-[#4A4A68] mt-1.5 font-bold">Step {step} of {totalSteps}</p>
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 1: Sub-role */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-3"
            >
              <p className="text-sm font-bold text-[#4A4A68] mb-3">
                Hi <span className="text-[#3D5AFE] font-black">{pendingReg.name}</span>, what&apos;s your specialty?
              </p>

              {SUB_ROLES.map(({ id, label, desc, icon: Icon, color }) => {
                const isSelected = subRole === id;
                const cm = colorMap[color];
                return (
                  <button
                    key={id}
                    onClick={() => setSubRole(id as SubRole)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-3 transition-all text-left ${
                      isSelected ? cm.selected : "border-[#1A1A2E] bg-white hover:bg-[#F5F0E8]"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center border-2 border-[#1A1A2E] ${isSelected ? "bg-white" : "bg-[#F5F0E8]"}`}>
                      <Icon size={22} className={isSelected ? cm.icon : "text-[#4A4A68]"} />
                    </div>
                    <div className="flex-1">
                      <p className="font-black text-sm text-[#1A1A2E]">{label}</p>
                      <p className="text-xs text-[#4A4A68] mt-0.5 font-bold">{desc}</p>
                    </div>
                    {isSelected && <CheckCircle className={`w-5 h-5 shrink-0 ${cm.check}`} />}
                  </button>
                );
              })}

              <button
                onClick={handleStep1Next}
                disabled={!subRole}
                className="w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-50 mt-2 bg-[#3D5AFE] text-white font-black rounded-xl uppercase tracking-wider border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] hover:shadow-[2px_2px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
              >
                Continue <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {/* STEP 2: GitHub + Skills or Credentials */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              {needsGithub ? (
                <>
                  <div>
                    <label className="block text-sm font-black text-[#1A1A2E] mb-2 ml-1 uppercase tracking-wider">GitHub Username</label>
                    <div className="flex items-center border-3 border-[#1A1A2E] rounded-xl overflow-hidden">
                      <span className="px-3 py-3 text-[#4A4A68] font-bold text-sm border-r-3 border-[#1A1A2E] bg-[#F5F0E8] shrink-0">github.com/</span>
                      <input
                        type="text"
                        value={githubId}
                        onChange={(e) => setGithubId(e.target.value)}
                        placeholder="your-username"
                        className="flex-1 bg-white text-[#1A1A2E] px-3 py-3 focus:outline-none font-bold text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-black text-[#1A1A2E] mb-2 ml-1 uppercase tracking-wider">Skills</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={skillInput}
                        onChange={(e) => setSkillInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
                        placeholder="e.g. React, Node.js"
                        className="flex-1 px-4 py-2.5 font-bold text-sm bg-white border-3 border-[#1A1A2E] rounded-xl focus:outline-none focus:shadow-[3px_3px_0px_#3D5AFE] transition-shadow text-[#1A1A2E]"
                      />
                      <button
                        onClick={addSkill}
                        className="w-10 h-10 flex items-center justify-center bg-[#3D5AFE] text-white rounded-xl transition-all shrink-0 border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] hover:shadow-[1px_1px_0px_#1A1A2E] hover:translate-x-[1px] hover:translate-y-[1px]"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    {skills.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {skills.map((s) => (
                          <span key={s} className="flex items-center gap-1.5 bg-[#E8EAF6] text-[#3D5AFE] border-2 border-[#3D5AFE] px-3 py-1 rounded-lg text-xs font-black">
                            {s}
                            <button onClick={() => removeSkill(s)} className="text-[#3D5AFE] hover:text-[#FF1744] transition-colors">
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => setStep(1)}
                      className="flex items-center gap-1.5 px-4 py-3 rounded-xl border-3 border-[#1A1A2E] text-[#1A1A2E] font-black text-sm hover:bg-[#F5F0E8] transition-all uppercase tracking-wider"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={handleStep2Next}
                      className="flex-1 py-3 flex items-center justify-center gap-2 bg-[#3D5AFE] text-white font-black rounded-xl uppercase tracking-wider border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] hover:shadow-[2px_2px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                    >
                      Continue <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </>
              ) : (
                <CredentialsForm
                  email={email} setEmail={setEmail}
                  password={password} setPassword={setPassword}
                  confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
                  onBack={() => setStep(1)} onSubmit={handleSubmit} isSubmitting={isSubmitting}
                />
              )}
            </motion.div>
          )}

          {/* STEP 3: Credentials (developer/debugger) */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <CredentialsForm
                email={email} setEmail={setEmail}
                password={password} setPassword={setPassword}
                confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
                onBack={() => setStep(2)} onSubmit={handleSubmit} isSubmitting={isSubmitting}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

function CredentialsForm({
  email, setEmail, password, setPassword, confirmPassword, setConfirmPassword,
  onBack, onSubmit, isSubmitting,
}: {
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  confirmPassword: string; setConfirmPassword: (v: string) => void;
  onBack: () => void; onSubmit: () => void; isSubmitting: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-black text-[#1A1A2E] mb-2 ml-1 uppercase tracking-wider">Email Address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-4 py-3 font-bold bg-white border-3 border-[#1A1A2E] rounded-xl focus:outline-none focus:shadow-[3px_3px_0px_#3D5AFE] transition-shadow text-[#1A1A2E]"
        />
      </div>

      <div>
        <label className="block text-sm font-black text-[#1A1A2E] mb-2 ml-1 uppercase tracking-wider">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minimum 8 characters"
          className="w-full px-4 py-3 font-bold bg-white border-3 border-[#1A1A2E] rounded-xl focus:outline-none focus:shadow-[3px_3px_0px_#3D5AFE] transition-shadow text-[#1A1A2E]"
        />
      </div>

      <div>
        <label className="block text-sm font-black text-[#1A1A2E] mb-2 ml-1 uppercase tracking-wider">Confirm Password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter password"
          className="w-full px-4 py-3 font-bold bg-white border-3 border-[#1A1A2E] rounded-xl focus:outline-none focus:shadow-[3px_3px_0px_#3D5AFE] transition-shadow text-[#1A1A2E]"
        />
      </div>

      <div className="flex gap-3 pt-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-3 rounded-xl border-3 border-[#1A1A2E] text-[#1A1A2E] font-black text-sm hover:bg-[#F5F0E8] transition-all uppercase tracking-wider"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="flex-1 py-3 flex items-center justify-center gap-2 disabled:opacity-50 bg-[#00C853] text-white font-black rounded-xl uppercase tracking-wider border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] hover:shadow-[2px_2px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
        >
          {isSubmitting ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Creating account...</>
          ) : (
            <>Complete Setup <ArrowRight className="w-5 h-5" /></>
          )}
        </button>
      </div>
    </div>
  );
}
