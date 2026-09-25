// Режиссёр промо-ролика: записывает сегменты геймплея покадрово (30 fps) в work/frames/<seg>/.
// Запуск: VW=1152 VH=648 node direct.mjs [имя сегмента ...]   (сервер server.mjs должен быть запущен)
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launch, openGame, seedState, tick, FPS, VW, VH } from "./lib.mjs";

const OUT = process.env.FRAMES || fileURLToPath(new URL("./work/frames", import.meta.url));
const FRAME = 1 / FPS;
const BEAT = 60 / 128;
const BAR = BEAT * 4;
const TAIL = 3; // кадров «хвоста» для кроссфейда со следующим сегментом

const CAP = {
  click: 'КЛИКАЙ И <span class="hl">ЗАРАБАТЫВАЙ</span>',
  buy: 'ВЫКУПАЙ <span class="hl">ЛЕГЕНДАРНЫЕ</span> МОДЕЛИ',
  upgrade: 'ПРОКАЧИВАЙ СВОЙ <span class="hl">АВТОБИЗНЕС</span>',
  cards: 'ВЫБИВАЙ <span class="hl">РЕДКИЕ</span> КАРТЫ',
  eras: '<span class="hl">23</span> МОДЕЛИ · ОТ 1928 ДО НАШИХ ДНЕЙ',
};

const ALL_CARDS_BUT_M1 = ["kofe", "elochka", "nomera", "turbo2002", "z1", "csi850", "mechhand", "luckycoin", "m3e30c", "m5e34c", "z4m", "goldtongue", "c507", "cslc"];
const cardsOf = (ids) => Object.fromEntries(ids.map((k) => [k, 1]));

// ── камера: прямоугольник кадра в CSS-пикселях макета (16:9), снимается clip-скриншотом ──
const R = (x, y, w) => {
  w = Math.min(VW, w);
  const h = (w * 9) / 16;
  return { x: Math.max(0, Math.min(VW - w, x)), y: Math.max(0, Math.min(VH - h, y)), w };
};
const FOCUS = (cx, cy, w) => R(cx - w / 2, cy - (w * 9) / 32, w);
const FULL = R(0, 0, VW);
const easeIO = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// детерминированный «ручной» разброс кликов по машине
let rs = 12345;
const rnd = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

