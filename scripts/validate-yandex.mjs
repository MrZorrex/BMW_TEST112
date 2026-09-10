// Проверка сборки для Яндекс Игр перед загрузкой в Консоль разработчика.
//
// Ловит причины отказа «Не встроено или некорректно встроено SDK» (п. 1.1)
// и смежные проблемы пакета заранее, а не через 3–5 дней модерации:
//
//   node scripts/validate-yandex.mjs            — проверить dist/index.html
//   node scripts/validate-yandex.mjs --zip publish/bmw-clicker-yandex.zip
//                                              — дополнительно проверить архив
//
// Использование: npm run build:yandex (сборка + проверки + упаковка).
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const distFile = path.join(root, "dist", "index.html");

const failures = [];
const passes = [];

function check(name, ok, hint = "") {
  if (ok) passes.push(name);
  else failures.push(hint ? `${name} — ${hint}` : name);
}

let html;
try {
  html = await readFile(distFile, "utf8");
  check("dist/index.html существует", true);
} catch {
  check("dist/index.html существует", false, "сначала выполните: npm run build");
  report();
}

const headEnd = html.indexOf("</head>");
const head = headEnd >= 0 ? html.slice(0, headEnd) : html;

// ── 1. Тег SDK (п. 1.1, 1.19.1) ──────────────────────────────────
const sdkTag = head.match(/<script[^>]*src="\/sdk\.js"[^>]*>/);
check("тег <script src=\"/sdk.js\"> в <head>", !!sdkTag, "актуальный путь SDK для сервера Яндекса");
if (sdkTag) {
  const bundlePos = html.search(/<script[^>]*type="module"/);
  check(
    "тег SDK идёт ДО бандла игры",
    bundlePos < 0 || sdkTag.index < bundlePos,
    "YaGames.init() вызывается из бандла — скрипт sdk.js обязан загрузиться раньше"
  );
}

// ── 2. Инициализация SDK в коде (п. 1.1) ───────────────────────────
check("YaGames.init() в коде", html.includes("YaGames.init"), "без инициализации платформа не увидит SDK");
check(
  "запасная догрузка SDK (свой домен)",
  html.includes("sdk.games.s3.yandex.net/sdk.js"),
  "абсолютный URL из доки для iframe-интеграции"
);

// ── 3. Загрузка и разметка геймплея (п. 1.19.2–1.19.4) ─────────────
check("LoadingAPI.ready()", html.includes("LoadingAPI") && html.includes(".ready("), "п. 1.19.2");
check(
  "GameplayAPI.start/stop",
  html.includes("GameplayAPI") && html.includes(".start(") && html.includes(".stop("),
  "п. 1.19.3"
);
check("паузы платформы (game_api_pause)", html.includes("game_api_pause"), "п. 1.19.4");

// ── 4. Монетизация через SDK (п. 1.12) ─────────────────────────────
check("fullscreen-реклама (showFullscreenAdv)", html.includes("showFullscreenAdv"), "п. 1.12/4.4");
check("rewarded-реклама (showRewardedVideo)", html.includes("showRewardedVideo"), "п. 4.5");

// ── 5. Автоопределение языка (п. 2.14) ─────────────────────────────
check(
  "чтение ysdk.environment.i18n.lang",
  html.includes("environment") && html.includes("i18n") && html.includes(".lang"),
  "иначе индикатор 文 на debug-панели не позеленеет"
);

// ── 6. Локали RU+EN ───────────────────────────────────────────────
check("русская локаль в сборке", html.includes("Прогреваем мотор"));
check("английская локаль в сборке", html.includes("Warming up"));

