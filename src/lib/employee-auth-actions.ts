"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { checkOtp, issueOtp, type OtpPurpose } from "@/lib/otp";
import { nationalNumber, normalizeIndianMobile } from "@/lib/phone";
import { hashPin, isWeakPin, verifyPin } from "@/lib/pin";
import { prisma } from "@/lib/prisma";
import { clientIp, consume } from "@/lib/rate-limit";
import {
  canChangePin,
  clearOtpTicket,
  clearRegistrationTicket,
  getEmployeeSession,
  readOtpTicket,
  readRegistrationTicket,
  setOtpTicket,
  setRegistrationTicket,
  setSignInDraft,
  startEmployeeSession,
} from "@/lib/session";
import {
  EMPLOYEE_ID_PATTERN,
  EMPLOYEE_PIN_PATTERN,
  NAME_PATTERN,
  OTP_CODE_PATTERN,
  cleanText,
} from "@/lib/validation";

const MINUTE = 60_000;
const MAX_PIN_FAILURES = 5;

let dummyPinHash: string | undefined;

function backToSignIn(purpose: OtpPurpose, error: string): never {
  const params = new URLSearchParams(purpose === "reset" ? { reset: "1", error } : { error });
  redirect(`/enter?${params}`);
}

function backToPinSignIn(error: string): never {
  redirect(`/enter?method=pin&error=${error}`);
}

function backToVerify(error: string): never {
  redirect(`/enter/verify?error=${error}`);
}

function pinProblem(pin: string, confirmPin: string, phone: string) {
  if (!EMPLOYEE_PIN_PATTERN.test(pin)) return "pinformat";
  if (pin !== confirmPin) return "pinmatch";
  if (isWeakPin(pin) || nationalNumber(phone).endsWith(pin)) return "pinweak";
  return null;
}

// A code proves the phone, so it also lifts a PIN lockout.
async function completeCodeSignIn(employeeId: string) {
  const employee = await prisma.employee.update({
    where: { id: employeeId },
    data: { pinFailedCount: 0, lastLoginAt: new Date() },
  });
  await startEmployeeSession(employee, "otp");
}

export async function requestOtp(formData: FormData) {
  const purpose: OtpPurpose = formData.get("purpose") === "reset" ? "reset" : "signin";
  const typed = cleanText(formData.get("phone"), 24);
  await setSignInDraft(typed);
  if (!consume(`otp-send:${await clientIp()}`, 30, 60 * MINUTE).ok) backToSignIn(purpose, "rate");
  const phone = normalizeIndianMobile(typed);
  if (!phone) backToSignIn(purpose, "phone");

  const issued = await issueOtp(phone, purpose);
  if (!issued.ok) backToSignIn(purpose, issued.error);
  await setOtpTicket(issued.challengeId);
  redirect("/enter/verify");
}

export async function resendOtp() {
  const challengeId = await readOtpTicket();
  const challenge = challengeId
    ? await prisma.otpChallenge.findUnique({ where: { id: challengeId }, select: { phone: true, purpose: true } })
    : null;
  if (!challenge) backToSignIn("signin", "expired");
  if (!consume(`otp-send:${await clientIp()}`, 30, 60 * MINUTE).ok) backToVerify("rate");

  const issued = await issueOtp(challenge.phone, challenge.purpose === "reset" ? "reset" : "signin");
  if (!issued.ok) backToVerify(issued.error);
  await setOtpTicket(issued.challengeId);
  redirect("/enter/verify?sent=1");
}

export async function verifyOtpCode(formData: FormData) {
  const challengeId = await readOtpTicket();
  if (!challengeId) backToSignIn("signin", "expired");
  if (!consume(`otp-verify:${await clientIp()}`, 60, 15 * MINUTE).ok) backToVerify("rate");
  const code = cleanText(formData.get("code"), 12).replace(/[\s-]/g, "");
  if (!OTP_CODE_PATTERN.test(code)) backToVerify("codeformat");

  const result = await checkOtp(challengeId, code);
  if (!result.ok) backToVerify(result.error);
  await clearOtpTicket();

  const employee = await prisma.employee.findUnique({ where: { phone: result.phone }, select: { id: true } });
  if (!employee) {
    await setRegistrationTicket({ phone: result.phone });
    redirect("/enter/register");
  }
  await completeCodeSignIn(employee.id);
  redirect(result.purpose === "reset" ? "/enter/new-pin" : "/stalls");
}

