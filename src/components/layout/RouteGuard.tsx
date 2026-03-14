"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { Loader2 } from "lucide-react";

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isConnected, address } = useAccount();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // If we're on the login page, don't guard it
    if (pathname === "/") {
      setIsAuthorized(true);
      return;
    }

    // Give wagmi a split second to hydrate the connection status before kicking them
    const timer = setTimeout(() => {
      if (!isConnected || !address) {
        setIsAuthorized(false);
        router.push("/");
        return;
      }

      // Check if they exist in our mock registry
      const registryStr = localStorage.getItem("nexus_registry");
      if (!registryStr) {
        setIsAuthorized(false);
        router.push("/");
        return;
      }

      try {
        const registry = JSON.parse(registryStr);
        const user = registry[address.toLowerCase()];

        if (!user || !user.role || !user.diditKycVerified) {
          setIsAuthorized(false);
          router.push("/");
          return;
        }

        // Optional: Enforce strictly role-based routing
        // If a worker tries to visit /client, boot them to their actual portal
        if (pathname.startsWith(`/${user.role}`)) {
           setIsAuthorized(true);
        } else if (pathname === "/admin" && user.role === "admin") {
           setIsAuthorized(true);
        } else {
           // Not their portal, send them home to be auto-routed to the correct place
           router.push("/");
        }

      } catch (e) {
        setIsAuthorized(false);
        router.push("/");
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isConnected, address, pathname, router]);

  // Prevent flash of guarded content
  if (!isAuthorized && pathname !== "/") {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center fade-in">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Verifying Credentials...</p>
      </div>
    );
  }

  return <>{children}</>;
}
