import { demoMode } from "@/lib/mode";
import { maskPhone } from "@/lib/phone";

export type SmsMode = "demo" | "twilio" | "misconfigured";

// Demo mode sends nothing: the code is shown on the verify screen instead, so
// anyone can sign in as any number. It needs DEMO_MODE=1; without it and
// without a real provider, codes are refused rather than shown.
export function smsMode(): SmsMode {
  const provider = (process.env.SMS_PROVIDER ?? "").trim().toLowerCase();
  if (provider === "twilio") return "twilio";
  if ((provider === "" || provider === "demo") && demoMode()) return "demo";
  return "misconfigured";
}

export function otpMessage(code: string) {
  return `${code} is your HPE IWF Food Court sign-in code. Valid for 5 minutes. Do not share it with anyone.`;
}

export async function sendOtpSms(phone: string, code: string): Promise<boolean> {
  const mode = smsMode();
  if (mode === "demo") {
    console.info(`[sms:demo] ${maskPhone(phone)}: ${otpMessage(code)}`);
    return true;
  }
  if (mode === "twilio") return sendWithTwilio(phone, otpMessage(code));
  console.error(
    process.env.SMS_PROVIDER
      ? `[sms] SMS_PROVIDER="${process.env.SMS_PROVIDER}" is not supported here; use "twilio" (or "demo" with DEMO_MODE=1).`
      : "[sms] No SMS provider configured: set SMS_PROVIDER=twilio, or DEMO_MODE=1 for a demo that shows codes on screen.",
  );
  return false;
}

async function sendWithTwilio(to: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
    console.error(
      "[sms] SMS_PROVIDER=twilio needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID.",
    );
    return false;
  }

  const form = new URLSearchParams({ To: to, Body: body });
  if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);
  else form.set("From", from!);

  const base = (process.env.TWILIO_API_BASE ?? "https://api.twilio.com").replace(/\/+$/, "");
  try {
    const response = await fetch(`${base}/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`[sms] Twilio rejected the message to ${maskPhone(to)} with HTTP ${response.status}.`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[sms] Twilio request failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