class Ctl {
  constructor(name, page, { capOffset = 0 } = {}) {
    this.name = name;
    this.page = page;
    this.f = 0; // кадров записано
    this.cursor = null; // {x,y,press,alpha}
    this.ripples = []; // {x,y,t}
    this.caption = null; // {html,t0,dur,offset}
    this.end = null; // {t0}
    this.spans = []; // {f0, vt0} — непрерывные куски записи (для звука)
    this.cuts = []; // кадры склеек внутри сегмента
    this.dir = `${OUT}/${name}`;
    this.capOffset = capOffset;
    this.camA = FULL;
    this.camB = FULL;
    this.camT0 = 0;
    this.camT1 = 0;
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
  }
  get t() {
    return this.f * FRAME;
  }
  async vt() {
    return this.page.evaluate(() => window.__VT.now());
  }
  async startSpan() {
    this.spans.push({ f0: this.f, vt0: await this.vt() });
  }
  cam(t = this.t) {
    const k = this.camT1 > this.camT0 ? easeIO(Math.max(0, Math.min(1, (t - this.camT0) / (this.camT1 - this.camT0)))) : 1;
    const a = this.camA,
      b = this.camB;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k };
  }
  camSet(r) {
    this.camA = this.camB = r;
    this.camT0 = this.camT1 = this.t;
  }
  camTo(r, dur) {
    this.camA = this.cam();
    this.camB = r;
    this.camT0 = this.t;
    this.camT1 = this.t + dur;
  }
  overlayState() {
    const t = this.t;
    return {
      cam: this.cam(),
      cursor: this.cursor,
      ripples: this.ripples.map((r) => ({ x: r.x, y: r.y, age: t - r.t })),
      caption: this.caption && t >= this.caption.t0 && t < this.caption.t0 + this.caption.dur
        ? { html: this.caption.html, t: t - this.caption.t0 + (this.caption.offset || 0), dur: this.caption.dur + (this.caption.offset || 0) }
        : null,
      end: this.end && t >= this.end.t0 ? { t: t - this.end.t0 } : null,
    };
  }
  /** Записать один кадр и продвинуть время на 1/30 с. */
  async frame() {
    this.ripples = this.ripples.filter((r) => this.t - r.t < 0.5);
    const st = this.overlayState();
    await this.page.evaluate((s) => window.__VT.render(s), st);
    const c = st.cam;
    const buf = await this.page.screenshot({
      type: "jpeg",
      quality: 93,
      optimizeForSpeed: true,
      clip: { x: c.x, y: c.y, width: c.w, height: (c.w * 9) / 16, scale: VW / c.w },
    });
    writeFileSync(`${this.dir}/${String(this.f).padStart(5, "0")}.jpg`, buf);
    this.f++;
    await tick(this.page, FRAME * 1000);
  }
  async until(t) {
    while (this.t < t - 1e-6) await this.frame();
  }
  showCaption(html, dur, offset = 0) {
    this.caption = { html, t0: this.t, dur, offset };
  }
  async moveTo(x, y, dur) {
    const from = this.cursor ? { ...this.cursor } : { x, y };
    const n = Math.max(1, Math.round(dur / FRAME));
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
      const cx = from.x + (x - from.x) * e;
      const cy = from.y + (y - from.y) * e - Math.sin(Math.PI * k) * Math.min(40, Math.hypot(x - from.x, y - from.y) * 0.08);
      this.cursor = { x: cx, y: cy, press: 0, alpha: 1 };
      await this.page.mouse.move(cx, cy);
      await this.frame();
    }
  }
  /** Клик в текущей позиции курсора. random — очередь значений Math.random для этого клика. */
  async click({ random } = {}) {
    const { x, y } = this.cursor;
    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    this.cursor = { ...this.cursor, press: 1 };
    this.ripples.push({ x, y, t: this.t });
    await this.frame();
    if (random) await this.page.evaluate((v) => window.__VT.queueRandom(...v), random);
    await this.page.mouse.up();
    this.cursor = { ...this.cursor, press: 0.4 };
    await this.frame();
    this.cursor = { ...this.cursor, press: 0 };
  }
  /** Быстрый клик без лишних кадров (для частых кликов по машине): кадр делает вызывающий. */
  async quickClick(x, y, { crit = false } = {}) {
    await this.page.evaluate((v) => window.__VT.queueRandom(...v), [crit ? 0.001 : 0.97, rnd()]);
    this.cursor = { x, y, press: 1, alpha: 1 };
    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    await this.page.mouse.up();
    this.ripples.push({ x, y, t: this.t });
  }
  /** Скачок времени без кадров (склейка внутри сегмента). */
  async skip(seconds) {
    await tick(this.page, seconds * 1000);
    this.cuts.push(this.f);
    await this.startSpan();
  }
  async center(opts) {
    return this.page.evaluate(
      ({ text, selector, within, nth }) => {
        const scope = within ? document.querySelector(within) || document : document;
        let els = [...scope.querySelectorAll(selector || "button")];
        if (text) {
          const re = new RegExp(text, "i");
          els = els.filter((e) => re.test((e.innerText || "").replace(/\s+/g, " ").trim()));
        }
        els = els.filter((e) => e.getBoundingClientRect().width > 0);
        const e = els[nth || 0];
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, disabled: !!e.disabled };
      },
      opts
    );
  }
  async audio() {
    const log = await this.page.evaluate(() => window.__VT.audioLog.splice(0));
    const vtEnd = await this.vt();
    // виртуальное время (с) → время сегмента (с) по кускам записи
    const spans = this.spans.map((s, i) => ({
      out0: s.f0 * FRAME,
      vt0: s.vt0 / 1000,
      vt1: i + 1 < this.spans.length ? this.spans[i + 1].vt0 / 1000 - 1e9 : vtEnd / 1000,
      outEnd: i + 1 < this.spans.length ? this.spans[i + 1].f0 * FRAME : this.f * FRAME,
    }));
    const events = [];
    for (const e of log) {
      for (const s of spans) {
        const dur = s.outEnd - s.out0;
        if (e.start >= s.vt0 - 0.001 && e.start < s.vt0 + dur) {
          const shift = s.out0 - s.vt0;
          events.push({
            type: e.type,
            start: e.start + shift,
            stop: e.stop + shift,
            freq: e.freq.map(([k, v, t, c]) => [k, v, t + shift, c]),
            gain: e.gain.map(([k, v, t, c]) => [k, v, t + shift, c]),
          });
          break;
        }
      }
    }
    return events;
  }
  async finish(extra = {}) {
    const meta = { name: this.name, frames: this.f, fps: FPS, cuts: this.cuts, audio: await this.audio(), ...extra };
    writeFileSync(`${this.dir}/meta.json`, JSON.stringify(meta));
    console.log(`[${this.name}] frames=${this.f} (${(this.f / FPS).toFixed(2)} s) sfx=${meta.audio.length} cuts=${this.cuts}`);
    return meta;
  }
}

