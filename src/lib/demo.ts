export const DEMO_EMPLOYEE = {
  employeeId: "EMP-48219",
  name: "Priya Nair",
  phone: "9845012345",
  pin: "4826",
};

// PIN every seeded stall starts with in demo mode. The seed reads the same variable.
export function demoVendorPin() {
  return process.env.DEMO_VENDOR_PIN || "1234";
}

export const EMPLOYEE_COOKIE = "fc_employee";
export const VENDOR_COOKIE = "fc_vendor";
export const OTP_TICKET_COOKIE = "fc_otp";
export const REGISTRATION_TICKET_COOKIE = "fc_reg";
export const SIGN_IN_DRAFT_COOKIE = "fc_signin";