export async function registerEmployee(formData: FormData) {
  const ticket = await readRegistrationTicket();
  if (!ticket) backToSignIn("signin", "regexpired");

  const existing = await prisma.employee.findUnique({ where: { phone: ticket.phone }, select: { id: true } });
  if (existing) {
    // Registered from another tab after the code was checked; the code still proves the phone.
    await clearRegistrationTicket();
    await completeCodeSignIn(existing.id);
    redirect("/stalls");
  }

  const name = cleanText(formData.get("name"), 60).replace(/\s+/g, " ");
  const employeeId = cleanText(formData.get("employeeId"), 20).toUpperCase();
  const pin = cleanText(formData.get("pin"), 8);
  const keepDraftAndFail = async (error: string): Promise<never> => {
    await setRegistrationTicket({ phone: ticket.phone, name, employeeId }, ticket.expiresAt);
    redirect(`/enter/register?error=${error}`);
  };

  if (!NAME_PATTERN.test(name)) await keepDraftAndFail("name");
  if (!EMPLOYEE_ID_PATTERN.test(employeeId)) await keepDraftAndFail("id");
  const problem = pinProblem(pin, cleanText(formData.get("confirmPin"), 8), ticket.phone);
  if (problem) await keepDraftAndFail(problem);
  if (await prisma.employee.findUnique({ where: { employeeId }, select: { id: true } })) {
    await keepDraftAndFail("idtaken");
  }

  let employee;
  try {
    employee = await prisma.employee.create({
      data: { employeeId, name, phone: ticket.phone, pinHash: hashPin(pin), lastLoginAt: new Date() },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return keepDraftAndFail("idtaken");
    }
    throw error;
  }
  await clearRegistrationTicket();
  await startEmployeeSession(employee, "otp");
  redirect("/stalls");
}

async function findEmployeeForPin(identifier: string) {
  const phone = normalizeIndianMobile(identifier);
  if (phone) {
    const byPhone = await prisma.employee.findUnique({ where: { phone } });
    if (byPhone) return byPhone;
  }
  const employeeId = identifier.toUpperCase();
  return EMPLOYEE_ID_PATTERN.test(employeeId) ? prisma.employee.findUnique({ where: { employeeId } }) : null;
}

export async function loginWithPin(formData: FormData) {
  const identifier = cleanText(formData.get("identifier"), 24);
  await setSignInDraft(identifier);
  if (!consume(`pin-login:${await clientIp()}`, 30, 15 * MINUTE).ok) backToPinSignIn("rate");
  const pin = cleanText(formData.get("pin"), 8);
  if (!identifier) backToPinSignIn("identifier");
  if (!EMPLOYEE_PIN_PATTERN.test(pin)) backToPinSignIn("credentials");

  const employee = await findEmployeeForPin(identifier);
  if (!employee) {
    // Same hashing cost and the same lockout as a real account, so this form
    // cannot be used to find out which numbers are registered.
    verifyPin(pin, (dummyPinHash ??= hashPin("0000")));
    const key = `pin-unknown:${normalizeIndianMobile(identifier) ?? identifier.toUpperCase()}`;
    backToPinSignIn(consume(key, MAX_PIN_FAILURES - 1, 60 * MINUTE).ok ? "credentials" : "locked");
  }

  // Count the attempt before checking it, so parallel guesses cannot get past the limit.
  const claimed = await prisma.employee.updateMany({
    where: { id: employee.id, pinFailedCount: { lt: MAX_PIN_FAILURES } },
    data: { pinFailedCount: { increment: 1 } },
  });
  if (claimed.count === 0) {
    // Hash anyway so a locked account answers as slowly as any other attempt.
    verifyPin(pin, employee.pinHash);
    backToPinSignIn("locked");
  }
  if (!verifyPin(pin, employee.pinHash)) {
    backToPinSignIn(employee.pinFailedCount + 1 >= MAX_PIN_FAILURES ? "locked" : "credentials");
  }

  const signedIn = await prisma.employee.update({
    where: { id: employee.id },
    data: { pinFailedCount: 0, lastLoginAt: new Date() },
  });
  await startEmployeeSession(signedIn, "pin");
  redirect("/stalls");
}

export async function setNewPin(formData: FormData) {
  const session = await getEmployeeSession();
  if (!session || !canChangePin(session)) backToSignIn("reset", "reauth");
  const pin = cleanText(formData.get("pin"), 8);
  const problem = pinProblem(pin, cleanText(formData.get("confirmPin"), 8), session.phone);
  if (problem) redirect(`/enter/new-pin?error=${problem}`);

  // A new session version signs out every other device that had this account open.
  const employee = await prisma.employee.update({
    where: { id: session.uid },
    data: { pinHash: hashPin(pin), pinFailedCount: 0, sessionVersion: { increment: 1 } },
  });
  await startEmployeeSession(employee, "otp", session.authAt);
  redirect("/enter/new-pin?saved=1");
}
