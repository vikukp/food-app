import { cache } from "react";
import { cookies, headers } from "next/headers";
import {
  EMPLOYEE_COOKIE,
  OTP_TICKET_COOKIE,
  REGISTRATION_TICKET_COOKIE,
  SIGN_IN_DRAFT_COOKIE,
  VENDOR_COOKIE,
} from "@/lib/demo";
import { prisma } from "@/lib/prisma";
import { sessionSecret } from "@/lib/secret";
import { type EmployeeAuthMethod, parseEmployeeClaims } from "@/lib/session-claims";
import { signToken, verifyToken } from "@/lib/signed-token";

export type EmployeeSession = {
  uid: string;
  employeeId: string;
  name: string;
  phone: string;
  auth: EmployeeAuthMethod;
  authAt: number;
};

export type VendorSession = {
  stallId: string;
};

type VendorClaims = VendorSession & { kind: "vendor" };

export const EMPLOYEE_SESSION_SECONDS = 60 * 60 * 24 * 7;
export const VENDOR_SESSION_SECONDS = 60 * 60 * 12;
const OTP_TICKET_SECONDS = 10 * 60;
const REGISTRATION_TICKET_SECONDS = 15 * 60;
const SIGN_IN_DRAFT_SECONDS = 10 * 60;
// Changing a PIN needs a code sign-in this recent, not just a long-lived session.
const PIN_CHANGE_WINDOW_MS = 10 * 60_000;

async function cookieOptions(maxAge: number) {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    // Secure only when actually served over TLS, so local http previews keep working.
    secure: proto.split(",")[0].trim() === "https",
  };
}

async function readVendorClaims(token: string | undefined) {
  const claims = await verifyToken<VendorClaims>(token, sessionSecret());
  return claims?.kind === "vendor" ? claims : null;
}

// The cookie only names the employee; the database decides whether it is still
// valid, so a PIN reset can sign out every other device.
export const getEmployeeSession = cache(async (): Promise<EmployeeSession | null> => {
  const store = await cookies();
  const claims = parseEmployeeClaims(await verifyToken(store.get(EMPLOYEE_COOKIE)?.value, sessionSecret()));
  if (!claims) return null;
  const employee = await prisma.employee.findUnique({
    where: { id: claims.uid },
    select: { id: true, employeeId: true, name: true, phone: true, sessionVersion: true },
  });
  if (!employee || employee.sessionVersion !== claims.sv) return null;
  return {
    uid: employee.id,
    employeeId: employee.employeeId,
    name: employee.name,
    phone: employee.phone,
    auth: claims.auth,
    authAt: claims.authAt,
  };
});

export function canChangePin(session: EmployeeSession) {
  return session.auth === "otp" && Date.now() - session.authAt < PIN_CHANGE_WINDOW_MS;
}

export async function getVendorSession(): Promise<VendorSession | null> {
  const store = await cookies();
  const claims = await readVendorClaims(store.get(VENDOR_COOKIE)?.value);
  return claims ? { stallId: claims.stallId } : null;
}

export async function startEmployeeSession(
  employee: { id: string; sessionVersion: number },
  auth: EmployeeAuthMethod,
  authAt = Date.now(),
) {
  const store = await cookies();
  const token = await signToken(
    { kind: "employee", uid: employee.id, sv: employee.sessionVersion, auth, authAt },
    sessionSecret(),
    EMPLOYEE_SESSION_SECONDS,
  );
  store.set(EMPLOYEE_COOKIE, token, await cookieOptions(EMPLOYEE_SESSION_SECONDS));
  store.delete(SIGN_IN_DRAFT_COOKIE);
}

export async function setVendorSession(session: VendorSession) {
  const store = await cookies();
  const token = await signToken({ ...session, kind: "vendor" }, sessionSecret(), VENDOR_SESSION_SECONDS);
  store.set(VENDOR_COOKIE, token, await cookieOptions(VENDOR_SESSION_SECONDS));
}

export async function clearEmployeeSession() {
  const store = await cookies();
  store.delete(EMPLOYEE_COOKIE);
}

export async function clearVendorSession() {
  const store = await cookies();
  store.delete(VENDOR_COOKIE);
}

// Short-lived tickets carry a sign-in between steps: what was typed into the
// sign-in form (so a refusal does not wipe it, and phone numbers stay out of
// URLs), which code this browser asked for, and which phone it has verified
// but not yet registered.

export async function setSignInDraft(typed: string) {
  const store = await cookies();
  const token = await signToken({ kind: "draft", typed }, sessionSecret(), SIGN_IN_DRAFT_SECONDS);
  store.set(SIGN_IN_DRAFT_COOKIE, token, await cookieOptions(SIGN_IN_DRAFT_SECONDS));
}

export async function readSignInDraft(): Promise<string | null> {
  const store = await cookies();
  const claims = await verifyToken<{ kind?: unknown; typed?: unknown }>(
    store.get(SIGN_IN_DRAFT_COOKIE)?.value,
    sessionSecret(),
  );
  return claims?.kind === "draft" && typeof claims.typed === "string" ? claims.typed : null;
}

export async function setOtpTicket(challengeId: string) {
  const store = await cookies();
  const token = await signToken({ kind: "otp", cid: challengeId }, sessionSecret(), OTP_TICKET_SECONDS);
  store.set(OTP_TICKET_COOKIE, token, await cookieOptions(OTP_TICKET_SECONDS));
}

export async function readOtpTicket(): Promise<string | null> {
  const store = await cookies();
  const claims = await verifyToken<{ kind?: unknown; cid?: unknown }>(
    store.get(OTP_TICKET_COOKIE)?.value,
    sessionSecret(),
  );
  return claims?.kind === "otp" && typeof claims.cid === "string" ? claims.cid : null;
}

export async function clearOtpTicket() {
  const store = await cookies();
  store.delete(OTP_TICKET_COOKIE);
}

export type RegistrationTicket = {
  phone: string;
  name: string;
  employeeId: string;
  expiresAt: number;
};

export async function setRegistrationTicket(
  draft: { phone: string; name?: string; employeeId?: string },
  expiresAt = Date.now() + REGISTRATION_TICKET_SECONDS * 1000,
) {
  const ttl = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
  const store = await cookies();
  const token = await signToken(
    { kind: "reg", phone: draft.phone, name: draft.name ?? "", employeeId: draft.employeeId ?? "" },
    sessionSecret(),
    ttl,
  );
  store.set(REGISTRATION_TICKET_COOKIE, token, await cookieOptions(ttl));
}

export async function readRegistrationTicket(): Promise<RegistrationTicket | null> {
  const store = await cookies();
  const claims = await verifyToken<{ kind?: unknown; phone?: unknown; name?: unknown; employeeId?: unknown }>(
    store.get(REGISTRATION_TICKET_COOKIE)?.value,
    sessionSecret(),
  );
  if (claims?.kind !== "reg" || typeof claims.phone !== "string") return null;
  return {
    phone: claims.phone,
    name: typeof claims.name === "string" ? claims.name : "",
    employeeId: typeof claims.employeeId === "string" ? claims.employeeId : "",
    expiresAt: claims.exp * 1000,
  };
}

export async function clearRegistrationTicket() {
  const store = await cookies();
  store.delete(REGISTRATION_TICKET_COOKIE);
}
