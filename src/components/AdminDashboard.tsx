"use client";

import { useState, useEffect } from "react";
import { useReadContract, useWatchContractEvent, usePublicClient } from "wagmi";
import { formatEther, parseAbiItem } from "viem";
import { Activity, Database, Zap, PieChart as PieChartIcon, Info, X } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import EscrowABI from "@/lib/abi/CrossBorderEscrow.json";
import USDTABI from "@/lib/abi/MockUSDT.json";

const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}`;
const USDT_ADDRESS = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}`;

type NetworkEvent = {
  hash: string;
  action: string;
  from: string;
  to: string;
  amount: string;
  timestamp: string;
};

export default function AdminDashboard() {
  const [events, setEvents] = useState<NetworkEvent[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1, INR: 92, EUR: 0.92, GBP: 0.79 });
  const [activePool, setActivePool] = useState<number | null>(null);
  const publicClient = usePublicClient();

  const { data: totalSupply } = useReadContract({
    address: USDT_ADDRESS,
    abi: USDTABI,
    functionName: "totalSupply",
  });

  const pushEvent = (newEvent: NetworkEvent) => {
    setEvents(prev => {
      if (prev.some(e => e.hash === newEvent.hash && e.action === newEvent.action)) return prev;
      return [newEvent, ...prev].slice(0, 50);
    }); 
  };

  useEffect(() => {
    axios.get("https://open.er-api.com/v6/latest/USD")
       .then(res => res.data?.rates && setRates(res.data.rates))
       .catch(err => console.error("Failed to fetch rates:", err));

    const fetchPastEvents = async () => {
      if (!publicClient) return;
      try {
        const transfers = await publicClient.getLogs({
          address: USDT_ADDRESS,
          event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
          fromBlock: 'earliest'
        });
        const projects = await publicClient.getLogs({
          address: ESCROW_ADDRESS,
          event: parseAbiItem('event ProjectCreated(uint256 indexed projectId, address indexed client, address indexed worker, uint256 amount)'),
          fromBlock: 'earliest'
        });
        const releases = await publicClient.getLogs({
          address: ESCROW_ADDRESS,
          event: parseAbiItem('event PaymentReleased(uint256 indexed projectId, address indexed client, address indexed worker, uint256 amount)'),
          fromBlock: 'earliest'
        });
        const burns = await publicClient.getLogs({
          address: ESCROW_ADDRESS,
          event: parseAbiItem('event TokensBurned(address indexed user, uint256 amount)'),
          fromBlock: 'earliest'
        });

        transfers.forEach(log => pushEvent({ hash: log.transactionHash, action: "Token Transfer", from: log.args.from as string, to: log.args.to as string, amount: formatEther(log.args.value || BigInt(0)), timestamp: new Date().toLocaleTimeString() }));
        projects.forEach(log => pushEvent({ hash: log.transactionHash, action: `Project Created #${log.args.projectId}`, from: log.args.client as string, to: log.args.worker as string, amount: formatEther(log.args.amount || BigInt(0)), timestamp: new Date().toLocaleTimeString() }));
        releases.forEach(log => pushEvent({ hash: log.transactionHash, action: `Payment Released #${log.args.projectId}`, from: log.args.client as string, to: log.args.worker as string, amount: formatEther(log.args.amount || BigInt(0)), timestamp: new Date().toLocaleTimeString() }));
        burns.forEach(log => pushEvent({ hash: log.transactionHash, action: "Worker Withdrew INR", from: log.args.user as string, to: "0x0000000000000000000000000000000000000000", amount: formatEther(log.args.amount || BigInt(0)), timestamp: new Date().toLocaleTimeString() }));
      } catch (err) {
        console.error("Failed to load historical events:", err);
      }
    };
    fetchPastEvents();
  }, [publicClient]);

  useWatchContractEvent({
    address: USDT_ADDRESS,
    abi: USDTABI,
    eventName: "Transfer",
    onLogs(logs: any[]) {
      logs.forEach(log => {
        pushEvent({
          hash: log.transactionHash,
          action: "Token Transfer",
          from: log.args.from,
          to: log.args.to,
          amount: formatEther(log.args.value || BigInt(0)),
          timestamp: new Date().toLocaleTimeString(),
        });
      });
    },
  });

  useWatchContractEvent({
    address: ESCROW_ADDRESS,
    abi: EscrowABI,
    eventName: "ProjectCreated",
    onLogs(logs: any[]) {
      logs.forEach(log => {
        pushEvent({
          hash: log.transactionHash,
          action: `Project Created #${log.args.projectId}`,
          from: log.args.client,
          to: log.args.worker,
          amount: formatEther(log.args.amount || BigInt(0)),
          timestamp: new Date().toLocaleTimeString(),
        });
      });
    },
  });

  useWatchContractEvent({
    address: ESCROW_ADDRESS,
    abi: EscrowABI,
    eventName: "PaymentReleased",
    onLogs(logs: any[]) {
      logs.forEach(log => {
        pushEvent({
          hash: log.transactionHash,
          action: `Payment Released #${log.args.projectId}`,
          from: log.args.client,
          to: log.args.worker,
          amount: formatEther(log.args.amount || BigInt(0)),
          timestamp: new Date().toLocaleTimeString(),
        });
      });
    },
  });

  useWatchContractEvent({
    address: ESCROW_ADDRESS,
    abi: EscrowABI,
    eventName: "TokensBurned",
    onLogs(logs: any[]) {
      logs.forEach(log => {
        pushEvent({
          hash: log.transactionHash,
          action: "Worker Withdrew INR",
          from: log.args.user,
          to: "0x0000000000000000000000000000000000000000",
          amount: formatEther(log.args.amount || BigInt(0)),
          timestamp: new Date().toLocaleTimeString(),
        });
      });
    },
  });

  const parsedSupply = totalSupply ? parseFloat(formatEther(totalSupply as bigint)) : 0;

  const chartData = [
    { name: 'USD Equivalent', value: parsedSupply, color: '#10b981', symbol: '$', code: 'USD', desc: 'Base fiat pool fully collateralizing the USDT minted. Held in Nexus global accounts.' }, 
    { name: 'EUR Liability', value: parsedSupply * rates.EUR, color: '#3b82f6', symbol: '€', code: 'EUR', desc: 'Real-time equivalent debt if total reserves were demanded in Euros.' }, 
    { name: 'GBP Liability', value: parsedSupply * rates.GBP, color: '#f59e0b', symbol: '£', code: 'GBP', desc: 'Real-time equivalent debt if total reserves were demanded in Great British Pounds.' }, 
    { name: 'INR Payout', value: parsedSupply * rates.INR, color: '#8b5cf6', symbol: '₹', code: 'INR', desc: 'Simulated Razorpay payout capacity to Indian worker bank accounts.' }, 
  ];

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin Overview</h1>
          <p className="text-slate-500 mt-1 text-sm">System-wide transparency, liquidity tracking & live explorer</p>
        </div>
        <div className="bg-emerald-50 text-emerald-700 px-4 py-2 font-mono text-sm uppercase tracking-widest font-bold rounded-lg flex items-center gap-2 border border-emerald-200">
          <Zap className="w-4 h-4" /> Live Node
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-emerald-600 to-teal-800 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col h-full gap-8">
            <h2 className="text-lg font-bold flex items-center gap-2 text-emerald-100 uppercase tracking-widest">
              <Database className="w-5 h-5" /> MockUSDT Supply
            </h2>
            
            <div className="flex justify-between items-end">
               <div>
                 <p className="text-5xl font-extrabold font-mono tracking-tighter">
                   {parsedSupply.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                 </p>
                 <p className="text-emerald-200 mt-2 font-medium">Total Tokens Minted</p>
               </div>
            </div>

            <div className="bg-white/10 p-5 rounded-2xl backdrop-blur-md border border-white/20 mt-auto flex-1 flex flex-col">
              <div className="flex justify-between text-sm mb-4 text-emerald-50">
                <span className="flex items-center gap-2"><PieChartIcon className="w-4 h-4"/> Global Liquidity Pools</span>
                <span className="font-bold">Real-time Fiat Value</span>
              </div>
              
              {parsedSupply > 0 ? (
                <>
                  <div className="h-48 w-full relative -ml-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={5}
                          dataKey="value"
                          onClick={(data, index) => setActivePool(activePool === index ? null : index)}
                          className="cursor-pointer outline-none"
                        >
                          {chartData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.color} 
                              stroke="rgba(255,255,255,0.2)" 
                              className="transition-all duration-300 hover:opacity-80 drop-shadow-md"
                              style={{
                                filter: activePool === index ? 'drop-shadow(0 0 8px rgba(255,255,255,0.5))' : 'none',
                                transform: activePool === index ? 'scale(1.05)' : 'scale(1)',
                                transformOrigin: 'center'
                              }}
                            />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: any, name: any) => [
                            (String(name).includes('INR') ? '₹' : String(name).includes('EUR') ? '€' : String(name).includes('GBP') ? '£' : '$') + 
                            Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 
                            name
                          ]}
                          contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          itemStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                        />
                        <Legend 
                          layout="vertical" 
                          verticalAlign="middle" 
                          align="right"
                          wrapperStyle={{ fontSize: '10px', color: '#ecfdf5', fontWeight: 'bold' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <AnimatePresence>
                    {activePool !== null && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        className="overflow-hidden"
                      >
                        <div 
                          className="bg-white/10 rounded-xl p-4 border relative" 
                          style={{ borderColor: chartData[activePool].color + '40' }}
                        >
                          <button 
                            onClick={() => setActivePool(null)}
                            className="absolute top-2 right-2 text-white/50 hover:text-white transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: chartData[activePool].color }} />
                            <h4 className="font-bold text-white tracking-wide">
                              {chartData[activePool].name}
                            </h4>
                          </div>
                          <p className="text-3xl font-mono font-bold text-white mb-2">
                            {chartData[activePool].symbol}{chartData[activePool].value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-white/70 flex items-start gap-1.5 leading-relaxed">
                            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            {chartData[activePool].desc}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <div className="h-48 w-full flex items-center justify-center border border-dashed border-emerald-400/30 rounded-xl">
                  <p className="text-emerald-200 text-sm font-medium">No liquidity in pools yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-slate-100 p-2 rounded-xl text-slate-700">
              <Activity className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Network Explorer</h2>
            <div className="ml-auto flex items-center gap-2">
               <span className="relative flex h-3 w-3">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
               </span>
               <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Listening</span>
            </div>
          </div>

          <div className="flex-1 border rounded-2xl overflow-hidden bg-slate-50 flex flex-col">
            <div className="grid grid-cols-5 bg-white border-b py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <div className="col-span-1">Action</div>
              <div className="col-span-1">Amount</div>
              <div className="col-span-2">Addresses (From &rarr; To)</div>
              <div className="col-span-1 text-right">Time</div>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[300px] p-2 space-y-2">
              {events.length === 0 ? (
                 <div className="h-full flex items-center justify-center text-slate-400 text-sm py-12">
                   Waiting for on-chain events...
                 </div>
              ) : (
                events.map((ev, i) => (
                  <div key={i} className="grid grid-cols-5 items-center bg-white border border-slate-100 rounded-xl p-3 text-sm hover:shadow-md transition-shadow">
                    <div className="col-span-1 font-semibold text-slate-800 truncate pr-2">
                      {ev.action}
                    </div>
                    <div className="col-span-1 font-bold font-mono text-emerald-600">
                      {parseFloat(ev.amount).toFixed(2)}
                    </div>
                    <div className="col-span-2 flex flex-col gap-1 pr-2 font-mono text-[10px] text-slate-500">
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded w-fit truncate" title={ev.from}>F: {ev.from.slice(0,8)}...</span>
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded w-fit truncate" title={ev.to}>T: {ev.to.slice(0,8)}...</span>
                    </div>
                    <div className="col-span-1 text-right text-xs text-slate-400 whitespace-nowrap">
                      {ev.timestamp}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
