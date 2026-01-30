import { NextResponse } from "next/server";
import { getFaqs } from "@/lib/faq";

export async function GET() {
  try {
    const faqs = await getFaqs();
    return NextResponse.json(faqs);
  } catch (err) {
    console.error("Failed to fetch FAQs:", err);
    return NextResponse.json([], { status: 200 });
  }
}
