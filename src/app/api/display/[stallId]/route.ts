import { NextResponse } from "next/server";
import { displayBoard } from "@/lib/display-board";
import { STALL_ID_PATTERN } from "@/lib/validation";

export async function GET(_request: Request, context: { params: Promise<{ stallId: string }> }) {
  const { stallId } = await context.params;
  if (!STALL_ID_PATTERN.test(stallId)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(await displayBoard(stallId));
}
