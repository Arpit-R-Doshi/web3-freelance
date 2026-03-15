import { NextRequest, NextResponse } from "next/server";
import { extractSkills } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const { description } = await req.json();
    if (!description) return NextResponse.json({ error: "description required" }, { status: 400 });
    const skills = await extractSkills(description);
    return NextResponse.json({ skills });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
