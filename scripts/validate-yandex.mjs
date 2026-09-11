// Проверка сборки для Яндекс Игр перед загрузкой в Консоль разработчика.
//
// Ловит причины отказа заранее, а не через 3–5 дней модерации:
//   • «Обнаружена ссылка на сервисное хранилище» — в файлах есть адрес
//     внутреннего хранилища сервиса (*.s3.yandex.net и подобные). Именно так
//     релиз отклонили из-за запасного URL SDK в бандле;
//   • «Не встроено или некорректно встроено SDK» (п. 1.1);
//   • битые пути к файлам внутри архива (игра раздаётся из вложенной папки,
//     поэтому годятся только относительные пути);
//   • лишние/чужие файлы в архиве.
//
//   node scripts/validate-yandex.mjs            — проверить dist/
//   node scripts/validate-yandex.mjs --zip publish/bmw-clicker-yandex.zip
//                                              — дополнительно проверить архив
//
// Использование: npm run build:yandex (сборка + проверки + упаковка).
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const distDir = path.join(root, "dist");
const distFile = path.join(distDir, "index.html");

const failures = [];
const passes = [];

function check(name, ok, hint = "") {
  if (ok) passes.push(name);
  else failures.push(hint ? `${name} — ${hint}` : name);
}

/** Рекурсивно собирает файлы папки. */
async function collect(dir, prefix = "") {
  const out = [];
  for (const name of (await readdir(dir)).sort()) {
    const absolute = path.join(dir, name);
    const relative = path.posix.join(prefix, name);
    const info = await stat(absolute);
    if (info.isDirectory()) out.push(...(await collect(absolute, relative)));
    else out.push({ absolute, relative, size: info.size });
  }
  return out;
}

let html;
let distFiles = [];
try {
  html = await readFile(distFile, "utf8");
  distFiles = await collect(distDir);
  check("dist/index.html существует", true);
} catch {
  check("dist/index.html существует", false, "сначала выполните: npm run build");
  report();
}

const distNames = new Set(distFiles.map((f) => f.relative));
const textFiles = distFiles.filter((f) => /\.(html|js|css|json|svg|txt|webmanifest)$/i.test(f.relative));

// ── 0. Исходник index.html — это точка входа Vite, а не собранный файл ────
// Отдельная проверка, потому что именно так рождается отказ «SDK не встроено»:
// в корень репозитория попал СОБРАННЫЙ pc-build/index.html (SDK из него вырезан),
// Vite использовал его как точку входа — и каждая сборка для Яндекса выходила
// без тега /sdk.js, независимо от того, насколько правильно написан src/game/yandex.ts.
const srcFile = path.join(root, "index.html");
try {
  const src = await readFile(srcFile, "utf8");
  check("index.html (исходник) существует", true);
  check(
    "в исходном index.html подключён SDK (<script src=\"/sdk.js\">)",
    /<script[^>]*src="\/sdk\.js"[^>]*><\/script>/.test(src),
    "Vite переносит содержимое <head> в сборку 1:1: нет тега здесь — нет тега в dist"
  );
  check(
    "исходный index.html ссылается на src/main.tsx",
    /<script[^>]*type="module"[^>]*src="[^"]*\/src\/main\.tsx"/.test(src),
    "точка входа сборки; её отсутствие означает, что в корень положен собранный файл"
  );
  check(
    "исходный index.html не является артефактом сборки",
    src.length < 200_000,
    `размер ${src.length} байт — похоже, сюда сохранили собранный single-file (он без SDK)`
  );
} catch {
  check("index.html (исходник) существует", false, "без него `vite build` не соберёт игру");
}

