"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useConfig, useAccount } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { parseEther } from "viem";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Github, Users, CheckCircle2, GitCommit,
  Loader2, Send, X, Zap, BarChart3, ShieldCheck, Lock, Coins,
  ThumbsUp, Trophy, XCircle, Scale, RotateCcw, AlertTriangle, ChevronLeft, ChevronRight, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import MilestoneDetailPanel from "@/components/projects/MilestoneDetailPanel";
import CommitActivityFeed, { type CommitEntry } from "@/components/projects/CommitActivityFeed";
import type { MilestoneForLayout } from "@/lib/milestone-layout";
import EscrowABI from "@/lib/abi/CrossBorderEscrow.json";
import USDTABI from "@/lib/abi/MockUSDT.json";
import { decodeToken } from "@/lib/auth-client";
import { parseError } from "@/lib/utils/error";

const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}`;
const USDT_ADDRESS = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}`;

// Dynamically import React Flow to avoid SSR issues
const MilestoneFlow = dynamic(() => import("@/components/projects/MilestoneFlow"), { ssr: false });

type Project = {
  id: string; name: string; description: string;
  status: string; repoUrl?: string | null; skills: string;
  budget?: number | null; budgetCurrency?: string | null;
  onChainId?: number | null; escrowStatus?: string | null;
  tokenReleased: number;
  milestones: MilestoneForLayout[];
  workers: { worker: { id: string; name: string; email: string; walletAddress?: string | null } }[];
  commits: CommitEntry[];
};

