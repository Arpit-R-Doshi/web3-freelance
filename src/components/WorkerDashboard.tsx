"use client";

import { useState, useMemo, useEffect } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { formatEther, parseEther } from "viem";
import {
  Briefcase, Landmark, CheckCircle, ArrowRightCircle,
  ChevronDown, RefreshCw, AlertTriangle, Wallet, ArrowRight, CheckCircle2, Scale,
  TrendingUp, Coins, FolderKanban,
} from "lucide-react";
import Link from "next/link";
import ConnectWallet from "./ConnectWallet";
import EscrowABI from "@/lib/abi/CrossBorderEscrow.json";
import USDTABI from "@/lib/abi/MockUSDT.json";
import { toast } from "sonner";
import { parseError } from "@/lib/utils/error";
import axios from "axios";

const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}`;
const USDT_ADDRESS   = process.env.NEXT_PUBLIC_USDT_ADDRESS   as `0x${string}`;

type DbProject = {
  id: string;
  name: string;
  description: string;
  status: string;
  onChainId: number | null;
  milestones: { status: string }[];
};

const DEFAULT_CURRENCY_CONFIG: Record<string, { rate: number; symbol: string; label: string }> = {
  INR: { rate: 83,   symbol: "₹", label: "Indian Rupee (INR)" },
  USD: { rate: 1,    symbol: "$", label: "US Dollar (USD)" },
  EUR: { rate: 0.92, symbol: "€", label: "Euro (EUR)" },
  GBP: { rate: 0.79, symbol: "£", label: "British Pound (GBP)" },
};

const POLL_INTERVAL = 8_000;

export default function WorkerDashboard() {
  const { address } = useAccount();
  const config = useConfig();

  const [registeredWallet, setRegisteredWallet] = useState<string | null>(null);
  const [dbProjects, setDbProjects] = useState<DbProject[]>([]);
  const [pendingRevisions, setPendingRevisions] = useState<any[]>([]);
  const [currencyConfig, setCurrencyConfig] = useState(DEFAULT_CURRENCY_CONFIG);

  useEffect(() => {
    // Fetch live rates
    fetch("/api/rates").then(r => r.json()).then(data => {
      if (data.rates) {
        setCurrencyConfig({
          INR: { rate: data.rates.INR || 83, symbol: "₹", label: "Indian Rupee (INR)" },
          USD: { rate: data.rates.USD || 1, symbol: "$", label: "US Dollar (USD)" },
          EUR: { rate: data.rates.EUR || 0.92, symbol: "€", label: "Euro (EUR)" },
          GBP: { rate: data.rates.GBP || 0.79, symbol: "£", label: "British Pound (GBP)" },
        });
      }
    }).catch(e => console.error("Failed to load live rates", e));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("wwt_token");
    if (!token) return;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => { if (data.walletAddress) setRegisteredWallet(data.walletAddress.toLowerCase()); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("wwt_token");
    if (!token) return;
    fetch("/api/projects", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (d.projects) setDbProjects(d.projects); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("wwt_token");
    if (!token) return;
    fetch("/api/worker/disputes", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (d.disputes) setPendingRevisions(d.disputes); })
      .catch(() => {});
  }, []);

  const walletMismatch =
    !!address && !!registeredWallet && address.toLowerCase() !== registeredWallet;

  const balanceAddress = (registeredWallet ?? address) as `0x${string}` | undefined;

  const [withdrawAmount, setWithdrawAmount]   = useState("");
  const [selectedCurrency, setSelectedCurrency] = useState("INR");
  const [isProcessing, setIsProcessing]       = useState(false);

  const currencyCfg = currencyConfig[selectedCurrency] || currencyConfig["INR"];
  const fiatPayout  = withdrawAmount
    ? parseFloat((Number(withdrawAmount) * currencyCfg.rate).toFixed(2))
    : 0;

  const { data: balanceData, refetch: refetchBalance } = useReadContract({
    address: USDT_ADDRESS,
    abi: USDTABI,
    functionName: "balanceOf",
    args: [balanceAddress],
    query: { enabled: !!balanceAddress, refetchInterval: POLL_INTERVAL },
  });

  const { data: nextProjectId, refetch: refetchNextId } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: EscrowABI,
    functionName: "nextProjectId",
    query: { refetchInterval: POLL_INTERVAL },
  });

  const projectContracts = useMemo(() => {
    if (!nextProjectId) return [];
    const count = Number(nextProjectId as bigint);
    return Array.from({ length: count }).map((_, i) => ({
      address: ESCROW_ADDRESS,
      abi: EscrowABI as any,
      functionName: "getProject",
      args: [BigInt(i)],
    }));
  }, [nextProjectId]);

  const { data: projectsData, refetch: refetchProjects } = useReadContracts({
    contracts: projectContracts,
    query: { enabled: projectContracts.length > 0, refetchInterval: POLL_INTERVAL },
  });

  const activeJobs = useMemo(() => {
    if (!projectsData || !balanceAddress) return [];
    return projectsData
      .map((res: any, index) => {
        if (!res.result) return null;
        const [client, worker, amount, releasedAmount, isCompleted] = res.result;
        return { index, client, worker, amount, releasedAmount, isCompleted };
      })
      .filter(
        (p: any) =>
          p &&
          p.worker.toLowerCase() === balanceAddress.toLowerCase() &&
          !p.isCompleted
      );
  }, [projectsData, balanceAddress]);

  const { data: allowanceData } = useReadContract({
    address: USDT_ADDRESS,
    abi: USDTABI,
    functionName: "allowance",
    args: [address, ESCROW_ADDRESS],
    query: { enabled: !!address },
  });

  const { writeContractAsync } = useWriteContract();

  const handleRefresh = () => {
    refetchBalance();
    refetchNextId();
    refetchProjects();
    toast.success("Balance refreshed");
  };

  const handleClaim = async (projectId: number) => {
    if (!address) return toast.error("Please connect wallet first");
    if (walletMismatch) {
      return toast.error(
        `Switch MetaMask to your registered wallet (${registeredWallet?.slice(0, 6)}…${registeredWallet?.slice(-4)}) to claim.`
      );
    }
    try {
      const txHash = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: EscrowABI,
        functionName: "releasePayment",
        args: [BigInt(projectId)],
      });
      toast.info("Transaction submitted — waiting for confirmation…");
      await waitForTransactionReceipt(config, { hash: txHash });
      toast.success("Payment claimed! Your token balance has been updated.");
      refetchBalance();
      refetchProjects();
    } catch (err: any) {
      toast.error(parseError(err));
    }
  };

  const handleWithdraw = async () => {
    if (!address || !withdrawAmount) {
      return toast.error("Please enter an amount and connect your wallet");
    }
    if (walletMismatch) {
      return toast.error(
        `Switch MetaMask to your registered wallet (${registeredWallet?.slice(0, 6)}…${registeredWallet?.slice(-4)}) to withdraw.`
      );
    }
    const tokens = Number(withdrawAmount);
    if (isNaN(tokens) || tokens <= 0) return toast.error("Enter a valid token amount");

    setIsProcessing(true);
    try {
      const amountInWei = parseEther(tokens.toString());

      if (!allowanceData || (allowanceData as bigint) < amountInWei) {
        toast.info("Step 1 of 2 — Approving escrow to burn tokens…");
        const approveTx = await writeContractAsync({
          address: USDT_ADDRESS,
          abi: USDTABI,
          functionName: "approve",
          args: [ESCROW_ADDRESS, amountInWei],
        });
        await waitForTransactionReceipt(config, { hash: approveTx });
      }

      toast.info("Step 2 of 2 — Burning tokens on-chain…");
      const txHash = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: EscrowABI,
        functionName: "burnAndWithdraw",
        args: [amountInWei],
      });
      await waitForTransactionReceipt(config, { hash: txHash });

      const res = await axios.post("/api/razorpay/withdraw", {
        tokens,
        currency: selectedCurrency,
        txHash,
      });

      if (res.data.success) {
        const { fiatAmount, currency } = res.data;
        const sym = currencyConfig[currency]?.symbol ?? "";
        toast.success(
          `${sym}${fiatAmount.toLocaleString()} ${currency} payout triggered to your bank account!`
        );
        setWithdrawAmount("");
        refetchBalance();
      } else {
        throw new Error(res.data.error || "Withdrawal failed");
      }
    } catch (err: any) {
      toast.error(parseError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const displayBalance = balanceData
    ? parseFloat(formatEther(balanceData as bigint)).toFixed(2)
    : "0.00";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center glass-card p-6 rounded-xl">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-text-primary uppercase">Worker Dashboard</h1>
          <p className="text-text-secondary mt-1 text-sm font-bold">
            View assignments, claim tokens, and withdraw to your local currency
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg text-text-muted hover:text-text-secondary hover:bg-[#F5F0E8] border-2 border-transparent hover:border-[#1A1A2E] transition-all"
            title="Refresh balances"
          >
            <RefreshCw size={16} />
          </button>
          <ConnectWallet balanceAddress={balanceAddress} />
        </div>
      </div>

      {/* Wallet mismatch warning */}
      {walletMismatch && (
        <div className="flex items-start gap-3 bg-[#FFF8E1] border-3 border-[#FFD600] rounded-xl px-5 py-4 text-sm text-[#F9A825] shadow-[4px_4px_0px_#FFD600]">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-[#F9A825]" />
          <div>
            <p className="font-black mb-0.5 uppercase">Wallet mismatch — action required</p>
            <p className="font-bold">
              Your MetaMask is connected to{" "}
              <code className="bg-[#FFD600]/20 px-1 rounded font-mono text-xs border border-[#FFD600]">
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </code>
              , but your <strong className="font-black">registered earnings wallet</strong> is{" "}
              <code className="bg-[#FFD600]/20 px-1 rounded font-mono text-xs border border-[#FFD600]">
                {registeredWallet?.slice(0, 6)}…{registeredWallet?.slice(-4)}
              </code>
              . Token releases from clients go to your registered wallet. Switch MetaMask to that wallet to
              see your real balance and withdraw funds.
            </p>
          </div>
        </div>
      )}

      {/* ── Quick stats ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#E8EAF6] border-2 border-[#3D5AFE] flex items-center justify-center shrink-0">
            <Coins className="w-5 h-5 text-[#3D5AFE]" />
          </div>
          <div>
            <p className="text-[10px] font-black text-text-muted uppercase tracking-wider">Token Balance</p>
            <p className="text-lg font-black text-text-primary">{displayBalance}</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#FFF8E1] border-2 border-[#FFD600] flex items-center justify-center shrink-0">
            <FolderKanban className="w-5 h-5 text-[#F9A825]" />
          </div>
          <div>
            <p className="text-[10px] font-black text-text-muted uppercase tracking-wider">Active Jobs</p>
            <p className="text-lg font-black text-text-primary">{dbProjects.filter((p) => p.status !== "completed").length}</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#E8F5E9] border-2 border-[#00C853] flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-[#00C853]" />
          </div>
          <div>
            <p className="text-[10px] font-black text-text-muted uppercase tracking-wider">Completed</p>
            <p className="text-lg font-black text-text-primary">{dbProjects.filter((p) => p.status === "completed").length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Balance + Withdraw Card */}
        <div className="md:col-span-1 bg-[#8b5cf6] rounded-xl p-8 text-white border-3 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] relative overflow-hidden flex flex-col justify-between min-h-[480px]">

          <div className="relative z-10 flex flex-col gap-4 flex-1">
            {/* Wallet info row */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 bg-white/20 self-start px-3 py-1.5 rounded-lg text-xs font-black border-2 border-white/30 uppercase tracking-wider">
                <Wallet size={12} /> Earnings Wallet
              </div>
              <p className="font-mono text-[11px] text-white/80 truncate font-bold">
                {registeredWallet
                  ? `${registeredWallet.slice(0, 10)}…${registeredWallet.slice(-6)}`
                  : "Not registered"}
              </p>
              {walletMismatch && (
                <span className="text-[10px] bg-[#FFD600]/30 text-[#FFD600] border-2 border-[#FFD600] px-2 py-0.5 rounded-lg self-start font-black uppercase tracking-wider">
                  ⚠ Switch wallet to withdraw
                </span>
              )}
            </div>

            <div className="mt-2">
              <p className="text-white/80 font-black text-xs mb-1 uppercase tracking-widest">
                Earned Balance (registered wallet)
              </p>
              <h2 className="text-5xl font-black tracking-tight flex items-end gap-2">
                {displayBalance}
                <span className="text-lg font-bold opacity-70 mb-1">Tokens</span>
              </h2>
            </div>
          </div>

          {/* Withdraw form */}
          <div className="bg-white/15 rounded-xl p-5 border-2 border-white/25 relative z-10 mt-6">
            <h3 className="text-sm font-black mb-3 flex items-center gap-2 uppercase tracking-wider">
              <Landmark className="w-4 h-4" /> Withdraw to Local Bank
            </h3>
            <div className="flex flex-col gap-3">
              {/* Currency selector */}
              <div className="relative">
                <select
                  value={selectedCurrency}
                  onChange={(e) => setSelectedCurrency(e.target.value)}
                  className="w-full appearance-none bg-white/15 border-2 border-white/30 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-white cursor-pointer pr-8 font-bold"
                >
                  {Object.entries(currencyConfig as Record<string, any>).map(([code, cfg]) => (
                    <option key={code} value={code} className="bg-[#8b5cf6] text-white">
                      {cfg.symbol} {cfg.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 pointer-events-none" />
              </div>

              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="bg-white/15 border-2 border-white/30 text-white placeholder-white/50 rounded-lg px-4 py-2 w-full focus:outline-none focus:border-white font-bold"
                placeholder="Tokens to withdraw"
                min="1"
              />
              <button
                onClick={handleWithdraw}
                disabled={isProcessing || walletMismatch}
                title={walletMismatch ? "Switch MetaMask to your registered wallet first" : undefined}
                className="bg-white text-[#8b5cf6] hover:bg-[#F5F0E8] px-6 py-3 rounded-lg font-black uppercase tracking-wider transition-all flex justify-center items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] hover:shadow-[1px_1px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px]"
              >
                {isProcessing ? "Processing…" : "Trigger Razorpay Payout"}
                <ArrowRightCircle className="w-5 h-5" />
              </button>
            </div>
            {withdrawAmount && !walletMismatch && (
              <p className="text-xs text-white/80 mt-3 flex justify-between gap-1 font-bold">
                <span>1 Token = {currencyCfg.symbol}{currencyCfg.rate} {selectedCurrency}</span>
                <span className="font-black text-white">
                  Payout: {currencyCfg.symbol}{fiatPayout.toLocaleString()} {selectedCurrency}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Active Assignments */}
        <div className="md:col-span-2 glass-card rounded-xl p-8 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-[#E8EAF6] border-2 border-[#3D5AFE] p-2 rounded-lg text-[#3D5AFE]">
                <Briefcase className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-black text-text-primary tracking-tight uppercase">Active Assignments</h2>
            </div>
            <div className="bg-[#F5F0E8] text-[#4A4A68] px-3 py-1 rounded-lg text-xs font-black border-2 border-[#1A1A2E] uppercase tracking-wider">
              {dbProjects.filter((p) => p.status !== "completed").length} Active
            </div>
          </div>

          <div className="space-y-4 overflow-y-auto max-h-[360px] pr-2">
            {dbProjects.filter((p) => p.status !== "completed").length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-muted gap-3 border-3 border-dashed border-[#1A1A2E] rounded-xl">
                <CheckCircle className="w-8 h-8 text-[#B0B0CC]" />
                <p className="font-black uppercase tracking-wider">No active assignments pending your completion.</p>
              </div>
            ) : (
              dbProjects
                .filter((p) => p.status !== "completed")
                .map((proj) => {
                  const total = proj.milestones.length;
                  const done = proj.milestones.filter((m) => m.status === "completed").length;
                  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
                  const onChainJob = proj.onChainId !== null
                    ? activeJobs.find((j: any) => j.index === proj.onChainId) ?? null
                    : null;
                  const released  = onChainJob ? parseFloat(formatEther(onChainJob.releasedAmount as bigint)) : 0;
                  const remaining = onChainJob ? parseFloat(formatEther((onChainJob.amount as bigint) - (onChainJob.releasedAmount as bigint))) : 0;
                  const pct = onChainJob && (onChainJob.amount as bigint) > BigInt(0)
                    ? Math.round((Number(onChainJob.releasedAmount) / Number(onChainJob.amount)) * 100)
                    : 0;

                  return (
                    <div
                      key={proj.id}
                      className="flex flex-col gap-3 p-5 rounded-xl border-3 border-[#1A1A2E] bg-white hover:bg-[#F5F0E8] hover:shadow-[4px_4px_0px_#3D5AFE] transition-all shadow-[3px_3px_0px_#1A1A2E]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1 pr-3">
                          <span className="font-black text-text-primary text-base flex items-center gap-2 truncate">
                            {proj.name}
                            <span className="bg-[#FFF8E1] text-[#F9A825] text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded-lg border-2 border-[#FFD600] shrink-0">
                              Active
                            </span>
                          </span>
                          <p className="text-xs text-text-muted truncate mt-0.5 font-bold">{proj.description}</p>
                        </div>
                        {onChainJob ? (
                          <button
                            onClick={() => handleClaim(onChainJob.index)}
                            disabled={walletMismatch}
                            title={walletMismatch ? "Switch to registered wallet first" : undefined}
                            className="bg-[#3D5AFE] hover:bg-[#304FFE] text-white px-4 py-2 rounded-lg font-black uppercase tracking-wider text-sm whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] hover:shadow-[1px_1px_0px_#1A1A2E] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                          >
                            Complete & Claim
                          </button>
                        ) : (
                          <Link
                            href={`/client/projects/${proj.id}`}
                            className="flex items-center gap-1.5 text-xs font-black text-[#3D5AFE] hover:text-[#304FFE] bg-[#E8EAF6] hover:bg-[#C5CAE9] border-2 border-[#3D5AFE] px-3 py-2 rounded-lg transition-all shrink-0 uppercase tracking-wider"
                          >
                            View Project <ArrowRight size={12} />
                          </Link>
                        )}
                      </div>

                      {/* Milestone progress */}
                      <div>
                        <div className="flex justify-between text-xs text-text-muted mb-1 font-bold">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 size={10} className="text-[#00C853]" />
                            {done}/{total} milestones
                          </span>
                          <span className="font-black">{progress}%</span>
                        </div>
                        <div className="h-2 bg-[#F5F0E8] border border-[#1A1A2E] rounded-sm overflow-hidden">
                          <div
                            className="h-full bg-[#3D5AFE] rounded-sm transition-all duration-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {/* On-chain payment info */}
                      {onChainJob && (
                        <div>
                          <div className="flex justify-between text-xs text-text-muted mb-1 font-bold">
                            <span>{released.toFixed(2)} tokens received</span>
                            <span className="font-black">{pct}% released</span>
                          </div>
                          <div className="h-2 bg-[#F5F0E8] border border-[#1A1A2E] rounded-sm overflow-hidden">
                            <div
                              className="h-full bg-[#00C853] rounded-sm transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs mt-1">
                            <span className="text-[#00C853] font-black">+{released.toFixed(2)} earned</span>
                            <span className="text-[#3D5AFE] font-black">{remaining.toFixed(2)} remaining in escrow</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>

      {/* ── Disputes & Revisions Widget ── */}
      {pendingRevisions.length > 0 && (
        <div className="glass-card rounded-xl p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="bg-[#FCE4EC] border-2 border-[#FF1744] p-2 rounded-lg text-[#FF1744]">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-text-primary uppercase tracking-wide">Disputes &amp; Revisions</h2>
              <p className="text-xs text-text-muted mt-0.5 font-bold">Active feedback from your clients</p>
            </div>
            {pendingRevisions.filter((d) => d.status === "open").length > 0 && (
              <div className="ml-auto bg-[#FCE4EC] text-[#FF1744] text-xs font-black px-3 py-1 rounded-lg border-2 border-[#FF1744] uppercase tracking-wider">
                {pendingRevisions.filter((d) => d.status === "open").length} Open
              </div>
            )}
          </div>

          <div className="space-y-3">
            {pendingRevisions.map((d) => (
              <div key={d.id} className={`rounded-xl border-3 p-4 ${
                d.status === "resolved"
                  ? d.outcome === "for_worker"
                    ? "bg-[#E8F5E9] border-[#00C853]"
                    : "bg-[#FCE4EC] border-[#FF1744]"
                  : "bg-[#FFF8E1] border-[#FFD600]"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border-2 ${
                      d.type === "dispute"
                        ? "text-[#FF1744] bg-white border-[#FF1744]"
                        : "text-[#F9A825] bg-white border-[#FFD600]"
                    }`}>{d.type}</span>
                    <span className="text-sm font-black text-text-primary">{d.project?.name}</span>
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg ${
                    d.status === "open" ? "text-[#F9A825]" : "text-[#00C853]"
                  }`}>{d.status}</span>
                </div>
                <p className="text-xs text-text-muted font-bold">
                  Raised by {d.raisedByClient?.name} on {new Date(d.createdAt).toLocaleDateString()}
                </p>
                {d.status === "resolved" && (
                  <p className={`text-xs font-black mt-2 ${d.outcome === "for_worker" ? "text-[#00C853]" : "text-[#FF1744]"}`}>
                    {d.outcome === "for_worker"
                      ? "Resolved in your favor — project proceeds"
                      : "Resolved against you — reputation adjusted"}
                    {d.resolutionText && `: ${d.resolutionText}`}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