// ── Точки кликов по машине (зона картинки в раскладке 1152×648) ──
async function carBox(page) {
  return page.evaluate(() => {
    const img = document.querySelector(".stage-kb img");
    const r = (img || document.querySelector(".stage-kb")).getBoundingClientRect();
    return { l: r.left, t: r.top, w: r.width, h: r.height };
  });
}
function carPoint(b) {
  return { x: b.l + b.w * (0.2 + rnd() * 0.6), y: b.t + b.h * (0.32 + rnd() * 0.42) };
}
/** Прямоугольник модалки (последний .glass-deep в фиксированном оверлее). */
async function modalRect(page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll(".fixed .glass-deep")].filter((e) => e.getBoundingClientRect().width > 0);
    const e = els[els.length - 1];
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });
}
/** Кадр, в который модалка входит с запасом margin. */
function fitRect(m, margin = 1.14) {
  const w = Math.max(m.w * margin, ((m.h * margin) * 16) / 9);
  return FOCUS(m.cx, m.cy, w);
}

/** Серия кликов по машине до времени tEnd: ~cps кликов в секунду, крит на заданных номерах. */
async function clickSpree(ctl, tEnd, { cps = 6.5, crits = [], box, onFrame } = {}) {
  let n = 0;
  let next = ctl.t;
  if (!ctl.cursor) ctl.cursor = { ...carPoint(box), press: 0, alpha: 1 };
  let target = { x: ctl.cursor.x, y: ctl.cursor.y };
  while (ctl.t < tEnd - 1e-6) {
    if (onFrame && (await onFrame())) return n;
    if (ctl.t >= next - 1e-6) {
      await ctl.quickClick(ctl.cursor.x, ctl.cursor.y, { crit: crits.includes(n) });
      n++;
      next += (1 / cps) * (0.8 + rnd() * 0.4);
      // следующая точка — недалеко от текущей, как у живой руки
      target = carPoint(box);
      ctl.cursor = { ...ctl.cursor, press: 1 };
      await ctl.frame();
    } else {
      const k = 0.42;
      const nx = ctl.cursor.x + (target.x - ctl.cursor.x) * k;
      const ny = ctl.cursor.y + (target.y - ctl.cursor.y) * k;
      ctl.cursor = { x: nx, y: ny, press: Math.max(0, (ctl.cursor.press || 0) - 0.6), alpha: 1 };
      await ctl.page.mouse.move(nx, ny);
      await ctl.frame();
    }
  }
  ctl.cursor = { ...ctl.cursor, press: 0 };
  return n;
}

async function incomePerSec(browser, state) {
  // пробный прогон без записи: сколько денег приносят пассив и автокликер за 2 с
  const { ctx, page } = await openGame(browser, state);
  await tick(page, 2050);
  const m0 = await page.evaluate(() => JSON.parse(localStorage.getItem("bmw-perekup-save-v1")).money);
  await tick(page, 2000);
  const m1 = await page.evaluate(() => JSON.parse(localStorage.getItem("bmw-perekup-save-v1")).money);
  await ctx.close();
  return (m1 - m0) / 2;
}

// ── Сегменты ─────────────────────────────────────────────────

const SEG = {};

