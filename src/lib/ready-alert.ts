// Browser-side nudges: "your food is ready" for employees, and the sounds the
// counter plays (an order due to start, a ticket it must not hand over). Each
// one is best effort: a phone may block sound until the page has been
// touched, a desktop may have no vibration motor, and notifications need the
// employee's permission.

export function canNotify() {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function askToNotify() {
  if (!canNotify() || Notification.permission !== "default") return canNotify() && Notification.permission === "granted";
  return (await Notification.requestPermission()) === "granted";
}

function audioContextClass() {
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

// A counter tablet turns sound on with a tap (browsers keep it off until the
// page has been touched) and keeps that one audio context for every sound
// after, as some (Safari) would not start a new one without a tap.
let kept: AudioContext | null = null;

export async function turnOnSound() {
  try {
    const Context = audioContextClass();
    if (!Context) return false;
    kept ??= new Context();
    await kept.resume();
    return kept.state === "running";
  } catch {
    return false;
  }
}

export function soundIsOn() {
  return kept?.state === "running";
}

// Rising for good news (ready, time to start), falling for a ticket the
// counter must not hand over.
const TONES = { ok: [880, 1175], wrong: [440, 294] };

export function chime(kind: keyof typeof TONES = "ok") {
  try {
    const Context = audioContextClass();
    if (!Context) return;
    const audio = kept?.state === "running" ? kept : new Context();
    TONES[kind].forEach((frequency, i) => {
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
    if (audio !== kept) setTimeout(() => void audio.close(), 800);
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
