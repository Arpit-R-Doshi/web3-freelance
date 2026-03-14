"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { User, Briefcase, Shield, ArrowRight, Loader2, ScanFace, CheckCircle } from "lucide-react";
import ConnectWallet from "@/components/ConnectWallet";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export default function Home() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  
  const [isMounted, setIsMounted] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"client" | "worker" | "admin" | "">("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isVerifyingKYC, setIsVerifyingKYC] = useState(false);
  const [kycStatus, setKycStatus] = useState<"scanning" | "analyzing" | "success" | "">("");
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && isConnected && address) {
      // Check if user exists in local registry
      const registryStr = localStorage.getItem("nexus_registry");
      if (registryStr) {
        try {
          const registry = JSON.parse(registryStr);
          const userAccount = registry[address.toLowerCase()];
          
          if (userAccount && userAccount.role) {
            // User exists, route them automatically
            toast.success(`Welcome back, ${userAccount.name}! routing to ${userAccount.role} portal...`);
            router.push(`/${userAccount.role}`);
          }
        } catch (e) {
          console.error("Failed to parse registry", e);
        }
      }
    }
  }, [isMounted, isConnected, address, router]);

  const handleRegister = async () => {
    if (!name.trim()) return toast.error("Please enter your name");
    if (!role) return toast.error("Please select a role");
    if (!address) return toast.error("Please connect your wallet first");

    setIsRegistering(true);
    setIsVerifyingKYC(true);
    setKycStatus("scanning");

    try {
      // Save pending registration state for after the redirect
      localStorage.setItem("nexus_pending_registration", JSON.stringify({
        name: name.trim(),
        role: role
      }));

      const response = await fetch("/api/didit/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          address, 
          callback: window.location.origin + "/verify-success" 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create Didit session");
      }

      setKycStatus("analyzing");
      toast.success("Redirecting to Didit secure environment...");
      
      // Full page redirect to Didit (Bypasses Chrome Private Network Access blocks on iframes)
      setTimeout(() => {
        window.location.href = data.url;
      }, 800);

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Didit Identity Verification Failed");
      setIsRegistering(false);
      setIsVerifyingKYC(false);
      setKycStatus("");
      localStorage.removeItem("nexus_pending_registration");
    }
  };

  if (!isMounted) return null; // Avoid hydration mismatch

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 relative overflow-hidden p-6 z-0">
      {/* Background Decorators */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl -z-10 animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-400/20 rounded-full blur-3xl -z-10 animate-pulse delay-1000"></div>

      <div className="w-full max-w-md bg-white/80 backdrop-blur-xl border border-slate-100 p-8 rounded-3xl shadow-2xl relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-blue-500/30 mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Nexus Global
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            The next-generation decentralized freelance protocol.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {!isConnected ? (
            <motion.div 
              key="connect"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center gap-6 py-6"
            >
              <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl text-center w-full">
                <Shield className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                <h3 className="font-bold text-slate-700 mb-1">Authentication Required</h3>
                <p className="text-sm text-slate-500 mb-5">
                  Please connect your Web3 wallet to access the platform.
                </p>
                <div className="flex justify-center flex-col items-center isolate">
                  <ConnectWallet />
                </div>
              </div>
            </motion.div>
          ) : isVerifyingKYC ? (
            <motion.div 
              key="kyc"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center py-4 text-center w-full"
            >
              <>
                <div className="relative w-24 h-24 mb-6 mt-8">
                  <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ScanFace className={`w-10 h-10 ${kycStatus === 'analyzing' ? 'text-blue-600 animate-pulse' : 'text-slate-400'}`} />
                  </div>
                </div>
                
                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  Initializing Didit...
                </h3>
                <p className="text-sm text-slate-500 max-w-[250px] mx-auto mb-8">
                  Routing you to our secure ID verification partner.
                </p>
              </>
            </motion.div>
          ) : (
            <motion.div 
              key="register"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-5"
            >
              <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 flex items-center justify-between">
                 <div className="flex flex-col flex-1 pl-2">
                   <span className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-0.5">Wallet Connected</span>
                   <span className="text-sm font-mono font-medium text-slate-800">{address?.slice(0,6)}...{address?.slice(-4)}</span>
                 </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">Full Name</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-medium"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">Select Role</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setRole("client")}
                      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${role === 'client' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'}`}
                    >
                      <User size={24} className={role === 'client' ? 'text-blue-600' : ''} />
                      <span className="font-bold text-sm">Client</span>
                    </button>
                    <button 
                      onClick={() => setRole("worker")}
                      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${role === 'worker' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'}`}
                    >
                      <Briefcase size={24} className={role === 'worker' ? 'text-indigo-600' : ''} />
                      <span className="font-bold text-sm">Worker</span>
                    </button>
                  </div>
                  {/* Secret Admin Override Option */}
                  <div className="mt-3 flex justify-end">
                    <button 
                      onClick={() => setRole("admin")} 
                      className={`text-xs font-bold transition-colors ${role === 'admin' ? 'text-emerald-500' : 'text-slate-300 hover:text-slate-400'}`}
                    >
                      {role === 'admin' ? 'Admin Selected ✓' : 'Developer Admin'}
                    </button>
                  </div>
                </div>

                <button 
                  onClick={handleRegister}
                  disabled={isRegistering || !name || !role}
                  className="w-full bg-slate-900 hover:bg-black text-white rounded-xl py-3.5 font-bold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {isRegistering ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Setting up profile...</>
                  ) : (
                    <>Create Account <ArrowRight className="w-5 h-5" /></>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
      
      <p className="text-slate-400 text-xs mt-8 relative z-10 font-medium tracking-wide">
        Powered by Anvil & Next.js
      </p>
    </main>
  );
}
