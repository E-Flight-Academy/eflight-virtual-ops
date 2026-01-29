import { NextResponse } from "next/server";
import { getKnowledgeBaseStatus } from "@/lib/documents";

export async function GET() {
  const status = getKnowledgeBaseStatus();
  return NextResponse.json(status);
}
