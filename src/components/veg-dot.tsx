export function VegDot({ veg, className = "" }: { veg: boolean; className?: string }) {
  return (
    <span
      title={veg ? "Vegetarian" : "Non-vegetarian"}
      className={`inline-flex size-3.5 items-center justify-center rounded-[2px] border ${
        veg ? "border-emerald-700" : "border-red-700"
      } ${className}`}
    >
      <span className={`size-1.5 rounded-full ${veg ? "bg-emerald-700" : "bg-red-700"}`} />
    </span>
  );
}
