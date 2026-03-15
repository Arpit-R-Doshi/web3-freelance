"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Building2, User, ArrowRight, ArrowLeft, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

type ClientType = "individual" | "organisation" | "";

export default function ClientOnboarding() {
  const router = useRouter();
  const { address } = useAccount();

  const [isMounted, setIsMounted] = useState(false);
  const [pendingReg, setPendingReg] = useState<{ name: string; role: string; walletAddress?: string } | null>(null);

  const [clientType, setClientType] = useState<ClientType>("");
  const [orgName, setOrgName] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const raw = localStorage.getItem("wwt_pending_registration");
    if (!raw) {
      toast.error("Session expired. Please register again.");
      router.push("/");
      return;
    }
    const reg = JSON.parse(raw);
    if (reg.role !== "client") { router.push("/onboarding/worker"); return; }
    setPendingReg(reg);
  }, [router]);

  if (!isMounted || !pendingReg) return null;

  const handleNext = () => {
    if (!clientType) return toast.error("Please select account type");
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!email.trim()) return toast.error("Please enter your email");
    if (!password) return toast.error("Please enter a password");
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirmPassword) return toast.error("Passwords do not match");
    if (clientType === "organisation") {
      if (!orgName.trim()) return toast.error("Please enter organisation name");
      if (!taxNumber.trim()) return toast.error("Please enter tax number");
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: pendingReg.name,
          email: email.trim(),
          password,
          role: "client",
          walletAddress: address || pendingReg.walletAddress,
          clientProfile: {
            type: clientType,
            orgName: clientType === "organisation" ? orgName.trim() : undefined,
            taxNumber: clientType === "organisation" ? taxNumber.trim() : undefined,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      localStorage.setItem("wwt_token", data.token);
      localStorage.setItem("wwt_user", JSON.stringify(data.user));
      localStorage.removeItem("wwt_pending_registration");

      toast.success(`Welcome to WeWorkTogether, ${data.user.name}!`);
      setTimeout(() => router.push("/client"), 800);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#FFFDF5] p-6 relative overflow-hidden">
      {/* Geometric bg shapes */}
      <div className="absolute top-16 left-16 w-40 h-40 bg-[#3D5AFE] border-3 border-[#1A1A2E] rotate-12 -z-10 opacity-20" />
      <div className="absolute bottom-16 right-16 w-32 h-32 bg-[#FFD600] border-3 border-[#1A1A2E] -rotate-6 -z-10 opacity-20" />
      <div className="absolute top-1/2 right-10 w-20 h-20 bg-[#00C853] border-3 border-[#1A1A2E] rotate-45 -z-10 opacity-15" />

      <div className="w-full max-w-md bg-white border-3 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] p-8 rounded-xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[#3D5AFE] rounded-lg flex items-center justify-center border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-black text-[#3D5AFE] uppercase tracking-widest">Client Onboarding</p>
              <h1 className="text-xl font-black text-[#1A1A2E]">Set up your account</h1>
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2">
            <div className={`h-2 flex-1 rounded-lg border-2 border-[#1A1A2E] overflow-hidden ${step >= 1 ? "bg-[#3D5AFE]" : "bg-[#F5F0E8]"}`} />
            <div className={`h-2 flex-1 rounded-lg border-2 border-[#1A1A2E] overflow-hidden ${step >= 2 ? "bg-[#3D5AFE]" : "bg-[#F5F0E8]"}`} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-[#4A4A68] font-bold">Account type</span>
            <span className="text-xs text-[#4A4A68] font-bold">Credentials</span>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <p className="text-sm font-bold text-[#4A4A68] mb-3">
                Hi <span className="text-[#3D5AFE] font-black">{pendingReg.name}</span>, are you registering as:
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setClientType("individual")}
                  className={`flex flex-col items-center justify-center gap-3 p-5 rounded-xl border-3 transition-all ${
                    clientType === "individual"
                      ? "border-[#3D5AFE] bg-[#E8EAF6] shadow-[3px_3px_0px_#3D5AFE]"
                      : "border-[#1A1A2E] bg-white hover:bg-[#F5F0E8]"
                  }`}
                >
                  <User size={28} className={clientType === "individual" ? "text-[#3D5AFE]" : "text-[#4A4A68]"} />
                  <div className="text-center">
                    <p className="font-black text-sm text-[#1A1A2E]">Individual</p>
                    <p className="text-xs text-[#4A4A68] mt-0.5 font-bold">Personal account</p>
                  </div>
                  {clientType === "individual" && <CheckCircle className="w-4 h-4 text-[#3D5AFE]" />}
                </button>

                <button
                  onClick={() => setClientType("organisation")}
                  className={`flex flex-col items-center justify-center gap-3 p-5 rounded-xl border-3 transition-all ${
                    clientType === "organisation"
                      ? "border-[#FFD600] bg-[#FFF8E1] shadow-[3px_3px_0px_#FFD600]"
                      : "border-[#1A1A2E] bg-white hover:bg-[#F5F0E8]"
                  }`}
                >
                  <Building2 size={28} className={clientType === "organisation" ? "text-[#F9A825]" : "text-[#4A4A68]"} />
                  <div className="text-center">
                    <p className="font-black text-sm text-[#1A1A2E]">Organisation</p>
                    <p className="text-xs text-[#4A4A68] mt-0.5 font-bold">Company account</p>
                  </div>
                  {clientType === "organisation" && <CheckCircle className="w-4 h-4 text-[#F9A825]" />}
                </button>
              </div>

              <button
                onClick={handleNext}
                disabled={!clientType}
                className="w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-50 mt-2 bg-[#3D5AFE] text-white font-black rounded-xl uppercase tracking-wider border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] hover:shadow-[2px_2px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
              >
                Continue <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              {clientType === "organisation" && (
                <>
                  <div>
                    <label className="block text-sm font-black text-[#1A1A2E] mb-2 ml-1 uppercase tracking-wider">Organisation Name</label>
                    <input
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Acme Corp"
                      className="w-full px-4 py-3 font-bold bg-white border-3 border-[#1A1A2E] rounded-xl focus:outline-none focus:shadow-[3px_3px_0px_#3D5AFE] transition-shadow text-[#1A1A2E]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-black text-[#1A1A2E] mb-2 ml-1 uppercase tracking-wider">Tax Number / GST</label>
                    <input
                      type="text"
                      value={taxNumber}
                      onChange={(e) => setTaxNumber(e.target.value)}
                      placeholder="GSTIN / Tax ID"
                      className="w-full px-4 py-3 font-bold bg-white border-3 border-[#1A1A2E] rounded-xl focus:outline-none focus:shadow-[3px_3px_0px_#3D5AFE] transition-shadow text-[#1A1A2E]"
                    />
                  </div>
                  <div className="border-t-3 border-[#1A1A2E] pt-2" />
                </>
              )}

              <div>
                <label className="block text-sm font-black text-[#1A1A2E] mb-2 ml-1 uppercase tracking-wider">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 font-bold bg-white border-3 border-[#1A1A2E] rounded-xl focus:outline-none focus:shadow-[3px_3px_0px_#3D5AFE] transition-shadow text-[#1A1A2E]"
                />
              </div>

              <div>
                <label className="block text-sm font-black text-[#1A1A2E] mb-2 ml-1 uppercase tracking-wider">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-4 py-3 font-bold bg-white border-3 border-[#1A1A2E] rounded-xl focus:outline-none focus:shadow-[3px_3px_0px_#3D5AFE] transition-shadow text-[#1A1A2E]"
                />
              </div>

              <div>
                <label className="block text-sm font-black text-[#1A1A2E] mb-2 ml-1 uppercase tracking-wider">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-4 py-3 font-bold bg-white border-3 border-[#1A1A2E] rounded-xl focus:outline-none focus:shadow-[3px_3px_0px_#3D5AFE] transition-shadow text-[#1A1A2E]"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 px-4 py-3 rounded-xl border-3 border-[#1A1A2E] text-[#1A1A2E] font-black text-sm hover:bg-[#F5F0E8] transition-all uppercase tracking-wider"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-1 py-3 flex items-center justify-center gap-2 disabled:opacity-50 bg-[#00C853] text-white font-black rounded-xl uppercase tracking-wider border-3 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] hover:shadow-[2px_2px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                >
                  {isSubmitting ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Creating account...</>
                  ) : (
                    <>Complete Setup <ArrowRight className="w-5 h-5" /></>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
