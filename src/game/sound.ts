let ctx: AudioContext | null = null;
let enabled = true; // настройка пользователя
let suspended = false; // системная пауза: потеря фокуса, реклама, пауза платформы

export function setSoundEnabled(v: boolean) {
  enabled = v;
  if (!v) hardSuspend();
}

/**
 * Требование 1.3: при потере фокуса звук из игры останавливается.
 * Требование 4.7: при показе рекламы звук ставится на паузу.
 */
export function setSoundSuspended(v: boolean) {
  suspended = v;
  if (v) hardSuspend();
}

function hardSuspend() {
  try {
    if (ctx && ctx.state === "running") void ctx.suspend();
  } catch {
    /* noop */
  }
}

function ac(): AudioContext | null {
  if (!enabled || suspended || typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, dur: number, gain: number, type: OscillatorType = "square", when = 0) {
  const c = ac();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + when);
  g.gain.setValueAtTime(gain, c.currentTime + when);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + when + dur);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + when);
  osc.stop(c.currentTime + when + dur + 0.02);
}

/** Скользящий тон (whoosh) — для старта прокрутки и эффектов буста. */
function sweep(fFrom: number, fTo: number, dur: number, gain: number, type: OscillatorType = "sawtooth", when = 0) {
  const c = ac();
  if (!c) return;
  try {
    const t = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fFrom, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, fTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.22);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch {
    /* noop */
  }
}

export function sfxClick(crit: boolean) {
  blip(crit ? 660 : 210, 0.07, crit ? 0.09 : 0.05, "square");
  if (crit) blip(990, 0.12, 0.08, "sawtooth", 0.04);
}

export function sfxBuy() {
  blip(320, 0.09, 0.07, "triangle");
  blip(480, 0.12, 0.07, "triangle", 0.08);
}

export function sfxWin() {
  [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.16, 0.08, "triangle", i * 0.09));
}

export function sfxSpin() {
  blip(180, 0.05, 0.04, "square");
}

export function sfxFail() {
  blip(160, 0.18, 0.06, "sawtooth");
}

// ── Рулетка контейнеров (в духе CS2) ──────────────────────────

/** Свист старта прокрутки. */
export function sfxSpinStart() {
  sweep(200, 1150, 0.5, 0.045, "sawtooth");
  sweep(150, 780, 0.55, 0.03, "triangle", 0.05);
}

/** Щелчок прохождения ячейки под указателем — сухой «пластиковый» тик. */
export function sfxTick() {
  blip(2100, 0.024, 0.028, "square");
}

/** Особый тик, когда мимо указателя пролетает эпик/легенда. */
export function sfxTickRare() {
  blip(2450, 0.035, 0.05, "square");
  blip(3300, 0.05, 0.036, "square", 0.035);
}

/** Выигрыш: кэш — звонкая «касса». */
export function sfxRewardCash() {
  [880, 1109, 1319, 1760].forEach((f, i) => blip(f, 0.12, 0.07, "triangle", i * 0.06));
  blip(2637, 0.12, 0.04, "square", 0.27);
}

/** Выигрыш: буст — восходящий разгон + аккорд. */
export function sfxRewardBoost() {
  sweep(280, 1500, 0.35, 0.055, "sawtooth");
  blip(523, 0.2, 0.07, "square", 0.34);
  blip(784, 0.24, 0.07, "square", 0.43);
}

/** Выигрыш: карта — фанфары, тем богаче, чем выше редкость. */
export function sfxRewardCard(rarity: "common" | "rare" | "epic" | "legend") {
  const seqs: Record<string, number[]> = {
    common: [660, 880, 1047],
    rare: [523, 659, 880, 1175],
    epic: [523, 659, 784, 1047, 1319],
    legend: [392, 523, 659, 784, 1047, 1319, 1568],
  };
  const seq = seqs[rarity];
  const step = rarity === "legend" ? 0.075 : 0.065;
  const dur = rarity === "legend" ? 0.22 : 0.15;
  seq.forEach((f, i) => blip(f, dur, 0.075, "triangle", i * step));
  if (rarity === "epic" || rarity === "legend") {
    // звёздная «пыль» октавой выше
    seq.forEach((f, i) => blip(f * 2, 0.07, 0.026, "sawtooth", i * step + 0.02));
  }
  if (rarity === "legend") {
    sweep(500, 2300, 0.55, 0.035, "sawtooth", 0.32);
    blip(2093, 0.3, 0.05, "triangle", 0.56);
  }
}
