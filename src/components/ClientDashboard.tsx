"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { parseEther, formatEther } from "viem";
import { PlusCircle, Briefcase, Wallet } from "lucide-react";
import ConnectWallet from "./ConnectWallet";
import EscrowABI from "@/lib/abi/CrossBorderEscrow.json";
import USDTABI from "@/lib/abi/MockUSDT.json";
import axios from "axios";
import { toast } from "sonner";
import { parseError } from "@/lib/utils/error";

const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}`;
const USDT_ADDRESS = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}`;

const WORKERS = [
  { id: 1, name: "Ravi Shankar", role: "Full Stack Developer", address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", rate: 500 },
  { id: 2, name: "Priya Patel", role: "UI/UX Designer", address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", rate: 300 },
];

export default function ClientDashboard() {
  const { address } = useAccount();
  const [depositAmount, setDepositAmount] = useState("100");
  const [currency, setCurrency] = useState("USD");
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

  const equivalentUsd = depositAmount ? (Number(depositAmount) / (rates[currency] || 1)).toFixed(2) : "0.00";

  const { data: balanceData } = useReadContract({
    address: USDT_ADDRESS,
    abi: USDTABI,
    functionName: "balanceOf",
    args: [address],
    query: {
      enabled: !!address,
    }
  });

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

  const handleAddFunds = async () => {
    if (!address) return toast.error("Please connect wallet first");
    setIsProcessing(true);

    try {
      const { data: order } = await axios.post("/api/razorpay/order", { 
        amount: Number(depositAmount),
        currency: currency
      });

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_123",
        amount: order.amount,
        currency: order.currency,
        name: "Nexus Global",
        description: `Deposit ${currency} to Wallet`,
        order_id: order.id,
        handler: async function (response: any) {
          try {
            const verifyRes = await axios.post("/api/razorpay/verify", {
              ...response,
              userAddress: address,
              amountToMint: equivalentUsd
            });
            if (verifyRes.data.success) {
              toast.success("Successfully deposited funds and minted MockUSDT!");
              window.location.reload();
            }
          } catch (err) {
            console.error(err);
            toast.error("Verification failed");
          } finally {
            setIsProcessing(false);
          }
        },
        prefill: {
          name: "US Client",
          email: "client@nexusglobal.com",
        },
        theme: { color: "#2563EB" },
        modal: {
          ondismiss: function() {
            setIsProcessing(false);
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        setIsProcessing(false);
        toast.error(response.error.description);
      });
      rzp.open();

    } catch (err) {
      console.error(err);
      setIsProcessing(false);
      toast.error("Failed to initialize payment");
    }
  };

  const handleHire = async (worker: any) => {
    if (!address) return toast.error("Please connect wallet first");
    
    try {
      const amountInWei = parseEther(worker.rate.toString());

      if (!allowanceData || (allowanceData as bigint) < amountInWei) {
        const approveTx = await writeContractAsync({
          address: USDT_ADDRESS,
          abi: USDTABI,
          functionName: "approve",
          args: [ESCROW_ADDRESS, amountInWei]
        });
        toast.success(`Approval transaction sent. Please wait for it to confirm, then click Hire again.`);
        return;
      }

      const tx = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: EscrowABI,
        functionName: "createProject",
        args: [worker.address, amountInWei]
      });

      toast.success(`Project created successfully!`);
    } catch (err: any) {
      console.error(err);
      toast.error(parseError(err));
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Client Dashboard</h1>
          <p className="text-slate-500 mt-1 text-sm">Manage your cross-border projects and wallet</p>
        </div>
        <ConnectWallet />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
          
          <div className="flex justify-between items-start mb-8 relative z-10">
            <div>
              <p className="text-blue-100 font-medium text-sm mb-1 uppercase tracking-wider">Available Balance</p>
              <h2 className="text-5xl font-extrabold tracking-tight flex items-center gap-2">
                <span className="text-3xl opacity-80">$</span>
                {balanceData ? parseFloat(formatEther(balanceData as bigint)).toFixed(2) : "0.00"}
              </h2>
            </div>
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
              <Wallet className="w-6 h-6 text-white" />
            </div>
          </div>

          <div className="bg-white/10 rounded-2xl p-5 backdrop-blur-md border border-white/20 relative z-10">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <PlusCircle className="w-4 h-4" /> Add Funds via Razorpay
            </h3>
            <div className="flex gap-3 mb-3">
              <select 
                value={currency} 
                onChange={(e) => setCurrency(e.target.value)}
                className="bg-white/10 border border-white/20 text-white rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                <option value="USD" className="text-slate-800">USD</option>
                <option value="EUR" className="text-slate-800">EUR</option>
                <option value="GBP" className="text-slate-800">GBP</option>
                <option value="INR" className="text-slate-800">INR</option>
              </select>
              <input 
                type="number" 
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="bg-white/10 border border-white/20 text-white placeholder-white/50 rounded-xl px-4 py-2 w-full focus:outline-none focus:ring-2 focus:ring-white/50"
                placeholder={`Amount in ${currency}`}
              />
              <button 
                onClick={handleAddFunds}
                disabled={isProcessing}
                className="bg-white text-blue-700 hover:bg-blue-50 px-6 py-2 rounded-xl font-bold transition-colors whitespace-nowrap shadow-lg disabled:opacity-50"
              >
                {isProcessing ? "Processing..." : "Deposit"}
              </button>
            </div>
            <div className="text-xs text-blue-100 flex justify-between px-1">
              <span>Real-time Rate: 1 USD = {rates[currency]?.toFixed(2)} {currency}</span>
              <span className="font-bold tracking-wider">You receive: ${equivalentUsd} MockUSDT</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-100 p-2 rounded-xl text-emerald-600">
              <Briefcase className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Top Indian Talent</h2>
          </div>

          <div className="space-y-4 flex-1">
            {WORKERS.map((worker) => (
              <div key={worker.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <div className="flex flex-col">
                  <span className="font-bold text-slate-800">{worker.name}</span>
                  <span className="text-sm text-slate-500">{worker.role}</span>
                  <span className="text-xs text-slate-400 font-mono mt-1" title={worker.address}>
                    {worker.address.slice(0,6)}...{worker.address.slice(-4)}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-bold text-slate-700 bg-white px-3 py-1 rounded-lg border border-slate-100 shadow-sm">
                    ${worker.rate}
                  </span>
                  <button 
                    onClick={() => handleHire(worker)}
                    className="text-sm bg-slate-900 hover:bg-slate-800 text-white px-4 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    Hire Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
