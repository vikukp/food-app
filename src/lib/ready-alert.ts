// Browser-side nudges for "your food is ready". Each one is best effort: a
// phone may block sound until the page has been touched, a desktop may have
// no vibration motor, and notifications need the employee's permission.

export function canNotify() {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function askToNotify() {
  if (!canNotify() || Notification.permission !== "default") return canNotify() && Notification.permission === "granted";
  return (await Notification.requestPermission()) === "granted";
}

function chime() {
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const audio = new Context();
    [880, 1175].forEach((frequency, i) => {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = frequency;
      const start = audio.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      tone.connect(gain).connect(audio.destination);
      tone.start(start);
      tone.stop(start + 0.22);
    });
    setTimeout(() => void audio.close(), 800);
  } catch {
    // No audio: the on-screen change still shows.
  }
}

export function announceReady(token: string, stallName: string) {
  navigator.vibrate?.([200, 100, 200]);
  chime();
  if (canNotify() && Notification.permission === "granted" && document.visibilityState !== "visible") {
    try {
      // Tokens repeat across stalls, so the tag names both.
      new Notification(`${token} is ready`, { body: `Collect it at ${stallName}.`, tag: `${token}@${stallName}` });
    } catch {
      // Some mobile browsers only allow notifications from a service worker.
    }
  }
}
