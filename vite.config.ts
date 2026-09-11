import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * `vite dev` и SDK Яндекс Игр.
 *
 * В dev-сервере подключённый в index.html `<script src="/sdk.js">` подхватить
 * негде: этот путь проксирует только сервер Яндекса (дока:
 * yandex.ru/dev/games/doc/ru/concepts/local-launch). Без обработки запроса Vite
 * отдаёт на /sdk.js индекс (SPA-fallback), и браузер показывает в консоли
 * «SyntaxError: Unexpected token '<'» — шум, мешающий отличить реальную проблему
 * от отсутствия платформы. Поэтому по умолчанию /sdk.js отдаётся пустым скриптом:
 * `window.YaGames` не появляется, игра мгновенно стартует в офлайн-режиме
 * (все вызовы SDK деградируют в no-op — см. src/game/yandex.ts).
 *
 * Нужен настоящий SDK (проверить рекламу, покупки, автоопределение языка) —
 * запускаем с прокси на CDN Яндекса, тогда заглушка не ставится:
 *   YANDEX_SDK_PROXY=1 npm run dev
 *
 * На саму сборку для Яндекс Игр это не влияет: тег /sdk.js остаётся в dist как есть.
 */
const sdkProxy = Boolean(process.env.YANDEX_SDK_PROXY);

const yandexSdkDevStub: PluginOption = {
  name: "yandex-sdk-dev-stub",
  apply: "serve",
  configureServer(server) {
    if (sdkProxy) return; // запрос уйдёт в server.proxy ниже
    server.middlewares.use("/sdk.js", (_req, res) => {
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end("/* Yandex Games SDK в `vite dev` недоступен. Реальный SDK: YANDEX_SDK_PROXY=1 npm run dev */");
    });
  },
};

/**
 * Зачистка всего, что похоже на внешний адрес, из файлов сборки.
 *
 * Зачем: автопроверка Консоли Яндекс Игр отклоняет релиз с замечанием
 * «Обнаружена ссылка на сервисное хранилище / Файл содержит URL-адрес
 * внутреннего хранилища сервиса». Трижды эта строка приезжала в сборку не из
 * кода, а из ПОЯСНЕНИЙ:
 *   1. запасной абсолютный адрес SDK (убран из src/game/yandex.ts);
 *   2. HTML-комментарии в index.html, где документация упоминала
 *      `yandex.ru/games/sdk/v2` и `yandex.ru/dev/games/doc/ru/sdk/sdk-about` —
 *      Vite переносит комментарии в dist как есть, а без схемы `https://`
 *      валидатор их не ловил;
 *   3. текст минифицированных ошибок React со ссылкой на react.dev.
 * Поэтому здесь вырезаются и HTML-комментарии, и внешние адреса в бандле.
 * На работу игры это не влияет: комментарии — только заметки разработчику,
 * а react.dev в тексте ошибки — подсказка отладчику, в релизе бесполезная.
 */
const stripExternalRefs: PluginOption = {
  name: "strip-external-refs",
  apply: "build",
  enforce: "post",
  transformIndexHtml: {
    order: "post",
    handler(html) {
      return html.replace(/<!--[\s\S]*?-->\s*/g, "");
    },
  },
  generateBundle(_options, bundle) {
    for (const item of Object.values(bundle)) {
      if (item.type !== "chunk") continue;
      // Минифицированные ошибки React содержат «visit https://react.dev/errors/310…».
      // Вырезаем домен целиком, вместе со схемой: код ошибки (#310) в сообщении
      // остаётся, а постороннего адреса в релизном файле больше нет.
      item.code = item.code.replace(/(?:https?:\/\/)?react\.dev\//g, "react-errors/");
    }
  },
};

/**
 * Один файл или папка с файлами.
 *
 * Релиз для Яндекс Игр (npm run build / build:yandex) — ОБЫЧНАЯ многофайловая
 * сборка: index.html в корне + папка assets/ со скриптом, стилями и картинками.
 * Так в архиве лежат реальные файлы игры, и ровно это видит модерация.
 *
 * SINGLE_FILE=1 — всё инлайнится в один index.html. Это нужно только
 * автономной ПК-версии (npm run build:pc), которую открывают двойным кликом.
 */
const singleFile = Boolean(process.env.SINGLE_FILE);

// https://vite.dev/config/
export default defineConfig({
  // Относительные пути — Яндекс Игры раздаёт архив из вложенной папки
  // (требование «используйте относительные пути»), а собранная игра к тому же
  // открывается двойным кликом (file://) и с любого хостинга без перенастройки.
  base: "./",
  plugins: [react(), tailwindcss(), yandexSdkDevStub, stripExternalRefs, ...(singleFile ? [viteSingleFile()] : [])],
  build: {
    // В многофайловой сборке картинки НЕ инлайним (лимит 0 байт): они уезжают
    // отдельными файлами в assets/ — это и есть «папка с картинками» в архиве.
    // В single-file сборке, наоборот, всё должно лечь внутрь HTML.
    assetsInlineLimit: singleFile ? Number.MAX_SAFE_INTEGER : 0,
    assetsDir: "assets",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Разрешаем превью-хосты песочницы (прокси вида *.e2b.app)
    allowedHosts: true,
    proxy: sdkProxy
      ? {
          "/sdk.js": {
            target: "https://sdk.games.s3.yandex.net",
            changeOrigin: true,
            secure: true,
          },
        }
      : undefined,
  },
  // `npm run preview` раздаёт собранную папку dist/ — так удобно проверить
  // ровно те относительные пути, которые уйдут в архив для Яндекс Игр.
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
  },
});
