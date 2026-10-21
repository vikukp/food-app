import Link from "next/link";
import { redirect } from "next/navigation";
import { FormError, PinField, linkClass } from "@/components/auth-ui";
import { SubmitButton } from "@/components/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { EMPLOYEE_LOGIN_ERRORS, loginError } from "@/lib/auth-errors";
import { setNewPin } from "@/lib/employee-auth-actions";
import { formatPhone } from "@/lib/phone";
import { canChangePin, getEmployeeSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "Choose a new PIN" };

export default async function NewPinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error: code, saved } = await searchParams;
  const session = await getEmployeeSession();
  if (!session) redirect("/enter?reset=1&error=reauth");

  if (saved === "1") {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">PIN updated</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Next time, sign in with {formatPhone(session.phone)} or {session.employeeId} and your new PIN. Any
          other device signed in to your account has been signed out.
        </p>
        <Link href="/stalls" className={cn(buttonVariants(), "mt-6 h-10 w-full")}>
          Browse stalls
        </Link>
      </>
    );
  }

  if (!canChangePin(session)) redirect("/enter?reset=1&error=reauth");
  const error = loginError(EMPLOYEE_LOGIN_ERRORS, code);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new PIN</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        For {session.name} ({formatPhone(session.phone)}). Saving it signs out your other devices.
      </p>
      <div className="mt-6 rounded-xl border bg-card p-4">
        <form action={setNewPin} className="space-y-4">
          <input type="text" name="username" autoComplete="username" value={formatPhone(session.phone)} readOnly hidden />
          <PinField
            id="pin"
            label="New PIN"
            autoComplete="new-password"
            hint="4 to 6 digits. Skip easy ones like 1234, 1111 or the end of your mobile number."
          />
          <PinField id="confirmPin" label="Repeat the new PIN" autoComplete="new-password" />
          {error ? <FormError>{error}</FormError> : null}
          <SubmitButton pendingLabel="Saving…">Save PIN</SubmitButton>
        </form>
      </div>
      <p className="mt-4 text-center text-sm">
        <Link href="/stalls" className={linkClass}>
          Skip for now
        </Link>
      </p>
    </>
  );
}