// ── 1. Ссылка на внутреннее хранилище сервиса ─────────────────
// Замечание модерации «Обнаружена ссылка на сервисное хранилище / Файл содержит
// URL-адрес внутреннего хранилища сервиса». Историческая причина — запасной
// абсолютный адрес SDK `https://sdk.games.s3.yandex.net/sdk.js` в бандле:
// домен `*.s3.yandex.net` платформа считает ссылкой на своё внутреннее хранилище.
// Сканируем ВСЕ текстовые файлы сборки, а не только index.html.
const STORAGE_HOSTS =
  /(^|\.)(s3|storage)\.[a-z0-9.-]*(yandex|yandexcloud|amazonaws|googleapis|windows\.net)/i;
const foundStorage = [];
const allUrls = new Map(); // url -> файлы, где встречается
const fileTexts = new Map(); // файл -> содержимое (нужно проверкам ниже)

for (const file of textFiles) {
  const text = file.relative === "index.html" ? html : await readFile(file.absolute, "utf8");
  fileTexts.set(file.relative, text);
  for (const m of text.matchAll(/https?:\/\/[^\s"'`)<>\]]+/g)) {
    const url = m[0];
    if (!allUrls.has(url)) allUrls.set(url, new Set());
    allUrls.get(url).add(file.relative);
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      /* обрезанный адрес в тексте — хост не определить, проверим строкой ниже */
    }
    if (STORAGE_HOSTS.test(host) || STORAGE_HOSTS.test(url)) {
      foundStorage.push(`${url} (${[...allUrls.get(url)].join(", ")})`);
    }
  }
}
check(
  "нет ссылок на внутреннее хранилище сервиса (*.s3.yandex.net и т.п.)",
  foundStorage.length === 0,
  [...new Set(foundStorage)].join("; ")
);

// ── 2. Никаких посторонних внешних адресов (п. 8.4.2) ──────────
// Разрешены только те строки, которые заведомо не являются запросом:
// пространства имён XML/SVG (обязательный атрибут xmlns) и адрес в тексте
// сообщения об ошибке React. Всё остальное — повод посмотреть глазами.
// Разрешены только пространства имён XML/SVG: это обязательный атрибут xmlns,
// запросом он не является и есть в любой странице с SVG.
const NEUTRAL_URLS = [
  "http://www.w3.org/2000/svg",
  "http://www.w3.org/1999/xlink",
  "http://www.w3.org/XML/1998/namespace",
  "http://www.w3.org/1998/Math/MathML",
];
const foreign = [...allUrls.keys()].filter((u) => !NEUTRAL_URLS.some((n) => u.startsWith(n)));
check(
  "нет внешних адресов, кроме нейтральных xmlns/текста ошибки React (п. 8.4.2)",
  foreign.length === 0,
  foreign.map((u) => `${u} (${[...allUrls.get(u)].join(", ")})`).join("; ")
);

// ── 2б. Адреса БЕЗ схемы (http:// не обязателен, чтобы быть ссылкой) ──
// Именно так в сборку второй раз приехала посторонняя ссылка: в HTML-комментариях
// index.html документация упоминала `yandex.ru/games/sdk/v2` и адрес раздела доки.
// Vite переносит комментарии в dist как есть, а проверка по `https?://` их не ловила.
// Минифицированный бандл здесь не смотрим — там `x.js` и `t.me` получаются из
// имён переменных; index.html не минифицируется, поэтому проверяем его целиком.
const TLD = "(?:ru|net|com|org|io|dev|cloud|app|me|info|biz|site|online|games|tv|gg|co)";
const bareDomains = [...new Set(
  [...html.matchAll(new RegExp(`\\b(?:[a-z0-9-]+\\.)+${TLD}(?:/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]*)?`, "gi"))].map(
    (m) => m[0]
  )
)];
check(
  "в index.html нет адресов (в том числе без схемы http)",
  bareDomains.length === 0,
  bareDomains.join(", ")
);
check(
  "в сборке нет HTML-комментариев (через них сюда приезжали ссылки)",
  !/<!--[\s\S]*?-->/.test(html),
  "stripExternalRefs в vite.config.ts должен их вырезать"
);

// ── 2в. Домен react.dev в тексте минифицированных ошибок React ───
// stripExternalRefs вырезает его из бандла вместе со схемой. Если он вернулся
// (обновился React, плагин отключили) — это регрессия: в файле снова посторонний домен.
const withReactDev = [...fileTexts].filter(([, t]) => /react\.dev/.test(t)).map(([f]) => f);
check("в сборке нет домена react.dev", withReactDev.length === 0, withReactDev.join(", "));

// ── 3. Тег SDK (п. 1.1, 1.19.1) ──────────────────────────────
const headEnd = html.indexOf("</head>");
const head = headEnd >= 0 ? html.slice(0, headEnd) : html;
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

// ── 4. Инициализация SDK в коде (п. 1.1) ───────────────────────
const bundle = distFiles.filter((f) => f.relative.endsWith(".js"));
const bundleText = (await Promise.all(bundle.map((f) => readFile(f.absolute, "utf8")))).join("\n");
const code = html + "\n" + bundleText;
check("YaGames.init() в коде", code.includes("YaGames.init"), "без инициализации платформа не увидит SDK");
check(
  "нет динамической догрузки SDK по абсолютному адресу",
  !/createElement\("script"\)[\s\S]{0,200}https?:\/\//.test(code),
  "SDK берётся только из /sdk.js — иначе вернётся замечание про хранилище сервиса"
);

// ── 5. Загрузка и разметка геймплея (п. 1.19.2–1.19.4) ─────────
check("LoadingAPI.ready()", code.includes("LoadingAPI") && code.includes(".ready("), "п. 1.19.2");
check(
  "GameplayAPI.start/stop",
  code.includes("GameplayAPI") && code.includes(".start(") && code.includes(".stop("),
  "п. 1.19.3"
);
check("паузы платформы (game_api_pause)", code.includes("game_api_pause"), "п. 1.19.4");

// ── 6. Монетизация через SDK (п. 1.12) ─────────────────────────
check("fullscreen-реклама (showFullscreenAdv)", code.includes("showFullscreenAdv"), "п. 1.12/4.4");
check("rewarded-реклама (showRewardedVideo)", code.includes("showRewardedVideo"), "п. 4.5");

// ── 7. Автоопределение языка (п. 2.14) ─────────────────────────
check(
  "чтение ysdk.environment.i18n.lang",
  code.includes("environment") && code.includes("i18n") && code.includes(".lang"),
  "иначе индикатор 文 на debug-панели не позеленеет"
);

// ── 8. Локали RU+EN ───────────────────────────────────────────
check("русская локаль в сборке", html.includes("Прогреваем мотор"));
check("английская локаль в сборке", html.includes("Warming up"));

// ── 9. Все ссылки из index.html ведут на файлы внутри сборки ───
// Игра раздаётся из вложенной папки, поэтому пути только относительные (./…);
// путь «от корня домена» (/assets/…) увёл бы запрос на yandex.ru/assets/…
const localRefs = [
  ...html.matchAll(/\ssrc="([^":][^"]*)"/g),
  ...html.matchAll(/\shref="([^":][^"]*)"/g),
]
  .map((m) => m[1])
  .filter((u) => !u.startsWith("data:") && !u.startsWith("#"));
// /sdk.js в архиве не лежит и не должен: этот путь отдаёт сервер Яндекс Игр.
const missingRefs = localRefs.filter((ref) => ref !== "/sdk.js" && !distNames.has(ref.replace(/^\.\//, "")));
const absoluteRefs = localRefs.filter((ref) => ref.startsWith("/"));
check(
  "все файлы из index.html лежат рядом в сборке",
  missingRefs.length === 0,
  `не найдено: ${missingRefs.join(", ")}`
);
check(
  "пути в index.html относительные (без «/» в начале)",
  absoluteRefs.filter((r) => r !== "/sdk.js").length === 0,
  `${absoluteRefs.filter((r) => r !== "/sdk.js").join(", ")} — на платформе уедут на корень домена`
);

// ── 10. Картинки — реальные файлы в папке сборки ──────────────
// Все изображения игры лежат в src/assets/**; сборка обязана донести их
// до dist/assets отдельными файлами (это и есть «папка с картинками» в архиве).
const srcImgs = await collect(path.join(root, "src", "assets")).catch(() => []);
const srcImgNames = srcImgs.filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f.relative));
const distImgs = distFiles.filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f.relative));
check(
  `в сборке ${distImgs.length} файл(ов) изображений (в src/assets: ${srcImgNames.length})`,
  srcImgNames.length > 0 && distImgs.length >= srcImgNames.length,
  "проверьте src/assets и build.assetsInlineLimit в vite.config.ts"
);
// Каждая картинка, на которую ссылается бандл, физически есть в dist.
const referenced = new Set(
  [...bundleText.matchAll(/new URL\("([^"]+\.(?:jpe?g|png|webp|gif))"/g)].map((m) => m[1])
);
const referencedMissing = [...referenced].filter((name) => !distNames.has(`assets/${name}`));
check(
  "бандл не ссылается на отсутствующие картинки",
  referenced.size > 0 && referencedMissing.length === 0,
  referenced.size === 0
    ? "в бандле не найдено ни одной ссылки new URL(…jpg) — проверка ничего не проверила"
    : `не найдено: ${referencedMissing.join(", ")}`
);

// ── 11. Это сборка ДЛЯ Яндекса, а не ПК-версия ─────────────────
check(
  "не перепутан файл с pc-build (там SDK вырезан)",
  !html.includes("автономная версия для ПК") && !html.includes("НЕ ЗАГРУЖАТЬ В ЯНДЕКС"),
  "в Консоль грузится publish/bmw-clicker-yandex.zip, НЕ pc-build/index.html"
);

// ── 12. Размер (п. 1.21) ──────────────────────────────────────
const totalBytes = distFiles.reduce((sum, f) => sum + f.size, 0);
const totalMb = totalBytes / 1024 / 1024;
check(`размер сборки ${totalMb.toFixed(2)} МБ (${distFiles.length} файл(ов)) < 100 МБ`, totalMb < 100, "п. 1.21");

// ── 13. Архив (п. 1.22: index.html в корне) ────────────────────
const zipIdx = process.argv.indexOf("--zip");
if (zipIdx >= 0) {
  const zipPath = process.argv[zipIdx + 1];
  if (!zipPath) {
    check("--zip <путь>", false, "не указан путь к архиву");
  } else {
    try {
      const abs = path.isAbsolute(zipPath) ? zipPath : path.join(root, zipPath);
      const out = execFileSync(
        "python3",
        [
          "-c",
          "import zipfile,sys; print('\\n'.join(i.filename for i in zipfile.ZipFile(sys.argv[1]).infolist()))",
          abs,
        ],
        { encoding: "utf8" }
      );
      const names = out.trim().split("\n").filter(Boolean);
      const nameSet = new Set(names);
      check(`архив ${zipPath} открывается`, true);
      check("index.html в КОРНЕ архива (п. 1.22)", nameSet.has("index.html"), `содержимое: ${names.slice(0, 8).join(", ")}`);
      check(
        "архив не завёрнут в лишнюю папку",
        !names.every((n) => n.startsWith(`${names[0].split("/")[0]}/`)),
        "внутри одна папка-обёртка — архив нужно собирать из СОДЕРЖИМОГО dist/"
      );
      check(
        "папка assets с файлами игры на месте",
        names.some((n) => n.startsWith("assets/")),
        `содержимое: ${names.slice(0, 8).join(", ")}`
      );
      const junk = names.filter((n) => /(^|\/)(\.DS_Store|Thumbs\.db|__MACOSX)|\.map$/i.test(n));
      check("в архиве нет служебного мусора", junk.length === 0, junk.join(", "));
      const missing = [...distNames].filter((n) => !nameSet.has(n));
      check("в архиве все файлы сборки", missing.length === 0, `не хватает: ${missing.join(", ")}`);
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
