import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoSmsBanner, FormError, PhoneField, PinField, fieldClass, linkClass } from "@/components/auth-ui";
import { SubmitButton } from "@/components/submit-button";
import { EMPLOYEE_LOGIN_ERRORS, loginError } from "@/lib/auth-errors";
import { DEMO_EMPLOYEE } from "@/lib/demo";
import { loginWithPin, requestOtp } from "@/lib/employee-auth-actions";
import { formatPhone, nationalNumber, normalizeIndianMobile } from "@/lib/phone";
import { getEmployeeSession, readSignInDraft } from "@/lib/session";
import { smsMode } from "@/lib/sms";
import { cn } from "@/lib/utils";

export const metadata = { title: "Employee sign-in" };

export default async function EnterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; method?: string; reset?: string }>;
}) {
  const { error: code, method, reset } = await searchParams;
  const resetting = reset === "1";
  const session = await getEmployeeSession();
  if (session && !resetting) redirect("/stalls");

  const usePin = method === "pin" && !resetting;
  const error = loginError(EMPLOYEE_LOGIN_ERRORS, code);
  const sms = smsMode();
  const demo = sms === "demo";
  const demoPhone = formatPhone(normalizeIndianMobile(DEMO_EMPLOYEE.phone)!);
  // After a refusal, show what was typed rather than the demo number.
  const typed = error ? await readSignInDraft() : null;
  const suggested = session ? nationalNumber(session.phone) : demo ? DEMO_EMPLOYEE.phone : undefined;
  const fieldDefault = typed ?? suggested;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {resetting ? "Reset your PIN" : "Sign in to order"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {resetting
          ? "We will text a code to your registered mobile number. Enter it, then choose a new PIN."
          : "Use your mobile number. First time here? Verify your number once, then add your name, employee ID and a PIN."}
      </p>

      {demo ? (
        <div className="mt-5">
          <DemoSmsBanner>
            No texts are sent: the code appears on the next screen. Demo employee: {demoPhone}, PIN{" "}
            {DEMO_EMPLOYEE.pin}.
          </DemoSmsBanner>
        </div>
      ) : sms === "misconfigured" ? (
        <div className="mt-5">
          <DemoSmsBanner title="Text codes are unavailable">
            Sign in with your PIN for now. New employees can register once codes are back.
          </DemoSmsBanner>
        </div>
      ) : null}

      {resetting ? null : (
        <nav
          aria-label="Sign-in method"
          className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-sm font-medium"
        >
          <MethodLink href="/enter" active={!usePin}>
            One-time code
          </MethodLink>
          <MethodLink href="/enter?method=pin" active={usePin}>
            PIN
          </MethodLink>
        </nav>
      )}

      <div className={cn("rounded-xl border bg-card p-4", resetting ? "mt-6" : "mt-3")}>
        {usePin ? (
          <form action={loginWithPin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="identifier" className="text-sm font-medium">
                Mobile number or employee ID
              </label>
              <input
                id="identifier"
                name="identifier"
                required
                autoComplete="username"
                maxLength={20}
                placeholder="98450 12345 or HPE-48219"
                defaultValue={fieldDefault}
                className={fieldClass}
              />
            </div>
            <PinField id="pin" label="PIN" autoComplete="current-password" />
            {error ? <FormError>{error}</FormError> : null}
            <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
            <p className="text-center text-sm">
              <Link href="/enter?reset=1" className={linkClass}>
                Forgot PIN?
              </Link>
            </p>
          </form>
        ) : (
          <form action={requestOtp} className="space-y-4">
            <input type="hidden" name="purpose" value={resetting ? "reset" : "signin"} />
            <PhoneField defaultValue={fieldDefault} />
            {error ? <FormError>{error}</FormError> : null}
            <SubmitButton pendingLabel="Sending code…">Send code</SubmitButton>
            <p className="text-xs text-muted-foreground">
              We text a 6-digit code that works for 5 minutes.
            </p>
          </form>
        )}
      </div>

      {resetting ? (
        <p className="mt-4 text-center text-sm">
          <Link href={session ? "/stalls" : "/enter?method=pin"} className={linkClass}>
            {session ? "Back to stalls" : "Back to PIN sign-in"}
          </Link>
        </p>
      ) : null}
    </>
  );
}

function MethodLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-lg px-3 py-2 text-center transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
