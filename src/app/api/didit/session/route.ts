import { NextResponse } from "next/server";

const DIDIT_API_URL = "https://verification.didit.me/v3/session/";

export async function POST(request: Request) {
  try {
    const { address, callback } = await request.json();

    if (!address) {
      return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });
    }

    const API_KEY = process.env.DIDIT_API_KEY;
    if (!API_KEY) {
      console.error("DIDIT_API_KEY is not defined in environment variables");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body: any = {
      vendor_data: address,
      workflow_id: process.env.DIDIT_WORKFLOW_ID || "a167d30b-6320-420c-906c-a2c8ad8ccf23"
    };

    if (callback) {
      body.callback = callback;
    }

    const requestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify(body),
    };

    const response = await fetch(DIDIT_API_URL, requestOptions);
    const data = await response.json();

    if (response.status === 201 && data) {
      return NextResponse.json(data);
    } else {
      const errorMessage = data.message || data.error || data.detail || JSON.stringify(data);
      console.error("Didit session creation failed:", errorMessage);
      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }
  } catch (error: any) {
    console.error("Didit API Error:", error);
    return NextResponse.json({ error: "Failed to communicate with Didit API" }, { status: 500 });
  }
}
