// Общие функции записи: запуск браузера, загрузка игры с сейвом, шаг времени, кадр.
import { readFileSync, existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

export const BASE = process.env.BASE || "http://127.0.0.1:8095/";
export const SAVE_KEY = "bmw-perekup-save-v1";
export const VW = Number(process.env.VW || 1280);
export const VH = Number(process.env.VH || 720);
export const DPR = Number(process.env.DPR || 1920 / VW);
export const FPS = 30;
const INJECT = readFileSync(new URL("./inject.js", import.meta.url), "utf8");

// Chromium: путь в CHROME (любой Chrome/Chromium ≥ 120); по умолчанию /tmp/chromium (например, распакованный @sparticuz/chromium).
const CHROME = process.env.CHROME || "/tmp/chromium";

export async function launch() {
  if (existsSync("/tmp/al2023/lib")) process.env.LD_LIBRARY_PATH = `/tmp/al2023/lib:${process.env.LD_LIBRARY_PATH || ""}`;
  if (!process.env.FONTCONFIG_PATH && existsSync("/tmp/fonts")) process.env.FONTCONFIG_PATH = "/tmp/fonts";
  return puppeteer.launch({
    executablePath: CHROME,
    headless: "shell",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--no-zygote",
      "--font-render-hinting=none",
      "--hide-scrollbars",
      "--mute-audio",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ],
    protocolTimeout: 600000,
  });
}

/** Полное состояние игры для сейва (всё, чего нет в overrides, — разумные значения поздней игры). */
export function seedState(o = {}) {
  const now = Date.now();
  return {
    money: 0,
    totalEarned: 1e22,
    clicks: 98765,
    modelIndex: 0,
    clickLv: { wash: 30, dryclean: 28, polish: 26, paint: 24, leather: 20, ceramic: 16, stage2: 12, photoset: 8 },
    autoLv: { avito: 30, student: 28, market: 26, manager: 22, showroom: 20, network: 16, import: 12, export: 9 },
    botLv: { nephew: 25, button2000: 22, robot: 18, neuro: 14, server: 9 },
    critLv: { critChance: 15, critPower: 12 },
    caseOpens: { tolyatti: 40, munich: 31 },
    cards: {},
    boostUntil: 0,
    boostMult: 1,
    prestige: 0,
    adReadyAt: 0,
    sound: true,
    introSeen: true,
    lastSeen: now,
    perks: {},
    lang: "ru",
    langPinnedOn: null,
    grantedTokens: {},
    savedAt: now,
    ...o,
  };
}

export async function openGame(browser, state, { lang = "ru" } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(600000);
  page.setDefaultNavigationTimeout(600000);
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300));
  });
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: DPR });
  await page.goto(BASE + "__seed", { waitUntil: "load" });
  await page.evaluate((k, v) => localStorage.setItem(k, v), SAVE_KEY, JSON.stringify(state));
  await page.evaluateOnNewDocument(INJECT);
  await page.goto(`${BASE}?lang=${lang}`, { waitUntil: "load" });
  // ждём первый рендер игры
  await page.waitForFunction(() => !!document.querySelector("main") && !!window.__VT, { polling: 100 });
  // шрифты: принудительно грузим все начертания Roboto (латиница + кириллица)
  await page.evaluate(async () => {
    const txt = "Перекуп BMW 0123456789 ₽ АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ abc";
    await Promise.all([400, 500, 600, 700, 800, 900].map((w) => document.fonts.load(`${w} 16px Roboto`, txt)));
    await document.fonts.ready;
  });
  page.__errors = errors;
  return { ctx, page, errors };
}

/** Продвинуть виртуальное время на ms (шагами по ~16.7 мс, как 60 Гц). */
export async function tick(page, ms) {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  const each = ms / steps;
  for (let i = 0; i < steps; i++) await page.evaluate((d) => window.__VT.tick(d), each);
}

export async function render(page, state) {
  await page.evaluate((s) => window.__VT.render(s), state);
}

export async function shot(page, path) {
  const buf = await page.screenshot({ type: "jpeg", quality: 92, optimizeForSpeed: true, captureBeyondViewport: false });
  if (path) (await import("node:fs")).writeFileSync(path, buf);
  return buf;
}

/** Центр элемента по тексту кнопки (regexp) или CSS-селектору. */
export async function centerOf(page, { text, selector, nth = 0, within } = {}) {
  return page.evaluate(
    (text, selector, nth, within) => {
      const scope = within ? document.querySelector(within) || document : document;
      let els = [];
      if (selector) els = [...scope.querySelectorAll(selector)];
      else els = [...scope.querySelectorAll("button, [role=button]")];
      if (text) {
        const re = new RegExp(text, "i");
        els = els.filter((e) => re.test((e.innerText || "").replace(/\s+/g, " ").trim()));
      }
      els = els.filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const e = els[nth];
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top, left: r.left };
    },
    text ?? null,
    selector ?? null,
    nth,
    within ?? null
  );
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
