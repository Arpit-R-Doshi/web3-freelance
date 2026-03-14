"use client";

import { useState, useMemo, useEffect } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { formatEther, parseEther } from "viem";
import { Briefcase, Landmark, Wallet, CheckCircle, ArrowRightCircle } from "lucide-react";
import ConnectWallet from "./ConnectWallet";
import EscrowABI from "@/lib/abi/CrossBorderEscrow.json";
import USDTABI from "@/lib/abi/MockUSDT.json";
import { toast } from "sonner";
import { parseError } from "@/lib/utils/error";
import axios from "axios";

const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}`;
const USDT_ADDRESS = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}`;

export default function WorkerDashboard() {
  const { address } = useAccount();
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1, INR: 92, EUR: 0.92, GBP: 0.79 });
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Fetch real-time exchange rates (Base: USD)
    axios.get("https://open.er-api.com/v6/latest/USD")
      .then(res => {
        if (res.data && res.data.rates) {
          setRates(res.data.rates);
        }
      })
      .catch(err => console.error("Failed to fetch rates:", err));
  }, []);

  const equivalentFiat = withdrawAmount ? (Number(withdrawAmount) * (rates[currency] || 1)).toFixed(2) : "0.00";

  const { data: balanceData } = useReadContract({
    address: USDT_ADDRESS,
    abi: USDTABI,
    functionName: "balanceOf",
    args: [address],
    query: {
      enabled: !!address,
    }
  });

  const { data: nextProjectId } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: EscrowABI,
    functionName: "nextProjectId",
  });

  const projectContracts = useMemo(() => {
    if (!nextProjectId) return [];
    
    const count = Number(nextProjectId as bigint);
    return Array.from({ length: count }).map((_, i) => ({
      address: ESCROW_ADDRESS,
      abi: EscrowABI as any,
      functionName: 'getProject',
      args: [BigInt(i)],
    }));
  }, [nextProjectId]);

  const { data: projectsData, refetch: refetchProjects } = useReadContracts({
    contracts: projectContracts,
    query: {
      enabled: projectContracts.length > 0,
    }
  });

  const activeJobs = useMemo(() => {
    if (!projectsData || !address) return [];
    return projectsData
      .map((res: any, index) => {
        if (!res.result) return null;
        const [client, worker, amount, isCompleted] = res.result;
        return { index, client, worker, amount, isCompleted };
      })
      .filter((project: any) => project && project.worker.toLowerCase() === address.toLowerCase() && !project.isCompleted);
  }, [projectsData, address]);

  const { data: allowanceData } = useReadContract({
    address: USDT_ADDRESS,
    abi: USDTABI,
    functionName: "allowance",
    args: [address, ESCROW_ADDRESS],
    query: {
      enabled: !!address,
    }
  });

  const { writeContractAsync } = useWriteContract();

  const handleClaim = async (projectId: number) => {
    if (!address) return toast.error("Please connect wallet first");
    
    try {
      const tx = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: EscrowABI,
        functionName: "releasePayment",
        args: [BigInt(projectId)]
      });
      toast.success(`Payment claimed successfully!`);
      refetchProjects();
    } catch (err: any) {
      console.error(err);
      toast.error(parseError(err));
    }
  };

  const handleWithdraw = async () => {
    if (!address || !withdrawAmount) return toast.error("Please enter amount and connect wallet");
    setIsProcessing(true);
    
    try {
      const amountInWei = parseEther(withdrawAmount.toString());

      if (!allowanceData || (allowanceData as bigint) < amountInWei) {
         await writeContractAsync({
           address: USDT_ADDRESS,
           abi: USDTABI,
           functionName: "approve",
           args: [ESCROW_ADDRESS, amountInWei]
         });
         toast.success("Approved. Please click Trigger Payout again after transaction confirms.");
         setIsProcessing(false);
         return;
      }

      const tx = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: EscrowABI,
        functionName: "burnAndWithdraw",
        args: [amountInWei]
      });

      const res = await axios.post("/api/razorpay/payout", {
        workerAddress: address,
        amount: Number(equivalentFiat),
        currency: currency
      });

      if (res.data.success) {
        toast.success(`Tokens burned. Real-time Razorpay payout of ${currency === "INR" ? "₹" : ""}${equivalentFiat} ${currency} triggered to your bank account!`);
      } else {
        throw new Error(res.data.error || "Payout route failed");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(parseError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Worker Dashboard</h1>
          <p className="text-slate-500 mt-1 text-sm">View assignments, claim escrow, and withdraw to INR</p>
        </div>
        <ConnectWallet />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[400px]">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col gap-6 flex-1">
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md self-start px-4 py-2 rounded-xl text-sm font-semibold border border-white/20 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Connected
            </div>
            
            <div className="mt-4">
              <p className="text-indigo-100 font-medium text-sm mb-1 uppercase tracking-wider">Withdrawable Balance</p>
              <h2 className="text-5xl font-extrabold tracking-tight flex items-center gap-2">
                <span className="text-3xl opacity-80">$</span>
                {balanceData ? parseFloat(formatEther(balanceData as bigint)).toFixed(2) : "0.00"}
              </h2>
            </div>
          </div>

          <div className="bg-white/10 rounded-2xl p-5 backdrop-blur-md border border-white/20 relative z-10 mt-6">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Landmark className="w-4 h-4" /> Withdraw to Local Bank
            </h3>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <select 
                  value={currency} 
                  onChange={(e) => setCurrency(e.target.value)}
                  className="bg-white/10 border border-white/20 text-white rounded-xl px-3 py-2 w-1/3 focus:outline-none focus:ring-2 focus:ring-white/50"
                >
                  <option value="INR" className="text-slate-800">INR</option>
                  <option value="USD" className="text-slate-800">USD</option>
                  <option value="EUR" className="text-slate-800">EUR</option>
                  <option value="GBP" className="text-slate-800">GBP</option>
                </select>
                <input 
                  type="number" 
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="bg-white/10 border border-white/20 text-white placeholder-white/50 rounded-xl px-4 py-2 w-full focus:outline-none focus:ring-2 focus:ring-white/50"
                  placeholder="USDT to Burn"
                />
              </div>
              <button 
                onClick={handleWithdraw}
                disabled={isProcessing}
                className="bg-white text-indigo-700 hover:bg-indigo-50 px-6 py-3 rounded-xl font-bold transition-all hover:-translate-y-0.5 whitespace-nowrap shadow-lg flex justify-center items-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? "Processing..." : "Trigger Razorpay Payout"} <ArrowRightCircle className="w-5 h-5" />
              </button>
            </div>
            {withdrawAmount && (
              <p className="text-xs text-indigo-100 mt-3 flex justify-between gap-1 opacity-80">
                <span>Rate: 1 USD = {rates[currency]?.toFixed(2)} {currency}</span>
                <span>Payout: <span className="font-bold text-white tracking-widest text-sm">{currency === 'INR' ? '₹' : ''}{equivalentFiat} {currency}</span></span>
              </p>
            )}
          </div>
        </div>

        <div className="md:col-span-2 bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-xl text-blue-600 shadow-inner">
                <Briefcase className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">Active Assignments</h2>
            </div>
            <div className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold border border-slate-200">
              {activeJobs.length} Pending
            </div>
          </div>

          <div className="space-y-4 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
            {activeJobs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-12 text-slate-400 gap-3 border-2 border-dashed border-slate-100 rounded-3xl">
                <CheckCircle className="w-8 h-8 text-slate-300" />
                <p>No active assignments pending your completion.</p>
              </div>
            ) : (
              activeJobs.map((job: any) => (
                <div key={job.index} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-white hover:shadow-md hover:border-blue-100 transition-all gap-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-800 text-lg flex items-center gap-2">
                       Project #{job.index}
                       <span className="bg-amber-100 text-amber-700 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ml-2 border border-amber-200">Funds Locked</span>
                    </span>
                    <span className="text-xs text-slate-500 font-mono mt-2 bg-slate-100 px-2 py-1 rounded w-fit">
                      Client: {job.client.slice(0,6)}...{job.client.slice(-4)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
                    <span className="text-2xl font-extrabold text-blue-600">
                      ${formatEther(job.amount)}
                    </span>
                    <button 
                      onClick={() => handleClaim(job.index)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-bold shadow transition-all hover:-translate-y-0.5 text-sm whitespace-nowrap border-b-4 border-blue-800 active:border-b-0 active:translate-y-1"
                    >
                      Complete & Claim
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
