"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useWriteContract,
  useReadContract,
  useAccount,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  CheckCircle2, Loader2, Lock, CreditCard, Wallet,
  ShieldCheck, AlertCircle, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import EscrowABI from "@/lib/abi/CrossBorderEscrow.json";
import USDTABI from "@/lib/abi/MockUSDT.json";

const USDT_ADDRESS = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}`;
const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}`;
const FALLBACK_WORKER = "0xf39Fd6e51aad88F6f4ce6aB8827279cffFb92266" as `0x${string}`;
const INR_PER_TOKEN = 83;

type Phase = "pay" | "approve" | "lock" | "done";

type Props = {
  projectId: string;
  projectName: string;
  budget: number;       // in Tokens (1 Token = 1 USDT)
  workerAddress?: string | null;
  onComplete: () => void;
};

export default function EscrowPaymentFlow({
  projectId, projectName, budget, workerAddress, onComplete,
}: Props) {
  const { address, isConnected } = useAccount();
  const [phase, setPhase] = useState<Phase>("pay");
  const [minting, setMinting] = useState(false);
  const [updatingDB, setUpdatingDB] = useState(false);
  const capturedChainId = useRef<number | null>(null);

  const budgetWei = parseEther(budget.toString());
  const workerAddr = ((workerAddress || FALLBACK_WORKER) as `0x${string}`);

  // Read nextProjectId to capture before lock tx
  const { data: nextProjectId } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: EscrowABI,
    functionName: "nextProjectId",
    query: { enabled: !!address && phase === "lock" },
  });

  // ── Approve ──
  const { writeContract: writeApprove, data: approveTxHash, isPending: approvePending } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash });

  // ── CreateProject ──
  const { writeContract: writeCreate, data: lockTxHash, isPending: lockPending } = useWriteContract();
  const { isLoading: lockConfirming, isSuccess: lockSuccess } = useWaitForTransactionReceipt({ hash: lockTxHash });

  // After approve confirms → move to lock
  useEffect(() => {
    if (approveSuccess) {
      toast.success("Tokens approved for escrow!");
      setPhase("lock");
    }
  }, [approveSuccess]);

  // After lock confirms → update DB and complete
  useEffect(() => {
    if (lockSuccess) {
      const chainId = capturedChainId.current ?? 0;
      patchDB(chainId, "locked");
    }
  }, [lockSuccess]);

  const patchDB = async (chainId: number | null, status: string) => {
    setUpdatingDB(true);
    try {
      await fetch(`/api/projects/${projectId}/escrow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(chainId !== null && { onChainId: chainId }),
          escrowStatus: status,
        }),
      });
      if (status === "locked") {
        setPhase("done");
        toast.success("Funds locked in smart contract!");
        setTimeout(onComplete, 1800);
      }
    } catch {
      toast.error("DB update failed — funds are locked on-chain");
    } finally {
      setUpdatingDB(false);
    }
  };

  const handleRazorpay = async () => {
    if (!address) return toast.error("Please connect your wallet first");
    setMinting(true);
    try {
      const orderRes = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: budget }),
      });
      const order = await orderRes.json();
      if (!order.id) throw new Error("Could not create Razorpay order");

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: "WeWorkTogether",
        description: `Buy ${budget} Tokens for: ${projectName}`,
        order_id: order.id,
        handler: async (response: any) => {
          try {
            const vRes = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                userAddress: address,
                amountToMint: budget.toString(),
              }),
            });
            const vd = await vRes.json();
            if (vd.success) {
              await patchDB(null, "funded");
              toast.success(`${budget} Tokens minted to ${address.slice(0, 6)}…`);
              setPhase("approve");
            } else {
              toast.error("Payment verification failed");
            }
          } catch {
            toast.error("Payment processing failed");
          } finally {
            setMinting(false);
          }
        },
        modal: { ondismiss: () => setMinting(false) },
        theme: { color: "#6366f1" },
        prefill: { name: "WeWorkTogether Client" },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (e: any) {
      toast.error(e.message ?? "Payment init failed");
      setMinting(false);
    }
  };

  const handleApprove = () => {
    if (!address) return;
    writeApprove({
      address: USDT_ADDRESS,
      abi: USDTABI,
      functionName: "approve",
      args: [ESCROW_ADDRESS, budgetWei],
    });
  };

  const handleLock = () => {
    if (!address) return;
    capturedChainId.current = nextProjectId !== undefined ? Number(nextProjectId) : null;
    writeCreate({
      address: ESCROW_ADDRESS,
      abi: EscrowABI,
      functionName: "createProject",
      args: [workerAddr, budgetWei],
    });
  };

  const PHASE_ORDER: Phase[] = ["pay", "approve", "lock", "done"];
  const phaseIdx = PHASE_ORDER.indexOf(phase);

  const steps = [
    {
      key: "pay" as Phase,
      icon: CreditCard,
      color: "indigo",
      title: `Pay ₹${(budget * INR_PER_TOKEN).toLocaleString()} for ${budget} Tokens via Razorpay`,
      desc: `Fiat payment → ${budget} Tokens minted to your wallet`,
      action: () => handleRazorpay(),
      loading: minting,
      btnLabel: minting ? "Opening Razorpay…" : "Pay Now",
      btnIcon: minting ? Loader2 : CreditCard,
    },
    {
      key: "approve" as Phase,
      icon: Wallet,
      color: "purple",
      title: `Approve ${budget} Tokens Spend`,
      desc: "Authorize the escrow contract to hold your tokens",
      action: () => handleApprove(),
      loading: approvePending || approveConfirming,
      btnLabel: approvePending ? "Check Wallet…" : approveConfirming ? "Confirming…" : "Approve",
      btnIcon: (approvePending || approveConfirming) ? Loader2 : Wallet,
    },
    {
      key: "lock" as Phase,
      icon: Lock,
      color: "emerald",
      title: `Lock ${budget} Tokens in Smart Contract`,
      desc: "Tokens are escrowed until milestones complete",
      action: () => handleLock(),
      loading: lockPending || lockConfirming || updatingDB,
      btnLabel: lockPending ? "Check Wallet…" : lockConfirming ? "Confirming…" : updatingDB ? "Saving…" : "Lock Funds",
      btnIcon: (lockPending || lockConfirming || updatingDB) ? Loader2 : Lock,
    },
  ];

  const colorMap: Record<string, { ring: string; bg: string; text: string; btn: string }> = {
    indigo: { ring: "ring-indigo-500/40", bg: "bg-indigo-900/20", text: "text-indigo-400", btn: "bg-indigo-600 hover:bg-indigo-500" },
    purple: { ring: "ring-purple-500/40", bg: "bg-purple-900/20", text: "text-purple-400", btn: "bg-purple-600 hover:bg-purple-500" },
    emerald: { ring: "ring-emerald-500/40", bg: "bg-emerald-900/20", text: "text-emerald-400", btn: "bg-emerald-600 hover:bg-emerald-500" },
  };

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="bg-indigo-900/20 border border-indigo-700/40 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-indigo-900/40 rounded-xl flex items-center justify-center shrink-0">
            <ShieldCheck size={18} className="text-indigo-400" />
          </div>
          <div>
            <p className="font-bold text-text-primary text-sm">Smart Contract Escrow</p>
            <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
              Your <span className="font-bold text-indigo-400">{budget.toLocaleString()} Tokens</span> get locked in{" "}
              <code className="text-[10px] bg-white/10 px-1 py-0.5 rounded font-mono text-text-secondary">CrossBorderEscrow</code> on-chain.
              Funds are released to workers only when milestones are completed.
            </p>
          </div>
        </div>
      </div>

      {/* Wallet connect prompt */}
      {!isConnected && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-4 bg-amber-900/20 border border-amber-700/40 rounded-2xl p-4"
        >
          <div>
            <p className="font-bold text-amber-300 text-sm flex items-center gap-1.5">
              <AlertCircle size={14} /> Wallet Required
            </p>
            <p className="text-xs text-amber-400/80 mt-0.5">Connect your wallet to interact with the escrow contract.</p>
          </div>
          <ConnectButton />
        </motion.div>
      )}

      {/* 3-step stepper */}
      <div className="space-y-2.5">
        {steps.map((s, i) => {
          const isActive = phase === s.key;
          const isDone = phaseIdx > i + 1 || phase === "done";
          const isLocked = phaseIdx < i + 1;
          const c = colorMap[s.color];
          const BtnIcon = s.btnIcon;

          return (
            <motion.div
              key={s.key}
              className={`rounded-2xl border-2 p-4 transition-all duration-300 ${
                isDone ? "border-emerald-700/30 bg-emerald-900/10" :
                isActive ? `ring-2 ${c.ring} ${c.bg} border-transparent` :
                "border-white/8 bg-white/3"
              } ${isLocked ? "opacity-40" : ""}`}
              animate={isActive ? { boxShadow: ["0 0 0 0 rgba(99,102,241,0)", "0 0 0 6px rgba(99,102,241,0.12)", "0 0 0 0 rgba(99,102,241,0)"] } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="flex items-center gap-3">
                {/* Number / check */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm transition-all ${
                  isDone ? "bg-emerald-900/30 text-emerald-400" :
                  isActive ? `${c.bg} ${c.text}` :
                  "bg-white/8 text-text-muted"
                }`}>
                  {isDone ? <CheckCircle2 size={17} className="text-emerald-400" /> : i + 1}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm ${isDone ? "line-through text-text-muted" : isActive ? "text-text-primary" : "text-text-muted"}`}>
                    {s.title}
                  </p>
                  <p className="text-xs text-text-muted truncate mt-0.5">{s.desc}</p>
                </div>

                {/* Action button */}
                {isActive && isConnected && !updatingDB && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={s.action}
                    disabled={s.loading || !isConnected}
                    className={`flex items-center gap-2 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shrink-0 disabled:opacity-60 ${c.btn}`}
                  >
                    <BtnIcon size={13} className={s.loading ? "animate-spin" : ""} />
                    {s.btnLabel}
                  </motion.button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Success state */}
      <AnimatePresence>
        {phase === "done" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0.4 }}
            className="text-center py-8 bg-gradient-to-br from-emerald-900/20 to-teal-900/20 border-2 border-emerald-700/30 rounded-2xl"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", bounce: 0.6, delay: 0.15 }}
              className="w-16 h-16 bg-emerald-900/40 rounded-full flex items-center justify-center mx-auto mb-3"
            >
              <ShieldCheck size={30} className="text-emerald-400" />
            </motion.div>
            <p className="font-extrabold text-text-primary">Project is Live!</p>
            <p className="text-sm text-emerald-400 mt-1 font-medium">
              {budget} Tokens locked in escrow contract #{capturedChainId.current}
            </p>
            <p className="text-xs text-text-muted mt-1">Navigating to your dashboard…</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contract info footer */}
      <div className="flex items-center justify-between text-[10px] text-text-muted px-1">
        <span className="font-mono truncate">Escrow: {ESCROW_ADDRESS?.slice(0, 10)}…</span>
        <a
          href="https://github.com/weworktogether/contracts"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-0.5 hover:text-text-secondary"
        >
          <ExternalLink size={10} /> View contract
        </a>
      </div>
    </div>
  );
}
