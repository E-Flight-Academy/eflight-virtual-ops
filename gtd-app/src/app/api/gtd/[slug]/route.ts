import { NextRequest, NextResponse } from "next/server";
import { getList, saveList, deleteList } from "@/lib/gtd";

type Ctx = { params: Promise<{ slug: string }> };

/** GET /api/gtd/:slug → single list */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params;
  const list = await getList(slug);
  if (!list) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(list);
}

/** PUT /api/gtd/:slug → update list */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params;
  const list = await getList(slug);
  if (!list) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (typeof body.title === "string") list.title = body.title;
  if (Array.isArray(body.tasks)) {
    list.tasks = body.tasks.map((t: { text: string; done: boolean }) => ({
      text: String(t.text),
      done: Boolean(t.done),
    }));
  }

  await saveList(list);
  return NextResponse.json(list);
}

/** DELETE /api/gtd/:slug → delete list */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params;
  const ok = await deleteList(slug);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
