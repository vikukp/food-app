import { DEMO_EMPLOYEE } from "@/lib/demo";
import { demoMode } from "@/lib/mode";
import { getEmployeeSession } from "@/lib/session";

// Food court managers are ordinary employees listed in ADMIN_EMPLOYEE_IDS
// (comma-separated). In demo mode with none listed, the demo employee is one.
export function adminEmployeeIds() {
  const listed = (process.env.ADMIN_EMPLOYEE_IDS ?? "")
    .split(",")
    .map((id) => id.trim().toUpperCase())
    .filter(Boolean);
  if (!listed.length && demoMode()) listed.push(DEMO_EMPLOYEE.employeeId);
  return new Set(listed);
}

export async function getAdminSession() {
  const session = await getEmployeeSession();
  return session && adminEmployeeIds().has(session.employeeId.toUpperCase()) ? session : null;
}
