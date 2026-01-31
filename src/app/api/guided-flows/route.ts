import { NextResponse } from "next/server";
import { getFlows } from "@/lib/guided-flows";

export async function GET() {
  try {
    const flows = await getFlows();
    return NextResponse.json(flows);
  } catch (err) {
    console.error("Failed to fetch guided flows:", err);
    return NextResponse.json([]);
  }
}
