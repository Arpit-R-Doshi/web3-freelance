"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import {
  User, Briefcase, ArrowRight, Loader2, ScanFace, LogIn,
  UserPlus, Eye, EyeOff, ShieldCheck, Zap, Globe,
} from "lucide-react";
import ConnectWallet from "@/components/ConnectWallet";
import WwtLogo from "@/components/WwtLogo";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { decodeToken } from "@/lib/auth-client";

export default function Home() {
  const { address, isConnected } = useAccount();
  const router = useRouter();

  const [isMounted, setIsMounted] = useState(false);
  const [mode, setMode] = useState<"register" | "login">("register");

  // Register state
  const [name, setName] = useState("");
  const [role, setRole] = useState<"client" | "worker" | "admin" | "">("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isVerifyingKYC, setIsVerifyingKYC] = useState(false);
  const [kycStatus, setKycStatus] = useState<"scanning" | "analyzing" | "">("");

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    if (!isMounted) return;
    const token = localStorage.getItem("wwt_token");
    if (token) {
      const payload = decodeToken(token);
      if (payload) {
        toast.success(`Welcome back, ${payload.name}!`);
        router.push(`/${payload.role}`);
        return;
      } else {
        localStorage.removeItem("wwt_token");
        localStorage.removeItem("wwt_user");
      }
    }
  }, [isMounted, router]);

  const handleRegister = async () => {
    if (!name.trim()) return toast.error("Please enter your name");
    if (!role) return toast.error("Please select a role");
    if (!address) return toast.error("Please connect your wallet first");

    setIsRegistering(true);
    setIsVerifyingKYC(true);
    setKycStatus("scanning");

    try {
      localStorage.setItem(
        "wwt_pending_registration",
        JSON.stringify({ name: name.trim(), role, walletAddress: address.toLowerCase() })
      );

      const response = await fetch("/api/didit/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, callback: window.location.origin + "/verify-success" }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create Didit session");

      setKycStatus("analyzing");
      toast.success("Redirecting to Didit secure environment...");
      setTimeout(() => { window.location.href = data.url; }, 800);
    } catch (err: any) {
      toast.error(err.message || "Didit Identity Verification Failed");
      setIsRegistering(false);
      setIsVerifyingKYC(false);
      setKycStatus("");
      localStorage.removeItem("wwt_pending_registration");
    }
  };

  const handleLogin = async () => {
    if (!loginEmail.trim()) return toast.error("Please enter your email");
    if (!loginPassword) return toast.error("Please enter your password");

    setIsLoggingIn(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      localStorage.setItem("wwt_token", data.token);
      localStorage.setItem("wwt_user", JSON.stringify(data.user));

      toast.success(`Welcome back, ${data.user.name}!`);
      setTimeout(() => router.push(`/${data.user.role}`), 500);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (!isMounted) return null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-page hero-glow relative overflow-hidden p-6">

      {/* Geometric background shapes */}
      <div className="absolute top-16 left-16 w-24 h-24 border-4 border-[#3D5AFE] rotate-12 -z-10 pointer-events-none opacity-20" />
      <div className="absolute bottom-24 right-20 w-32 h-32 border-4 border-[#00C853] -rotate-6 -z-10 pointer-events-none opacity-15" />
      <div className="absolute top-1/3 right-1/4 w-16 h-16 bg-[#FFD600] -z-10 pointer-events-none opacity-10 rotate-45" />
      <div className="absolute bottom-1/3 left-1/5 w-20 h-20 border-4 border-[#FF1744] -z-10 pointer-events-none opacity-10 rotate-12" />

      {/* Hero brand header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-8"
      >
        <div className="w-20 h-20 mx-auto mb-5 bg-[#3D5AFE] border-4 border-[#1A1A2E] rounded-2xl flex items-center justify-center shadow-[6px_6px_0px_#1A1A2E] relative">
          <WwtLogo className="w-11 h-11 text-white" />
        </div>

        <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-3 uppercase">
          <span className="text-text-primary">WeWork</span>
          <span className="gradient-text">Together</span>
        </h1>
        <p className="text-text-secondary text-base font-bold max-w-xs mx-auto leading-relaxed">
          Connect globally. Collaborate seamlessly.<br />
          Get paid securely.
        </p>
      </motion.div>

      {/* Feature pills */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex flex-wrap items-center justify-center gap-3 mb-8"
      >
        <span className="feature-pill"><ShieldCheck className="w-3.5 h-3.5 text-[#00C853]" /> KYC Verified</span>
        <span className="feature-pill"><Zap className="w-3.5 h-3.5 text-[#3D5AFE]" /> Smart Contract Escrow</span>
        <span className="feature-pill"><Globe className="w-3.5 h-3.5 text-[#FFD600]" /> Multi-Currency Payouts</span>
      </motion.div>

      {/* Auth card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="w-full max-w-lg glass-card rounded-2xl overflow-hidden"
      >
        {/* Tab bar */}
        {!isVerifyingKYC && (
          <div className="flex border-b-3 border-[#1A1A2E]">
            <button
              onClick={() => setMode("register")}
              className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-black uppercase tracking-wider transition-all relative ${
                mode === "register" ? "text-text-primary bg-[#E8EAF6]" : "text-text-muted hover:text-text-secondary hover:bg-[#F5F0E8]"
              }`}
            >
              <UserPlus size={15} /> Register
              {mode === "register" && (
                <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-1 bg-[#3D5AFE]" />
              )}
            </button>
            <button
              onClick={() => setMode("login")}
              className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-black uppercase tracking-wider transition-all relative border-l-3 border-[#1A1A2E] ${
                mode === "login" ? "text-text-primary bg-[#E8EAF6]" : "text-text-muted hover:text-text-secondary hover:bg-[#F5F0E8]"
              }`}
            >
              <LogIn size={15} /> Sign In
              {mode === "login" && (
                <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-1 bg-[#3D5AFE]" />
              )}
            </button>
          </div>
        )}

        <div className="p-7">
          <AnimatePresence mode="wait">

            {/* ── KYC Loading ── */}
            {isVerifyingKYC ? (
              <motion.div key="kyc" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                className="flex flex-col items-center py-8 text-center">
                <div className="relative w-24 h-24 mb-6">
                  <div className="absolute inset-0 border-4 border-[#1A1A2E] rounded-none" />
                  <div className="absolute inset-0 border-4 border-t-[#3D5AFE] border-r-[#00C853] border-b-transparent border-l-transparent animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ScanFace className={`w-10 h-10 ${kycStatus === "analyzing" ? "text-[#3D5AFE] animate-pulse" : "text-text-muted"}`} />
                  </div>
                </div>
                <h3 className="text-xl font-black text-text-primary mb-2 uppercase">Initializing Didit...</h3>
                <p className="text-sm text-text-secondary max-w-[240px] leading-relaxed font-semibold">
                  Routing you to our secure ID verification partner.
                </p>
              </motion.div>

            ) : mode === "login" ? (
              /* ── Login Form ── */
              <motion.div key="login" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-5">
                <div>
                  <label className="block text-xs font-black text-text-secondary uppercase tracking-wider mb-2">Email Address</label>
                  <input
                    type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    placeholder="you@example.com" className="glass-input w-full px-4 py-3.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-text-secondary uppercase tracking-wider mb-2">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"} value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                      placeholder="Enter your password" className="glass-input w-full px-4 py-3.5 pr-12 text-sm"
                    />
                    <button type="button" onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors">
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
                <button onClick={handleLogin} disabled={isLoggingIn}
                  className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 text-sm disabled:opacity-50">
                  {isLoggingIn ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
                </button>
                <p className="text-center text-xs text-text-muted pt-1 font-bold">
                  No account?{" "}
                  <button onClick={() => setMode("register")} className="text-[#3D5AFE] font-black hover:underline underline-offset-2">Create one</button>
                </p>
              </motion.div>

            ) : !isConnected ? (
              /* ── Connect Wallet ── */
              <motion.div key="connect" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="flex flex-col items-center gap-5 py-2">
                <div className="w-full bg-[#F5F0E8] border-3 border-[#1A1A2E] rounded-2xl p-6 text-center shadow-[4px_4px_0px_#1A1A2E]">
                  <div className="w-12 h-12 mx-auto mb-3 bg-[#E8EAF6] border-3 border-[#3D5AFE] rounded-xl flex items-center justify-center">
                    <WwtLogo className="w-7 h-7 text-[#3D5AFE]" />
                  </div>
                  <h3 className="font-black text-text-primary mb-1.5 uppercase">Connect Your Wallet</h3>
                  <p className="text-sm text-text-secondary mb-5 leading-relaxed font-semibold">
                    A Web3 wallet is required to interact with the escrow smart contracts.
                  </p>
                  <div className="flex justify-center">
                    <ConnectWallet />
                  </div>
                </div>
                <p className="text-center text-xs text-text-muted font-bold">
                  Already have an account?{" "}
                  <button onClick={() => setMode("login")} className="text-[#3D5AFE] font-black hover:underline underline-offset-2">Sign in instead</button>
                </p>
              </motion.div>

            ) : (
              /* ── Register Form ── */
              <motion.div key="register" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className="space-y-5">
                {/* Wallet badge */}
                <div className="flex items-center gap-3 bg-[#E8EAF6] border-3 border-[#3D5AFE] rounded-xl p-3.5 shadow-[3px_3px_0px_#3D5AFE]">
                  <div className="w-8 h-8 rounded-lg bg-[#3D5AFE] flex items-center justify-center shrink-0">
                    <span className="text-white text-xs font-black">W3</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-[#3D5AFE] uppercase tracking-wider">Wallet Connected</p>
                    <p className="text-sm font-mono font-bold text-text-primary truncate">{address?.slice(0, 8)}...{address?.slice(-6)}</p>
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-black text-text-secondary uppercase tracking-wider mb-2">Full Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name" className="glass-input w-full px-4 py-3.5 text-sm" />
                </div>

                {/* Role selector */}
                <div>
                  <label className="block text-xs font-black text-text-secondary uppercase tracking-wider mb-2.5">Your Role</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setRole("client")}
                      className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border-3 transition-all ${
                        role === "client" ? "border-[#3D5AFE] bg-[#E8EAF6] shadow-[4px_4px_0px_#3D5AFE]" : "border-[#1A1A2E] bg-white hover:bg-[#F5F0E8] shadow-[3px_3px_0px_#1A1A2E] hover:shadow-[4px_4px_0px_#1A1A2E]"
                      }`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center border-2 ${role === "client" ? "bg-[#3D5AFE] border-[#1A1A2E]" : "bg-[#F5F0E8] border-[#1A1A2E]"}`}>
                        <User size={20} className={role === "client" ? "text-white" : "text-text-muted"} />
                      </div>
                      <div className="text-center">
                        <p className={`font-black text-sm uppercase ${role === "client" ? "text-[#3D5AFE]" : "text-text-secondary"}`}>Client</p>
                        <p className="text-[10px] text-text-muted mt-0.5 font-bold">Hire talent</p>
                      </div>
                    </button>
                    <button onClick={() => setRole("worker")}
                      className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border-3 transition-all ${
                        role === "worker" ? "border-[#00C853] bg-[#E8F5E9] shadow-[4px_4px_0px_#00C853]" : "border-[#1A1A2E] bg-white hover:bg-[#F5F0E8] shadow-[3px_3px_0px_#1A1A2E] hover:shadow-[4px_4px_0px_#1A1A2E]"
                      }`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center border-2 ${role === "worker" ? "bg-[#00C853] border-[#1A1A2E]" : "bg-[#F5F0E8] border-[#1A1A2E]"}`}>
                        <Briefcase size={20} className={role === "worker" ? "text-white" : "text-text-muted"} />
                      </div>
                      <div className="text-center">
                        <p className={`font-black text-sm uppercase ${role === "worker" ? "text-[#00C853]" : "text-text-secondary"}`}>Worker</p>
                        <p className="text-[10px] text-text-muted mt-0.5 font-bold">Find work</p>
                      </div>
                    </button>
                  </div>
                  <div className="flex justify-end mt-2">
                    <button onClick={() => setRole(role === "admin" ? "" : "admin")}
                      className={`text-[10px] font-black uppercase tracking-wider transition-colors ${role === "admin" ? "text-[#00C853]" : "text-text-muted hover:text-text-secondary"}`}>
                      {role === "admin" ? "Admin Selected ✓" : "Developer Admin"}
                    </button>
                  </div>
                </div>

                <button onClick={handleRegister} disabled={isRegistering || !name || !role}
                  className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 text-sm disabled:opacity-50">
                  {isRegistering ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up profile...</> : <>Create Account <ArrowRight className="w-4 h-4" /></>}
                </button>

                {process.env.NODE_ENV === "development" && (
                  <button
                    onClick={() => {
                      if (!name.trim()) return toast.error("Please enter your name");
                      if (!role) return toast.error("Please select a role");
                      if (!address) return toast.error("Please connect your wallet first");
                      localStorage.setItem("wwt_pending_registration", JSON.stringify({ name: name.trim(), role, walletAddress: address.toLowerCase() }));
                      toast.success("Dev bypass: skipping KYC");
                      router.push(`/onboarding/${role}`);
                    }}
                    className="w-full border-3 border-dashed border-[#FFD600] text-[#F9A825] rounded-xl py-2.5 text-xs font-black uppercase tracking-wider hover:bg-[#FFF8E1] transition-all"
                  >
                    Skip KYC (Dev Only)
                  </button>
                )}

                <p className="text-center text-xs text-text-muted pt-1 font-bold">
                  Already have an account?{" "}
                  <button onClick={() => setMode("login")} className="text-[#3D5AFE] font-black hover:underline underline-offset-2">Sign in</button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Footer */}
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
        className="mt-8 text-text-muted text-[11px] font-black tracking-widest text-center uppercase">
        Secured by smart contracts · Powered by Anvil &amp; Next.js
      </motion.p>
    </main>
  );
}