// 1) Клики → выкуп i8 → модалка → новая машина (5 тактов = 9.375 с)
SEG.s1 = async (browser) => {
  const I8_PRICE = 2.7e18;
  const base = seedState({
    modelIndex: 18,
    cards: cardsOf(ALL_CARDS_BUT_M1),
    boostUntil: Date.now() + 95_000,
    boostMult: 3,
    perks: { vip_dealer: 1 },
    prestige: 1,
    money: 1e17,
  });
  const inc = await incomePerSec(browser, base);
  const TARGET_T = 3.7; // когда кнопка выкупа должна загореться
  const money = Math.max(1e16, I8_PRICE - inc * (TARGET_T + 0.8));
  console.log("s1 income/s", inc.toExponential(3), "start money", money.toExponential(3), "bar", (money / I8_PRICE).toFixed(2));
  const { page } = await openGame(browser, { ...base, money, lastSeen: Date.now(), savedAt: Date.now(), boostUntil: Date.now() + 95_000 });
  await tick(page, 800); // прогрев (виртуальное время)
  const ctl = new Ctl("s1", page);
  await ctl.startSpan();
  const box = await carBox(page);
  ctl.cursor = { x: box.l + box.w * 0.62, y: box.t + box.h * 0.62, press: 0, alpha: 1 };
  ctl.showCaption(CAP.click, 2.45);
  ctl.camSet(R(0, 0, 830));
  ctl.camTo(R(0, 0, 790), 3.4);
  // кликаем, пока не загорится «ВЫКУПИТЬ»
  let buyAt = null;
  await clickSpree(ctl, 6.0, {
    box,
    cps: 5.6,
    crits: [1, 5, 9, 13, 17, 21],
    onFrame: async () => {
      if (buyAt === null) {
        const b = await ctl.center({ text: "ВЫКУПИТЬ" });
        if (b && !b.disabled) {
          buyAt = ctl.t;
          ctl.camTo(FULL, 0.6);
        }
      }
      return buyAt !== null && ctl.t >= buyAt + 0.25;
    },
  });
  console.log("s1 buy lit at", buyAt?.toFixed(2));
  const buy = await ctl.center({ text: "ВЫКУПИТЬ" });
  await ctl.moveTo(buy.x - 8, buy.y + 4, 0.33);
  await ctl.click();
  const clickedBuyAt = ctl.t;
  // модалка «Новая тачка в гараже»: лёгкий наезд
  await ctl.until(clickedBuyAt + 0.3);
  const um = await modalRect(page);
  if (um) ctl.camTo(fitRect(um, 1.1), 1.9);
  await ctl.until(clickedBuyAt + 1.75);
  const go = await ctl.center({ text: "ПОГНАЛИ" });
  await ctl.moveTo(go.x + 40, go.y + 6, 0.38);
  await ctl.until(clickedBuyAt + 2.35);
  await ctl.click();
  ctl.camTo(R(0, 0, 860), 1.0);
  // новая машина на сцене + подпись
  await ctl.until(ctl.t + 0.35);
  ctl.showCaption(CAP.buy, 9.375 - ctl.t + 0.05);
  const box2 = await carBox(page);
  await ctl.moveTo(box2.l + box2.w * 0.55, box2.t + box2.h * 0.5, 0.3);
  await clickSpree(ctl, 9.375 + TAIL * FRAME, { box: box2, cps: 6, crits: [2] });
  return ctl.finish({ buyAt, clickedBuyAt });
};

