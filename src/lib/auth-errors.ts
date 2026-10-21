// Login pages only ever render one of these fixed strings, keyed by a short
// code in the URL, so nothing typed into the address bar is echoed back.
export const EMPLOYEE_LOGIN_ERRORS: Record<string, string> = {
  phone: "Enter a 10-digit Indian mobile number, for example 98450 12345.",
  cooldown: "A code was sent less than 30 seconds ago. Wait a moment before asking for another.",
  phonelimit: "Too many codes for this number in the last hour. Try again later or sign in with your PIN.",
  daily: "Text messages are paused for today. Sign in with your PIN instead.",
  sms: "We could not send the text message. Try again in a minute or sign in with your PIN.",
  rate: "Too many attempts from this network. Wait a few minutes.",
  expired: "That code has expired. Ask for a new one.",
  codeformat: "Enter the 6-digit code from the text message.",
  wrong: "That code is not right. Check the latest text message.",
  exhausted: "Too many wrong codes. Ask for a new one.",
  identifier: "Enter your mobile number or employee ID.",
  credentials: "That mobile number or employee ID and PIN do not match.",
  locked: "PIN sign-in is locked after 5 wrong tries. Sign in with a one-time code to unlock it.",
  regexpired: "Your verification timed out. Confirm your mobile number again.",
  name: "Enter the name on your badge (letters, spaces, dots or hyphens).",
  id: "Enter a valid employee ID, for example HPE-48219.",
  idtaken: "That employee ID is already registered with another mobile number. Ask the facilities desk if that is wrong.",
  pinformat: "Choose a PIN of 4 to 6 digits.",
  pinmatch: "The two PINs do not match.",
  pinweak:
    "That PIN is too easy to guess. Avoid repeats (1111), runs (1234), common picks and the end of your mobile number.",
  reauth: "To change your PIN, confirm your mobile number with a fresh code.",
};

export const VENDOR_LOGIN_ERRORS: Record<string, string> = {
  stall: "Choose your stall.",
  pin: "PIN is incorrect.",
  locked: "Too many wrong PINs. This stall's login is locked for 15 minutes.",
  rate: "Too many sign-in attempts from this network. Wait a few minutes.",
};

export function loginError(table: Record<string, string>, code: string | undefined) {
  return code ? table[code] ?? null : null;
}
