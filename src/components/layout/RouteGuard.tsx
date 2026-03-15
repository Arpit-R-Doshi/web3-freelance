"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { decodeToken } from "@/lib/auth-client";

const PUBLIC_PATHS = ["/", "/verify-success"];
const ONBOARDING_PREFIX = "/onboarding";
const ADMIN_PREFIX = "/admin";

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // Public paths, onboarding, and admin are always accessible
    if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith(ONBOARDING_PREFIX) || pathname.startsWith(ADMIN_PREFIX)) {
      setIsAuthorized(true);
      return;
    }

    const timer = setTimeout(() => {
      // Check JWT auth first
      const token = localStorage.getItem("wwt_token");
      if (token) {
        const payload = decodeToken(token);
        if (payload) {
          const onOwnPortal = pathname.startsWith(`/${payload.role}`);
          // Workers can view client project detail pages (read-only)
          const workerViewingProject =
            payload.role === "worker" && pathname.startsWith("/client/projects/");
          if (onOwnPortal || workerViewingProject) {
            setIsAuthorized(true);
          } else {
            // User is authed but on the wrong portal — send them to theirs
            router.push(`/${payload.role}`);
          }
          return;
        }
        // Token is invalid/expired — clean up
        localStorage.removeItem("wwt_token");
        localStorage.removeItem("wwt_user");
      }

      // Not authenticated — send to home
      setIsAuthorized(false);
      router.push("/");
    }, 100);

    return () => clearTimeout(timer);
  }, [pathname, router]);

  if (!isAuthorized && !PUBLIC_PATHS.includes(pathname) && !pathname.startsWith(ONBOARDING_PREFIX) && !pathname.startsWith(ADMIN_PREFIX)) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center fade-in">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Verifying Credentials...</p>
      </div>
    );
  }

  return <>{children}</>;
}
