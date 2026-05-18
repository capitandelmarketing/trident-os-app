// notify-sound.js — Audible + visual notification when system needs operator's attention
// Uses Web Audio API (no audio file needed · works after first user interaction)
// Exposes window.attentionNeeded(message) callable from anywhere (incl. console + preview_eval)

let audioCtx = null;
let unlocked = false;

// Unlock audio on first user interaction (browser policy)
function unlock() {
  if (unlocked) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    unlocked = true;
    console.log("[notify-sound] Audio unlocked");
  } catch (e) {
    console.warn("[notify-sound] Unlock failed:", e.message);
  }
}

// Auto-unlock on any user interaction
["click", "keydown", "touchstart"].forEach(evt => {
  document.addEventListener(evt, unlock, { once: false, passive: true });
});

// Pleasant 2-tone chime (C5 + E5 · 220ms each · soft envelope)
function playChime(volume = 0.3) {
  if (!unlocked || !audioCtx) {
    console.warn("[notify-sound] Audio not unlocked yet · click anywhere first");
    return;
  }
  const now = audioCtx.currentTime;
  const tones = [
    { freq: 523.25, start: 0,    duration: 0.22 }, // C5
    { freq: 659.25, start: 0.12, duration: 0.28 }  // E5
  ];
  tones.forEach(({ freq, start, duration }) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + start);
    // Soft attack + decay envelope
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(volume, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + start);
    osc.stop(now + start + duration + 0.05);
  });
}

// Toast notification (visual fallback)
function showToast(message, kind = "attention") {
  const t = document.createElement("div");
  t.className = `notify-toast notify-toast--${kind}`;
  t.innerHTML = `
    <span class="notify-toast__icon">${kind === "attention" ? "🔔" : kind === "ok" ? "✅" : "⚠️"}</span>
    <span class="notify-toast__msg">${message}</span>
    <button class="notify-toast__close">×</button>
  `;
  t.querySelector(".notify-toast__close").addEventListener("click", () => t.remove());
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("notify-toast--show"), 10);
  setTimeout(() => {
    t.classList.remove("notify-toast--show");
    setTimeout(() => t.remove(), 400);
  }, 8000);
}

// Title flash (so Damian sees it even if tab not active)
let titleInterval = null;
let originalTitle = null;
function flashTitle(message = "🔔 Trident OS necesita atención") {
  if (titleInterval) clearInterval(titleInterval);
  originalTitle = originalTitle || document.title;
  let toggle = false;
  titleInterval = setInterval(() => {
    document.title = toggle ? originalTitle : message;
    toggle = !toggle;
  }, 1000);

  // Stop flashing when tab regains focus
  const stop = () => {
    if (titleInterval) { clearInterval(titleInterval); titleInterval = null; }
    document.title = originalTitle;
    window.removeEventListener("focus", stop);
  };
  window.addEventListener("focus", stop);
}

// Browser native notification (asks permission once)
async function nativeNotify(message) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch {}
  }
  if (Notification.permission === "granted") {
    new Notification("Trident OS", {
      body: message,
      icon: "/favicon.ico",
      tag: "trident-attention",
      requireInteraction: true
    });
  }
}

// ============ PUBLIC API ============

// Call this from anywhere when you need Damian's attention
window.attentionNeeded = function(message = "Trident OS necesita tu atención") {
  console.log(`[notify] 🔔 ATTENTION NEEDED: ${message}`);
  playChime(0.35);
  showToast(message, "attention");
  flashTitle(`🔔 ${message.substring(0, 40)}…`);
  nativeNotify(message);
};

// Lighter version for success/info notifications (no title flash)
window.notifyInfo = function(message, kind = "ok") {
  console.log(`[notify] ${kind}: ${message}`);
  if (kind === "attention") playChime(0.35);
  showToast(message, kind);
};

console.log("[notify-sound] Ready. Call window.attentionNeeded('msg') to alert operator.");
