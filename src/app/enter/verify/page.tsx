import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoSmsBanner, FormError, FormNotice, fieldClass, linkClass } from "@/components/auth-ui";
import { ResendCodeButton } from "@/components/resend-code-button";
import { SubmitButton } from "@/components/submit-button";
import { EMPLOYEE_LOGIN_ERRORS, loginError } from "@/lib/auth-errors";
import { resendOtp, verifyOtpCode } from "@/lib/employee-auth-actions";
import { OTP_MAX_ATTEMPTS, getOtpChallengeView } from "@/lib/otp";
import { maskPhone } from "@/lib/phone";
import { readOtpTicket } from "@/lib/session";
import { otpMessage } from "@/lib/sms";
import { cn } from "@/lib/utils";

export const metadata = { title: "Enter your code" };

// Once a code is dead, its own status says why; only sending errors still apply.
const CODE_ERRORS = new Set(["wrong", "exhausted", "expired", "codeformat"]);

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error: code, sent } = await searchParams;
  const challengeId = await readOtpTicket();
  const challenge = challengeId ? await getOtpChallengeView(challengeId) : null;
  if (!challenge) redirect("/enter?error=expired");
  if (challenge.status === "used") redirect("/enter");

  const open = challenge.status === "open";
  const error = !open && code && CODE_ERRORS.has(code) ? null : loginError(EMPLOYEE_LOGIN_ERRORS, code);
  const phone = maskPhone(challenge.phone);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Enter the code</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We sent a 6-digit code to <span className="font-medium text-foreground">{phone}</span>. It works for 5
        minutes.
      </p>

      {challenge.demoCode ? (
        <div className="mt-5">
          <DemoSmsBanner title="Demo SMS inbox">
            <p className="text-xs">To {phone}</p>
            <p className="mt-1 rounded-lg bg-white/70 px-3 py-2 text-amber-950">{otpMessage(challenge.demoCode)}</p>
          </DemoSmsBanner>
        </div>
      ) : null}

      <div className="mt-6 space-y-4 rounded-xl border bg-card p-4">
        {open ? (
          <form action={verifyOtpCode} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="code" className="text-sm font-medium">
                6-digit code
              </label>
              <input
                id="code"
                name="code"
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                title="6 digits"
                className={cn(fieldClass, "h-12 text-center font-mono text-xl tracking-[0.5em]")}
              />
              {challenge.attemptsLeft < OTP_MAX_ATTEMPTS ? (
                <p className="text-xs text-muted-foreground">
                  {challenge.attemptsLeft} {challenge.attemptsLeft === 1 ? "try" : "tries"} left for this code.
                </p>
              ) : null}
            </div>
            {error ? (
              <FormError>{error}</FormError>
            ) : sent === "1" ? (
              <FormNotice>New code sent. Earlier codes no longer work.</FormNotice>
            ) : null}
            <SubmitButton pendingLabel="Checking…">Verify and continue</SubmitButton>
          </form>
        ) : (
          <FormError>
            {challenge.status === "exhausted" ? EMPLOYEE_LOGIN_ERRORS.exhausted : EMPLOYEE_LOGIN_ERRORS.expired}
          </FormError>
        )}
        {!open && error ? <FormError>{error}</FormError> : null}
        <form action={resendOtp}>
          <ResendCodeButton key={challenge.issuedAt} waitSeconds={challenge.resendInSeconds} />
        </form>
      </div>

      <p className="mt-4 text-center text-sm">
        <Link href={challenge.purpose === "reset" ? "/enter?reset=1" : "/enter"} className={linkClass}>
          Use a different number
        </Link>
      </p>
    </>
  );
}
