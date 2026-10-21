const INDIAN_MOBILE = /^[6-9]\d{9}$/;

// Campus staff sign in with Indian mobile numbers only, which also keeps the
// SMS gateway away from international premium-rate numbers.
export function normalizeIndianMobile(raw: unknown): string | null {
  let digits = String(raw ?? "")
    .slice(0, 24)
    .replace(/\D/g, "");
  if (digits.length === 14 && digits.startsWith("0091")) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return INDIAN_MOBILE.test(digits) ? `+91${digits}` : null;
}

export function nationalNumber(e164: string) {
  return e164.startsWith("+91") ? e164.slice(3) : e164;
}

export function formatPhone(e164: string) {
  const national = nationalNumber(e164);
  return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
}

export function maskPhone(e164: string) {
  const national = nationalNumber(e164);
  return `+91 ${national.slice(0, 2)}••• ••${national.slice(7)}`;
}
