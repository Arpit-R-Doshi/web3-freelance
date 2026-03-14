"use client";

import Link from "next/link";
import { User, Briefcase, Shield } from "lucide-react";

export default function Home() {

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-900 font-sans p-4">
      <h1 className="text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 mb-8 tracking-tight">
        Nexus Global
      </h1>
      <p className="text-slate-500 mb-12 max-w-lg text-center text-lg">
        Select your portal to access the Web3 cross-border platform. Ensure your MetaMask is connected to the right role.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
        <Link href="/client" className="group bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col items-center text-center">
          <div className="bg-blue-100 text-blue-600 p-4 rounded-2xl mb-4 group-hover:scale-110 transition-transform">
             <User size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-slate-800">Client Portal</h2>
          <p className="text-slate-500 text-sm">Deposit USD & Hire top Indian Talent instantly on-chain.</p>
        </Link>

        <Link href="/worker" className="group bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col items-center text-center">
          <div className="bg-indigo-100 text-indigo-600 p-4 rounded-2xl mb-4 group-hover:scale-110 transition-transform">
             <Briefcase size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-slate-800">Worker Portal</h2>
          <p className="text-slate-500 text-sm">Claim completed jobs and withdraw funds directly to your INR bank account.</p>
        </Link>

        <Link href="/admin" className="group bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col items-center text-center">
          <div className="bg-emerald-100 text-emerald-600 p-4 rounded-2xl mb-4 group-hover:scale-110 transition-transform">
             <Shield size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-slate-800">Admin Explorer</h2>
          <p className="text-slate-500 text-sm">Monitor system liquidity, view live events, and audit the escrow pools.</p>
        </Link>
      </div>
    </main>
  );
}
