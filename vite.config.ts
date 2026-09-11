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

// https://vite.dev/config/
export default defineConfig({
  // Относительные пути — собранная игра открывается двойным кликом (file://)
  // и с любого хостинга без перенастройки.
  base: "./",
  plugins: [react(), tailwindcss(), yandexSdkDevStub, viteSingleFile()],
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
});
