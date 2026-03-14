"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";
import { LogOut, Shield, ChevronLeft, ShieldCheck } from "lucide-react";
import ConnectWallet from "@/components/ConnectWallet";
import { useEffect, useState } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  
  const [userName, setUserName] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("");
  const [isKycVerified, setIsKycVerified] = useState<boolean>(false);

  useEffect(() => {
    if (address) {
      const registryStr = localStorage.getItem("nexus_registry");
      if (registryStr) {
        try {
          const registry = JSON.parse(registryStr);
          const user = registry[address.toLowerCase()];
          if (user) {
            setUserName(user.name);
            setUserRole(user.role);
            setIsKycVerified(!!user.diditKycVerified);
          }
        } catch (e) {}
      }
    } else {
      setUserName("");
      setUserRole("");
      setIsKycVerified(false);
    }
  }, [address, pathname]); // Re-run if path changes to ensure fresh state

  const handleLogout = () => {
    disconnect();
    // Do not wipe registry so they can log back in smoothly later,
    // just push them to the onboarding screen.
    window.location.href = "/";
  };

  // Don't show nav on the login/onboarding screen
  if (pathname === "/") return null;

  return (
    <nav className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-xl border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg shadow-sm group-hover:shadow-md transition-all">
               <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-extrabold text-xl tracking-tight text-slate-800 hidden sm:inline-block">Nexus Global</span>
          </Link>

          {/* User Status */}
          <div className="flex items-center gap-4">
            {isConnected && userName && (
               <div className="hidden md:flex flex-col items-end mr-2">
                 <div className="flex items-center gap-1.5">
                   <span className="text-sm font-bold text-slate-800">{userName}</span>
                   {isKycVerified && (
                     <div title="Didit Identity Verified">
                       <ShieldCheck className="w-4 h-4 text-emerald-500" />
                     </div>
                   )}
                 </div>
                 <span className="text-xs font-bold uppercase tracking-widest text-blue-600">{userRole} Portal</span>
               </div>
            )}
            
            <ConnectWallet />

            {isConnected && (
              <button 
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-1"
                title="Disconnect & Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
