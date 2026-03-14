"use client";

import dynamic from "next/dynamic";
import { ReactNode } from "react";

const ProvidersClient = dynamic(() => import("./ProvidersClient"), { ssr: false });

export function Providers({ children }: { children: ReactNode }) {
  return <ProvidersClient>{children}</ProvidersClient>;
}
