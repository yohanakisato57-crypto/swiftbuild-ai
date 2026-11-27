let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

/** Call from a user gesture (Send) so the browser lets the chime play later. */
export function unlockAudio() {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') void c.resume();
    // Play one silent tick to fully unlock on iOS Safari.
    const o = c.createOscillator();
    const g = c.createGain();
    g.gain.value = 0;
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.01);
    startKeepAlive();
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
  } catch {
    /* ignore */
  }
}

let keepOsc: OscillatorNode | null = null;
let keepTimer: ReturnType<typeof setTimeout> | undefined;

/** Inaudible tone that keeps the page's audio alive so the chime can still ring when the app is in the background. */
function startKeepAlive() {
  const c = getCtx();
  if (!c || keepOsc) return;
  const o = c.createOscillator();
  const g = c.createGain();
  g.gain.value = 0.00001;
  o.frequency.value = 30;
  o.connect(g).connect(c.destination);
  o.start();
  keepOsc = o;
  clearTimeout(keepTimer);
  keepTimer = setTimeout(stopKeepAlive, 20 * 60 * 1000);
}

function stopKeepAlive() {
  try { keepOsc?.stop(); } catch { /* ignore */ }
  keepOsc = null;
}

function showNotification() {
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification('SwiftBuild AI', { body: 'Your project is ready. Tap to open it.', tag: 'sb-done', silent: false });
    }
  } catch { /* ignore */ }
}

/** Soft two-note rising chime: C5 then G5, ~0.5s total. */
export function playChime() {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') void c.resume();
    showNotification();
    setTimeout(stopKeepAlive, 1500);
    const t0 = c.currentTime + 0.02;
    [[523.25, 0], [783.99, 0.18]].forEach(([freq, delay]) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const s = t0 + delay;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.22, s + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.32);
      o.connect(g).connect(c.destination);
      o.start(s);
      o.stop(s + 0.35);
    });
  } catch {
    /* ignore */
  }
}
