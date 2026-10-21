import { redirect } from "next/navigation";
import { FormError, PinField, fieldClass } from "@/components/auth-ui";
import { SubmitButton } from "@/components/submit-button";
import { EMPLOYEE_LOGIN_ERRORS, loginError } from "@/lib/auth-errors";
import { registerEmployee } from "@/lib/employee-auth-actions";
import { formatPhone } from "@/lib/phone";
import { readRegistrationTicket } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "Create your account" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: code } = await searchParams;
  const ticket = await readRegistrationTicket();
  if (!ticket) redirect("/enter?error=regexpired");
  const error = loginError(EMPLOYEE_LOGIN_ERRORS, code);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your food court account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your number is verified. Add your badge details and choose a PIN, so next time you can sign in
        without waiting for a text.
      </p>

      <div className="mt-6 rounded-xl border bg-card p-4">
        <form action={registerEmployee} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">
              Mobile number
            </label>
            <div className="relative">
              <input
                id="username"
                name="username"
                readOnly
                value={formatPhone(ticket.phone)}
                autoComplete="username"
                className={cn(fieldClass, "bg-muted/60 pr-20 text-muted-foreground")}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-emerald-800">
                Verified
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Name on your badge
            </label>
            <input
              id="name"
              name="name"
              required
              autoComplete="name"
              maxLength={60}
              defaultValue={ticket.name}
              className={fieldClass}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="employeeId" className="text-sm font-medium">
              Employee ID
            </label>
            <input
              id="employeeId"
              name="employeeId"
              required
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={20}
              pattern="[A-Za-z0-9][A-Za-z0-9\-]{2,19}"
              title="Letters, digits and hyphens, for example HPE-48219"
              placeholder="HPE-48219"
              defaultValue={ticket.employeeId}
              className={fieldClass}
            />
          </div>
          <PinField
            id="pin"
            label="Choose a PIN"
            autoComplete="new-password"
            hint="4 to 6 digits. Skip easy ones like 1234, 1111 or the end of your mobile number."
          />
          <PinField id="confirmPin" label="Repeat the PIN" autoComplete="new-password" />
          {error ? <FormError>{error}</FormError> : null}
          <SubmitButton pendingLabel="Creating your account…">Create account</SubmitButton>
          <p className="text-xs text-muted-foreground">
            Your orders are linked to this employee ID. The verification is valid for 15 minutes.
          </p>
        </form>
      </div>
    </>
  );
}
