import { notFound } from "next/navigation";
import { DisplayBoardView } from "@/components/display-board";
import { displayBoard } from "@/lib/display-board";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Counter display" };

// Full-screen board for a TV or spare tablet facing the queue. No sign-in:
// it shows tokens only.
export default async function DisplayPage({ params }: { params: Promise<{ stallId: string }> }) {
  const { stallId } = await params;
  const stall = await prisma.stall.findUnique({ where: { id: stallId }, select: { id: true, name: true, location: true } });
  if (!stall) notFound();
  return <DisplayBoardView stall={stall} initial={await displayBoard(stall.id)} />;
}
