"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";
import { LogOut, ShieldCheck, UserCircle, Sun, Moon } from "lucide-react";
import ConnectWallet from "@/components/ConnectWallet";
import WwtLogo from "@/components/WwtLogo";
import { useEffect, useState } from "react";
import { decodeToken } from "@/lib/auth-client";
import { useTheme } from "@/context/ThemeContext";

export default function TopNav() {
  const pathname = usePathname();
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const { theme, toggleTheme } = useTheme();

  const [userName, setUserName] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("");

  useEffect(() => {
    const token = localStorage.getItem("wwt_token");
    if (token) {
      const payload = decodeToken(token);
      if (payload) {
        setUserName(payload.name);
        setUserRole(payload.role);
        return;
      }
    }
    if (address) {
      const registryStr = localStorage.getItem("wwt_registry");
      if (registryStr) {
        try {
          const registry = JSON.parse(registryStr);
          const user = registry[address.toLowerCase()];
          if (user) { setUserName(user.name); setUserRole(user.role); }
        } catch {}
      }
    } else {
      setUserName(""); setUserRole("");
    }
  }, [address, pathname]);

  const handleLogout = () => {
    disconnect();
    localStorage.removeItem("wwt_token");
    localStorage.removeItem("wwt_user");
    window.location.href = "/";
  };

  if (pathname === "/" || pathname.startsWith("/onboarding") || pathname === "/verify-success") return null;

  return (
    <nav className="sticky top-0 z-50 w-full nav-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 flex items-center justify-center bg-[#3D5AFE] border-3 border-[#1A1A2E] rounded-lg shadow-[3px_3px_0px_#1A1A2E] group-hover:shadow-[4px_4px_0px_#1A1A2E] group-hover:translate-x-[-1px] group-hover:translate-y-[-1px] transition-all duration-200">
              <WwtLogo className="w-5 h-5 text-white" />
            </div>
            <span className="font-black text-lg tracking-tight text-text-primary hidden sm:inline-block uppercase">
              WeWork<span className="text-[#3D5AFE]">Together</span>
            </span>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-2">

            {/* User identity */}
            {userName && (
              <Link
                href={`/${userRole}/profile`}
                className="hidden md:flex flex-col items-end mr-3 hover:opacity-80 transition-opacity"
                title="View Profile"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-black text-text-primary">{userName}</span>
                  <ShieldCheck className="w-3.5 h-3.5 text-[#00C853]" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#3D5AFE]">
                  {userRole} Portal
                </span>
              </Link>
            )}

            {userName && (
              <Link
                href={`/${userRole}/profile`}
                className="p-2 text-text-muted hover:text-[#3D5AFE] hover:bg-[#E8EAF6] rounded-lg border-2 border-transparent hover:border-[#3D5AFE] transition-all duration-150"
                title="My Profile"
              >
                <UserCircle className="w-5 h-5" />
              </Link>
            )}

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 text-text-muted hover:text-[#FFD600] hover:bg-[#FFF8E1] rounded-lg border-2 border-transparent hover:border-[#FFD600] transition-all duration-150"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle theme"
            >
              {theme === "dark"
                ? <Sun className="w-4.5 h-4.5" />
                : <Moon className="w-4.5 h-4.5" />}
            </button>

            <ConnectWallet />

            {(isConnected || userName) && (
              <button
                onClick={handleLogout}
                className="p-2 text-text-muted hover:text-[#FF1744] hover:bg-[#FCE4EC] rounded-lg border-2 border-transparent hover:border-[#FF1744] transition-all duration-150"
                title="Sign out"
              >
                <LogOut className="w-4.5 h-4.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
