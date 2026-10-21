import { prisma } from "@/lib/prisma";

// A stall's rating over the last 30 days. Hidden until a handful of people
// have rated it, so one bad lunch does not define a stall.
const WINDOW_DAYS = 30;
export const MIN_RATINGS_SHOWN = 5;

export type StallRating = { average: number; count: number };

export async function stallRatings(stallIds?: string[]) {
  const rows = await prisma.order.groupBy({
    by: ["stallId"],
    where: {
      rating: { not: null },
      ratedAt: { gte: new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60_000) },
      ...(stallIds ? { stallId: { in: stallIds } } : {}),
    },
    _avg: { rating: true },
    _count: { rating: true },
  });
  return new Map<string, StallRating>(
    rows.map((row) => [row.stallId, { average: row._avg.rating ?? 0, count: row._count.rating }]),
  );
}

export function ratingCopy(rating: StallRating | undefined) {
  if (!rating || rating.count < MIN_RATINGS_SHOWN) return null;
  return `★ ${rating.average.toFixed(1)} (${rating.count})`;
}

// Recent comments for the stall's own screen and the admin page.
export async function recentFeedback(stallId: string, take = 10) {
  return prisma.order.findMany({
    where: { stallId, rating: { not: null } },
    orderBy: { ratedAt: "desc" },
    take,
    select: { token: true, rating: true, ratingComment: true, ratedAt: true },
  });
}
