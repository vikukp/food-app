// Menu prices include GST (as Indian menus show them). The receipt splits the
// tax back out. Food court restaurant service is usually 5% without input tax
// credit (2.5% CGST + 2.5% SGST); confirm the rate with finance and set
// GST_RATE_PERCENT if it differs.
export function gstRatePercent() {
  const value = Number(process.env.GST_RATE_PERCENT ?? 5);
  return Number.isFinite(value) && value >= 0 && value <= 28 ? value : 5;
}

export type GstBreakup = { ratePercent: number; taxableInr: number; cgstInr: number; sgstInr: number; totalInr: number };

const paise = (inr: number) => Math.round(inr * 100);

export function gstBreakup(totalInr: number, ratePercent = gstRatePercent()): GstBreakup {
  const totalPaise = paise(totalInr);
  const taxablePaise = Math.round((totalPaise * 100) / (100 + ratePercent));
  const taxPaise = totalPaise - taxablePaise;
  const cgstPaise = Math.floor(taxPaise / 2);
  return {
    ratePercent,
    taxableInr: taxablePaise / 100,
    cgstInr: cgstPaise / 100,
    sgstInr: (taxPaise - cgstPaise) / 100,
    totalInr,
  };
}

// 15 characters: state code, PAN, entity number, Z, checksum character.
export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