export default function ProjectDashboard() {
  const params = useParams();
  const projectId = params.id as string;
  const router = useRouter();
  const { address } = useAccount();
  const config = useConfig();
  const [token, setToken] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<MilestoneForLayout[]>([]);
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [selectedMilestone, setSelectedMilestone] = useState<MilestoneForLayout | null>(null);
  const [loading, setLoading] = useState(true);

  // Commit simulation modal
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Milestone approval
  const [approveModal, setApproveModal] = useState<{ milestoneId: string; amount: number } | null>(null);
  const [approving, setApproving] = useState(false);

  // Project completion
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Escrow locking
  const [lockingEscrow, setLockingEscrow] = useState(false);

  // Dispute / Revision
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeModalType, setDisputeModalType] = useState<"dispute" | "revision">("dispute");
  const [disputeStep, setDisputeStep] = useState(1);
  const [disputeAnswers, setDisputeAnswers] = useState<Record<string, string>>({});
  const [submittingDispute, setSubmittingDispute] = useState(false);
  const [openDispute, setOpenDispute] = useState<{ id: string; type: string; status: string; outcome?: string | null; resolutionText?: string | null } | null>(null);

  // Wagmi — milestone partial release
  const milestoneTxRef = useRef<{ milestoneId: string; amount: number } | null>(null);
  const [mReleaseTxHash, setMReleaseTxHash] = useState<`0x${string}` | undefined>();
  const { writeContractAsync: writeMilestoneReleaseAsync, isPending: mReleasePending } = useWriteContract();
  const { isLoading: mReleaseConfirming, isSuccess: mReleaseSuccess } = useWaitForTransactionReceipt({ hash: mReleaseTxHash });

  // Chat
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{sender: "user" | "dev", text: string}[]>([]);

  // Initialize chat when opened
  useEffect(() => {
    if (showChat && chatMessages.length === 0) {
      if (isClient) {
        const devName = project?.workers?.[0]?.worker?.name || "Developer";
        setChatMessages([
          { sender: "dev", text: `Hi there! I'm ${devName}, the developer for this project. Let me know if you have any questions!` }
        ]);
      } else {
        setChatMessages([
          { sender: "dev", text: `Hi there! I'm your client for this project. Let me know if you have any questions or updates!` }
        ]);
      }
    }
  }, [showChat, project, chatMessages.length, isClient]);

  // Wagmi — full project release
  const completeTxRef = useRef<boolean>(false);
  const [completeReleaseTxHash, setCompleteReleaseTxHash] = useState<`0x${string}` | undefined>();
  const { writeContractAsync: writeCompleteReleaseAsync, isPending: completeReleasePending } = useWriteContract();
  const { isLoading: completeReleaseConfirming, isSuccess: completeReleaseSuccess } = useWaitForTransactionReceipt({ hash: completeReleaseTxHash });

  // Project cancellation
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const cancelTxRef = useRef<boolean>(false);
  const [cancelTxHash, setCancelTxHash] = useState<`0x${string}` | undefined>();
  const { writeContractAsync: writeCancelProjectAsync, isPending: cancelPending } = useWriteContract();
  const { isLoading: cancelConfirming, isSuccess: cancelSuccess } = useWaitForTransactionReceipt({ hash: cancelTxHash });

  // Wagmi — escrow creation (lock)
  const { writeContractAsync: writeEscrowAsync } = useWriteContract();
  const { data: nextProjectId } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: EscrowABI,
    functionName: "nextProjectId",
    query: { enabled: isClient },
  });
  const { data: usdtAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDT_ADDRESS,
    abi: USDTABI,
    functionName: "allowance",
    args: [address, ESCROW_ADDRESS],
    query: { enabled: !!address && isClient },
  });

  useEffect(() => {
    const t = localStorage.getItem("wwt_token") ?? "";
    if (!t) { router.push("/"); return; }
    setToken(t);
    const payload = decodeToken(t);
    setIsClient(payload?.role === "client");

    fetch(`/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { toast.error(d.error); router.push("/client/projects"); return; }
        setProject(d.project);
        setMilestones(d.project.milestones ?? []);
        setCommits(d.project.commits ?? []);
        // Fetch open dispute/revision for this project
        fetch(`/api/projects/${projectId}/dispute`, { headers: { Authorization: `Bearer ${t}` } })
          .then((r) => r.json())
          .then((dd) => { if (dd.dispute) setOpenDispute(dd.dispute); })
          .catch(() => {});
      })
      .catch(() => toast.error("Failed to load project"))
      .finally(() => setLoading(false));
  }, [projectId, router]);

  // Update graph when SSE delivers milestone updates
  const handleMilestoneUpdate = useCallback((ms: MilestoneForLayout[]) => {
    setMilestones(ms);
  }, []);

  // Handle SSE commit received (prepend to feed)
  const handleCommitReceived = useCallback((commit: CommitEntry) => {
    setCommits((prev) => [commit, ...prev.slice(0, 19)]);
  }, []);

  // After milestone release tx confirms → update DB
  useEffect(() => {
    if (!mReleaseSuccess || !milestoneTxRef.current) return;
    const { milestoneId, amount } = milestoneTxRef.current;
    milestoneTxRef.current = null;
    fetch(`/api/projects/${projectId}/milestone-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ milestoneId, action: "approve", tokenRelease: amount }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.milestone) {
          setMilestones((prev) =>
            prev.map((m) => m.id === milestoneId
              ? { ...m, reviewStatus: "approved", tokenRelease: amount }
              : m
            )
          );
          if (selectedMilestone?.id === milestoneId) {
            setSelectedMilestone((prev) => prev ? { ...prev, reviewStatus: "approved", tokenRelease: amount } : null);
          }
          setProject((prev) => prev ? { ...prev, tokenReleased: (prev.tokenReleased ?? 0) + amount } : prev);
          toast.success(`${amount} tokens released to worker!`);
          if (d.allApproved) toast.success("All milestones approved! You can now complete the project.");
        }
        setApproving(false);
        setApproveModal(null);
      })
      .catch(() => {
        toast.error("DB update failed — tokens released on-chain");
        setApproving(false);
      });
  }, [mReleaseSuccess]);

  // After complete release tx confirms → update DB
  useEffect(() => {
    if (!completeReleaseSuccess || !completeTxRef.current) return;
    completeTxRef.current = false;
    fetch(`/api/projects/${projectId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.project) {
          setProject((prev) => prev ? { ...prev, status: "completed", escrowStatus: "released" } : prev);
          toast.success("Project completed! All funds released to workers. 🎉");
        }
        setCompleting(false);
        setShowCompleteModal(false);
      })
      .catch(() => {
        toast.error("DB update failed — payment released on-chain");
        setCompleting(false);
      });
  }, [completeReleaseSuccess]);

  // After cancel tx confirms → update DB
  useEffect(() => {
    if (!cancelSuccess || !cancelTxRef.current) return;
    cancelTxRef.current = false;
    fetch(`/api/projects/${projectId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.project) {
          setProject((prev) => prev ? { ...prev, status: "cancelled", escrowStatus: "none" } : prev);
          toast.success("Project cancelled. Remaining tokens have been returned to your wallet.");
        }
        setCancelling(false);
        setShowCancelModal(false);
      })
      .catch(() => {
        toast.error("DB update failed — tokens returned on-chain");
        setCancelling(false);
      });
  }, [cancelSuccess]);

  const handleLockEscrow = async () => {
    if (!project?.budget) {
      return toast.error("Set a budget on this project before locking escrow.");
    }
    const primaryWorker = project.workers[0]?.worker;
    if (!primaryWorker?.walletAddress) {
      return toast.error("The assigned worker has not connected their wallet yet.");
    }
    if (!address) return toast.error("Connect your wallet first.");

    setLockingEscrow(true);
    try {
      const amountWei = parseEther(project.budget.toString());

      // Step 1: approve USDT spend if needed
      if (!usdtAllowance || (usdtAllowance as bigint) < amountWei) {
        const approveTx = await writeEscrowAsync({
          address: USDT_ADDRESS,
          abi: USDTABI,
          functionName: "approve",
          args: [ESCROW_ADDRESS, amountWei],
        });
        await waitForTransactionReceipt(config, { hash: approveTx });
        refetchAllowance();
      }

      // Capture onChainId before calling createProject (nextProjectId is the next available slot)
      const onChainProjectId = Number(nextProjectId ?? 0);

      // Step 2: createProject on-chain
      const createTx = await writeEscrowAsync({
        address: ESCROW_ADDRESS,
        abi: EscrowABI,
        functionName: "createProject",
        args: [primaryWorker.walletAddress as `0x${string}`, amountWei],
      });
      await waitForTransactionReceipt(config, { hash: createTx });

      // Step 3: persist onChainId + escrowStatus to DB
      const res = await fetch(`/api/projects/${projectId}/escrow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ onChainId: onChainProjectId, escrowStatus: "locked" }),
      });
      const data = await res.json();
      if (data.project) {
        setProject((prev) =>
          prev ? { ...prev, onChainId: onChainProjectId, escrowStatus: "locked" } : prev
        );
        toast.success(`${project.budget} tokens locked in escrow! Milestone approvals are now live.`);
      } else {
        throw new Error(data.error ?? "DB update failed");
      }
    } catch (err: any) {
      toast.error(parseError(err));
    } finally {
      setLockingEscrow(false);
    }
  };

  const handleApproveRequest = (milestoneId: string) => {
    const total = milestones.length;
    const budget = project?.budget ?? 0;
    const perMilestone = total > 0 ? budget / total : 0;
    setApproveModal({ milestoneId, amount: parseFloat(perMilestone.toFixed(4)) });
  };

  const confirmMilestoneApprove = async () => {
    if (!approveModal) return;
    if (project?.onChainId == null) {
      toast.error("Project is not linked to the blockchain yet. Please lock escrow first.");
      return;
    }
    const { milestoneId, amount } = approveModal;
    setApproving(true);
    milestoneTxRef.current = { milestoneId, amount };
    try {
      const txHash = await writeMilestoneReleaseAsync({
        address: ESCROW_ADDRESS,
        abi: EscrowABI,
        functionName: "releaseMilestonePayment",
        args: [BigInt(project!.onChainId!), parseEther(amount.toString())],
      });
      setMReleaseTxHash(txHash);
    } catch (err: any) {
      milestoneTxRef.current = null;
      setApproving(false);
      toast.error(parseError(err));
    }
  };

  const confirmCompleteProject = async () => {
    if (project?.onChainId == null) {
      toast.error("Project is not linked to the blockchain yet.");
      return;
    }
    setCompleting(true);
    completeTxRef.current = true;
    try {
      const txHash = await writeCompleteReleaseAsync({
        address: ESCROW_ADDRESS,
        abi: EscrowABI,
        functionName: "releasePayment",
        args: [BigInt(project!.onChainId!)],
      });
      setCompleteReleaseTxHash(txHash);
    } catch (err: any) {
      completeTxRef.current = false;
      setCompleting(false);
      toast.error(parseError(err));
    }
  };

  const confirmCancelProject = async () => {
    if (project?.onChainId == null) {
      toast.error("Project is not linked to the blockchain yet.");
      return;
    }
    setCancelling(true);
    cancelTxRef.current = true;
    try {
      const txHash = await writeCancelProjectAsync({
        address: ESCROW_ADDRESS,
        abi: EscrowABI,
        functionName: "cancelProject",
        args: [BigInt(project!.onChainId!)],
      });
      setCancelTxHash(txHash);
    } catch (err: any) {
      cancelTxRef.current = false;
      setCancelling(false);
      toast.error(parseError(err));
    }
  };

  const handleSimulateCommit = async () => {
    if (!commitMsg.trim()) return toast.error("Enter a commit message");
    setSubmitting(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: commitMsg }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success("Commit processed — milestones updated!");
      setCommitMsg("");
      setShowCommitModal(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const DISPUTE_QUESTIONS = [
    { key: "q1_missing",   label: "What's missing from the delivered work?" },
    { key: "q2_mentioned", label: "Did you mention this in your original requirements?" },
    { key: "q3_changes",   label: "What specific changes would you like instead?" },
    { key: "q4_payExtra",  label: "Would you be willing to pay extra for this feature?" },
  ];

  const REVISION_QUESTIONS = [
    { key: "q1_disliked",  label: "What didn't you like about the delivered work?" },
    { key: "q2_expected",  label: "How would you have liked it done?" },
    { key: "q3_changes",   label: "What specific changes do you want made?" },
    { key: "q4_payExtra",  label: "Will you pay extra to the worker for these changes?" },
  ];

  const handleDisputeSubmit = async () => {
    setSubmittingDispute(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: disputeModalType, answers: disputeAnswers }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setOpenDispute(d.dispute);
      toast.success(
        disputeModalType === "dispute"
          ? "Dispute submitted. Admins will review shortly."
          : "Revision request submitted. The worker will be notified."
      );
      setShowDisputeModal(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingDispute(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
      </div>
    );
  }
  if (!project) return null;

  const totalMilestones = milestones.length;
  const doneMilestones = milestones.filter((m) => m.status === "completed").length;
  const approvedMilestones = milestones.filter((m) => m.reviewStatus === "approved").length;
  const inProgressMilestones = milestones.filter((m) => m.status === "in_progress").length;
  const overallProgress = totalMilestones > 0 ? Math.round((doneMilestones / totalMilestones) * 100) : 0;
  const allMilestonesApproved = totalMilestones > 0 && approvedMilestones === totalMilestones;
  const canComplete = isClient && allMilestonesApproved && project.escrowStatus === "locked" && project.status !== "completed";
  const canCancel = isClient && project.onChainId != null && project.status !== "completed" && project.status !== "cancelled" && (project.escrowStatus === "funded" || project.escrowStatus === "locked");
  const canRaiseDispute = isClient && project.status === "active" && project.escrowStatus === "locked" && !openDispute;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* ── Header ── */}
      <div className="bg-white border-b-3 border-[#1A1A2E] px-6 py-3 flex items-center gap-4 shrink-0">
        <Link href="/client/projects" className="text-[#4A4A68] hover:text-[#1A1A2E] transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-[#1A1A2E] text-lg truncate uppercase tracking-tight">{project.name}</h1>
          <p className="text-xs text-[#4A4A68] truncate font-bold">{project.description}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Escrow badge */}
          {project.budget && (
            <div className={`flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-lg border-2 uppercase tracking-wider ${
              project.status === "cancelled" ? "bg-[#FCE4EC] text-[#FF1744] border-[#FF1744]" :
              project.escrowStatus === "locked" ? "bg-[#E8F5E9] text-[#00C853] border-[#00C853]" :
              project.escrowStatus === "funded" ? "bg-[#E8EAF6] text-[#3D5AFE] border-[#3D5AFE]" :
              "bg-[#FFF8E1] text-[#F9A825] border-[#FFD600]"
            }`}>
              {project.status === "cancelled"
                ? <><XCircle size={11} /> Cancelled</>
                : project.escrowStatus === "locked"
                ? <><Lock size={11} /> {((project.budget ?? 0) - (project.tokenReleased ?? 0)).toFixed(2)} Tokens Locked</>
                : project.escrowStatus === "funded"
                ? <><ShieldCheck size={11} /> Funded</>
                : <><Coins size={11} /> {project.budget?.toLocaleString()} Tokens Pending</>
              }
            </div>
          )}
          {project.repoUrl && (
            <a href={project.repoUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-black text-[#1A1A2E] bg-[#F5F0E8] hover:bg-[#EBE5D9] border-2 border-[#1A1A2E] px-3 py-1.5 rounded-lg transition-all uppercase tracking-wider">
              <Github size={13} /> GitHub
            </a>
          )}
          {isClient && project.onChainId == null && !!project.budget && project.workers.length > 0 && (
            <button
              onClick={handleLockEscrow}
              disabled={lockingEscrow}
              className="flex items-center gap-1.5 text-xs font-black text-white bg-[#3D5AFE] hover:bg-[#304FFE] px-3 py-1.5 rounded-lg transition-all disabled:opacity-60 border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] uppercase tracking-wider"
            >
              {lockingEscrow
                ? <><Loader2 size={13} className="animate-spin" /> Locking…</>
                : <><Lock size={13} /> Lock Escrow</>}
            </button>
          )}
          {!isClient && (
            <button
              onClick={() => setShowCommitModal(true)}
              className="flex items-center gap-1.5 text-xs font-black text-white bg-[#3D5AFE] hover:bg-[#304FFE] px-3 py-1.5 rounded-lg transition-all border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] uppercase tracking-wider"
            >
              <Zap size={13} /> Simulate Commit
            </button>
          )}
          {canComplete && (
            <button
              onClick={() => setShowCompleteModal(true)}
              className="flex items-center gap-1.5 text-xs font-black text-white bg-[#00C853] hover:bg-[#00E676] px-3 py-1.5 rounded-lg transition-all border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] uppercase tracking-wider"
            >
              <Trophy size={13} /> Complete Project
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="flex items-center gap-1.5 text-xs font-black text-white bg-[#FF1744] hover:bg-[#D50000] px-3 py-1.5 rounded-lg transition-all border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] uppercase tracking-wider"
            >
              <XCircle size={13} /> Cancel Project
            </button>
          )}
          {canRaiseDispute && (
            <>
              <button
                onClick={() => { setDisputeModalType("revision"); setDisputeStep(1); setDisputeAnswers({}); setShowDisputeModal(true); }}
                className="flex items-center gap-1.5 text-xs font-black text-white bg-[#F9A825] hover:bg-[#FFD600] px-3 py-1.5 rounded-lg transition-all border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] uppercase tracking-wider"
              >
                <RotateCcw size={13} /> Request Revision
              </button>
              <button
                onClick={() => { setDisputeModalType("dispute"); setDisputeStep(1); setDisputeAnswers({}); setShowDisputeModal(true); }}
                className="flex items-center gap-1.5 text-xs font-black text-white bg-[#FF1744] hover:bg-[#D50000] px-3 py-1.5 rounded-lg transition-all border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] uppercase tracking-wider"
              >
                <Scale size={13} /> Raise Dispute
              </button>
            </>
          )}
          <button
            onClick={() => setShowChat(true)}
            className="flex items-center gap-1.5 text-xs font-black text-[#1A1A2E] bg-[#E8EAF6] hover:bg-[#C5CAE9] px-3 py-1.5 rounded-lg transition-all border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] uppercase tracking-wider"
          >
            <MessageSquare size={13} /> {isClient ? "Contact Developer" : "Contact Client"}
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="bg-[#F5F0E8] border-b-3 border-[#1A1A2E] px-6 py-2 flex items-center gap-6 shrink-0">
        <Stat icon={BarChart3} label="Overall" value={`${overallProgress}%`} color="blue" />
        <Stat icon={CheckCircle2} label="Milestones" value={`${doneMilestones}/${totalMilestones}`} color="emerald" />
        {isClient && <Stat icon={ThumbsUp} label="Approved" value={`${approvedMilestones}/${totalMilestones}`} color="violet" />}
        {isClient && project.budget && (
          <Stat
            icon={Coins}
            label="Released"
            value={`${(project.tokenReleased ?? 0).toFixed(1)}/${project.budget.toFixed(1)}`}
            color="amber"
          />
        )}
        <Stat icon={Zap} label="Active" value={`${inProgressMilestones}`} color="amber" />
        <Stat icon={Users} label="Workers" value={`${project.workers.length}`} color="violet" />
        <Stat icon={GitCommit} label="Commits" value={`${commits.length}`} color="slate" />
        {/* Progress bar */}
        <div className="flex-1 flex items-center gap-3 ml-2">
          <div className="flex-1 h-2 bg-white rounded-lg border-2 border-[#1A1A2E] overflow-hidden">
            <motion.div
              className="h-full bg-[#3D5AFE]"
              animate={{ width: `${overallProgress}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          <span className="text-xs font-black text-[#1A1A2E] shrink-0">{overallProgress}% done</span>
        </div>
      </div>

      {/* ── Main Area ── */}
      {openDispute && (
        <div className={`px-6 py-2 border-b text-xs font-semibold flex items-center gap-2 shrink-0 ${
          openDispute.status === "resolved"
            ? openDispute.outcome === "for_client"
              ? "bg-emerald-900/20 border-emerald-800/30 text-emerald-400"
              : "bg-indigo-900/20 border-indigo-800/30 text-indigo-400"
            : "bg-amber-900/20 border-amber-800/30 text-amber-400"
        }`}>
          <AlertTriangle size={12} />
          {openDispute.status === "open"
            ? `${openDispute.type === "dispute" ? "Dispute" : "Revision request"} filed — awaiting jury review`
            : `${openDispute.type === "dispute" ? "Dispute" : "Revision"} resolved: ${
                openDispute.outcome === "for_client" ? "In your favor" : "In worker's favor"
              }${openDispute.resolutionText ? ` — ${openDispute.resolutionText}` : ""}`
          }
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        {/* Left: React Flow */}
        <div
          className="flex-1 relative"
          style={{ background: "radial-gradient(ellipse at 30% 60%, #0d1535 0%, #050b18 55%, #030711 100%)" }}
        >
          {milestones.length > 0 ? (
            <MilestoneFlow
              projectId={projectId}
              initialMilestones={milestones}
              token={token}
              onNodeSelect={setSelectedMilestone}
              onCommitReceived={(c) =>
                handleCommitReceived({ id: `sse-${Date.now()}`, ...c, aiSummary: c.aiSummary ?? null })
              }
              onMilestoneUpdate={handleMilestoneUpdate}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-4" />
              <p className="text-slate-300 font-semibold">Generating milestones...</p>
              <p className="text-slate-400 text-sm mt-1">AI is planning your development roadmap</p>
            </div>
          )}
        </div>

        {/* Right panel: milestone detail or activity feed */}
        <div className="w-80 border-l border-white/5 bg-surface flex flex-col overflow-hidden shrink-0">
          {selectedMilestone ? (
            <MilestoneDetailPanel
              milestone={selectedMilestone}
              onClose={() => setSelectedMilestone(null)}
              recentCommits={commits}
              isClient={isClient}
              onApproveRequest={handleApproveRequest}
            />
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 shrink-0">
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Live Activity</p>
                <p className="text-xs text-text-muted mt-0.5">Click any node on the graph to see details</p>
              </div>
              <div className="flex-1 overflow-hidden p-4">
                <CommitActivityFeed commits={commits} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Simulate Commit Modal ── */}
      <AnimatePresence>
        {showCommitModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={(e) => e.target === e.currentTarget && setShowCommitModal(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="glass-card rounded-3xl p-6 shadow-2xl w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-900/30 border border-indigo-800/30 rounded-xl flex items-center justify-center">
                    <GitCommit className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-text-primary">Simulate Commit</h3>
                    <p className="text-xs text-text-muted">Advances milestone progress</p>
                  </div>
                </div>
                <button onClick={() => setShowCommitModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-white/8">
                  <X size={16} />
                </button>
              </div>

              <textarea
                autoFocus
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSimulateCommit())}
                placeholder="Describe what was built or fixed…&#10;e.g. Added login API with JWT authentication and user session management"
                rows={4}
                className="glass-input w-full px-4 py-3 text-sm font-medium resize-none mb-4"
              />

              <div className="bg-amber-900/20 border border-amber-800/30 rounded-xl p-3 mb-4 text-xs text-amber-400">
                <strong>Tip:</strong> Include keywords related to the current milestone for better test matching and faster progress.
              </div>

              <button
                onClick={handleSimulateCommit}
                disabled={submitting || !commitMsg.trim()}
                className="w-full btn-primary flex items-center justify-center gap-2 py-3 rounded-xl font-bold disabled:opacity-50"
              >
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : <><Send size={16} /> Push Commit</>}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Milestone Approve Modal ── */}
      <AnimatePresence>
        {approveModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={(e) => e.target === e.currentTarget && !approving && setApproveModal(null)}>
            <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="glass-card rounded-3xl p-6 shadow-2xl w-full max-w-sm">
              <div className="text-center mb-5">
                <div className="w-14 h-14 bg-emerald-900/30 border border-emerald-800/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <ThumbsUp className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="font-extrabold text-text-primary text-lg">Approve Milestone</h3>
                <p className="text-sm text-text-secondary mt-1">
                  Release partial payment from escrow to the worker
                </p>
              </div>

              <div className="bg-emerald-900/20 border border-emerald-800/30 rounded-2xl p-4 mb-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Release amount</span>
                  <span className="font-extrabold text-emerald-400">{approveModal.amount} tokens</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Escrow contract</span>
                  <span className="font-bold text-text-secondary text-xs font-mono">#{project?.onChainId}</span>
                </div>
                {totalMilestones > 0 && (
                  <div className="flex justify-between border-t border-emerald-800/30 pt-2 text-[11px] text-text-muted">
                    <span>= budget ÷ {totalMilestones} milestones</span>
                    <span>{approvedMilestones + 1}/{totalMilestones} approved after this</span>
                  </div>
                )}
              </div>

              <div className="bg-indigo-900/20 border border-indigo-800/30 rounded-xl p-3 mb-4">
                <p className="text-xs text-indigo-300">
                  Your wallet will prompt you to sign the <code className="bg-indigo-900/40 px-1 rounded">releaseMilestonePayment</code> transaction.
                </p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setApproveModal(null)} disabled={approving}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-text-secondary font-bold text-sm hover:bg-white/5 transition-all disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={confirmMilestoneApprove}
                  disabled={approving || mReleasePending || mReleaseConfirming}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20">
                  {approving || mReleasePending || mReleaseConfirming
                    ? <><Loader2 size={14} className="animate-spin" /> {mReleasePending ? "Check Wallet…" : "Confirming…"}</>
                    : <><ThumbsUp size={14} /> Approve &amp; Release</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Complete Project Modal ── */}
      <AnimatePresence>
        {showCompleteModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={(e) => e.target === e.currentTarget && !completing && setShowCompleteModal(false)}>
            <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="glass-card rounded-3xl p-6 shadow-2xl w-full max-w-sm">
              <div className="text-center mb-5">
                <div className="w-14 h-14 bg-violet-900/30 border border-violet-800/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Trophy className="w-6 h-6 text-violet-400" />
                </div>
                <h3 className="font-extrabold text-text-primary text-lg">Complete Project</h3>
                <p className="text-sm text-text-secondary mt-1">
                  Release all remaining escrow funds and mark the project as complete
                </p>
              </div>

              <div className="bg-violet-900/20 border border-violet-800/30 rounded-2xl p-4 mb-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Total budget</span>
                  <span className="font-bold text-text-primary">{project?.budget?.toLocaleString()} tokens</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Already released</span>
                  <span className="font-bold text-emerald-400">{project?.tokenReleased?.toFixed(2)} tokens</span>
                </div>
                <div className="flex justify-between border-t border-violet-800/30 pt-2">
                  <span className="text-text-muted">Remaining to release</span>
                  <span className="font-extrabold text-violet-400">
                    {((project?.budget ?? 0) - (project?.tokenReleased ?? 0)).toFixed(2)} tokens
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowCompleteModal(false)} disabled={completing}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-text-secondary font-bold text-sm hover:bg-white/5 transition-all disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={confirmCompleteProject}
                  disabled={completing || completeReleasePending || completeReleaseConfirming}
                  className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20">
                  {completing || completeReleasePending || completeReleaseConfirming
                    ? <><Loader2 size={14} className="animate-spin" /> {completeReleasePending ? "Check Wallet…" : "Confirming…"}</>
                    : <><Trophy size={14} /> Complete &amp; Release</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cancel Project Modal ── */}
      <AnimatePresence>
        {showCancelModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={(e) => e.target === e.currentTarget && !cancelling && setShowCancelModal(false)}>
            <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="glass-card rounded-3xl p-6 shadow-2xl w-full max-w-sm">
              <div className="text-center mb-5">
                <div className="w-14 h-14 bg-red-900/30 border border-red-800/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <XCircle className="w-6 h-6 text-red-400" />
                </div>
                <h3 className="font-extrabold text-text-primary text-lg">Cancel Project</h3>
                <p className="text-sm text-text-secondary mt-1">
                  Unlock escrow and return tokens to your wallet
                </p>
              </div>

              <div className="bg-red-900/20 border border-red-800/30 rounded-2xl p-4 mb-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Total locked</span>
                  <span className="font-bold text-text-primary">{project?.budget?.toLocaleString()} tokens</span>
                </div>
                {(project?.tokenReleased ?? 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Already paid to workers</span>
                    <span className="font-bold text-amber-400">{project?.tokenReleased?.toFixed(2)} tokens</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-red-800/30 pt-2">
                  <span className="text-text-muted">Returned to you</span>
                  <span className="font-extrabold text-emerald-400">
                    {((project?.budget ?? 0) - (project?.tokenReleased ?? 0)).toFixed(2)} tokens
                  </span>
                </div>
              </div>

              <div className="bg-amber-900/20 border border-amber-800/30 rounded-xl p-3 mb-4">
                <p className="text-xs text-amber-400">
                  Workers who completed milestones keep their earned tokens. Only the remaining unlocked amount is returned.
                </p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowCancelModal(false)} disabled={cancelling}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-text-secondary font-bold text-sm hover:bg-white/5 transition-all disabled:opacity-50">
                  Keep Project
                </button>
                <button onClick={confirmCancelProject}
                  disabled={cancelling || cancelPending || cancelConfirming}
                  className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                  {cancelling || cancelPending || cancelConfirming
                    ? <><Loader2 size={14} className="animate-spin" /> {cancelPending ? "Check Wallet…" : "Confirming…"}</>
                    : <><XCircle size={14} /> Confirm Cancel</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Dispute / Revision Questionnaire Modal ── */}
      <AnimatePresence>
        {showDisputeModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={(e) => e.target === e.currentTarget && !submittingDispute && setShowDisputeModal(false)}>
            <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="glass-card rounded-3xl p-6 shadow-2xl w-full max-w-md">

              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    disputeModalType === "dispute"
                      ? "bg-rose-900/30 border border-rose-800/30"
                      : "bg-amber-900/30 border border-amber-800/30"
                  }`}>
                    {disputeModalType === "dispute"
                      ? <Scale className="w-5 h-5 text-rose-400" />
                      : <RotateCcw className="w-5 h-5 text-amber-400" />}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-text-primary">
                      {disputeModalType === "dispute" ? "Raise a Dispute" : "Request Revision"}
                    </h3>
                    <p className="text-xs text-text-muted">Step {disputeStep} of 5</p>
                  </div>
                </div>
                <button onClick={() => setShowDisputeModal(false)} disabled={submittingDispute}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-white/8">
                  <X size={16} />
                </button>
              </div>

              {/* Progress dots */}
              <div className="flex gap-1.5 mb-5">
                {[1,2,3,4,5].map((s) => (
                  <div key={s} className={`h-1 flex-1 rounded-full transition-all ${
                    s <= disputeStep
                      ? disputeModalType === "dispute" ? "bg-rose-500" : "bg-amber-500"
                      : "bg-white/10"
                  }`} />
                ))}
              </div>

              {/* Step 1: Intro */}
              {disputeStep === 1 && (
                <div className="text-center py-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
                    disputeModalType === "dispute"
                      ? "bg-rose-900/30 border border-rose-800/30"
                      : "bg-amber-900/30 border border-amber-800/30"
                  }`}>
                    {disputeModalType === "dispute"
                      ? <Scale className="w-7 h-7 text-rose-400" />
                      : <RotateCcw className="w-7 h-7 text-amber-400" />}
                  </div>
                  <h4 className="font-extrabold text-text-primary text-base mb-2">
                    {disputeModalType === "dispute"
                      ? "Start a Dispute"
                      : "Request a Revision"}
                  </h4>
                  <p className="text-sm text-text-secondary mb-4">
                    {disputeModalType === "dispute"
                      ? "We'll ask you 4 quick questions to understand the issue. An admin jury will review your answers and make a fair ruling."
                      : "We'll ask you 4 quick questions about what you'd like changed. The worker will be notified and can address your feedback."}
                  </p>
                  <div className={`text-xs rounded-xl p-3 ${
                    disputeModalType === "dispute"
                      ? "bg-rose-900/20 border border-rose-800/30 text-rose-400"
                      : "bg-amber-900/20 border border-amber-800/30 text-amber-400"
                  }`}>
                    {disputeModalType === "dispute"
                      ? "If the jury rules in your favor, the worker's reputation will be adjusted."
                      : "You can discuss extra compensation with the worker if needed."}
                  </div>
                </div>
              )}

              {/* Steps 2–5: Questions */}
              {disputeStep >= 2 && (() => {
                const questions = disputeModalType === "dispute" ? DISPUTE_QUESTIONS : REVISION_QUESTIONS;
                const q = questions[disputeStep - 2];
                return (
                  <div>
                    <label className="block text-sm font-bold text-text-primary mb-2">{q.label}</label>
                    <textarea
                      autoFocus
                      value={disputeAnswers[q.key] ?? ""}
                      onChange={(e) => setDisputeAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
                      rows={4}
                      placeholder="Be as specific as possible…"
                      className="glass-input w-full px-4 py-3 text-sm font-medium resize-none"
                    />
                  </div>
                );
              })()}

              {/* Navigation */}
              <div className="flex gap-3 mt-5">
                {disputeStep > 1 && (
                  <button onClick={() => setDisputeStep((s) => s - 1)} disabled={submittingDispute}
                    className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-white/10 text-text-secondary font-bold text-sm hover:bg-white/5 transition-all disabled:opacity-50">
                    <ChevronLeft size={14} /> Back
                  </button>
                )}
                <button
                  onClick={() => {
                    if (disputeStep < 5) { setDisputeStep((s) => s + 1); }
                    else { handleDisputeSubmit(); }
                  }}
                  disabled={submittingDispute || (disputeStep >= 2 && !(disputeAnswers[(disputeModalType === "dispute" ? DISPUTE_QUESTIONS : REVISION_QUESTIONS)[disputeStep - 2]?.key]?.trim()))}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-50 ${
                    disputeModalType === "dispute"
                      ? "bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-500/20"
                      : "bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-500/20"
                  }`}
                >
                  {submittingDispute
                    ? <><Loader2 size={14} className="animate-spin" /> Submitting…</>
                    : disputeStep < 5
                    ? <><ChevronRight size={14} /> Next</>
                    : <><Send size={14} /> Submit {disputeModalType === "dispute" ? "Dispute" : "Revision"}</>
                  }
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Dummy Chat Popup ── */}
      <AnimatePresence>
        {showChat && (
          <motion.div initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 100 }}
            className="fixed bottom-6 right-6 w-80 bg-white border-3 border-[#1A1A2E] rounded-2xl shadow-[8px_8px_0px_#1A1A2E] z-50 flex flex-col overflow-hidden"
            style={{ height: "400px" }}>
            
            {/* Header */}
            <div className="bg-[#3D5AFE] p-4 border-b-3 border-[#1A1A2E] flex justify-between items-center text-white">
              <div>
                <h3 className="font-black uppercase tracking-wider text-sm flex items-center gap-2">
                  <MessageSquare size={16} /> 
                  {isClient ? "Contact Developer" : "Contact Client"}
                </h3>
                <p className="text-xs font-bold opacity-90 mt-0.5">
                  {isClient ? (project?.workers?.[0]?.worker?.name || "Developer") : "Client"}
                </p>
              </div>
              <button onClick={() => setShowChat(false)} className="hover:bg-white/20 p-1 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto bg-[#F5F0E8] flex flex-col gap-3">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`px-3 py-2 text-sm font-bold border-2 border-[#1A1A2E] max-w-[80%] ${
                    msg.sender === "user" 
                      ? "bg-[#00C853] text-white rounded-l-xl rounded-tr-xl rounded-br-sm shadow-[2px_2px_0px_#1A1A2E]" 
                      : "bg-white text-[#1A1A2E] rounded-r-xl rounded-tl-xl rounded-bl-sm shadow-[2px_2px_0px_#1A1A2E]"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <form onSubmit={(e) => {
              e.preventDefault();
              if(!chatInput.trim()) return;
              setChatMessages(p => [...p, {sender: "user", text: chatInput}]);
              setChatInput("");
            }} className="p-3 border-t-3 border-[#1A1A2E] bg-white flex gap-2">
              <input 
                type="text" 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Type a message..." 
                className="flex-1 px-3 py-2 text-sm font-bold bg-[#F5F0E8] border-2 border-[#1A1A2E] rounded-xl focus:outline-none focus:bg-white"
              />
              <button type="submit" className="bg-[#3D5AFE] text-white p-2 w-10 h-10 flex items-center justify-center rounded-xl border-2 border-[#1A1A2E] hover:translate-x-[1px] hover:translate-y-[1px] shadow-[2px_2px_0px_#1A1A2E] transition-all shrink-0">
                <Send size={16} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  const c = {
    blue: "text-blue-400", emerald: "text-emerald-400",
    amber: "text-amber-400", violet: "text-violet-400", slate: "text-slate-400",
  }[color] ?? "text-slate-400";

  return (
    <div className="flex items-center gap-1.5">
      <Icon size={13} className={c} />
      <span className="text-xs text-text-muted">{label}</span>
      <span className={`text-xs font-bold ${c}`}>{value}</span>
    </div>
  );
}
