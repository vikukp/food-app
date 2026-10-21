// FSSAI marks: a green circle in a square for vegetarian, a brown triangle in
// a square for non-vegetarian (egg included).
export function VegDot({ veg, egg = false, className = "" }: { veg: boolean; egg?: boolean; className?: string }) {
  const label = veg ? "Vegetarian" : egg ? "Contains egg" : "Non-vegetarian";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-[2px] border ${
        veg ? "border-emerald-700" : "border-[#7b3f00]"
      } ${className}`}
    >
      {veg ? (
        <span className="size-1.5 rounded-full bg-emerald-700" />
      ) : (
        <span className="size-0 border-x-[3.5px] border-b-[6px] border-x-transparent border-b-[#7b3f00]" />
      )}
    </span>
  );
}
