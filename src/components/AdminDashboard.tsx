"use client";

import { useState, useEffect, useCallback } from "react";
import { useReadContract, useWatchContractEvent, usePublicClient } from "wagmi";
import { formatEther, parseAbiItem } from "viem";
import {
  Activity, Database, Zap, PieChart as PieChartIcon, Info, X,
  Download, Search, Filter, RefreshCw, TrendingUp, ChevronDown,
  Scale, CheckCircle2, AlertTriangle, ChevronUp,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, BarChart, Bar, ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import EscrowABI from "@/lib/abi/CrossBorderEscrow.json";
import USDTABI from "@/lib/abi/MockUSDT.json";

const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}`;
const USDT_ADDRESS = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}`;

const POOL_COLORS: Record<string, string> = {
  INR: "#8b5cf6", USD: "#00C853", EUR: "#3D5AFE", GBP: "#FFD600",
};
const POOL_SYMBOLS: Record<string, string> = {
  INR: "₹", USD: "$", EUR: "€", GBP: "£",
};
const CURRENCIES = ["INR", "USD", "EUR", "GBP"];
const ACTION_TYPES = ["All", "Token Transfer", "Project Created", "Payment Released", "Worker Withdrawal"];

type PoolData = { currency: string; totalDeposited: number; totalTokens: number };
type PoolSnapshot = { time: string; INR: number; USD: number; EUR: number; GBP: number };

type NetworkEvent = {
  hash: string;
  action: string;
  actionType: string;
  from: string;
  to: string;
  amount: string;
  timestamp: string;
};

type UserInfo = { walletAddress: string; name: string; role: string };

