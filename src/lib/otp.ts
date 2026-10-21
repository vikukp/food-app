import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sessionSecret } from "@/lib/secret";
import { hmacHex } from "@/lib/signed-token";
import { sendOtpSms, smsMode } from "@/lib/sms";

export type OtpPurpose = "signin" | "reset";

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_SECONDS = 30;
const OTP_PER_PHONE_PER_HOUR = 5;
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

// A global ceiling on texts per rolling 24 hours, so a scripted abuse run
// cannot run up the SMS bill.
function dailyLimit() {
  const value = Number(process.env.OTP_DAILY_LIMIT ?? 2000);
  return Number.isInteger(value) && value > 0 ? value : 2000;
}

function hashCode(challengeId: string, phone: string, code: string) {
  return hmacHex(sessionSecret(), `otp:${challengeId}:${phone}:${code}`);
}

function sameHex(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export type IssueOtpResult =
  | { ok: true; challengeId: string }
  | { ok: false; error: "cooldown" | "phonelimit" | "daily" | "sms" };

// Requests for one number take turns, so parallel requests cannot all pass the
// cooldown and hourly checks before any of them is written. In-process, like
// the rate limits: fine for one server.
const issuing = new Map<string, Promise<unknown>>();

export function issueOtp(phone: string, purpose: OtpPurpose): Promise<IssueOtpResult> {
  const previous = issuing.get(phone) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(() => issueOtpNow(phone, purpose));
  issuing.set(phone, run);
  void run.finally(() => {
    if (issuing.get(phone) === run) issuing.delete(phone);
  }).catch(() => {});
  return run;
}

async function issueOtpNow(phone: string, purpose: OtpPurpose): Promise<IssueOtpResult> {
  const now = Date.now();
  const lastHour = await prisma.otpChallenge.findMany({
    where: { phone, createdAt: { gt: new Date(now - HOUR_MS) } },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (lastHour[0] && now - lastHour[0].createdAt.getTime() < OTP_RESEND_SECONDS * 1000) {
    return { ok: false, error: "cooldown" };
  }
  if (lastHour.length >= OTP_PER_PHONE_PER_HOUR) return { ok: false, error: "phonelimit" };
  const lastDay = await prisma.otpChallenge.count({ where: { createdAt: { gt: new Date(now - DAY_MS) } } });
  if (lastDay >= dailyLimit()) return { ok: false, error: "daily" };

  const id = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.$transaction([
    prisma.otpChallenge.deleteMany({ where: { createdAt: { lt: new Date(now - 2 * DAY_MS) } } }),
    // Only the newest code for a number works.
    prisma.otpChallenge.updateMany({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date(now) } },
      data: { expiresAt: new Date(now) },
    }),
    prisma.otpChallenge.create({
      data: {
        id,
        phone,
        purpose,
        codeHash: await hashCode(id, phone, code),
        demoCode: smsMode() === "demo" ? code : null,
        expiresAt: new Date(now + OTP_TTL_SECONDS * 1000),
      },
    }),
  ]);

  if (!(await sendOtpSms(phone, code))) {
    await prisma.otpChallenge.update({ where: { id }, data: { expiresAt: new Date() } });
    return { ok: false, error: "sms" };
  }
  return { ok: true, challengeId: id };
}

export type CheckOtpResult =
  | { ok: true; phone: string; purpose: OtpPurpose }
  | { ok: false; error: "wrong" | "exhausted" | "expired" };

export async function checkOtp(challengeId: string, code: string): Promise<CheckOtpResult> {
  // Count the attempt before comparing, so parallel guesses cannot exceed the limit.
  const claimed = await prisma.otpChallenge.updateMany({
    where: {
      id: challengeId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: OTP_MAX_ATTEMPTS },
    },
    data: { attempts: { increment: 1 } },
  });
  const challenge = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge) return { ok: false, error: "expired" };
  const exhausted = challenge.attempts >= OTP_MAX_ATTEMPTS;
  if (claimed.count === 0) return { ok: false, error: exhausted && !challenge.consumedAt ? "exhausted" : "expired" };

  if (!sameHex(await hashCode(challenge.id, challenge.phone, code), challenge.codeHash)) {
    return { ok: false, error: exhausted ? "exhausted" : "wrong" };
  }
  const consumed = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date(), demoCode: null },
  });
  if (consumed.count === 0) return { ok: false, error: "expired" };
  return { ok: true, phone: challenge.phone, purpose: challenge.purpose === "reset" ? "reset" : "signin" };
}

export type OtpChallengeView = {
  phone: string;
  purpose: OtpPurpose;
  status: "open" | "expired" | "exhausted" | "used";
  issuedAt: number;
  attemptsLeft: number;
  resendInSeconds: number;
  demoCode: string | null;
};

export async function getOtpChallengeView(challengeId: string): Promise<OtpChallengeView | null> {
  const challenge = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge) return null;
  const now = Date.now();
  const status = challenge.consumedAt
    ? "used"
    : challenge.attempts >= OTP_MAX_ATTEMPTS
      ? "exhausted"
      : challenge.expiresAt.getTime() <= now
        ? "expired"
        : "open";
  return {
    phone: challenge.phone,
    purpose: challenge.purpose === "reset" ? "reset" : "signin",
    status,
    issuedAt: challenge.createdAt.getTime(),
    attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - challenge.attempts),
    resendInSeconds: Math.max(
      0,
      Math.ceil((challenge.createdAt.getTime() + OTP_RESEND_SECONDS * 1000 - now) / 1000),
    ),
    demoCode: status === "open" && smsMode() === "demo" ? challenge.demoCode : null,
  };
}
