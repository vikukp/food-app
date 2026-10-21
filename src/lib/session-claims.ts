// Shape checks for the signed employee cookie. Kept free of database imports so
// the proxy can use them too.

export type EmployeeAuthMethod = "otp" | "pin";

export type EmployeeClaims = {
  kind: "employee";
  uid: string;
  sv: number;
  auth: EmployeeAuthMethod;
  authAt: number;
};

export function parseEmployeeClaims(payload: Record<string, unknown> | null): EmployeeClaims | null {
  if (!payload || payload.kind !== "employee") return null;
  const { uid, sv, auth, authAt } = payload;
  if (typeof uid !== "string" || uid.length === 0 || uid.length > 64) return null;
  if (typeof sv !== "number" || !Number.isInteger(sv)) return null;
  if (auth !== "otp" && auth !== "pin") return null;
  if (typeof authAt !== "number" || !Number.isFinite(authAt)) return null;
  return { kind: "employee", uid, sv, auth, authAt };
}
