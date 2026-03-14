"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function VerifySuccess() {
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();
  const { address, isConnected } = useAccount();

  useEffect(() => {
    // Read URL search parameters directly from window to avoid Next.js Suspense boundary requirements
    const searchParams = new URLSearchParams(window.location.search);
    
    // Check for common error parameters returned by OAuth/ID-verification callbacks
    const errorParam = searchParams.get('error');
    const statusParam = searchParams.get('status');
    
    const hasError = errorParam !== null || statusParam === 'failed' || statusParam === 'declined' || statusParam === 'error';

    if (hasError) {
      setIsError(true);
      const errorMsg = searchParams.get('error_description') || errorParam || statusParam || "Verification was declined or failed.";
      setErrorMessage(errorMsg);
      toast.error(`Verification Failed: ${errorMsg}`);
      
      // Clear pending registration and route back home
      localStorage.removeItem("nexus_pending_registration");
      setTimeout(() => router.push("/"), 3000);
      return;
    }

    // Only proceed if wallet is connected (give it a second to hydrate)
    if (!isConnected || !address) return;

    // Retrieve pending registration state
    const pendingRegStr = localStorage.getItem("nexus_pending_registration");
    if (!pendingRegStr) {
       toast.error("Registration session expired.");
       router.push("/");
       return;
    }

    try {
      const pendingReg = JSON.parse(pendingRegStr);
      
      const registryStr = localStorage.getItem("nexus_registry");
      const registry = registryStr ? JSON.parse(registryStr) : {};
      
      registry[address.toLowerCase()] = { 
        name: pendingReg.name, 
        role: pendingReg.role,
        diditKycVerified: true,
        verificationDate: new Date().toISOString()
      };
      localStorage.setItem("nexus_registry", JSON.stringify(registry));
      localStorage.removeItem("nexus_pending_registration");

      toast.success("Identity Verified & Account Created!");
      
      setTimeout(() => {
        router.push(`/${pendingReg.role}`);
      }, 1500);

    } catch (err) {
      console.error(err);
      toast.error("Failed to finalize account creation");
      router.push("/");
    }

  }, [isConnected, address, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
      <div className={`bg-white rounded-3xl p-8 shadow-xl flex flex-col items-center text-center max-w-sm w-full border ${isError ? 'border-red-100' : 'border-emerald-100'}`}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 animate-bounce ${isError ? 'bg-red-100 text-red-500' : 'bg-emerald-100 text-emerald-500'}`}>
          {isError ? <XCircle className="w-8 h-8" /> : <CheckCircle className="w-8 h-8" />}
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">
          {isError ? "Verification Failed" : "Identity Verified!"}
        </h2>
        <p className="text-sm text-slate-500 mb-6 font-medium">
          {isError 
            ? errorMessage || "Your KYC validation could not be completed."
            : "Your KYC proof has been minted. Finalizing account routing..."}
        </p>
        
        {!isError && (
          <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-4 py-2 rounded-full text-sm font-bold">
            <Loader2 className="w-4 h-4 animate-spin" /> Redirecting
          </div>
        )}
      </div>
    </div>
  );
}
