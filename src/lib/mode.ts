// DEMO_MODE=1 turns on everything that makes a demo easy and a deployment
// unsafe: sign-in codes shown on screen instead of texted, the shared demo
// counter PIN on the login page, and the seeded demo employee. It is off
// unless set, so a production server that forgets a setting fails closed.
export function demoMode() {
  return process.env.DEMO_MODE === "1";
}
