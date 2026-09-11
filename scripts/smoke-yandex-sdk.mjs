// Смоук-тест интеграции SDK Яндекс Игр в СОБРАННОМ файле.
//
// Валидатор (`npm run validate:yandex`) смотрит на текст сборки: есть ли тег,
// вызовы, разметка. Этот скрипт идёт дальше — он исполняет бандл в jsdom с
// моком `window.YaGames` и проверяет ФАКТ вызовов платформы по сценарию реального
// запуска. Именно нехватка такой проверки позволила отдать в Консоль файл,
// где SDK был в исходниках, но не в собранной странице (отказ п. 1.1).
//
//   node scripts/smoke-yandex-sdk.mjs                 — проверить dist/index.html
//   node scripts/smoke-yandex-sdk.mjs path/to/file.html
//
// Нужно: npm i (зависимость jsdom — dev).
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve("dist/index.html");

let JSDOM;
try {
  // Резолвим jsdom от корня проекта: скрипту не важно, откуда его запускают.
  const require = createRequire(pathToFileURL(path.join(process.cwd(), "package.json")).href);
  JSDOM = require("jsdom").JSDOM;
} catch {
  console.error("✖ Не найден jsdom. Установите зависимости: npm i");
  process.exit(1);
}

let html;
try {
  html = readFileSync(target, "utf8");
} catch {
  console.error(`✖ Не читается ${target} — сначала выполните: npm run build`);
  process.exit(1);
}

// jsdom не исполняет <script type="module">. Сборка singlefile — самодостаточный
// скрипт без import/export, поэтому для теста достаточно снять атрибут.
if (/<script[^>]*type="module"/.test(html)) {
  html = html.replace(/<script([^>]*?)type="module"[^>]*>/, "<script$1>");
}

const calls = [];
/** Spy, который ОДНОВРЕМЕННО помнит о вызове и отдаёт мок-значение (иначе
 *  код игры, ожидающий массив или объект, упал бы — и мы бы чинили не сборку, а тест). */
const rec = (name, value) => (...args) => {
  calls.push({ name, args });
  return Promise.resolve(value);
};

// ── Мок SDK ───────────────────────────────────────────────────────
// Поведение повторяет доку: init() → getPlayer/getStorage/payments/adv,
// колбэки рекламы вызываются синхронно (иначе тест завис бы на паузе звука).
const sdkStorage = (() => {
  const map = new Map();
  return {
    get: (k) => (map.has(k) ? map.get(k) : null),
    has: (k) => map.has(k),
    size: () => map.size,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  };
})();

const player = {
  getUniqueID: () => "smoke-player",
  getName: () => "Smoke",
  isAuthorized: () => true,
  getData: rec("player.getData", {}),
  setData: rec("player.setData"),
};

const adv = {
  showFullscreenAdv: (opts) => {
    calls.push({ name: "adv.showFullscreenAdv" });
    opts?.callbacks?.onOpen?.();
    opts?.callbacks?.onClose?.(true);
  },
  showRewardedVideo: (opts) => {
    calls.push({ name: "adv.showRewardedVideo" });
    opts?.onOpen?.();
    opts?.onRewarded?.();
    opts?.onClose?.();
  },
};

const ysdk = {
  features: {
    LoadingAPI: { ready: rec("LoadingAPI.ready") },
    GameplayAPI: { start: rec("GameplayAPI.start"), stop: rec("GameplayAPI.stop") },
  },
  environment: { i18n: { lang: process.env.SMOKE_LANG || "ru", tld: "ru" }, appInstall: {}, turbulence: {} },
  getStorage: async () => sdkStorage,
  getPlayer: async () => player,
  getPayments: async () => ({
    getCatalog: rec("payments.getCatalog", []),
    getPurchases: rec("payments.getPurchases", []),
    purchase: async () => {
      throw new Error("smoke: оплата отменена");
    },
    consumePurchase: async () => {},
  }),
  on: rec("ysdk.on"),
  off: () => {},
  EVENTS: {
    HISTORY_BACK: "history-back",
    ACCOUNT_SELECTION_DIALOG_OPENED: "account_selection_dialog_opened",
    ACCOUNT_SELECTION_DIALOG_CLOSED: "account_selection_dialog_closed",
  },
  auth: { openAuthDialog: async () => {} },
  adv,
};

