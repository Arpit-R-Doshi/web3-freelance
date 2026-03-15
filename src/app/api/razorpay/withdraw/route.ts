import { NextResponse } from "next/server";
import { db } from '@/lib/db';
import { getLiveExchangeRates } from '@/lib/rates';

// POST /api/razorpay/withdraw
// Called AFTER the client has successfully burned tokens on-chain via burnAndWithdraw().
// Triggers the simulated fiat payout and updates the liquidity pool.
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tokens, currency, txHash } = await req.json();

    if (!tokens || isNaN(Number(tokens)) || Number(tokens) <= 0) {
      return NextResponse.json({ error: "Invalid token amount" }, { status: 400 });
    }

    const RATES = await getLiveExchangeRates();

    if (!RATES[currency]) {
      return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    }

    const tokenCount = Number(tokens);
    const rate = RATES[currency];
    const fiatAmount = parseFloat((tokenCount * rate).toFixed(2));

    // Simulate network delay for payout processing
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Update liquidity pool — deduct tokens and deposited fiat
    try {
      await db.liquidityPool.upsert({
        where: { currency },
        update: {
          totalDeposited: { decrement: fiatAmount },
          totalTokens: { decrement: tokenCount },
        },
        create: {
          currency,
          totalDeposited: 0,
          totalTokens: 0,
        },
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({
      success: true,
      payoutId: `pout_${Date.now()}`,
      status: "processed",
      tokens: tokenCount,
      currency,
      fiatAmount,
      txHash: txHash ?? null,
    });
  } catch (error: any) {
    console.error("Withdraw error:", error);
    return NextResponse.json({ error: "Failed to process withdrawal" }, { status: 500 });
  }
}
