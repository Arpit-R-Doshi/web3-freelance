"use client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { foundry } from 'wagmi/chains';
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { ReactNode } from 'react';
import { Toaster } from 'sonner';
import RouteGuard from '@/components/layout/RouteGuard';

const config = getDefaultConfig({
  appName: 'WeWorkTogether',
  projectId: 'TEST_ID',
  chains: [foundry],
  ssr: true,
});

const queryClient = new QueryClient();

export default function ProvidersClient({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <RouteGuard>
            {children}
            <Toaster position="bottom-right" richColors />
          </RouteGuard>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
