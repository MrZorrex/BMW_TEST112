// Сборка автономной версии игры для ПК: один файл pc-build/index.html,
// который запускается двойным кликом (file://) без сервера и без интернета.
//
// Отличия от сборки для Яндекс Игр:
// - вырезан тег SDK Яндекс Игр (офлайн-версии он не нужен, игра и так
//   умеет работать без платформы: прогресс хранится в localStorage);
// - итог копируется в pc-build/index.html — папку можно переименовывать
//   и переносить куда угодно.
//
// Запуск: npm run build:pc
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const tmpDir = path.join(root, "dist-pc");
const outDir = path.join(root, "pc-build");
const outFile = path.join(outDir, "index.html");

console.log("▸ Собираю игру (vite build)…");
await execFileAsync(process.execPath, ["./node_modules/vite/bin/vite.js", "build", "--outDir", "dist-pc", "--emptyOutDir"], {
  cwd: root,
  windowsHide: true,
});

const files = await readdir(tmpDir);
if (!files.includes("index.html")) {
  throw new Error("dist-pc/index.html не создан — сборка не удалась.");
}

let html = await readFile(path.join(tmpDir, "index.html"), "utf8");

// Вырезаем SDK Яндекс Игр — для офлайн-запуска на ПК он не нужен,
// а грузиться с file:// без интернета он будет с задержкой.
const before = html.length;
html = html
  .replace(/<!--\s*Yandex Games SDK[\s\S]*?-->\s*/i, "")
  .replace(/<script[^>]*src="(\/sdk\.js|https:\/\/yandex\.ru\/games\/sdk\/v2)"[^>]*>\s*<\/script>\s*/i, "");
if (html.length === before) {
  console.warn("! Тег SDK Яндекс Игр не найден — возможно, index.html изменился. Продолжаю как есть.");
}

// Динамическая догрузка SDK (ensureSdkScript в src/game/yandex.ts) на file://
// не срабатывает сама: она включается только для страниц, открытых по http(s),
// и использует тот же относительный путь /sdk.js. Абсолютных адресов SDK
// в бандле нет (п. 1.7) — вырезать больше ничего не нужно.

// Помечаем файл как ПК-версию — крупно, чтобы его случайно не загрузили
// в Консоль Яндекс Игр: здесь НЕТ SDK, такой файл получит отказ по п. 1.1.
// В Консоль грузится только publish/bmw-clicker-yandex.zip (npm run build:yandex).
html = html.replace(
  "<head>",
  "<head>\n    <!-- Перекуп BMW — автономная версия для ПК: работает офлайн, прогресс хранится в браузере -->\n    <!-- НЕ ЗАГРУЖАТЬ В ЯНДЕКС ИГРЫ: в этом файле вырезан SDK, будет отказ по п. 1.1 -->"
);

// Проверки для запуска через file://
const problems = [];
if (/src="\//.test(html) || /href="\//.test(html)) problems.push("найдены абсолютные пути src=\"/…\" / href=\"/…\"");
if (/yandex\.ru\/games\/sdk/.test(html) || /src="\/sdk\.js"/.test(html) || /s3\.yandex/.test(html))
  problems.push("осталась ссылка на SDK Яндекс Игр");
if (/\/src\/main\.tsx/.test(html)) problems.push("осталась ссылка на исходник /src/main.tsx (сборка не инлайнилась)");
if (problems.length > 0) {
  throw new Error("Файл не годится для запуска двойным кликом: " + problems.join("; "));
}

await mkdir(outDir, { recursive: true });
await writeFile(outFile, html);
const sizeMb = ((await stat(outFile)).size / 1024 / 1024).toFixed(2);

console.log(`✔ Готово: pc-build/index.html (${sizeMb} МБ, один файл).`);
console.log("  Открой его двойным кликом — игра запустится без сервера и без интернета.");
