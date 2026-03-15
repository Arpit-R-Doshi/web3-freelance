import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createWalletClient, http, publicActions, parseEther, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import EscrowABI from '@/lib/abi/CrossBorderEscrow.json';
import { db } from '@/lib/db';
import { getLiveExchangeRates } from '@/lib/rates';

const adminPrivateKey = (process.env.ADMIN_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as `0x${string}`;

export async function POST(req: Request) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userAddress,
      amountToMint,
      currency = 'INR',
    } = await req.json();

    const secret = process.env.RAZORPAY_KEY_SECRET || 'secret123';

    let isAuthentic = true;

    if (razorpay_signature && razorpay_order_id) {
      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(body.toString())
        .digest("hex");
      isAuthentic = expectedSignature === razorpay_signature;
    }

    if (!isAuthentic) {
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    const account = privateKeyToAccount(adminPrivateKey);
    const client = createWalletClient({
      account,
      chain: foundry,
      transport: http('http://127.0.0.1:8545')
    }).extend(publicActions);

    const escrowAddress = getAddress(process.env.NEXT_PUBLIC_ESCROW_ADDRESS!) as `0x${string}`;
    if (!escrowAddress) throw new Error("Escrow address not configured in environment");

    const tokens = Number(amountToMint);
    const amountInWei = parseEther(tokens.toString());

    const { request } = await client.simulateContract({
      address: escrowAddress,
      abi: EscrowABI,
      functionName: 'depositAndMint',
      args: [getAddress(userAddress), amountInWei, razorpay_payment_id || `mock_tx_${Date.now()}`],
      account
    });

    const hash = await client.writeContract(request);
    await client.waitForTransactionReceipt({ hash });

    // Update liquidity pool for the deposited currency
    const RATES = await getLiveExchangeRates();
    const rate = RATES[currency] ?? RATES['INR'];
    const fiatDeposited = tokens * rate;
    try {
      await db.liquidityPool.upsert({
        where: { currency },
        update: {
          totalDeposited: { increment: fiatDeposited },
          totalTokens: { increment: tokens },
        },
        create: {
          currency,
          totalDeposited: fiatDeposited,
          totalTokens: tokens,
        },
      });
    } catch {
      // Non-fatal — don't fail the payment if LP update fails
    }

    return NextResponse.json({ success: true, txHash: hash });
  } catch (error: any) {
    console.error("Verification error:", error);
    return NextResponse.json({ error: error?.message || "Verification failed" }, { status: 500 });
  }
}
