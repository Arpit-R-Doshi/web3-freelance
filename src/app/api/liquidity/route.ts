import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const CURRENCIES = ["INR", "USD", "GBP", "EUR"];

export async function GET() {
  try {
    const pools = await db.liquidityPool.findMany();

    // Ensure all 4 currencies are represented (zero-fill missing)
    const poolMap = Object.fromEntries(pools.map((p) => [p.currency, p]));
    const result = CURRENCIES.map((c) => ({
      currency: c,
      totalDeposited: poolMap[c]?.totalDeposited ?? 0,
      totalTokens: poolMap[c]?.totalTokens ?? 0,
    }));

    return NextResponse.json({ pools: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
