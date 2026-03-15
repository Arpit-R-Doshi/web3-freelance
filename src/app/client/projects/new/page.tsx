"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Sparkles, X, Plus, Search, User,
  Loader2, CheckCircle2, Github, Code2, Bug, Palette, Coins,
  AlertTriangle, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import EscrowPaymentFlow from "@/components/projects/EscrowPaymentFlow";
import USDTABI from "@/lib/abi/MockUSDT.json";

type WorkerCard = {
  id: string; name: string; email: string;
  walletAddress?: string | null;
  subRole?: string; skills: string[]; githubId?: string | null;
  matchScore?: number;
};

type CreationStep = { label: string; done: boolean };

const SUB_ROLE_ICONS: Record<string, any> = { developer: Code2, debugger: Bug, ui_ux_designer: Palette };

export default function NewProjectPage() {
  const router = useRouter();
  const { address } = useAccount();
  const [token, setToken] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  // Step 2
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [workers, setWorkers] = useState<WorkerCard[]>([]);
  const [selectedWorkers, setSelectedWorkers] = useState<WorkerCard[]>([]);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [workerLoading, setWorkerLoading] = useState(false);

  // Step 3
  const [creating, setCreating] = useState(false);
  const [creationSteps, setCreationSteps] = useState<CreationStep[]>([]);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [showEscrow, setShowEscrow] = useState(false);
  const [showTopUpGate, setShowTopUpGate] = useState(false);

  // USDT balance check
  const USDT_ADDRESS = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}`;
  const { data: balanceData, refetch: refetchBalance } = useReadContract({
    address: USDT_ADDRESS,
    abi: USDTABI,
    functionName: "balanceOf",
    args: [address],
    query: { enabled: !!address },
  });
  const balanceTokens = balanceData ? parseFloat(formatEther(balanceData as bigint)) : 0;

  useEffect(() => {
    const t = localStorage.getItem("wwt_token") ?? "";
    setToken(t);
  }, []);

  // Auto-load recommended workers when skills change
  useEffect(() => {
    if (!skills.length || !token) return;
    setWorkerLoading(true);
    fetch(`/api/workers?skills=${encodeURIComponent(skills.join(","))}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setWorkers(d.workers ?? []))
      .catch(() => {})
      .finally(() => setWorkerLoading(false));
  }, [skills, token]);

  const handleAnalyze = async () => {
    if (!description.trim()) return toast.error("Please describe your project");
    if (!budget || isNaN(Number(budget)) || Number(budget) <= 0)
      return toast.error("Please enter a valid project budget");
    setAnalyzing(true);
    try {
      const r = await fetch("/api/ai/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const d = await r.json();
      if (d.skills?.length) {
        setSkills(d.skills);
        toast.success(`Extracted ${d.skills.length} skills`);
        setStep(2);
      } else {
        toast.error("Could not extract skills. Try a more detailed description.");
      }
    } catch { toast.error("AI analysis failed"); }
    finally { setAnalyzing(false); }
  };

  const addSkill = () => {
    const s = skillInput.trim();
    if (!s || skills.includes(s)) return;
    setSkills((p) => [...p, s]);
    setSkillInput("");
  };

  const searchByEmail = async () => {
    if (!searchEmail.trim()) return;
    setSearchLoading(true);
    try {
      const r = await fetch(`/api/workers?email=${encodeURIComponent(searchEmail)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      const found: WorkerCard[] = d.workers ?? [];
      if (!found.length) { toast.error("No worker found with that email"); return; }
      setWorkers((prev) => {
        const ids = new Set(prev.map((w) => w.id));
        return [...prev, ...found.filter((w) => !ids.has(w.id))];
      });
      setSearchEmail("");
    } catch { toast.error("Search failed"); }
    finally { setSearchLoading(false); }
  };

  const toggleWorker = (w: WorkerCard) => {
    setSelectedWorkers((prev) =>
      prev.find((s) => s.id === w.id) ? prev.filter((s) => s.id !== w.id) : [...prev, w]
    );
  };

  const handleCreate = async () => {
    if (!name.trim()) return toast.error("Project name required");
    setCreating(true);

    const steps: CreationStep[] = [
      { label: "Generating milestones with AI", done: false },
      { label: "Creating GitHub repository", done: false },
      { label: "Adding workers as collaborators", done: false },
      { label: "Finalizing project", done: false },
    ];
    setCreationSteps(steps);

    try {
      const fetchPromise = fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          skills,
          workerIds: selectedWorkers.map((w) => w.id),
          budget: Number(budget),
          budgetCurrency: "USDT",
        }),
      });

      // Animate steps while waiting
      for (let i = 0; i < steps.length; i++) {
        await new Promise((res) => setTimeout(res, 900));
        setCreationSteps((prev) => prev.map((s, idx) => idx <= i ? { ...s, done: true } : s));
      }

      const r = await fetchPromise;
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);

      setCreatedProjectId(d.project.id);
      toast.success("Project created! Fund it to lock the escrow.");
      setShowEscrow(true);
    } catch (err: any) {
      toast.error(err.message);
      setCreating(false);
    }
  };

  const budgetNum = Number(budget) || 0;
  const balanceInsufficient = budgetNum > 0 && balanceTokens < budgetNum;
  const firstWorkerAddress = selectedWorkers.find((w) => w.walletAddress)?.walletAddress ?? null;
  const progress = (step / 3) * 100;

  return (
    <main className="max-w-2xl mx-auto py-8 px-4">
      {/* Progress header */}
      <div className="mb-8">
        <button
          onClick={() => step > 1 && !showEscrow ? setStep((s) => (s - 1) as any) : router.push("/client/projects")}
          className="flex items-center gap-1.5 text-[#4A4A68] hover:text-[#1A1A2E] text-sm font-black uppercase tracking-wider mb-4"
        >
          <ArrowLeft size={15} /> {step > 1 && !showEscrow ? "Back" : "My Projects"}
        </button>
        <h1 className="text-2xl font-black text-[#1A1A2E] uppercase tracking-tight">New Project</h1>
        <div className="mt-4 h-2 bg-[#F5F0E8] rounded-lg border-2 border-[#1A1A2E] overflow-hidden">
          <motion.div
            className="h-full bg-[#3D5AFE]"
            animate={{ width: showEscrow ? "100%" : `${progress}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <p className="text-xs text-[#4A4A68] mt-1.5 font-bold">
          {showEscrow ? "Step 3 of 3 · Fund & Lock Escrow" : `Step ${step} of 3`}
        </p>
      </div>

      <AnimatePresence mode="wait">

        {/* ─── STEP 1: Details + Budget ─── */}
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-5">
            <div>
              <h2 className="text-lg font-black text-[#1A1A2E] uppercase tracking-wide mb-1">Project Details</h2>
              <p className="text-sm text-[#4A4A68] font-bold">Describe your project and set a budget — AI will extract skills and generate milestones.</p>
            </div>

            <div>
              <label className="block text-sm font-black text-[#1A1A2E] mb-2 ml-1 uppercase tracking-wider">Project Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. E-commerce Mobile App"
                className="w-full px-4 py-3 font-bold bg-white border-3 border-[#1A1A2E] rounded-xl focus:outline-none focus:shadow-[3px_3px_0px_#3D5AFE] transition-shadow text-[#1A1A2E]"
              />
            </div>

            <div>
              <label className="block text-sm font-black text-[#1A1A2E] mb-2 ml-1 uppercase tracking-wider">Project Requirements</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Describe what you want to build — include key features, technologies, integrations, etc."
                className="w-full px-4 py-3 font-bold bg-white border-3 border-[#1A1A2E] rounded-xl focus:outline-none focus:shadow-[3px_3px_0px_#3D5AFE] transition-shadow text-[#1A1A2E] resize-none"
              />
            </div>

            {/* Budget */}
            <div>
              <label className="block text-sm font-black text-[#1A1A2E] mb-2 ml-1 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Coins size={14} className="text-[#3D5AFE]" /> Project Budget
                  <span className="text-xs font-bold text-[#4A4A68] normal-case">(locked in smart contract escrow)</span>
                </span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number" value={budget} onChange={(e) => setBudget(e.target.value)}
                  placeholder="500" min="1"
                  className="flex-1 min-w-0 px-4 py-3 font-black text-lg bg-white border-3 border-[#1A1A2E] rounded-xl focus:outline-none focus:shadow-[3px_3px_0px_#3D5AFE] transition-shadow text-[#1A1A2E]"
                />
                <div className="flex items-center px-4 py-3 bg-[#F5F0E8] border-3 border-[#1A1A2E] rounded-xl text-[#1A1A2E] font-black">
                  Tokens
                </div>
              </div>
              {budgetNum > 0 && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 ml-1 space-y-1">
                  <p className="text-xs text-indigo-400 font-semibold">
                    = {budgetNum} USDT will be locked in escrow · Pay ₹{(budgetNum * 83).toLocaleString()} via Razorpay
                  </p>
                  {balanceInsufficient && (
                    <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-800/30 rounded-xl px-3 py-2 mt-1">
                      <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-amber-300">
                          Insufficient balance — you have {balanceTokens.toFixed(2)} tokens, need {budgetNum}
                        </p>
                        <Link href="/client" className="text-[11px] text-amber-400 underline flex items-center gap-1 mt-0.5">
                          Add tokens on dashboard <ExternalLink size={10} />
                        </Link>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>

            <button onClick={handleAnalyze}
              disabled={analyzing || !name.trim() || !description.trim() || !budgetNum}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-black uppercase tracking-wider disabled:opacity-50 bg-[#3D5AFE] text-white border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] hover:shadow-[2px_2px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
            >
              {analyzing ? <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing…</> : <><Sparkles className="w-5 h-5" /> Analyze with AI</>}
            </button>
          </motion.div>
        )}

        {/* ─── STEP 2: Skills & Workers ─── */}
        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
            <div>
              <h2 className="text-lg font-black text-[#1A1A2E] uppercase tracking-wide mb-1">Skills & Team</h2>
              <p className="text-sm text-[#4A4A68] font-bold">Review AI-extracted skills and add workers to your project.</p>
            </div>

            <div>
              <label className="block text-sm font-black text-[#1A1A2E] mb-2 ml-1 uppercase tracking-wider">Required Skills</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {skills.map((s) => (
                  <span key={s} className="flex items-center gap-1.5 bg-[#E8EAF6] text-[#3D5AFE] border-2 border-[#3D5AFE] px-3 py-1 rounded-lg text-xs font-black">
                    {s}
                    <button onClick={() => setSkills((p) => p.filter((x) => x !== s))} className="text-[#3D5AFE] hover:text-[#FF1744]"><X size={11} /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={skillInput} onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
                  placeholder="Add a skill..."
                  className="flex-1 min-w-0 px-4 py-2.5 text-sm font-bold bg-white border-3 border-[#1A1A2E] rounded-xl focus:outline-none focus:shadow-[3px_3px_0px_#3D5AFE] transition-shadow text-[#1A1A2E]"
                />
                <button onClick={addSkill} className="w-10 h-10 bg-[#3D5AFE] text-white rounded-xl flex items-center justify-center border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] hover:shadow-[1px_1px_0px_#1A1A2E] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"><Plus size={16} /></button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-text-secondary mb-2 ml-1">Search Worker by Email</label>
              <div className="flex gap-2">
                <input type="email" value={searchEmail} onChange={(e) => setSearchEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchByEmail())}
                  placeholder="worker@email.com"
                  className="flex-1 glass-input px-4 py-2.5 text-sm font-medium"
                />
                <button onClick={searchByEmail} disabled={searchLoading}
                  className="w-10 h-10 bg-white/8 hover:bg-white/12 border border-white/10 text-text-secondary rounded-xl flex items-center justify-center transition-all">
                  {searchLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-bold text-text-secondary ml-1">
                  {workers.length > 0 ? `Recommended Workers (${workers.length})` : "Workers"}
                </label>
                {selectedWorkers.length > 0 && <span className="text-xs text-indigo-400 font-bold">{selectedWorkers.length} selected</span>}
              </div>
              {workerLoading ? (
                <div className="flex items-center justify-center h-20"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
              ) : workers.length === 0 ? (
                <div className="text-center py-6 text-sm text-text-muted bg-white/3 rounded-2xl border border-white/6">
                  No workers available. Register some worker accounts to see recommendations.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {workers.map((w) => {
                    const isSelected = selectedWorkers.some((s) => s.id === w.id);
                    const WIcon = w.subRole ? (SUB_ROLE_ICONS[w.subRole] ?? User) : User;
                    return (
                      <button key={w.id} onClick={() => toggleWorker(w)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${isSelected ? "border-indigo-500 bg-indigo-900/20" : "border-white/8 bg-white/3 hover:border-white/15"}`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? "bg-indigo-900/40" : "bg-white/8"}`}>
                          <WIcon size={16} className={isSelected ? "text-indigo-400" : "text-text-muted"} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-text-primary truncate">{w.name}</p>
                          <p className="text-xs text-text-muted truncate">{w.email}</p>
                          {w.walletAddress && (
                            <p className="text-[10px] text-indigo-400 font-mono truncate mt-0.5">{w.walletAddress.slice(0, 14)}…</p>
                          )}
                          {w.skills.length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {w.skills.slice(0, 3).map((s) => (
                                <span key={s} className="text-[9px] bg-white/8 text-text-muted px-1.5 py-0.5 rounded-full font-medium">{s}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        {w.githubId && <Github size={13} className="text-text-muted shrink-0" />}
                        {isSelected && <CheckCircle2 size={16} className="text-indigo-400 shrink-0" />}
                        {w.matchScore !== undefined && w.matchScore > 0 && (
                          <span className="text-[10px] font-bold text-indigo-300 bg-indigo-900/30 border border-indigo-800/30 px-1.5 py-0.5 rounded-full shrink-0">{w.matchScore} match</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button onClick={() => setStep(3)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black uppercase tracking-wider bg-[#3D5AFE] text-white border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] hover:shadow-[2px_2px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px] transition-all">
              Review & Create <ArrowRight size={18} />
            </button>
          </motion.div>
        )}

        {/* ─── STEP 3: Review + Create ─── */}
        {step === 3 && !showEscrow && (
          <motion.div key="s3" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-5">
            <div>
              <h2 className="text-lg font-black text-[#1A1A2E] uppercase tracking-wide mb-1">Review & Launch</h2>
              <p className="text-sm text-[#4A4A68] font-bold">Everything looks good? We&apos;ll create the repo, generate milestones, then lock your budget in escrow.</p>
            </div>

            <div className="bg-white border-3 border-[#1A1A2E] rounded-xl p-5 space-y-4 shadow-[4px_4px_0px_#1A1A2E]">
              <div>
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Project</p>
                <p className="font-bold text-text-primary">{name}</p>
                <p className="text-sm text-text-secondary mt-0.5 line-clamp-2">{description}</p>
              </div>

              {/* Budget */}
              <div className="flex items-center gap-3 bg-indigo-900/20 border border-indigo-800/30 rounded-xl px-4 py-3">
                <Coins size={18} className="text-indigo-400 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Escrow Budget</p>
                  <p className="font-extrabold text-text-primary">
                    {budgetNum.toLocaleString()} Tokens
                    <span className="text-xs font-normal text-text-muted ml-2">= ₹{(budgetNum * 83).toLocaleString()} via Razorpay</span>
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Skills ({skills.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((s) => <span key={s} className="text-xs font-bold text-indigo-300 bg-indigo-900/30 border border-indigo-800/30 px-2.5 py-0.5 rounded-full">{s}</span>)}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Workers ({selectedWorkers.length})</p>
                {selectedWorkers.length === 0 ? (
                  <p className="text-sm text-text-muted">No workers selected — you can add them later.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedWorkers.map((w) => (
                      <span key={w.id} className="flex items-center gap-1.5 text-xs font-bold bg-white/8 border border-white/10 text-text-secondary px-3 py-1 rounded-full">
                        <span className="w-4 h-4 bg-indigo-900/40 border border-indigo-800/30 rounded-full flex items-center justify-center text-[9px] text-indigo-400 font-black">{w.name[0]}</span>
                        {w.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Insufficient balance warning in review */}
            {balanceInsufficient && (
              <div className="flex items-start gap-3 bg-amber-900/20 border border-amber-800/30 rounded-xl p-4">
                <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-300">Insufficient Token Balance</p>
                  <p className="text-xs text-amber-400 mt-0.5">
                    You have <strong>{balanceTokens.toFixed(2)}</strong> tokens but this project requires{" "}
                    <strong>{budgetNum}</strong> tokens for escrow. You need{" "}
                    <strong>{(budgetNum - balanceTokens).toFixed(2)}</strong> more tokens.
                  </p>
                  <Link href="/client"
                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 underline mt-1">
                    Buy more tokens on dashboard <ExternalLink size={10} />
                  </Link>
                </div>
              </div>
            )}

            {creating && creationSteps.length > 0 && (
              <div className="space-y-2.5 py-2">
                {creationSteps.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {s.done
                      ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                      : <Loader2 size={16} className="text-indigo-400 animate-spin shrink-0" />}
                    <span className={`text-sm font-medium ${s.done ? "text-text-muted line-through" : "text-text-secondary"}`}>{s.label}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => {
                if (balanceInsufficient && selectedWorkers.length > 0) {
                  setShowTopUpGate(true);
                } else {
                  handleCreate();
                }
              }}
              disabled={creating}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-black text-base uppercase tracking-wider disabled:opacity-60 bg-[#00C853] text-white border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] hover:shadow-[2px_2px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
            >
              {creating ? <><Loader2 className="w-5 h-5 animate-spin" /> Building your project…</> : <>🚀 Launch Project</>}
            </button>
          </motion.div>
        )}

        {/* ─── ESCROW PAYMENT FLOW ─── */}
        {step === 3 && showEscrow && createdProjectId && (
          <motion.div key="s4" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-text-primary mb-1">Fund &amp; Lock Escrow</h2>
              <p className="text-sm text-text-secondary">Pay via Razorpay, approve tokens, then lock them in the smart contract.</p>
            </div>

            <div className="flex items-center gap-3 bg-emerald-900/20 border border-emerald-800/30 rounded-2xl p-3">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold text-text-primary text-sm">Project created successfully</p>
                <p className="text-xs text-text-muted">Now lock the budget in the smart contract escrow.</p>
              </div>
            </div>

            <EscrowPaymentFlow
              projectId={createdProjectId}
              projectName={name}
              budget={budgetNum}
              workerAddress={firstWorkerAddress}
              onComplete={() => router.push(`/client/projects/${createdProjectId}`)}
            />

            {/* Only allow skip if no workers selected (escrow is optional without a worker) */}
            {!firstWorkerAddress && (
              <button onClick={() => router.push(`/client/projects/${createdProjectId}`)}
                className="w-full text-center text-sm text-text-muted hover:text-text-secondary py-2 transition-colors">
                Skip for now → Go to project dashboard
              </button>
            )}
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Force Top-Up Gate Modal ── */}
      <AnimatePresence>
        {showTopUpGate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={(e) => e.target === e.currentTarget && setShowTopUpGate(false)}>
            <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="glass-card rounded-3xl p-6 shadow-2xl w-full max-w-sm">
              <div className="text-center mb-5">
                <div className="w-14 h-14 bg-amber-900/30 border border-amber-800/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                </div>
                <h3 className="font-extrabold text-text-primary text-lg">Token Balance Required</h3>
                <p className="text-sm text-text-secondary mt-1">
                  You must have enough tokens to lock in escrow before launching with workers.
                </p>
              </div>

              <div className="bg-amber-900/20 border border-amber-800/30 rounded-2xl p-4 mb-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Your balance</span>
                  <span className="font-bold text-text-primary">{balanceTokens.toFixed(2)} tokens</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Required</span>
                  <span className="font-bold text-red-400">{budgetNum} tokens</span>
                </div>
                <div className="flex justify-between border-t border-amber-800/30 pt-2">
                  <span className="text-text-muted">You need</span>
                  <span className="font-extrabold text-amber-400">{(budgetNum - balanceTokens).toFixed(2)} more tokens</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Link href="/client"
                  className="btn-primary w-full py-3 rounded-xl font-bold text-sm text-center">
                  Buy Tokens on Dashboard
                </Link>
                <button
                  onClick={() => { setShowTopUpGate(false); handleCreate(); }}
                  className="w-full py-3 rounded-xl border border-white/10 text-text-secondary font-bold text-sm hover:bg-white/5 transition-all">
                  Launch anyway (fund escrow later)
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
