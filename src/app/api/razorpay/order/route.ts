import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getLiveExchangeRates } from '@/lib/rates';

// Smallest currency unit multiplier (paise for INR, cents for others)
const SUBUNIT_MULTIPLIER: Record<string, number> = {
  INR: 100,
  USD: 100,
  GBP: 100,
  EUR: 100,
};

export async function POST(req: Request) {
  try {
    const { tokens, currency = 'INR' } = await req.json();

    if (!tokens || isNaN(Number(tokens)) || Number(tokens) <= 0) {
      return NextResponse.json({ error: "Invalid token amount" }, { status: 400 });
    }
    
    const RATES = await getLiveExchangeRates();
    
    if (!RATES[currency]) {
      return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    }

    const tokenCount = Number(tokens);
    // Fiat amount in the selected currency
    const fiatAmount = parseFloat((tokenCount * RATES[currency]).toFixed(2));
    // Amount in smallest currency unit (paise for INR, cents for USD/GBP/EUR)
    const amountInSmallestUnit = Math.round(fiatAmount * (SUBUNIT_MULTIPLIER[currency] || 100));

    const razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || 'rzp_test_123',
      key_secret: process.env.RAZORPAY_KEY_SECRET || 'secret123',
    });

    const order = await razorpay.orders.create({
      amount: amountInSmallestUnit,
      currency: currency,
      receipt: `wwt_${Date.now()}`,
      notes: {
        originalCurrency: currency,
        originalAmount: fiatAmount.toString(),
        tokens: tokenCount.toString(),
      },
    });

    return NextResponse.json({
      ...order,
      displayCurrency: currency,
      displayAmount: fiatAmount,
      tokens: tokenCount,
    });
  } catch (error) {
    console.error("Razorpay order error:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