// 2) Прокачка (2 такта = 3.75 с)
SEG.s2 = async (browser) => {
  const st = seedState({
    modelIndex: 19,
    money: 2.0e19,
    clickLv: { wash: 23, dryclean: 22, polish: 20, paint: 24, leather: 20, ceramic: 16, stage2: 12, photoset: 8 },
    cards: cardsOf(ALL_CARDS_BUT_M1),
    boostUntil: Date.now() + 80_000,
    boostMult: 3,
    perks: { vip_dealer: 1 },
    prestige: 1,
  });
  const { page } = await openGame(browser, st);
  await tick(page, 800);
  const ctl = new Ctl("s2", page);
  await ctl.startSpan();
  const box = await carBox(page);
  ctl.cursor = { x: box.l + box.w * 0.8, y: box.t + box.h * 0.55, press: 0, alpha: 1 };
  // кадр: вкладки и первые два апгрейда выше подписи, слева — край сцены с машиной
  ctl.camSet(R(300, 88, 852));
  ctl.camTo(R(336, 100, 816), 3.8);
  const tab = await ctl.center({ text: "^ПРОКАЧКА" });
  await ctl.moveTo(tab.x, tab.y + 2, 0.36);
  await ctl.click();
  ctl.showCaption(CAP.upgrade, 3.75 - ctl.t - 0.08);
  await ctl.until(0.62);
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll("aside button")]
      .filter((b) => b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().top > 230 && /₽/.test(b.innerText))
      .slice(0, 3)
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })
  );
  const plan = [
    [0, 3],
    [1, 3],
  ];
  for (const [ri, times] of plan) {
    const r = rows[ri];
    await ctl.moveTo(r.x - 6, r.y + 3, 0.26);
    for (let k = 0; k < times; k++) {
      await ctl.click();
      await ctl.until(ctl.t + 0.14);
    }
  }
  await ctl.moveTo(rows[1].x - 150, rows[1].y - 40, 0.4);
  await ctl.until(3.75 + TAIL * FRAME);
  return ctl.finish();
};

// 3) Контейнер → легенда BMW M1 (3 такта = 5.625 с; раскрытие ровно на 2-м такте)
SEG.s3 = async (browser) => {
  const st = seedState({
    modelIndex: 19,
    money: 1.4e19,
    // без «Механической руки»: иначе на вкладке «Удача» появляется лишняя строка и кнопка уезжает под футер
    cards: cardsOf(ALL_CARDS_BUT_M1.filter((k) => k !== "mechhand")),
    perks: { vip_dealer: 1 },
    prestige: 1,
  });
  const { page } = await openGame(browser, st);
  await tick(page, 800);
  const ctl = new Ctl("s3", page);
  await ctl.startSpan();
  const box = await carBox(page);
  ctl.cursor = { x: box.l + box.w * 0.55, y: box.t + box.h * 0.6, press: 0, alpha: 1 };
  const tab = await ctl.center({ text: "^УДАЧА" });
  await ctl.moveTo(tab.x, tab.y + 2, 0.3);
  await ctl.click();
  await ctl.until(0.4);
  const open = await ctl.center({ text: "^ОТКРЫТЬ" });
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const b = el && el.closest("button");
    return b ? b.innerText.replace(/\s+/g, " ").trim() : String(el && el.className);
  }, { x: open.x - 30, y: open.y + 3 });
  console.log("s3 open button hit-test:", hit);
  if (!/ОТКРЫТЬ/.test(hit)) throw new Error("кнопка контейнера перекрыта: " + hit);
  await ctl.moveTo(open.x - 30, open.y + 3, 0.28);
  // легенда (последний вес), первая карта пула легенд — BMW M1
  await ctl.click({ random: [0.99995, 0.01] });
  const openedAt = ctl.t - FRAME; // onClick сработал на mouseup — после первого кадра click()
  const vtOpen = (await ctl.vt()) - FRAME * 1000;
  ctl.showCaption(CAP.cards, 2.7);
  // курсор уходит в сторону, лента крутится; камера наезжает на ленту
  await ctl.moveTo(open.x + 120, open.y + 30, 0.3);
  const gm = await modalRect(page);
  if (gm) ctl.camTo(fitRect(gm, 1.12), 0.55);
  await ctl.moveTo(open.x + 160, open.y + 60, 0.2);
  const LAND_T = BAR * 2; // 3.75 с — остановка ленты ровно на сильной доле (дроп музыки)
  const REVEAL_T = LAND_T + 0.85; // HOLD_MS
  const SLOW_SHOW = 2.4; // сколько секунд показываем финальное «ползание» ленты
  await ctl.until(LAND_T - SLOW_SHOW);
  // склейка: перескакиваем к финальному торможению ленты
  const vtNow = await ctl.vt();
  const spinEndVt = vtOpen + 6400;
  const need = spinEndVt - SLOW_SHOW * 1000 - vtNow;
  console.log("s3 skip ms", need.toFixed(0), "openedAt", openedAt.toFixed(2));
  if (need > 0) await ctl.skip(need / 1000);
  ctl.cursor = { ...ctl.cursor, alpha: 0 };
  await ctl.until(REVEAL_T + 0.12);
  const rm = await modalRect(page);
  if (rm) ctl.camTo(fitRect(rm, 1.1), 0.5);
  await ctl.until(BAR * 3.5 + TAIL * FRAME);
  return ctl.finish();
};

