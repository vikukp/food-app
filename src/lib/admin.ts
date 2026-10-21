import { DEMO_EMPLOYEE } from "@/lib/demo";
import { demoMode } from "@/lib/mode";
import { normalizeIndianMobile } from "@/lib/phone";
import { getEmployeeSession, type EmployeeSession } from "@/lib/session";

// Food court managers are listed by mobile number in ADMIN_PHONES
// (comma-separated). The phone is the one thing a sign-in proves: employee IDs
// are typed in at registration, so anyone could claim a manager's ID. In demo
// mode with none listed, the demo employee is an admin.
export function adminPhones() {
  const listed = (process.env.ADMIN_PHONES ?? "")
    .split(",")
    .map((raw) => normalizeIndianMobile(raw))
    .filter((phone): phone is string => Boolean(phone));
  if (!listed.length && demoMode()) listed.push(normalizeIndianMobile(DEMO_EMPLOYEE.phone)!);
  return new Set(listed);
}

export function isAdmin(session: Pick<EmployeeSession, "phone">) {
  return adminPhones().has(session.phone);
}

export async function getAdminSession() {
  const session = await getEmployeeSession();
  return session && isAdmin(session) ? session : null;
}