const network = [];
const errors = [];

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  // Домен платформы: часть логики (например, автопоказ стартовой рекламы)
  // ориентируется на хост.
  url: "https://yandex.ru/games/app/123456/",
  beforeParse(window) {
    window.YaGames = {
      init: async (opts) => {
        calls.push({ name: "YaGames.init", args: [opts ?? null] });
        return ysdk;
      },
    };
    // Мок сетевых запросов: считаем, куда игра ходит сама (п. 8.4.2 — внешних
    // загрузок быть не должно; /sdk.js — единственный разрешённый путь).
    window.fetch = (input) => {
      network.push(String(input?.url ?? input));
      return Promise.reject(new Error("smoke: сеть закрыта"));
    };
    const RealImage = window.Image;
    window.Image = class extends RealImage {
      set src(v) {
        if (/^https?:/.test(String(v))) network.push(String(v));
        super.src = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
      }
    };
    // Чего нет в jsdom, но использует игра (звук, confetti, вьюпорт).
    window.matchMedia ||= (q) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    });
    window.HTMLCanvasElement.prototype.getContext = () =>
      new Proxy(
        {},
        {
          get: (_t, p) =>
            p === "canvas"
              ? { width: 300, height: 150 }
              : typeof p === "string" && p.startsWith("create")
                ? () => ({ addColorStop() {} })
                : () => {},
        }
      );
    const fakeNode = () => ({
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
      gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} },
      frequency: { value: 1, setValueAtTime() {} },
      type: "",
      buffer: null,
      onload: null,
      onended: null,
    });
    class FakeAudioContext {
      constructor() {
        return new Proxy(this, {
          get: (t, p) =>
            p === "currentTime" ? 0 : p === "destination" || p === "state" ? (p === "state" ? "running" : {}) : fakeNode,
        });
      }
      resume() {
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
    window.scrollTo = () => {};
    window.addEventListener("error", (e) => errors.push(String(e.message || e.error).slice(0, 200)));
    window.addEventListener("unhandledrejection", (e) => errors.push("rejection: " + String(e.reason).slice(0, 200)));
  },
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(2500); // init + облако + первый рендер
const doc = dom.window.document;

// Интро закрываем: до его закрытия игра считает себя «в меню» и GameplayAPI.start()
// не вызывает (п. 1.19.3) — это правильное поведение, но проверить его надо.
const introBtn = [...doc.querySelectorAll("button")].find((b) => /НАЧАТЬ ТОРГ|START/i.test(b.textContent ?? ""));
if (introBtn) {
  introBtn.click();
  await wait(600);
}
// Уход со страницы → облачный сейв с flush (п. 1.9)
dom.window.dispatchEvent(new dom.window.Event("pagehide"));
await wait(400);

const names = calls.map((c) => c.name);
const has = (n) => names.includes(n);
const failures = [];
const passes = [];
const check = (label, ok, hint = "") => (ok ? passes : failures).push(label + (ok || !hint ? "" : ` — ${hint}`));

const root = doc.getElementById("root");
const uiText = (root?.textContent ?? "").replace(/\s+/g, " ").trim();

// Мок `window.YaGames` подставляем мы, поэтому «инициализация прошла» сама по
// себе не доказывает, что в файле ЕСТЬ SDK. Проверяем и это: иначе тест
// одинаково дружелюбно пропускал бы и pc-build/index.html без тега.
check(
  'в проверяемом файле есть тег <script src="/sdk.js"> (п. 1.1)',
  /<script[^>]*src="\/sdk\.js"[^>]*><\/script>/.test(html),
  "это ПК-сборка или файл без SDK — в Консоль её грузить нельзя"
);
check("страница загрузилась без ошибок JS", errors.length === 0, errors.slice(0, 3).join(" | "));
check("игра отрисована (#root непустой, #boot убран)", uiText.length > 200 && !doc.getElementById("boot"));
check("YaGames.init() вызван", has("YaGames.init"));
check(
  "init() без signed (обработка платежей на клиенте)",
  calls.find((c) => c.name === "YaGames.init")?.args?.[0]?.signed !== true
);
check("язык платформы прочитан и применён (п. 2.14)", doc.documentElement.lang === (process.env.SMOKE_LANG || "ru"));
check("LoadingAPI.ready() вызван (п. 1.19.2)", has("LoadingAPI.ready"));
check("GameplayAPI.start() вызван вне меню (п. 1.19.3)", has("GameplayAPI.start"));
check("game_api_pause/resume подписаны (п. 1.19.4)", has("ysdk.on"));
check("облачное сохранение: getData", has("player.getData"));
check("облачное сохранение: setData (п. 1.9)", has("player.setData"));
check("надёжное хранилище подключено (getStorage)", sdkStorage.has("bmw-perekup-save-v1"));
check(
  "внешних запросов, кроме SDK, нет (п. 8.4.2)",
  network.every((u) => u.includes("/sdk.js")),
  network.join(", ")
);

for (const p of passes) console.log(`  ✔ ${p}`);
for (const f of failures) console.log(`  ✖ ${f}`);
console.log(`\nВызовы SDK: ${[...new Set(names)].join(", ") || "нет"}`);
console.log(`Подписки: ${calls.filter((c) => c.name === "ysdk.on").map((c) => c.args[0]).join(", ")}`);

dom.window.close();

if (failures.length) {
  console.log(`\nСмоук-тест НЕ пройден: ${failures.length} проблем(ы). Такую сборку в Консоль грузить нельзя.`);
  process.exit(1);
}
console.log(`\nСмоук-тест пройден (${passes.length}) — SDK в сборке работает, а не просто присутствует в тексте.`);
