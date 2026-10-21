export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="h-7 w-48 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-4 w-72 animate-pulse rounded bg-muted" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
