import { NextRequest, NextResponse } from "next/server";
import { getAllLists, createList } from "@/lib/gtd";

/** GET /api/gtd → all lists */
export async function GET() {
  const lists = await getAllLists();
  return NextResponse.json(lists);
}

/** POST /api/gtd  { title } → create list */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const list = await createList(title);
  return NextResponse.json(list, { status: 201 });
}
