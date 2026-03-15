import { NextResponse } from 'next/server';
import { getLiveExchangeRates } from '@/lib/rates';

export async function GET() {
  try {
    const rates = await getLiveExchangeRates();
    return NextResponse.json({ rates });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch rates" }, { status: 500 });
  }
}
