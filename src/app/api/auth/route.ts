import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (!process.env.SITE_PASSWORD) {
    return NextResponse.json(
      { error: "SITE_PASSWORD is not configured" },
      { status: 500 }
    );
  }

  if (password === process.env.SITE_PASSWORD) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
}
