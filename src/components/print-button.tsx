"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
    >
      Print or save as PDF
    </button>
  );
}
