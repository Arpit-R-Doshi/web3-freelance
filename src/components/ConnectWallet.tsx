"use client";

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import USDTABI from '@/lib/abi/MockUSDT.json';

const USDT_ADDRESS = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}`;

export default function ConnectWallet() {
  const { address } = useAccount();

  const { data: balanceData } = useReadContract({
    address: USDT_ADDRESS,
    abi: USDTABI as any,
    functionName: "balanceOf",
    args: [address],
    query: {
      enabled: !!address,
    }
  });

  const usdtBalance = balanceData ? parseFloat(formatEther(balanceData as bigint)).toFixed(2) : "0.00";

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus ||
            authenticationStatus === 'authenticated');

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              'className': 'opacity-0 pointer-events-none select-none'
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button 
                    onClick={openConnectModal} 
                    type="button"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full font-bold transition-all shadow-md text-sm"
                  >
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button 
                    onClick={openChainModal} 
                    type="button"
                    className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-full font-bold transition-all text-sm shadow-sm"
                  >
                    Wrong network
                  </button>
                );
              }

              return (
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={openChainModal}
                    type="button"
                    className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-full font-medium transition-all text-sm border border-slate-200"
                  >
                    {chain.hasIcon && (
                      <div
                        style={{
                          background: chain.iconBackground,
                          width: 16,
                          height: 16,
                          borderRadius: 999,
                          overflow: 'hidden',
                        }}
                      >
                        {chain.iconUrl && (
                          <img
                            alt={chain.name ?? 'Chain icon'}
                            src={chain.iconUrl}
                            style={{ width: 16, height: 16 }}
                          />
                        )}
                      </div>
                    )}
                    {chain.name}
                  </button>

                  <button 
                    onClick={openAccountModal} 
                    type="button"
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-full font-medium transition-all text-sm border border-slate-700 shadow-sm"
                  >
                    <span className="text-emerald-400 font-bold tracking-wider">${usdtBalance} <span className="text-[10px] text-emerald-200/50">USDT</span></span>
                    <span className="w-[1px] h-4 bg-slate-600 mx-1"></span>
                    {account.displayName}
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
