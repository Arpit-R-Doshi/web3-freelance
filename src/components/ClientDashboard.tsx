"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { parseEther, formatEther } from "viem";
import {
  PlusCircle, Wallet, ArrowUpRight, ArrowDownLeft, Briefcase,
  TrendingUp, RefreshCw, AlertCircle, ChevronRight, CheckCircle2,
  Clock, Loader2, Coins, Lock,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import ConnectWallet from "./ConnectWallet";
import EscrowABI from "@/lib/abi/CrossBorderEscrow.json";
import USDTABI from "@/lib/abi/MockUSDT.json";
import axios from "axios";
import { toast } from "sonner";
import { parseError } from "@/lib/utils/error";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}`;
const USDT_ADDRESS = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}`;

const DEFAULT_CURRENCIES = [
  { code: "INR", label: "₹ INR", rate: 83, symbol: "₹" },
  { code: "USD", label: "$ USD", rate: 1, symbol: "$" },
  { code: "GBP", label: "£ GBP", rate: 0.79, symbol: "£" },
  { code: "EUR", label: "€ EUR", rate: 0.92, symbol: "€" },
];

const CURRENCY_COLORS: Record<string, string> = {
  INR: "#8b5cf6",
  USD: "#00C853",
  GBP: "#FFD600",
  EUR: "#3D5AFE",
};

type LiquidityEntry = { currency: string; totalDeposited: number; totalTokens: number };
type ProjectEntry = {
  id: string;
  name: string;
  status: string;
  escrowStatus: string;
  budget?: number | null;
  tokenReleased: number;
  milestones: { status: string }[];
};

