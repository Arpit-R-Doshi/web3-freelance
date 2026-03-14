"use client";

import { useEffect } from "react";
import { CheckCircle } from "lucide-react";

export default function VerifySuccess() {
  useEffect(() => {
    // Broadcast success to the parent window (the main web app)
    window.parent.postMessage({ type: 'DIDIT_SUCCESS' }, '*');
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
      <div className="bg-white rounded-3xl p-8 shadow-xl flex flex-col items-center text-center max-w-sm w-full border border-emerald-100">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4 text-emerald-500 animate-bounce">
          <CheckCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Identity Verified</h2>
        <p className="text-sm text-slate-500">
          Your KYC validation was successful. You can safely close this window or wait to be redirected.
        </p>
      </div>
    </div>
  );
}
