"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function VerifySuccess() {
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();
  const { address } = useAccount();
  const redirected = useRef(false);

  useEffect(() => {
    if (redirected.current) return;
    const searchParams = new URLSearchParams(window.location.search);
    const errorParam = searchParams.get("error");
    const statusParam = searchParams.get("status");

    const hasError =
      errorParam !== null ||
      statusParam === "failed" ||
      statusParam === "declined" ||
      statusParam === "error";

    if (hasError) {
      setIsError(true);
      const errorMsg =
        searchParams.get("error_description") || errorParam || statusParam || "Verification was declined or failed.";
      setErrorMessage(errorMsg);
      toast.error(`Verification Failed: ${errorMsg}`);
      localStorage.removeItem("wwt_pending_registration");
      redirected.current = true;
      setTimeout(() => router.push("/"), 3000);
      return;
    }

    const pendingRegStr = localStorage.getItem("wwt_pending_registration");
    if (!pendingRegStr) {
      toast.error("Registration session expired.");
      redirected.current = true;
      router.push("/");
      return;
    }

    try {
      const pendingReg = JSON.parse(pendingRegStr);
      const walletAddress = address ? address.toLowerCase() : pendingReg.walletAddress;
      const updated = { ...pendingReg, walletAddress };
      localStorage.setItem("wwt_pending_registration", JSON.stringify(updated));

      toast.success("Identity Verified! Completing your profile...");

      redirected.current = true;
      setTimeout(() => {
        router.push(`/onboarding/${pendingReg.role}`);
      }, 1200);
    } catch (err) {
      console.error(err);
      toast.error("Failed to finalize account creation");
      redirected.current = true;
      router.push("/");
    }
  }, [address, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FFFDF5] p-6 relative">
      {/* Geometric bg shapes */}
      <div className="absolute top-20 left-20 w-32 h-32 bg-[#FFD600] border-3 border-[#1A1A2E] rotate-12 -z-10" />
      <div className="absolute bottom-20 right-20 w-24 h-24 bg-[#3D5AFE] border-3 border-[#1A1A2E] -rotate-12 -z-10 rounded-full" />

      <div
        className={`bg-white rounded-xl p-8 border-3 shadow-[6px_6px_0px_#1A1A2E] flex flex-col items-center text-center max-w-sm w-full ${
          isError ? "border-[#FF1744]" : "border-[#00C853]"
        }`}
      >
        <div
          className={`w-16 h-16 rounded-lg flex items-center justify-center mb-6 border-3 shadow-[3px_3px_0px] ${
            isError
              ? "bg-[#FCE4EC] text-[#FF1744] border-[#FF1744] shadow-[#FF1744]"
              : "bg-[#E8F5E9] text-[#00C853] border-[#00C853] shadow-[#00C853]"
          }`}
        >
          {isError ? <XCircle className="w-8 h-8" /> : <CheckCircle className="w-8 h-8" />}
        </div>
        <h2 className="text-2xl font-black text-[#1A1A2E] mb-2 uppercase">
          {isError ? "Verification Failed" : "Identity Verified!"}
        </h2>
        <p className="text-sm text-[#4A4A68] mb-6 font-bold">
          {isError
            ? errorMessage || "Your KYC validation could not be completed."
            : "KYC complete. Setting up your profile..."}
        </p>

        {!isError && (
          <div className="flex items-center gap-2 text-[#3D5AFE] bg-[#E8EAF6] border-2 border-[#3D5AFE] px-4 py-2 rounded-lg text-sm font-black uppercase tracking-wider">
            <Loader2 className="w-4 h-4 animate-spin" /> Redirecting to onboarding
          </div>
        )}
      </div>
    </div>
  );
}