export default function ClientDashboard() {
  const { address } = useAccount();
  const config = useConfig();
  const [token, setToken] = useState("");
  const [currencies, setCurrencies] = useState(DEFAULT_CURRENCIES);

  useEffect(() => {
    // Fetch live rates
    fetch("/api/rates").then(r => r.json()).then(data => {
      if (data.rates) {
        setCurrencies([
          { code: "INR", label: "₹ INR", rate: data.rates.INR || 83, symbol: "₹" },
          { code: "USD", label: "$ USD", rate: data.rates.USD || 1, symbol: "$" },
          { code: "GBP", label: "£ GBP", rate: data.rates.GBP || 0.79, symbol: "£" },
          { code: "EUR", label: "€ EUR", rate: data.rates.EUR || 0.92, symbol: "€" },
        ]);
      }
    }).catch(e => console.error("Failed to load live rates", e));
  }, []);

  // Buy tokens state
  const [buyCurrency, setBuyCurrency] = useState("INR");
  const [buyTokens, setBuyTokens] = useState("100");
  const [isProcessing, setIsProcessing] = useState(false);

  // Withdraw state
  const [withdrawCurrency, setWithdrawCurrency] = useState("INR");
  const [withdrawTokens, setWithdrawTokens] = useState("50");
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);

  // Data
  const [liquidityPools, setLiquidityPools] = useState<LiquidityEntry[]>([]);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Wagmi — USDT balance
  const { data: balanceData, refetch: refetchBalance } = useReadContract({
    address: USDT_ADDRESS,
    abi: USDTABI,
    functionName: "balanceOf",
    args: [address],
    query: { enabled: !!address },
  });

  // Wagmi — escrow allowance (needed before burn)
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: USDT_ADDRESS,
    abi: USDTABI,
    functionName: "allowance",
    args: [address, ESCROW_ADDRESS],
    query: { enabled: !!address },
  });

  // Wagmi — write (approve + burn)
  const { writeContractAsync: burnAsync, isPending: burnPending } = useWriteContract();

  const balanceTokens = balanceData ? parseFloat(formatEther(balanceData as bigint)) : 0;
  const buyCurrencyMeta = currencies.find((c) => c.code === buyCurrency) || currencies[0];
  const buyFiatCost = parseFloat((Number(buyTokens) * buyCurrencyMeta.rate).toFixed(2));
  const withdrawCurrencyMeta = currencies.find((c) => c.code === withdrawCurrency) || currencies[0];
  const withdrawFiatOut = parseFloat((Number(withdrawTokens) * withdrawCurrencyMeta.rate).toFixed(2));
  const withdrawTokenCount = Number(withdrawTokens) || 0;

  // Load data
  useEffect(() => {
    const t = localStorage.getItem("wwt_token") ?? "";
    setToken(t);

    Promise.all([
      fetch("/api/liquidity").then((r) => r.json()),
      t ? fetch("/api/projects", { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.json()) : Promise.resolve({ projects: [] }),
    ])
      .then(([liq, proj]) => {
        setLiquidityPools(liq.pools ?? []);
        setProjects((proj.projects ?? []).slice(0, 6));
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [refreshKey]);

  const handleBuyTokens = async () => {
    if (!address) return toast.error("Please connect wallet first");
    const tokens = Number(buyTokens);
    if (!tokens || tokens <= 0) return toast.error("Enter a valid token amount");
    setIsProcessing(true);

    try {
      const { data: order } = await axios.post("/api/razorpay/order", {
        tokens,
        currency: buyCurrency,
      });

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_123",
        amount: order.amount,
        currency: order.currency,
        name: "WeWorkTogether",
        description: `Buy ${tokens} Tokens · ${buyCurrencyMeta.symbol}${buyFiatCost.toLocaleString()} ${buyCurrency}`,
        order_id: order.id,
        handler: async function (response: any) {
          try {
            const verifyRes = await axios.post("/api/razorpay/verify", {
              ...response,
              userAddress: address,
              amountToMint: tokens.toString(),
              currency: buyCurrency,
            });
            if (verifyRes.data.success) {
              toast.success(`${tokens} tokens minted to your wallet!`);
              refetchBalance();
              setRefreshKey((k) => k + 1);
            }
          } catch (err) {
            toast.error("Verification failed");
          } finally {
            setIsProcessing(false);
          }
        },
        prefill: { name: "WeWorkTogether Client" },
        theme: { color: "#3D5AFE" },
        modal: { ondismiss: () => setIsProcessing(false) },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", (r: any) => {
        setIsProcessing(false);
        toast.error(r.error.description);
      });
      rzp.open();
    } catch (err: any) {
      setIsProcessing(false);
      toast.error(parseError(err));
    }
  };

  const initiateWithdrawal = () => {
    if (!address) return toast.error("Connect wallet first");
    if (withdrawTokenCount <= 0) return toast.error("Enter a valid amount");
    if (withdrawTokenCount > balanceTokens) return toast.error("Insufficient token balance");
    setShowWithdrawConfirm(true);
  };

  const confirmWithdrawal = async () => {
    if (!address) return;
    setShowWithdrawConfirm(false);
    setIsWithdrawing(true);
    try {
      const amountWei = parseEther(withdrawTokenCount.toString());

      // Approve escrow to spend tokens if allowance is insufficient
      if (!allowanceData || (allowanceData as bigint) < amountWei) {
        const approveTxHash = await burnAsync({
          address: USDT_ADDRESS,
          abi: USDTABI,
          functionName: "approve",
          args: [ESCROW_ADDRESS, amountWei],
        });
        const approveReceipt = await waitForTransactionReceipt(config, { hash: approveTxHash });
        if (approveReceipt.status === "reverted") {
          throw new Error("Approval transaction reverted");
        }
        refetchAllowance();
      }

      const txHash = await burnAsync({
        address: ESCROW_ADDRESS,
        abi: EscrowABI,
        functionName: "burnAndWithdraw",
        args: [amountWei],
      });
      const receipt = await waitForTransactionReceipt(config, { hash: txHash });
      if (receipt.status === "reverted") {
        throw new Error("Transaction reverted — tokens were not burned");
      }
      await completWithdrawal(txHash);
    } catch (err: any) {
      toast.error(parseError(err));
      setIsWithdrawing(false);
    }
  };

  const completWithdrawal = async (txHash: string) => {
    try {
      await axios.post("/api/razorpay/withdraw", {
        tokens: withdrawTokenCount,
        currency: withdrawCurrency,
        txHash,
      });
      toast.success(
        `Payout of ${withdrawCurrencyMeta.symbol}${withdrawFiatOut.toLocaleString()} ${withdrawCurrency} initiated!`
      );
      refetchBalance();
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error("Payout failed — tokens burned. Contact support.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const lockedInEscrow = projects
    .filter((p) => p.escrowStatus === "funded" || p.escrowStatus === "locked")
    .reduce((sum, p) => sum + (p.budget ?? 0) - p.tokenReleased, 0);

  const chartData = liquidityPools.map((p) => ({
    currency: p.currency,
    tokens: p.totalTokens,
    deposited: p.totalDeposited,
  }));

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex justify-between items-center glass-card p-6 rounded-xl">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-text-primary uppercase">Client Dashboard</h1>
          <p className="text-text-secondary mt-1 text-sm font-bold">Manage your wallet, tokens, and cross-border projects</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="p-2 rounded-lg text-text-muted hover:text-text-secondary hover:bg-[#F5F0E8] border-2 border-transparent hover:border-[#1A1A2E] transition-all"
            title="Refresh data"
          >
            <RefreshCw size={16} />
          </button>
          <ConnectWallet />
        </div>
      </div>

      {/* ── Quick stats ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#E8EAF6] border-2 border-[#3D5AFE] flex items-center justify-center shrink-0">
            <Coins className="w-5 h-5 text-[#3D5AFE]" />
          </div>
          <div>
            <p className="text-[10px] font-black text-text-muted uppercase tracking-wider">Token Balance</p>
            <p className="text-lg font-black text-text-primary">{balanceTokens.toFixed(2)}</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#FFF8E1] border-2 border-[#FFD600] flex items-center justify-center shrink-0">
            <Briefcase className="w-5 h-5 text-[#F9A825]" />
          </div>
          <div>
            <p className="text-[10px] font-black text-text-muted uppercase tracking-wider">Active Projects</p>
            <p className="text-lg font-black text-text-primary">{projects.filter((p) => p.status !== "completed").length}</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#F3E5F5] border-2 border-[#8b5cf6] flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5 text-[#8b5cf6]" />
          </div>
          <div>
            <p className="text-[10px] font-black text-text-muted uppercase tracking-wider">Locked in Escrow</p>
            <p className="text-lg font-black text-text-primary">{lockedInEscrow.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* ── Balance + Buy + Withdraw ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Balance Card */}
        <div className="bg-[#3D5AFE] rounded-xl p-7 text-white border-3 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div className="bg-white/20 p-2.5 rounded-lg border-2 border-white/30">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <Link href="/client/projects/new"
                className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg border-2 border-white/30 transition-all">
                <PlusCircle size={12} /> New Project
              </Link>
            </div>
            <p className="text-white/80 text-xs font-black uppercase tracking-widest mb-1">Platform Balance</p>
            <p className="text-4xl font-black tracking-tight">
              {balanceTokens.toFixed(2)}
              <span className="text-lg font-bold opacity-60 ml-2">USDT</span>
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-white/80 font-bold">
              <Coins size={12} />
              <span>1 Token = $1 USDT · Platform escrow currency</span>
            </div>
            {lockedInEscrow > 0 && (
              <div className="mt-2 flex items-center gap-2 text-xs text-white bg-white/10 border-2 border-white/20 px-3 py-1.5 rounded-lg font-bold">
                <Lock size={11} />
                <span>{lockedInEscrow.toFixed(2)} tokens locked in active projects</span>
              </div>
            )}
          </div>
        </div>

        {/* Buy Tokens */}
        <div className="glass-card rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="bg-[#E8F5E9] border-2 border-[#00C853] p-2 rounded-lg"><ArrowDownLeft className="w-4 h-4 text-[#00C853]" /></div>
            <h2 className="font-black text-text-primary uppercase tracking-wide">Buy Tokens</h2>
          </div>

          <div className="space-y-3">
            <div className="flex gap-2 w-full">
              <select
                value={buyCurrency}
                onChange={(e) => setBuyCurrency(e.target.value)}
                className="glass-input px-3 py-2.5 text-sm font-black w-24 shrink-0"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code} className="bg-white">{c.label}</option>
                ))}
              </select>
              <input
                type="number" min="1" value={buyTokens}
                onChange={(e) => setBuyTokens(e.target.value)}
                placeholder="Tokens"
                className="flex-1 min-w-0 glass-input px-4 py-2.5 font-black text-lg"
              />
            </div>

            {Number(buyTokens) > 0 && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="text-xs text-[#3D5AFE] font-black bg-[#E8EAF6] border-2 border-[#3D5AFE] px-3 py-2 rounded-lg uppercase tracking-wider">
                You pay: {buyCurrencyMeta.symbol}{buyFiatCost.toLocaleString()} {buyCurrency}
                <span className="text-text-muted ml-2 normal-case">≈ {buyTokens} USDT tokens</span>
              </motion.div>
            )}

            <button onClick={handleBuyTokens} disabled={isProcessing || !Number(buyTokens)}
              className="w-full bg-[#00C853] hover:bg-[#00E676] text-white py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 border-3 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] hover:shadow-[1px_1px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px]">
              {isProcessing
                ? <><Loader2 size={15} className="animate-spin" /> Processing…</>
                : <><ArrowDownLeft size={15} /> Pay via Razorpay</>}
            </button>
          </div>
        </div>

        {/* Withdraw Tokens */}
        <div className="glass-card rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="bg-[#FFF8E1] border-2 border-[#FFD600] p-2 rounded-lg"><ArrowUpRight className="w-4 h-4 text-[#F9A825]" /></div>
            <h2 className="font-black text-text-primary uppercase tracking-wide">Withdraw</h2>
          </div>

          <div className="space-y-3">
            <div className="flex gap-2 w-full">
              <select
                value={withdrawCurrency}
                onChange={(e) => setWithdrawCurrency(e.target.value)}
                className="glass-input px-3 py-2.5 text-sm font-black w-24 shrink-0"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code} className="bg-white">{c.label}</option>
                ))}
              </select>
              <input
                type="number" min="1" max={balanceTokens} value={withdrawTokens}
                onChange={(e) => setWithdrawTokens(e.target.value)}
                placeholder="Tokens"
                className="flex-1 min-w-0 glass-input px-4 py-2.5 font-black text-lg"
              />
            </div>

            {withdrawTokenCount > 0 && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className={`text-xs font-black px-3 py-2 rounded-lg border-2 uppercase tracking-wider ${
                  withdrawTokenCount > balanceTokens
                    ? "bg-[#FCE4EC] border-[#FF1744] text-[#FF1744]"
                    : "bg-[#FFF8E1] border-[#FFD600] text-[#F9A825]"
                }`}>
                {withdrawTokenCount > balanceTokens
                  ? `⚠ Exceeds balance (${balanceTokens.toFixed(2)} tokens available)`
                  : `You receive: ${withdrawCurrencyMeta.symbol}${withdrawFiatOut.toLocaleString()} ${withdrawCurrency}`}
              </motion.div>
            )}

            <button
              onClick={initiateWithdrawal}
              disabled={isWithdrawing || burnPending || !withdrawTokenCount || withdrawTokenCount > balanceTokens}
              className="w-full bg-[#F9A825] hover:bg-[#FFD600] text-white py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 border-3 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] hover:shadow-[1px_1px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px]"
            >
              {burnPending
                ? <><Loader2 size={15} className="animate-spin" /> Check Wallet…</>
                : isWithdrawing
                ? <><Loader2 size={15} className="animate-spin" /> Processing Payout…</>
                : <><ArrowUpRight size={15} /> Withdraw Tokens</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Projects Overview ── */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b-3 border-[#1A1A2E]">
          <div className="flex items-center gap-3">
            <div className="bg-[#E8EAF6] border-2 border-[#3D5AFE] p-2 rounded-lg text-[#3D5AFE]">
              <Briefcase className="w-4 h-4" />
            </div>
            <h2 className="font-black text-text-primary uppercase tracking-wide">My Projects</h2>
            <div className="bg-[#F5F0E8] text-[#4A4A68] px-2.5 py-0.5 rounded-lg text-xs font-black border-2 border-[#1A1A2E]">
              {projects.length}
            </div>
          </div>
          <Link href="/client/projects"
            className="flex items-center gap-1.5 text-xs font-black text-[#3D5AFE] hover:text-[#304FFE] transition-colors uppercase tracking-wider">
            View all <ChevronRight size={13} />
          </Link>
        </div>

        {loadingData ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-[#B0B0CC]" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 bg-[#F5F0E8] border-2 border-[#1A1A2E] rounded-lg flex items-center justify-center mx-auto mb-3">
              <Briefcase className="w-5 h-5 text-text-muted" />
            </div>
            <p className="text-sm font-black text-text-secondary uppercase">No projects yet</p>
            <p className="text-xs text-text-muted mt-1 font-bold">Create your first project to get started</p>
            <Link href="/client/projects/new"
              className="inline-flex items-center gap-1.5 mt-3 text-xs font-black text-white bg-[#3D5AFE] hover:bg-[#304FFE] px-4 py-2 rounded-lg transition-all uppercase tracking-wider border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <PlusCircle size={12} /> New Project
            </Link>
          </div>
        ) : (
          <div className="divide-y-2 divide-[#1A1A2E]">
            {projects.map((p) => {
              const total = p.milestones.length;
              const done = p.milestones.filter((m) => m.status === "completed").length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;

              return (
                <Link key={p.id} href={`/client/projects/${p.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-[#F5F0E8] transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-[#E8EAF6] border-2 border-[#3D5AFE] flex items-center justify-center shrink-0">
                    <Briefcase size={16} className="text-[#3D5AFE]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm text-text-primary truncate">{p.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex-1 h-2 bg-[#F5F0E8] border border-[#1A1A2E] rounded-sm max-w-32">
                        <div className="h-full bg-[#3D5AFE] rounded-sm transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-text-muted whitespace-nowrap font-black">{done}/{total} milestones</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <EscrowBadge status={p.escrowStatus} />
                    {p.budget && p.budget > 0 && (
                      <span className="text-[10px] text-text-muted font-bold">
                        {p.tokenReleased.toFixed(0)}/{p.budget.toFixed(0)} tokens released
                      </span>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-text-muted shrink-0" />
                </Link>
              );
            })}
          </div>
        )}

        <div className="px-6 py-3 border-t-3 border-[#1A1A2E]">
          <Link href="/client/projects/new"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border-3 border-dashed border-[#3D5AFE] text-sm font-black text-[#3D5AFE] hover:bg-[#E8EAF6] transition-all uppercase tracking-wider">
            <PlusCircle size={14} /> Create New Project
          </Link>
        </div>
      </div>

      {/* ── Withdraw Confirm Modal ── */}
      <AnimatePresence>
        {showWithdrawConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6"
            onClick={(e) => e.target === e.currentTarget && setShowWithdrawConfirm(false)}>
            <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="glass-card rounded-xl p-6 w-full max-w-sm">
              <div className="text-center mb-5">
                <div className="w-14 h-14 bg-[#FFF8E1] border-3 border-[#FFD600] rounded-lg flex items-center justify-center mx-auto mb-3 shadow-[3px_3px_0px_#FFD600]">
                  <ArrowUpRight className="w-6 h-6 text-[#F9A825]" />
                </div>
                <h3 className="font-black text-text-primary text-lg uppercase">Confirm Withdrawal</h3>
                <p className="text-sm text-text-secondary mt-1 font-bold">
                  Burn {withdrawTokenCount} USDT tokens and receive fiat payout
                </p>
              </div>

              <div className="bg-[#FFF8E1] border-3 border-[#FFD600] rounded-xl p-4 mb-5">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-text-muted font-bold">Tokens to burn</span>
                  <span className="font-black text-text-primary">{withdrawTokenCount} USDT</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted font-bold">You receive</span>
                  <span className="font-black text-[#00C853]">
                    {withdrawCurrencyMeta.symbol}{withdrawFiatOut.toLocaleString()} {withdrawCurrency}
                  </span>
                </div>
              </div>

              <div className="bg-[#E8EAF6] border-3 border-[#3D5AFE] rounded-xl p-3 mb-4">
                <p className="text-xs text-[#3D5AFE] flex items-start gap-1.5 font-bold">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  Your wallet will prompt you to sign the burn transaction. Payout will be processed after confirmation.
                </p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowWithdrawConfirm(false)}
                  className="flex-1 py-3 rounded-xl border-3 border-[#1A1A2E] text-text-secondary font-black text-sm hover:bg-[#F5F0E8] transition-all uppercase tracking-wider shadow-[2px_2px_0px_#1A1A2E] hover:shadow-[1px_1px_0px_#1A1A2E] hover:translate-x-[1px] hover:translate-y-[1px]">
                  Cancel
                </button>
                <button onClick={confirmWithdrawal}
                  className="flex-1 py-3 rounded-xl bg-[#F9A825] hover:bg-[#FFD600] text-white font-black text-sm transition-all uppercase tracking-wider border-3 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] hover:shadow-[1px_1px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px]">
                  Confirm &amp; Burn
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EscrowBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    none: { label: "No Escrow", cls: "bg-[#F5F0E8] text-[#8888A0] border-2 border-[#1A1A2E]", Icon: Clock },
    funded: { label: "Funded", cls: "bg-[#E8EAF6] text-[#3D5AFE] border-2 border-[#3D5AFE]", Icon: CheckCircle2 },
    locked: { label: "Locked", cls: "bg-[#E8F5E9] text-[#00C853] border-2 border-[#00C853]", Icon: CheckCircle2 },
    released: { label: "Released", cls: "bg-[#F3E5F5] text-[#8b5cf6] border-2 border-[#8b5cf6]", Icon: CheckCircle2 },
    cancelled: { label: "Cancelled", cls: "bg-[#FCE4EC] text-[#FF1744] border-2 border-[#FF1744]", Icon: Clock },
  };
  const meta = map[status] ?? map.none;
  const Icon = meta.Icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg ${meta.cls}`}>
      <Icon size={9} />
      {meta.label}
    </span>
  );
}
