"use client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { foundry } from 'wagmi/chains';
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { ReactNode } from 'react';
import { Toaster } from 'sonner';

const config = getDefaultConfig({
  appName: 'Nexus Global',
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
          {children}
          <Toaster position="bottom-right" richColors />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
