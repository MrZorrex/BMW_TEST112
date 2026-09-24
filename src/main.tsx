import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { cloudLoad, getSdkLang, initYandex, loadingReady, onSdkLang, setCloudSnapshot, withTimeout } from "./game/yandex";
import { SAVE_KEY } from "./game/useGame";
import { applyLangToDocument, readLocalLangSave, resolveStartLang } from "./i18n";

/**
 * Страховка для п. 1.19.2 (`LoadingAPI.ready()`).
 * Готовность заявляет App в эффекте первого рендера — это и есть момент, когда
 * с игрой можно взаимодействовать. Аварийный таймер нужен только на случай,
 * если запуск завис (все ожидания SDK ограничены ~13 с, так что при нормальном
 * старте таймер ничего не делает). На ошибки JS готовность НЕ заявляем:
 * посторонняя ошибка во время загрузки дала бы зелёный Game Ready раньше,
 * чем игра стала доступна, — а это отдельное нарушение п. 1.19.2.
 */
function armReadyFallback() {
  if (typeof window === "undefined") return;
  setTimeout(() => {
    try {
      loadingReady();
    } catch {
      /* уже заявлена или платформы нет */
    }
  }, 15000);
}

armReadyFallback();

/**
 * Порядок запуска:
 * 1. Инициализируем SDK Яндекс Игр. Как только он вернул environment.i18n.lang,
 *    язык сразу применяется к документу и загрузочной заглушке — до хранилища,
 *    getPlayer() и облака (п. 2.14: автоопределение работает на старте).
 * 2. Подтягиваем облачное сохранение: язык, выбранный игроком вручную, может
 *    приехать из облака (п. 6.9).
 * 3. Рендерим игру; LoadingAPI.ready() вызывается внутри App (п. 1.19.2).
 *
 * Все ожидания ограничены таймаутами: старт игры никогда не висит дольше
 * ~10 секунд даже при мёртвой сети. Иначе видна только заглушка «Прогреваем
 * мотор», платформа не получает LoadingAPI.ready() — и фиксирует отказ
 * «SDK некорректно встроено» (п. 1.1).
 */
async function boot() {
  // Язык применяем по событию, а не после await initYandex(): внутри
  // инициализации есть сетевые вызовы, и задержка сдвигала бы смену языка
  // из «запуска» в «процесс игры» — именно это проверяет debug-панель.
  const offLang = onSdkLang(() => applyBootLang());

  try {
    const ok = await withTimeout(initYandex(), 9000, "boot-init").catch(() => false);
    if (ok) {
      const cloud = await withTimeout(cloudLoad(), 4000, "boot-cloud").catch(() => null);
      if (cloud) setCloudSnapshot(cloud);
    }
  } catch {
    /* играем офлайн, прогресс останется локальным */
  } finally {
    offLang();
  }

  // Стартовый язык: автоопределение SDK > ручной выбор игрока > язык браузера.
  applyBootLang();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  // Убираем стартовую заглушку
  const boot = document.getElementById("boot");
  if (boot) {
    boot.style.opacity = "0";
    setTimeout(() => boot.remove(), 420);
  }
}

/** Язык до первого кадра: <html lang>, title, meta description, подпись заглушки. */
function applyBootLang() {
  try {
    applyLangToDocument(resolveStartLang(getSdkLang(), [readLocalLangSave(SAVE_KEY)]));
  } catch {
    /* останется язык, проставленный инлайн-скриптом из index.html */
  }
}

void boot();