export default function AdminDashboard() {
  const [events, setEvents] = useState<NetworkEvent[]>([]);
  const [pools, setPools] = useState<PoolData[]>([]);
  const [poolHistory, setPoolHistory] = useState<PoolSnapshot[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserInfo>>({});
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1, INR: 83, EUR: 0.92, GBP: 0.79 });
  const [activePool, setActivePool] = useState<number | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("All");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Dispute jury
  const [disputes, setDisputes] = useState<any[]>([]);
  const [expandedDispute, setExpandedDispute] = useState<string | null>(null);
  const [voteReasons, setVoteReasons] = useState<Record<string, string>>({});
  const [votingId, setVotingId] = useState<string | null>(null);

  const publicClient = usePublicClient();

  const { data: totalSupply } = useReadContract({
    address: USDT_ADDRESS,
    abi: USDTABI,
    functionName: "totalSupply",
  });

  const pushEvent = useCallback((newEvent: NetworkEvent) => {
    setEvents(prev => {
      if (prev.some(e => e.hash === newEvent.hash && e.action === newEvent.action)) return prev;
      return [newEvent, ...prev].slice(0, 200);
    });
  }, []);

  const fetchPools = useCallback(async () => {
    try {
      const res = await axios.get("/api/liquidity");
      const poolsData: PoolData[] = res.data.pools;
      setPools(poolsData);
      const byCode = Object.fromEntries(poolsData.map(p => [p.currency, p.totalDeposited]));
      const snapshot: PoolSnapshot = {
        time: new Date().toLocaleTimeString(),
        INR: byCode.INR ?? 0,
        USD: byCode.USD ?? 0,
        EUR: byCode.EUR ?? 0,
        GBP: byCode.GBP ?? 0,
      };
      setPoolHistory(prev => [...prev.slice(-19), snapshot]);
    } catch (err) {
      console.error("Failed to fetch pool data:", err);
    }
  }, []);

  const fetchUserMap = useCallback(async () => {
    try {
      const res = await axios.get("/api/admin/users");
      const map: Record<string, UserInfo> = {};
      for (const u of (res.data.users ?? [])) {
        if (u.walletAddress) map[u.walletAddress.toLowerCase()] = u;
      }
      setUserMap(map);
    } catch (err) {
      console.error("Failed to fetch user map:", err);
    }
  }, []);

  const fetchDisputes = useCallback(async () => {
    try {
      const token = localStorage.getItem("wwt_token");
      const res = await axios.get("/api/disputes", { headers: { Authorization: `Bearer ${token}` } });
      setDisputes(res.data.disputes ?? []);
    } catch {
      // silently ignore — user may not be authed yet
    }
  }, []);

  const handleJuryVote = async (disputeId: string, vote: "for_client" | "for_worker") => {
    setVotingId(disputeId);
    try {
      const token = localStorage.getItem("wwt_token");
      const res = await axios.post(
        `/api/disputes/${disputeId}/vote`,
        { vote, reason: voteReasons[disputeId] ?? "" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.dispute) {
        setDisputes((prev) => prev.map((d) => d.id === disputeId ? res.data.dispute : d));
      }
    } catch (err: any) {
      console.error("Vote failed:", err?.response?.data?.error ?? err.message);
    } finally {
      setVotingId(null);
    }
  };

  useEffect(() => {
    axios.get("https://open.er-api.com/v6/latest/USD")
      .then(res => res.data?.rates && setRates(res.data.rates))
      .catch(() => {});
    fetchPools();
    fetchUserMap();
    fetchDisputes();
    const interval = setInterval(fetchPools, 30_000);
    return () => clearInterval(interval);
  }, [fetchPools, fetchUserMap, fetchDisputes]);

  useEffect(() => {
    if (!publicClient) return;
    const fetchPastEvents = async () => {
      try {
        const [transfers, projects, releases, burns] = await Promise.all([
          publicClient.getLogs({ address: USDT_ADDRESS, event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"), fromBlock: "earliest" }),
          publicClient.getLogs({ address: ESCROW_ADDRESS, event: parseAbiItem("event ProjectCreated(uint256 indexed projectId, address indexed client, address indexed worker, uint256 amount)"), fromBlock: "earliest" }),
          publicClient.getLogs({ address: ESCROW_ADDRESS, event: parseAbiItem("event PaymentReleased(uint256 indexed projectId, address indexed client, address indexed worker, uint256 amount)"), fromBlock: "earliest" }),
          publicClient.getLogs({ address: ESCROW_ADDRESS, event: parseAbiItem("event TokensBurned(address indexed user, uint256 amount)"), fromBlock: "earliest" }),
        ]);
        transfers.forEach(log => pushEvent({ hash: log.transactionHash, action: "Token Transfer", actionType: "Token Transfer", from: log.args.from as string, to: log.args.to as string, amount: formatEther(log.args.value || BigInt(0)), timestamp: new Date().toLocaleTimeString() }));
        projects.forEach(log => pushEvent({ hash: log.transactionHash, action: `Project Created #${log.args.projectId}`, actionType: "Project Created", from: log.args.client as string, to: log.args.worker as string, amount: formatEther(log.args.amount || BigInt(0)), timestamp: new Date().toLocaleTimeString() }));
        releases.forEach(log => pushEvent({ hash: log.transactionHash, action: `Payment Released #${log.args.projectId}`, actionType: "Payment Released", from: log.args.client as string, to: log.args.worker as string, amount: formatEther(log.args.amount || BigInt(0)), timestamp: new Date().toLocaleTimeString() }));
        burns.forEach(log => pushEvent({ hash: log.transactionHash, action: "Worker Withdrawal", actionType: "Worker Withdrawal", from: log.args.user as string, to: "0x0000000000000000000000000000000000000000", amount: formatEther(log.args.amount || BigInt(0)), timestamp: new Date().toLocaleTimeString() }));
      } catch (err) { console.error("Failed to load historical events:", err); }
    };
    fetchPastEvents();
  }, [publicClient, pushEvent]);

  useWatchContractEvent({
    address: USDT_ADDRESS, abi: USDTABI, eventName: "Transfer",
    onLogs(logs: any[]) {
      logs.forEach(log => pushEvent({ hash: log.transactionHash, action: "Token Transfer", actionType: "Token Transfer", from: log.args.from, to: log.args.to, amount: formatEther(log.args.value || BigInt(0)), timestamp: new Date().toLocaleTimeString() }));
    },
  });
  useWatchContractEvent({
    address: ESCROW_ADDRESS, abi: EscrowABI, eventName: "ProjectCreated",
    onLogs(logs: any[]) {
      logs.forEach(log => pushEvent({ hash: log.transactionHash, action: `Project Created #${log.args.projectId}`, actionType: "Project Created", from: log.args.client, to: log.args.worker, amount: formatEther(log.args.amount || BigInt(0)), timestamp: new Date().toLocaleTimeString() }));
    },
  });
  useWatchContractEvent({
    address: ESCROW_ADDRESS, abi: EscrowABI, eventName: "PaymentReleased",
    onLogs(logs: any[]) {
      logs.forEach(log => pushEvent({ hash: log.transactionHash, action: `Payment Released #${log.args.projectId}`, actionType: "Payment Released", from: log.args.client, to: log.args.worker, amount: formatEther(log.args.amount || BigInt(0)), timestamp: new Date().toLocaleTimeString() }));
    },
  });
  useWatchContractEvent({
    address: ESCROW_ADDRESS, abi: EscrowABI, eventName: "TokensBurned",
    onLogs(logs: any[]) {
      logs.forEach(log => pushEvent({ hash: log.transactionHash, action: "Worker Withdrawal", actionType: "Worker Withdrawal", from: log.args.user, to: "0x0000000000000000000000000000000000000000", amount: formatEther(log.args.amount || BigInt(0)), timestamp: new Date().toLocaleTimeString() }));
    },
  });

  const parsedSupply = totalSupply ? parseFloat(formatEther(totalSupply as bigint)) : 0;

  const pieData = [
    { name: "USD Equivalent", value: parsedSupply, color: "#00C853", symbol: "$", code: "USD", desc: "Base fiat pool fully collateralizing the USDT minted. Held in WeWorkTogether accounts." },
    { name: "EUR Liability", value: parsedSupply * rates.EUR, color: "#3D5AFE", symbol: "€", code: "EUR", desc: "Real-time equivalent debt if total reserves were demanded in Euros." },
    { name: "GBP Liability", value: parsedSupply * rates.GBP, color: "#FFD600", symbol: "£", code: "GBP", desc: "Real-time equivalent debt if total reserves were demanded in Great British Pounds." },
    { name: "INR Payout", value: parsedSupply * rates.INR, color: "#8b5cf6", symbol: "₹", code: "INR", desc: "Simulated Razorpay payout capacity to Indian worker bank accounts." },
  ];

  const getName = (addr: string) => userMap[addr.toLowerCase()]?.name ?? "";

  const filteredEvents = events.filter(ev => {
    const q = searchQuery.toLowerCase();
    if (q) {
      const fromName = getName(ev.from).toLowerCase();
      const toName = getName(ev.to).toLowerCase();
      const match = ev.from.toLowerCase().includes(q) || ev.to.toLowerCase().includes(q) || fromName.includes(q) || toName.includes(q);
      if (!match) return false;
    }
    if (actionFilter !== "All" && ev.actionType !== actionFilter) return false;
    const amt = parseFloat(ev.amount);
    if (minAmount && amt < parseFloat(minAmount)) return false;
    if (maxAmount && amt > parseFloat(maxAmount)) return false;
    return true;
  });

  const downloadAuditReport = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

    // ── NEO-BRUTALIST HEADER ──
    // Bold header band with thick border
    doc.setFillColor(26, 26, 46); // #1A1A2E
    doc.rect(0, 0, pageW, 32, "F");
    doc.setFillColor(0, 200, 83); // forex green
    doc.rect(0, 32, pageW, 4, "F");

    doc.setTextColor(255, 253, 245);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("WEWORKTOGETHER", 14, 14);
    doc.setFontSize(11);
    doc.setTextColor(140, 158, 255);
    doc.text("BLOCKCHAIN AUDIT REPORT", 14, 23);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 253, 245);
    doc.text(`Generated: ${dateStr} at ${timeStr}`, pageW - 14, 14, { align: "right" });
    doc.setFontSize(9);
    doc.setTextColor(176, 176, 204);
    doc.text(
      `${filteredEvents.length} transaction${filteredEvents.length !== 1 ? "s" : ""}${hasActiveFilters ? " (filtered)" : ""}`,
      pageW - 14, 23, { align: "right" }
    );

    // ── SUMMARY BOX — neo-brutalism with thick border ──
    doc.setFillColor(255, 253, 245);
    doc.setDrawColor(26, 26, 46);
    doc.setLineWidth(1);
    doc.roundedRect(14, 40, pageW - 28, 24, 2, 2, "FD");

    const summaryFields = [
      { label: "TOTAL TRANSACTIONS", value: String(filteredEvents.length), x: 20 },
      { label: "ACTION FILTER", value: actionFilter, x: 80 },
      { label: "AMOUNT RANGE", value: minAmount || maxAmount ? `${minAmount || "0"} – ${maxAmount || "∞"} USDT` : "All amounts", x: 150 },
      { label: "ADDRESS / NAME SEARCH", value: searchQuery || "None", x: 220 },
    ];
    summaryFields.forEach(({ label, value, x }) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(136, 136, 160);
      doc.text(label, x, 48);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(26, 26, 46);
      doc.text(value.length > 22 ? value.slice(0, 21) + "…" : value, x, 57);
    });

    // ── TABLE — clean grid with bold headers ──
    const tableRows = filteredEvents.map(ev => [
      ev.timestamp,
      ev.action,
      `${ev.from.slice(0, 12)}…${ev.from.slice(-6)}${getName(ev.from) ? `\n${getName(ev.from)}` : ""}`,
      `${ev.to.slice(0, 12)}…${ev.to.slice(-6)}${getName(ev.to) ? `\n${getName(ev.to)}` : ""}`,
      parseFloat(ev.amount).toFixed(4),
      `${ev.hash.slice(0, 14)}…${ev.hash.slice(-8)}`,
    ]);

    autoTable(doc, {
      startY: 68,
      head: [["Time", "Action", "From", "To", "Amount (USDT)", "Tx Hash"]],
      body: tableRows,
      theme: "grid",
      headStyles: {
        fillColor: [26, 26, 46],
        textColor: [255, 253, 245],
        fontStyle: "bold",
        fontSize: 9,
        cellPadding: 5,
        lineWidth: 0.5,
        lineColor: [26, 26, 46],
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [26, 26, 46],
        cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
        lineWidth: 0.5,
        lineColor: [26, 26, 46],
      },
      alternateRowStyles: { fillColor: [245, 240, 232] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 50 },
        2: { cellWidth: 52 },
        3: { cellWidth: 52 },
        4: { cellWidth: 26, halign: "right", fontStyle: "bold" },
        5: { cellWidth: 43, textColor: [136, 136, 160] },
      },
      margin: { left: 14, right: 14 },
    });

    // ── FOOTER — bold with forex green stripe ──
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(136, 136, 160);
      doc.text(
        `Page ${i} of ${totalPages}  ·  WeWorkTogether Audit Report  ·  ${dateStr}`,
        pageW / 2, pageH - 10, { align: "center" }
      );
      doc.setFillColor(0, 200, 83);
      doc.rect(0, pageH - 5, pageW, 5, "F");
      doc.setFillColor(26, 26, 46);
      doc.rect(0, pageH - 6, pageW, 1, "F");
    }

    doc.save(`wwt-audit-${now.toISOString().slice(0, 10)}.pdf`);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setActionFilter("All");
    setMinAmount("");
    setMaxAmount("");
  };
  const hasActiveFilters = searchQuery || actionFilter !== "All" || minAmount || maxAmount;

  // Pool totals for bar chart
  const poolBarData = CURRENCIES.map(c => {
    const p = pools.find(x => x.currency === c);
    return { currency: c, Deposited: p?.totalDeposited ?? 0, Tokens: p?.totalTokens ?? 0 };
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border-3 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E]">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#1A1A2E] uppercase">Admin Overview</h1>
          <p className="text-[#4A4A68] mt-1 text-sm font-bold">System-wide transparency, liquidity tracking & live explorer</p>
        </div>
        <div className="bg-[#E8F5E9] text-[#00C853] px-4 py-2 font-mono text-sm uppercase tracking-widest font-black rounded-lg flex items-center gap-2 border-3 border-[#00C853] shadow-[3px_3px_0px_#00C853]">
          <Zap className="w-4 h-4" /> Live Node
        </div>
      </div>

      {/* Section 1: Supply + Fiat Pie + Pool Balances */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* MockUSDT Supply + Pie */}
        <div className="bg-[#1A1A2E] rounded-xl p-8 text-white border-3 border-[#1A1A2E] shadow-[6px_6px_0px_#00C853] relative overflow-hidden">
          <div className="relative z-10 flex flex-col h-full gap-8">
            <h2 className="text-lg font-black flex items-center gap-2 text-[#00C853] uppercase tracking-widest">
              <Database className="w-5 h-5" /> MockUSDT Supply
            </h2>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-5xl font-black font-mono tracking-tighter">
                  {parsedSupply.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-[#8C9EFF] mt-2 font-bold uppercase tracking-wider">Total Tokens Minted</p>
              </div>
            </div>
            <div className="bg-white/10 p-5 rounded-xl border-2 border-white/20 mt-auto flex-1 flex flex-col">
              <div className="flex justify-between text-sm mb-4 text-white/80">
                <span className="flex items-center gap-2 font-bold uppercase tracking-wider"><PieChartIcon className="w-4 h-4" /> Global Liquidity Pools</span>
                <span className="font-black">Real-time Fiat Value</span>
              </div>
              {parsedSupply > 0 ? (
                <>
                  <div className="h-48 w-full relative -ml-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={5}
                          dataKey="value"
                          onClick={(_, index) => setActivePool(activePool === index ? null : index)}
                          className="cursor-pointer outline-none"
                        >
                          {pieData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.color}
                              stroke="#1A1A2E"
                              strokeWidth={2}
                              style={{
                                filter: activePool === index ? "drop-shadow(0 0 8px rgba(255,255,255,0.5))" : "none",
                                transform: activePool === index ? "scale(1.05)" : "scale(1)",
                                transformOrigin: "center",
                                transition: "all 0.3s",
                              }}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: any, name: any) => [
                            (String(name).includes("INR") ? "₹" : String(name).includes("EUR") ? "€" : String(name).includes("GBP") ? "£" : "$") +
                            Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                            name,
                          ]}
                          contentStyle={{ backgroundColor: "#FFFDF5", borderRadius: "8px", border: "3px solid #1A1A2E", boxShadow: "4px 4px 0px #1A1A2E", fontWeight: "bold" }}
                          itemStyle={{ color: "#1A1A2E", fontWeight: "bold" }}
                        />
                        <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: "10px", color: "#FFFDF5", fontWeight: "bold" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <AnimatePresence>
                    {activePool !== null && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: "auto", marginTop: 16 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="bg-white/10 rounded-xl p-4 border-2 relative" style={{ borderColor: pieData[activePool].color }}>
                          <button onClick={() => setActivePool(null)} className="absolute top-2 right-2 text-white/50 hover:text-white transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-4 h-4 rounded-none border-2 border-white/40" style={{ backgroundColor: pieData[activePool].color }} />
                            <h4 className="font-black text-white tracking-wide uppercase">{pieData[activePool].name}</h4>
                          </div>
                          <p className="text-3xl font-mono font-black text-white mb-2">
                            {pieData[activePool].symbol}{pieData[activePool].value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-white/70 flex items-start gap-1.5 leading-relaxed font-semibold">
                            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            {pieData[activePool].desc}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <div className="h-48 w-full flex items-center justify-center border-3 border-dashed border-white/20 rounded-xl">
                  <p className="text-white/60 text-sm font-bold uppercase tracking-wider">No liquidity in pools yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Per-pool balance cards */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-[#1A1A2E] flex items-center gap-2 uppercase tracking-wide">
              <TrendingUp className="w-5 h-5 text-[#3D5AFE]" /> Liquidity Pool Balances
            </h2>
            <button
              onClick={fetchPools}
              className="flex items-center gap-1.5 text-xs text-[#4A4A68] hover:text-[#1A1A2E] transition-colors bg-[#F5F0E8] hover:bg-[#E8EAF6] px-3 py-1.5 rounded-lg font-black uppercase tracking-wider border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] hover:shadow-[1px_1px_0px_#1A1A2E] hover:translate-x-[1px] hover:translate-y-[1px]"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {CURRENCIES.map(c => {
              const pool = pools.find(p => p.currency === c);
              return (
                <div key={c} className="bg-white rounded-xl border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-widest text-[#8888A0]">{c} Pool</span>
                    <span
                      className="w-3 h-3 border-2 border-[#1A1A2E]"
                      style={{ backgroundColor: POOL_COLORS[c] }}
                    />
                  </div>
                  <p className="text-2xl font-black font-mono text-[#1A1A2E]">
                    {POOL_SYMBOLS[c]}{(pool?.totalDeposited ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-[#8888A0] font-bold">
                    <span className="font-black text-[#4A4A68]">{(pool?.totalTokens ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT</span> issued
                  </p>
                </div>
              );
            })}
          </div>
          {/* Pool history area chart */}
          <div className="bg-white rounded-xl border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] p-4 flex-1">
            <p className="text-xs font-black text-[#8888A0] uppercase tracking-widest mb-3">Live Balance History</p>
            {poolHistory.length >= 1 ? (
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={poolHistory} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    {CURRENCIES.map(c => (
                      <linearGradient key={c} id={`grad-${c}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={POOL_COLORS[c]} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={POOL_COLORS[c]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E0DCD4" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#8888A0", fontWeight: 700 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#8888A0", fontWeight: 700 }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip
                    contentStyle={{ fontSize: "11px", borderRadius: "8px", border: "3px solid #1A1A2E", boxShadow: "3px 3px 0px #1A1A2E", fontWeight: "bold" }}
                    formatter={(value: any, name: any) => [`${POOL_SYMBOLS[name] ?? ""}${Number(value).toLocaleString()}`, name]}
                  />
                  {CURRENCIES.map(c => (
                    <Area key={c} type="monotone" dataKey={c} stroke={POOL_COLORS[c]} fill={`url(#grad-${c})`} strokeWidth={3} dot={false} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-36 flex items-center justify-center text-[#8888A0] text-sm font-bold uppercase tracking-wider">
                Polling pool data...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 2: Pool comparison bar chart */}
      <div className="bg-white rounded-xl border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] p-6">
        <h2 className="text-base font-black text-[#1A1A2E] mb-4 flex items-center gap-2 uppercase tracking-wide">
          <Activity className="w-4 h-4 text-[#3D5AFE]" /> Pool Comparison — Deposited vs Tokens Issued
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={poolBarData} margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E0DCD4" />
            <XAxis dataKey="currency" tick={{ fontSize: 12, fill: "#1A1A2E", fontWeight: 800 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#8888A0", fontWeight: 700 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ fontSize: "12px", borderRadius: "8px", border: "3px solid #1A1A2E", boxShadow: "3px 3px 0px #1A1A2E", fontWeight: "bold" }} />
            <Legend wrapperStyle={{ fontSize: "12px", fontWeight: "bold" }} />
            <Bar dataKey="Deposited" radius={[4, 4, 0, 0]}>
              {poolBarData.map((entry) => (
                <Cell key={entry.currency} fill={POOL_COLORS[entry.currency]} />
              ))}
            </Bar>
            <Bar dataKey="Tokens" fill="#B0B0CC" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Section 3: Dispute Resolution Center */}
      <div className="bg-white rounded-xl border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="bg-[#FCE4EC] p-2 rounded-lg border-2 border-[#FF1744] text-[#FF1744]">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-[#1A1A2E] uppercase tracking-wide">Dispute Resolution Center</h2>
            <p className="text-xs text-[#8888A0] mt-0.5 font-bold">Review client disputes and revision requests. Your vote resolves immediately.</p>
          </div>
          {disputes.filter((d) => d.status === "open").length > 0 && (
            <div className="ml-auto bg-[#FCE4EC] text-[#FF1744] text-xs font-black px-3 py-1 rounded-lg border-2 border-[#FF1744] uppercase tracking-wider">
              {disputes.filter((d) => d.status === "open").length} Open
            </div>
          )}
        </div>

        {disputes.length === 0 ? (
          <div className="text-center py-10 text-[#8888A0]">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-[#B0B0CC]" />
            <p className="font-black uppercase tracking-wider">No disputes yet</p>
            <p className="text-xs mt-1 font-bold">Disputes and revision requests will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {disputes.map((d) => (
              <div key={d.id} className={`rounded-xl border-3 p-5 transition-all ${
                d.status === "resolved"
                  ? "bg-[#F5F0E8] border-[#1A1A2E]"
                  : d.type === "dispute"
                  ? "bg-[#FCE4EC] border-[#FF1744]"
                  : "bg-[#FFF8E1] border-[#FFD600]"
              }`}>
                {/* Card header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border-2 ${
                      d.type === "dispute"
                        ? "bg-white text-[#FF1744] border-[#FF1744]"
                        : "bg-white text-[#F9A825] border-[#FFD600]"
                    }`}>{d.type}</span>
                    <span className="font-black text-[#1A1A2E] text-sm">{d.project?.name}</span>
                    {d.status === "resolved" && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-lg font-black border-2 ${
                        d.outcome === "for_client"
                          ? "bg-[#E8F5E9] text-[#00C853] border-[#00C853]"
                          : "bg-[#E8EAF6] text-[#3D5AFE] border-[#3D5AFE]"
                      }`}>
                        {d.outcome === "for_client" ? "Resolved: Client" : "Resolved: Worker"}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[#8888A0] shrink-0 font-bold">{new Date(d.createdAt).toLocaleDateString()}</span>
                </div>

                <p className="text-xs text-[#4A4A68] mb-3 font-bold">
                  Raised by <strong className="font-black">{d.raisedByClient?.name}</strong> · Workers:{" "}
                  {d.project?.workers?.map((w: any) => w.worker?.name).join(", ") || "—"}
                </p>

                {/* Toggle answers */}
                <button
                  onClick={() => setExpandedDispute(expandedDispute === d.id ? null : d.id)}
                  className="flex items-center gap-1.5 text-xs text-[#3D5AFE] hover:underline mb-3 font-black uppercase tracking-wider"
                >
                  {expandedDispute === d.id ? <><ChevronUp size={12} /> Hide answers</> : <><ChevronDown size={12} /> View questionnaire answers</>}
                </button>

                <AnimatePresence>
                  {expandedDispute === d.id && (
                    <motion.div
                      key="answers"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-white rounded-xl border-2 border-[#1A1A2E] p-4 mb-3 space-y-3 shadow-[2px_2px_0px_#1A1A2E]">
                        {Object.entries(JSON.parse(d.answers || "{}") as Record<string, string>).map(([key, val]) => (
                          <div key={key}>
                            <p className="text-[10px] font-black text-[#8888A0] uppercase tracking-wider">{key.replace(/_/g, " ")}</p>
                            <p className="text-sm text-[#1A1A2E] mt-0.5 font-semibold">{val || <span className="text-[#B0B0CC] italic">No answer</span>}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Vote tally */}
                <div className="flex items-center gap-3 text-xs mb-4">
                  <span className="text-[#00C853] font-black">
                    {d.votes?.filter((v: any) => v.vote === "for_client").length ?? 0} for client
                  </span>
                  <span className="text-[#B0B0CC] font-bold">|</span>
                  <span className="text-[#FF1744] font-black">
                    {d.votes?.filter((v: any) => v.vote === "for_worker").length ?? 0} for worker
                  </span>
                </div>

                {d.status === "open" ? (
                  <>
                    <textarea
                      value={voteReasons[d.id] ?? ""}
                      onChange={(e) => setVoteReasons((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      placeholder="Reason for your vote (optional)…"
                      rows={2}
                      className="w-full text-sm border-3 border-[#1A1A2E] rounded-xl px-3 py-2 mb-3 resize-none focus:outline-none focus:border-[#3D5AFE] focus:shadow-[3px_3px_0px_#3D5AFE] bg-white font-semibold transition-all"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleJuryVote(d.id, "for_client")}
                        disabled={votingId === d.id}
                        className="flex-1 py-2.5 rounded-xl bg-[#00C853] hover:bg-[#00E676] text-white text-sm font-black uppercase tracking-wider transition-all disabled:opacity-50 border-3 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] hover:shadow-[1px_1px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px]"
                      >
                        {votingId === d.id ? "Voting…" : "✓ Vote for Client"}
                      </button>
                      <button
                        onClick={() => handleJuryVote(d.id, "for_worker")}
                        disabled={votingId === d.id}
                        className="flex-1 py-2.5 rounded-xl bg-[#FF1744] hover:bg-[#FF5252] text-white text-sm font-black uppercase tracking-wider transition-all disabled:opacity-50 border-3 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] hover:shadow-[1px_1px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px]"
                      >
                        {votingId === d.id ? "Voting…" : "✓ Vote for Worker"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={`text-sm font-black px-4 py-2.5 rounded-xl inline-flex items-center gap-2 uppercase tracking-wider border-3 ${
                    d.outcome === "for_client"
                      ? "bg-[#E8F5E9] text-[#00C853] border-[#00C853]"
                      : "bg-[#E8EAF6] text-[#3D5AFE] border-[#3D5AFE]"
                  }`}>
                    <CheckCircle2 size={15} />
                    {d.outcome === "for_client" ? "Resolved in client's favor" : "Resolved in worker's favor"}
                    {d.resolutionText && <span className="font-bold normal-case"> — {d.resolutionText}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 4: Transaction Explorer */}
      <div className="bg-white rounded-xl border-3 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] p-6">
        {/* Explorer header */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-2">
            <div className="bg-[#E8EAF6] p-2 rounded-lg border-2 border-[#3D5AFE] text-[#3D5AFE]">
              <Activity className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-black text-[#1A1A2E] uppercase tracking-wide">Transaction Explorer</h2>
          </div>
          <div className="flex items-center gap-2 ml-1">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-[#00C853] opacity-75" />
              <span className="relative inline-flex h-3 w-3 bg-[#00C853] border border-[#1A1A2E]" />
            </span>
            <span className="text-xs text-[#4A4A68] font-black uppercase tracking-widest">Listening</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-[#4A4A68] font-bold">{filteredEvents.length} / {events.length} txns</span>
            <button
              onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg font-black uppercase tracking-wider border-3 transition-all ${showFilters || hasActiveFilters ? "bg-[#1A1A2E] text-white border-[#1A1A2E] shadow-[2px_2px_0px_#3D5AFE]" : "bg-white text-[#4A4A68] border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] hover:shadow-[1px_1px_0px_#1A1A2E] hover:translate-x-[1px] hover:translate-y-[1px]"}`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {hasActiveFilters && (
                <span className="bg-[#00C853] text-white text-xs rounded-md w-4 h-4 flex items-center justify-center leading-none border border-[#1A1A2E] font-black">!</span>
              )}
            </button>
            <button
              onClick={downloadAuditReport}
              className="flex items-center gap-1.5 text-sm bg-[#00C853] hover:bg-[#00E676] text-white px-3 py-2 rounded-lg font-black uppercase tracking-wider transition-all border-3 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] hover:shadow-[1px_1px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px]"
            >
              <Download className="w-4 h-4" />
              Download PDF Report
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: 20 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-[#F5F0E8] border-3 border-[#1A1A2E] rounded-xl p-4 flex flex-wrap gap-3 items-end shadow-[3px_3px_0px_#1A1A2E]">
                {/* Address / name search */}
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs font-black text-[#8888A0] uppercase tracking-wider mb-1.5 block">Address or Name</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8888A0]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="0x… or worker name"
                      className="w-full pl-9 pr-3 py-2 text-sm border-3 border-[#1A1A2E] rounded-lg bg-white focus:outline-none focus:border-[#3D5AFE] focus:shadow-[2px_2px_0px_#3D5AFE] font-bold transition-all"
                    />
                  </div>
                </div>

                {/* Action type */}
                <div className="min-w-[180px]">
                  <label className="text-xs font-black text-[#8888A0] uppercase tracking-wider mb-1.5 block">Action Type</label>
                  <div className="relative">
                    <select
                      value={actionFilter}
                      onChange={e => setActionFilter(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 text-sm border-3 border-[#1A1A2E] rounded-lg bg-white focus:outline-none focus:border-[#3D5AFE] focus:shadow-[2px_2px_0px_#3D5AFE] appearance-none font-bold transition-all"
                    >
                      {ACTION_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8888A0] pointer-events-none" />
                  </div>
                </div>

                {/* Amount range */}
                <div className="flex gap-2 items-end">
                  <div>
                    <label className="text-xs font-black text-[#8888A0] uppercase tracking-wider mb-1.5 block">Min USDT</label>
                    <input
                      type="number"
                      value={minAmount}
                      onChange={e => setMinAmount(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-24 px-3 py-2 text-sm border-3 border-[#1A1A2E] rounded-lg bg-white focus:outline-none focus:border-[#3D5AFE] focus:shadow-[2px_2px_0px_#3D5AFE] font-bold transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-[#8888A0] uppercase tracking-wider mb-1.5 block">Max USDT</label>
                    <input
                      type="number"
                      value={maxAmount}
                      onChange={e => setMaxAmount(e.target.value)}
                      placeholder="∞"
                      min="0"
                      className="w-24 px-3 py-2 text-sm border-3 border-[#1A1A2E] rounded-lg bg-white focus:outline-none focus:border-[#3D5AFE] focus:shadow-[2px_2px_0px_#3D5AFE] font-bold transition-all"
                    />
                  </div>
                </div>

                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1.5 text-sm text-[#FF1744] hover:text-[#D50000] font-black uppercase tracking-wider self-end mb-2"
                  >
                    <X className="w-3.5 h-3.5" /> Clear
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transaction table */}
        <div className="border-3 border-[#1A1A2E] rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 bg-[#1A1A2E] text-white py-3 px-4 text-xs font-black uppercase tracking-widest">
            <div className="col-span-2">Action</div>
            <div className="col-span-1 text-right">Amount</div>
            <div className="col-span-4">From</div>
            <div className="col-span-4">To</div>
            <div className="col-span-1 text-right">Time</div>
          </div>
          <div className="overflow-y-auto max-h-[420px] p-2 space-y-1.5 bg-[#FFFDF5]">
            {filteredEvents.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-[#8888A0] text-sm font-bold uppercase tracking-wider">
                {events.length === 0 ? "Waiting for on-chain events..." : "No transactions match your filters."}
              </div>
            ) : (
              filteredEvents.map((ev, i) => {
                const fromName = getName(ev.from);
                const toName = getName(ev.to);
                return (
                  <div key={i} className="grid grid-cols-12 items-center bg-white border-2 border-[#1A1A2E] rounded-lg px-4 py-3 text-sm hover:shadow-[3px_3px_0px_#1A1A2E] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all gap-1">
                    <div className="col-span-2 font-black text-[#1A1A2E] truncate pr-2 text-xs uppercase">
                      {ev.action}
                    </div>
                    <div className="col-span-1 font-black font-mono text-[#00C853] text-right text-xs">
                      {parseFloat(ev.amount).toFixed(2)}
                    </div>
                    <div className="col-span-4 pr-3">
                      <span className="font-mono text-[10px] text-[#4A4A68] bg-[#F5F0E8] border border-[#1A1A2E] px-1.5 py-0.5 rounded block truncate font-bold" title={ev.from}>
                        {ev.from.slice(0, 10)}…{ev.from.slice(-6)}
                      </span>
                      {fromName && (
                        <span className="text-[10px] text-[#8888A0] font-bold mt-0.5 block truncate">{fromName}</span>
                      )}
                    </div>
                    <div className="col-span-4 pr-3">
                      <span className="font-mono text-[10px] text-[#4A4A68] bg-[#F5F0E8] border border-[#1A1A2E] px-1.5 py-0.5 rounded block truncate font-bold" title={ev.to}>
                        {ev.to.slice(0, 10)}…{ev.to.slice(-6)}
                      </span>
                      {toName && (
                        <span className="text-[10px] text-[#8888A0] font-bold mt-0.5 block truncate">{toName}</span>
                      )}
                    </div>
                    <div className="col-span-1 text-right text-xs text-[#8888A0] whitespace-nowrap font-bold">
                      {ev.timestamp}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {filteredEvents.length > 0 && (
          <p className="text-xs text-[#8888A0] mt-3 text-right font-bold">
            Showing {filteredEvents.length} transaction{filteredEvents.length !== 1 ? "s" : ""}
            {hasActiveFilters ? " (filtered)" : ""}. Download as PDF for a full audit trail.
          </p>
        )}
      </div>
    </div>
  );
}
