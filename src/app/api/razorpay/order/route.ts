import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';

export async function POST(req: Request) {
  try {
    const { amount, currency = "USD" } = await req.json();
    // Razorpay accepts amounts in the smallest subunit (e.g. cents/paise)
    const amountInSubunits = Math.round(amount * 100);

    const razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || 'rzp_test_123',
      key_secret: process.env.RAZORPAY_KEY_SECRET || 'secret123',
    });

    const options = {
      amount: amountInSubunits,
      currency: currency,
      receipt: `receipt_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);
    return NextResponse.json(order);
  } catch (error) {
    console.error("Razorpay order error:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