// ── 7. Нет внешних запросов (п. 8.4.2) ────────────────────────────
// Проверяем именно загрузку ресурсов (src/href/url()/import), а не строки
// в коде: ссылка вида https://react.dev/errors/ в тексте ошибки React —
// это не запрос.
const resourceUrls = [
  ...html.matchAll(/\ssrc="(https?:\/\/[^"]+)"/g),
  ...html.matchAll(/\shref="(https?:\/\/[^"]+)"/g),
  ...html.matchAll(/url\(\s*["']?(https?:\/\/[^"')]+)["']?\s*\)/g),
  ...html.matchAll(/@import\s+["'](https?:\/\/[^"']+)["']/g),
  ...html.matchAll(/\bimport\(\s*["'](https?:\/\/[^"']+)["']/g),
].map((m) => m[1]);
const ALLOWED = new Set(["https://sdk.games.s3.yandex.net/sdk.js"]);
const forbidden = [...new Set(resourceUrls)].filter((u) => !ALLOWED.has(u));
check("нет внешних ресурсов (п. 8.4.2)", forbidden.length === 0, forbidden.join(", "));

// ── 8. Это сборка ДЛЯ Яндекса, а не ПК-версия ─────────────────────
check(
  "не перепутан файл с pc-build (там SDK вырезан)",
  !html.includes("автономная версия для ПК") && !html.includes("НЕ ЗАГРУЖАТЬ В ЯНДЕКС"),
  "в Консоль грузится publish/bmw-clicker-yandex.zip, НЕ pc-build/index.html"
);

// ── 9. Single-file: нет локальных ассетов рядом ────────────────────
const localRefs = [
  ...html.matchAll(/\ssrc="(\.{0,2}\/[^"]+)"/g),
  ...html.matchAll(/\shref="(\.{0,2}\/[^"]+)"/g),
].map((m) => m[1]);
const localBad = [...new Set(localRefs)].filter((u) => u !== "/sdk.js" && !u.startsWith("data:"));
check("single-file (нет ссылок на соседние файлы)", localBad.length === 0, localBad.join(", "));

// ── 10. Изображения встроены ──────────────────────────────────────
const imgCount = (html.match(/data:image\/jpeg;base64/g) || []).length;
check(`встроенные изображения (${imgCount}/33)`, imgCount === 33, "карты машин должны быть data-URI в бандле");

// ── 11. Размер ─────────────────────────────────────────────────────
const sizeMb = (await stat(distFile)).size / 1024 / 1024;
check(`размер dist/index.html ${sizeMb.toFixed(2)} МБ < 100 МБ`, sizeMb < 100, "п. 1.21");

// ── 12. Архив (п. 1.22: index.html в корне) ────────────────────────
const zipIdx = process.argv.indexOf("--zip");
if (zipIdx >= 0) {
  const zipPath = process.argv[zipIdx + 1];
  if (!zipPath) {
    check("--zip <путь>", false, "не указан путь к архиву");
  } else {
    try {
      const abs = path.isAbsolute(zipPath) ? zipPath : path.join(root, zipPath);
      const out = execFileSync("python3", ["-c", "import zipfile,sys; print('\\n'.join(i.filename for i in zipfile.ZipFile(sys.argv[1]).infolist()))", abs], {
        encoding: "utf8",
      });
      const names = out.trim().split("\n").filter(Boolean);
      check(`архив ${zipPath} открывается`, true);
      check("index.html в корне архива (п. 1.22)", names.includes("index.html"), `содержимое: ${names.join(", ")}`);
      check(
        "в архиве нет вложенных папок",
        names.every((n) => !n.includes("/")),
        `содержимое: ${names.join(", ")}`
      );
      const zipMb = (await stat(abs)).size / 1024 / 1024;
      check(`размер архива ${zipMb.toFixed(2)} МБ < 100 МБ`, zipMb < 100, "п. 1.21");
    } catch (e) {
      check(`архив ${zipPath} открывается`, false, String(e?.message ?? e).split("\n")[0]);
    }
  }
}

function report() {
  for (const p of passes) console.log(`  ✔ ${p}`);
  if (failures.length > 0) {
    console.log("");
    for (const f of failures) console.log(`  ✖ ${f}`);
    console.log(`\nПроверка НЕ пройдена: ${failures.length} проблем(ы).`);
    process.exit(1);
  }
  console.log(`\nВсе проверки пройдены (${passes.length}). Можно грузить в Консоль Яндекс Игр.`);
  process.exit(0);
}

report();
