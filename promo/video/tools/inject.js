// Встраивается в страницу ДО любых скриптов игры (evaluateOnNewDocument).
// 1) Виртуальное время: Date, performance.now, setTimeout/setInterval, rAF и CSS-анимации
//    идут только тогда, когда их двигает запись, — каждый кадр честный и плавный,
//    как бы медленно ни рендерил headless-браузер.
// 2) Детерминированный Math.random (+ очередь значений для постановки критов и дропа).
// 3) Фейковый AudioContext: записывает все звуки игры (осциллятор, частота, громкость,
//    время), чтобы потом синтезировать их в звуковую дорожку синхронно с картинкой.
// 4) Шрифт Roboto (как на Android) и слой оверлея: курсор, подписи, финальная карточка.
(() => {
  if (window.__VT) return;

  // ── детерминированный рандом ──
  let seed = 0x9e3779b9 >>> 0;
  const rng = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const randQueue = [];
  Math.random = () => (randQueue.length ? randQueue.shift() : rng());

  // ── виртуальное время ──
  const RealDate = Date;
  const realPerfNow = performance.now.bind(performance);
  const epoch0 = RealDate.now();
  const perf0 = realPerfNow();
  let vt = 0; // мс с момента установки

  class VDate extends RealDate {
    constructor(...a) {
      if (a.length === 0) super(epoch0 + vt);
      else super(...a);
    }
    static now() {
      return epoch0 + vt;
    }
  }
  window.Date = new Proxy(VDate, {
    apply() {
      return new VDate().toString();
    },
  });
  performance.now = () => perf0 + vt;

  const timers = new Map();
  let timerSeq = 0;
  const addTimer = (fn, delay, args, repeat) => {
    const id = ++timerSeq;
    const d = Math.max(1, Number(delay) || 0);
    timers.set(id, { id, fn, args, at: vt + d, rep: repeat ? d : 0 });
    return id;
  };
  window.setTimeout = (fn, delay, ...args) => addTimer(fn, delay, args, false);
  window.setInterval = (fn, delay, ...args) => addTimer(fn, delay, args, true);
  window.clearTimeout = window.clearInterval = (id) => {
    timers.delete(id);
  };
  window.requestIdleCallback = (cb) => addTimer(() => cb({ didTimeout: false, timeRemaining: () => 8 }), 1, [], false);
  window.cancelIdleCallback = (id) => timers.delete(id);

  const rafs = new Map();
  let rafSeq = 0;
  window.requestAnimationFrame = (cb) => {
    const id = ++rafSeq;
    rafs.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    rafs.delete(id);
  };

  // настоящий макротаск: даём отработать микрозадачам и планировщику React
  const mc = new MessageChannel();
  const waiters = [];
  mc.port1.onmessage = () => {
    const w = waiters.shift();
    if (w) w();
  };
  const yieldTask = () =>
    new Promise((r) => {
      waiters.push(r);
      mc.port2.postMessage(0);
    });

  async function advanceTo(target) {
    for (let guard = 0; guard < 20000; guard++) {
      let next = null;
      for (const t of timers.values()) {
        if (t.at <= target && (!next || t.at < next.at || (t.at === next.at && t.id < next.id))) next = t;
      }
      if (!next) break;
      if (next.at > vt) vt = next.at;
      if (next.rep) next.at += next.rep;
      else timers.delete(next.id);
      try {
        if (typeof next.fn === "function") next.fn(...(next.args || []));
      } catch (e) {
        console.error("[vt] timer", e && e.message);
      }
      await yieldTask();
    }
    if (target > vt) vt = target;
  }

  const seenAnims = new WeakMap();
  function stepAnimations() {
    let list = [];
    try {
      list = document.getAnimations();
    } catch {
      /* noop */
    }
    for (const a of list) {
      let st = seenAnims.get(a);
      if (!st) {
        st = { t0: vt, base: Number(a.currentTime) || 0 };
        seenAnims.set(a, st);
        try {
          a.pause();
        } catch {
          /* noop */
        }
      }
      try {
        a.currentTime = st.base + (vt - st.t0) * (a.playbackRate || 1);
      } catch {
        /* noop */
      }
    }
  }

  async function tick(ms) {
    await advanceTo(vt + ms);
    const cbs = [...rafs.values()];
    rafs.clear();
    const ts = perf0 + vt;
    for (const cb of cbs) {
      try {
        cb(ts);
      } catch (e) {
        console.error("[vt] raf", e && e.message);
      }
    }
    await yieldTask();
    stepAnimations();
    await yieldTask();
  }

  // ── без WAAPI (framer-motion анимирует через rAF) и без OffscreenCanvas (конфетти в основном потоке) ──
  try {
    delete Element.prototype.animate;
  } catch {
    /* noop */
  }
  try {
    delete HTMLCanvasElement.prototype.transferControlToOffscreen;
    window.OffscreenCanvas = undefined;
  } catch {
    /* noop */
  }

  // ── фейковый AudioContext: протокол звуков ──
  const audioLog = [];
  class FParam {
    constructor(v) {
      this.value = v;
      this.ev = [];
    }
    setValueAtTime(v, t) {
      this.ev.push(["set", v, t]);
      return this;
    }
    exponentialRampToValueAtTime(v, t) {
      this.ev.push(["exp", v, t]);
      return this;
    }
    linearRampToValueAtTime(v, t) {
      this.ev.push(["lin", v, t]);
      return this;
    }
    setTargetAtTime(v, t, c) {
      this.ev.push(["target", v, t, c]);
      return this;
    }
    cancelScheduledValues() {
      return this;
    }
  }
  class FNode {
    constructor(ctx) {
      this.context = ctx;
      this.out = [];
    }
    connect(n) {
      this.out.push(n);
      return n;
    }
    disconnect() {}
  }
  class FGain extends FNode {
    constructor(c) {
      super(c);
      this.gain = new FParam(1);
    }
  }
  class FOsc extends FNode {
    constructor(c) {
      super(c);
      this.type = "sine";
      this.frequency = new FParam(440);
      this.detune = new FParam(0);
    }
    start(t = 0) {
      this.t0 = t;
    }
    stop(t) {
      const g = this.out.find((n) => n instanceof FGain);
      audioLog.push({
        type: this.type,
        start: this.t0 ?? 0,
        stop: t ?? (this.t0 ?? 0) + 1,
        freq: this.frequency.ev.slice(),
        gain: g ? g.gain.ev.slice() : [["set", 0.05, this.t0 ?? 0]],
        vt,
      });
    }
  }
  class FakeAudioContext {
    constructor() {
      this.destination = new FNode(this);
      this.sampleRate = 44100;
      this.state = "running";
    }
    get currentTime() {
      return vt / 1000;
    }
    createOscillator() {
      return new FOsc(this);
    }
    createGain() {
      return new FGain(this);
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    suspend() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  }
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;

  // ── шрифт и оверлей ──
  const OV_CSS = `
  :root { --font-sans: "Roboto", system-ui, sans-serif !important; --font-display: "Roboto", system-ui, sans-serif !important; }
  html, body { font-family: "Roboto", system-ui, sans-serif; }
  #__ov { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; font-family: "Roboto", sans-serif; }
  #__ov * { box-sizing: border-box; }
  #__ov .scr { position: absolute; left: 0; top: 0; width: 100vw; height: 100vh; transform-origin: 0 0; }
  #__ov .cur { position: absolute; left: 0; top: 0; width: 30px; height: 30px; transform-origin: 3px 3px; filter: drop-shadow(0 3px 6px rgba(0,0,0,.55)); }
  #__ov .rip { position: absolute; border-radius: 9999px; border: 3px solid rgba(255,255,255,.9); box-shadow: 0 0 18px rgba(90,169,255,.8), inset 0 0 12px rgba(90,169,255,.5); }
  #__ov .cap { position: absolute; left: 0; right: 0; bottom: 0; height: 190px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 34px;
     background: linear-gradient(to top, rgba(3,5,9,.92) 0%, rgba(3,5,9,.72) 38%, rgba(3,5,9,0) 100%); }
  #__ov .cap .txt { font-weight: 900; font-size: 46px; line-height: 1.02; letter-spacing: .005em; text-transform: uppercase; color: #fff; text-align: center;
     text-shadow: 0 4px 22px rgba(0,0,0,.65), 0 1px 0 rgba(0,0,0,.35); white-space: nowrap; }
  #__ov .cap .hl { color: #f5c542; text-shadow: 0 0 26px rgba(245,197,66,.55), 0 4px 22px rgba(0,0,0,.6); }
  #__ov .cap .bl { color: #5aa9ff; text-shadow: 0 0 26px rgba(90,169,255,.55), 0 4px 22px rgba(0,0,0,.6); }
  #__ov .cap .bar { display:block; height: 5px; width: 120px; margin: 14px auto 0; border-radius: 9999px; background: linear-gradient(90deg,#1c69d4,#5aa9ff 45%,#e30a17); }
  #__ov .end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  #__ov .end .bg { position: absolute; inset: 0; background: radial-gradient(70% 60% at 50% 45%, rgba(12,24,44,.55), rgba(3,5,9,.9)); }
  #__ov .end .kick { position: relative; font-weight: 800; font-size: 17px; letter-spacing: .34em; color: #5aa9ff; text-transform: uppercase; }
  #__ov .end .title { position: relative; margin-top: 10px; font-weight: 900; font-size: 118px; line-height: .95; letter-spacing: -.01em; color: #fff; text-shadow: 0 10px 50px rgba(0,0,0,.6); }
  #__ov .end .title .b { background: linear-gradient(180deg,#8cc4ff,#1c69d4); -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: none; filter: drop-shadow(0 8px 30px rgba(28,105,212,.55)); }
  #__ov .end .stripes { position: relative; display:flex; gap: 6px; margin-top: 18px; }
  #__ov .end .stripes i { display:block; width: 64px; height: 6px; border-radius: 3px; }
  #__ov .end .sub { position: relative; margin-top: 22px; font-weight: 600; font-size: 25px; color: rgba(238,242,248,.82); }
  #__ov .end .cta { position: relative; margin-top: 34px; padding: 20px 52px; border-radius: 22px; font-weight: 900; font-size: 30px; letter-spacing: .04em; color: #07090d;
     background: linear-gradient(90deg,#f59e0b,#f5c542); box-shadow: 0 16px 50px -10px rgba(245,197,66,.75), inset 0 1px 0 rgba(255,255,255,.45); overflow: hidden; }
  #__ov .end .cta .sh { position: absolute; top: -20%; bottom: -20%; width: 34%; background: linear-gradient(100deg, transparent, rgba(255,255,255,.65), transparent); transform: skewX(-18deg); }
  `;
  const CURSOR_SVG = `<svg viewBox="0 0 30 30" width="30" height="30" xmlns="http://www.w3.org/2000/svg"><path d="M3 2.5 L3 24 L8.6 18.9 L12.4 27.2 L16.3 25.5 L12.6 17.4 L20.2 17.4 Z" fill="#fff" stroke="#07090d" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const easeOutBack = (x) => {
    x = clamp(x);
    const c1 = 1.70158,
      c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  };

  let ov = null;
  function ensureOverlay() {
    if (ov) return ov;
    if (!document.documentElement) return null;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/fonts/roboto.css";
    (document.head || document.documentElement).appendChild(link);
    const style = document.createElement("style");
    style.textContent = OV_CSS;
    (document.head || document.documentElement).appendChild(style);
    const root = document.createElement("div");
    root.id = "__ov";
    root.innerHTML = `<div class="ripples"></div><div class="scr"><div class="capwrap"></div><div class="endwrap"></div></div><div class="cur" style="display:none">${CURSOR_SVG}</div>`;
    document.documentElement.appendChild(root);
    ov = {
      root,
      ripples: root.querySelector(".ripples"),
      cap: root.querySelector(".capwrap"),
      scr: root.querySelector(".scr"),
      end: root.querySelector(".endwrap"),
      cur: root.querySelector(".cur"),
      capKey: null,
      endBuilt: false,
    };
    return ov;
  }
  document.addEventListener("DOMContentLoaded", ensureOverlay);

  /**
   * Состояние оверлея на кадр — полностью из параметров (детерминированно):
   * { cursor: {x,y,press}|null, ripples: [{x,y,age}], caption: {html,t,dur}|null, end: {t}|null }
   */
  function render(s) {
    const o = ensureOverlay();
    if (!o) return;
    // экранный слой (подписи, финальная карточка) — обратная трансформация камеры,
    // чтобы после кадрирования clip-скриншотом он оказался на весь кадр в исходном размере
    if (s.cam) {
      const k = s.cam.w / window.innerWidth;
      o.scr.style.transform = `translate(${s.cam.x}px, ${s.cam.y}px) scale(${k})`;
    } else o.scr.style.transform = "";
    // курсор
    if (s.cursor) {
      o.cur.style.display = "block";
      const sc = 1 - 0.12 * clamp(s.cursor.press || 0);
      o.cur.style.transform = `translate(${s.cursor.x - 3}px, ${s.cursor.y - 3}px) scale(${sc})`;
      o.cur.style.opacity = String(s.cursor.alpha ?? 1);
    } else o.cur.style.display = "none";
    // круги от клика
    const rs = (s.ripples || []).filter((r) => r.age >= 0 && r.age < 0.42);
    o.ripples.innerHTML = rs
      .map((r) => {
        const k = easeOut(r.age / 0.42);
        const d = 14 + 58 * k;
        return `<div class="rip" style="left:${r.x - d / 2}px;top:${r.y - d / 2}px;width:${d}px;height:${d}px;opacity:${(1 - k) * 0.95}"></div>`;
      })
      .join("");
    // подпись
    if (s.caption) {
      const { html, t, dur } = s.caption;
      if (o.capKey !== html) {
        o.cap.innerHTML = `<div class="cap"><div class="inner"><div class="txt">${html}</div><span class="bar"></span></div></div>`;
        o.capKey = html;
      }
      const inK = easeOutBack(t / 0.34);
      const outK = clamp((t - (dur - 0.26)) / 0.26);
      const cap = o.cap.firstChild;
      const inner = cap.querySelector(".inner");
      const bar = cap.querySelector(".bar");
      cap.style.opacity = String(clamp(t / 0.2) * (1 - outK));
      inner.style.transform = `translateY(${(1 - inK) * 34 - outK * 10}px) scale(${0.94 + 0.06 * clamp(inK, 0, 1.2)})`;
      bar.style.width = `${40 + 150 * easeOut((t - 0.12) / 0.5)}px`;
    } else if (o.capKey !== null) {
      o.cap.innerHTML = "";
      o.capKey = null;
    }
    // финальная карточка
    if (s.end) {
      const t = s.end.t;
      if (!o.endBuilt) {
        o.end.innerHTML = `<div class="end">
          <div class="bg"></div>
          <div class="kick">кликер · симулятор перекупщика</div>
          <div class="title">ПЕРЕКУП <span class="b">BMW</span></div>
          <div class="stripes"><i style="background:#5cb1eb"></i><i style="background:#1c69d4"></i><i style="background:#e30a17"></i></div>
          <div class="sub">Собери всю историю — от Dixi 1928 до Neue Klasse</div>
          <div class="cta">ИГРАЙ СЕЙЧАС<span class="sh"></span></div>
        </div>`;
        o.endBuilt = true;
      }
      const e = o.end.firstChild;
      const q = (sel) => e.querySelector(sel);
      const a = easeOut(t / 0.45);
      e.style.backdropFilter = `blur(${12 * a}px) saturate(${1 + 0.2 * a})`;
      e.style.webkitBackdropFilter = e.style.backdropFilter;
      q(".bg").style.opacity = String(a);
      const show = (el, t0, dy = 26) => {
        const k = easeOutBack((t - t0) / 0.42);
        el.style.opacity = String(clamp((t - t0) / 0.22));
        el.style.transform = `translateY(${(1 - k) * dy}px)`;
      };
      show(q(".kick"), 0.12, 14);
      const tk = easeOutBack((t - 0.18) / 0.5);
      q(".title").style.opacity = String(clamp((t - 0.18) / 0.25));
      q(".title").style.transform = `scale(${1.22 - 0.22 * tk})`;
      const st = q(".stripes");
      st.style.opacity = String(clamp((t - 0.4) / 0.2));
      st.style.transform = `scaleX(${easeOut((t - 0.4) / 0.4)})`;
      show(q(".sub"), 0.5);
      const cta = q(".cta");
      show(cta, 0.72, 30);
      const pulse = t > 1.2 ? 1 + 0.035 * Math.sin((t - 1.2) * Math.PI * 2 * 1.07) : 1;
      cta.style.transform += ` scale(${pulse})`;
      const shK = ((t - 1.0) % 1.6) / 1.6;
      q(".cta .sh").style.left = `${-40 + 160 * clamp(shK)}%`;
    } else if (o.endBuilt) {
      o.end.innerHTML = "";
      o.endBuilt = false;
    }
  }

  window.__VT = {
    now: () => vt,
    tick,
    yieldTask,
    queueRandom: (...v) => randQueue.push(...v),
    clearRandom: () => (randQueue.length = 0),
    setSeed: (s) => (seed = s >>> 0),
    audioLog,
    render,
    pendingTimers: () => timers.size,
  };
})();
