// Статический сервер для записи промо-видео: игра (dist/index.html), мок SDK, шрифты.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
// по умолчанию — свежая сборка из корня репозитория (npm run build:yandex)
const GAME = process.argv[2] || join(DIR, "../../../dist/index.html");
const PORT = Number(process.argv[3] || 8095);
const FONTS = process.env.FONTS_DIR || dirname(createRequire(import.meta.url).resolve("@fontsource/roboto/400.css"));

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2" };

// Roboto 400–900 (latin, latin-ext, cyrillic, cyrillic-ext) — так игра выглядит на Android (system-ui → Roboto)
function fontsCss() {
  let css = "";
  for (const w of [400, 500, 600, 700, 800, 900]) {
    const src = readFileSync(join(FONTS, `${w}.css`), "utf8");
    // оставляем только нужные подмножества
    for (const block of src.split("}")) {
      if (!/roboto-(latin|latin-ext|cyrillic|cyrillic-ext)-\d+-normal/.test(block)) continue;
      css += block.replace(/url\(\.\/files\//g, "url(/fonts/files/") + "}\n";
    }
  }
  return css;
}
const FONTS_CSS = fontsCss();

createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  try {
    if (p === "/" || p === "/index.html") {
      res.writeHead(200, { "content-type": types[".html"], "cache-control": "no-store" });
      return res.end(readFileSync(GAME));
    }
    if (p === "/sdk.js") {
      res.writeHead(200, { "content-type": types[".js"], "cache-control": "no-store" });
      return res.end(readFileSync(join(DIR, "mock-sdk.js")));
    }
    if (p === "/__seed") {
      res.writeHead(200, { "content-type": types[".html"] });
      return res.end("<!doctype html><title>seed</title>");
    }
    if (p === "/fonts/roboto.css") {
      res.writeHead(200, { "content-type": types[".css"], "cache-control": "max-age=3600" });
      return res.end(FONTS_CSS);
    }
    if (p.startsWith("/fonts/files/")) {
      const f = join(FONTS, "files", p.slice("/fonts/files/".length).replace(/[^\w.-]/g, ""));
      if (existsSync(f)) {
        res.writeHead(200, { "content-type": types[extname(f)] || "application/octet-stream", "cache-control": "max-age=3600" });
        return res.end(readFileSync(f));
      }
    }
    res.writeHead(404);
    res.end("not found");
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`video server on ${PORT}`));
