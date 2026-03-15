"use client";

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import USDTABI from '@/lib/abi/MockUSDT.json';

const USDT_ADDRESS = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}`;

interface ConnectWalletProps {
  /** Override the address used for USDT balance display (e.g. registered wallet). Falls back to connected MetaMask address. */
  balanceAddress?: `0x${string}` | null;
}

export default function ConnectWallet({ balanceAddress }: ConnectWalletProps = {}) {
  const { address } = useAccount();

  const effectiveBalanceAddress = balanceAddress ?? address;

  const { data: balanceData } = useReadContract({
    address: USDT_ADDRESS,
    abi: USDTABI as any,
    functionName: "balanceOf",
    args: [effectiveBalanceAddress],
    query: {
      enabled: !!effectiveBalanceAddress,
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
                    className="bg-[#3D5AFE] hover:bg-[#304FFE] text-white px-5 py-2.5 rounded-lg font-black uppercase tracking-wider transition-all text-sm border-3 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] hover:shadow-[1px_1px_0px_#1A1A2E] hover:translate-x-[2px] hover:translate-y-[2px]"
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
                    className="bg-[#FF1744] hover:bg-[#D50000] text-white px-4 py-2 rounded-lg font-black uppercase tracking-wider transition-all text-sm border-3 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E]"
                  >
                    Wrong network
                  </button>
                );
              }

              return (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={openChainModal}
                    type="button"
                    className="flex items-center gap-2 bg-[#F5F0E8] hover:bg-[#E8EAF6] text-text-primary px-3 py-2 rounded-lg font-bold transition-all text-sm border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] hover:shadow-[1px_1px_0px_#1A1A2E] hover:translate-x-[1px] hover:translate-y-[1px]"
                  >
                    {chain.hasIcon && (
                      <div
                        style={{
                          background: chain.iconBackground,
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          overflow: 'hidden',
                          border: '1px solid #1A1A2E',
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
                    className="flex items-center gap-2 bg-[#1A1A2E] hover:bg-[#252542] text-white px-4 py-2 rounded-lg font-bold transition-all text-sm border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#3D5AFE] hover:shadow-[1px_1px_0px_#3D5AFE] hover:translate-x-[1px] hover:translate-y-[1px]"
                  >
                    <span className="text-[#00C853] font-black tracking-wider">{usdtBalance} <span className="text-[10px] text-[#00C853]/60 font-bold">Tokens</span></span>
                    <span className="w-[2px] h-4 bg-[#3D5AFE] mx-1"></span>
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