// 4) Нарезка эпох: Dixi 1928 → 507 → i3 Neue Klasse (последний кадр — в s5, вместе с финальной карточкой)
const ERA_CUTS = [
  { name: "s4a", st: { modelIndex: 0, money: 118, totalEarned: 400, clicks: 260, clickLv: { wash: 2 }, autoLv: {}, botLv: {}, critLv: {}, caseOpens: {}, cards: {} } },
  { name: "s4b", st: { modelIndex: 6, money: 1.55e7, totalEarned: 4e7, clickLv: { wash: 12, dryclean: 9, polish: 6, paint: 2 }, autoLv: { avito: 11, student: 8, market: 4 }, botLv: { nephew: 6, button2000: 3 }, critLv: { critChance: 3, critPower: 2 }, caseOpens: { tolyatti: 6, munich: 2 }, cards: cardsOf(["kofe", "elochka", "turbo2002"]) } },
];
const CUT = BEAT * 2; // 0.9375 с на кадр нарезки

for (const [i, c] of ERA_CUTS.entries()) {
  SEG[c.name] = async (browser) => {
    const { page } = await openGame(browser, seedState(c.st));
    await tick(page, 700);
    const ctl = new Ctl(c.name, page);
    await ctl.startSpan();
    const box = await carBox(page);
    ctl.cursor = { x: box.l + box.w * (0.45 + 0.1 * i), y: box.t + box.h * 0.55, press: 0, alpha: 1 };
    ctl.caption = { html: CAP.eras, t0: -i * CUT, dur: CUT * 2 + CUT * 0.9, offset: 0 };
    ctl.camSet(FOCUS(VW / 2, VH / 2, VW * 0.9));
    ctl.camTo(FULL, 0.32);
    await clickSpree(ctl, CUT, { box, cps: 5 });
    return ctl.finish();
  };
}

SEG.s5 = async (browser) => {
  const st = seedState({
    modelIndex: 22,
    money: 3.2e21,
    totalEarned: 3e22,
    cards: cardsOf(ALL_CARDS_BUT_M1.concat(["m1c", "bot3000"])),
    perks: { vip_dealer: 1 },
    prestige: 2,
  });
  const { page } = await openGame(browser, st);
  await tick(page, 700);
  const ctl = new Ctl("s5", page);
  await ctl.startSpan();
  const box = await carBox(page);
  ctl.cursor = { x: box.l + box.w * 0.58, y: box.t + box.h * 0.55, press: 0, alpha: 1 };
  ctl.caption = { html: CAP.eras, t0: -2 * CUT, dur: CUT * 2 + CUT * 0.9, offset: 0 };
  ctl.camSet(FOCUS(VW / 2, VH / 2, VW * 0.9));
  ctl.camTo(FULL, 0.32);
  await clickSpree(ctl, CUT, { box, cps: 5, crits: [1] });
  // финальная карточка — фон медленно наезжает под размытием
  ctl.end = { t0: ctl.t };
  ctl.cursor = null;
  ctl.camTo(FOCUS(VW / 2, VH / 2, VW * 0.86), BAR * 2);
  await ctl.until(CUT + BAR * 2);
  return ctl.finish();
};

// ── запуск ──
const which = process.argv.slice(2);
const names = which.length ? which : Object.keys(SEG);
const browser = await launch();
const t0 = Date.now();
for (const n of names) {
  const ts = Date.now();
  await SEG[n](browser);
  console.log(`  ${n} done in ${((Date.now() - ts) / 1000).toFixed(0)} s`);
}
await browser.close();
console.log(`total ${((Date.now() - t0) / 1000).toFixed(0)} s, viewport ${VW}x${VH}`);
