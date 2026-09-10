import { createContext, useContext } from "react";
import { isLang, RU_LANG_CODES, type Lang } from "./types";
import { ru, type Dict } from "./ru";
import { en } from "./en";
import { setNumberLang } from "../game/format";

export type { Lang, Dict };
export { LANGS, RU_LANG_CODES, isLang } from "./types";

/**
 * Часть сохранения, важная для выбора языка (п. 2.14).
 * `langPinnedOn` — код языка платформы в момент РУЧНОГО выбора игрока. Он нужен,
 * чтобы отличить «игрок сам выбрал язык» от «значение языка попало в сейв вместе
 * с автосохранением прогресса»: второе не имеет права перекрывать
 * автоопределение при следующем запуске.
 */
export interface LangSave {
  lang?: unknown;
  langPinnedOn?: unknown;
}

/** Нормализация кода языка: `ru-RU` / `TR` → `ru` / `tr` (ISO 639-1). */
export function langCodeOf(code: string | null | undefined): string {
  return (code ?? "").toLowerCase().split(/[-_]/)[0];
}

/**
 * Выбор языка игры по коду языка интерфейса платформы (п. 2.10, 2.14).
 * Резервный набор языков из доки: `ru` для be/kk/uk/uz, `en` для остальных.
 */
export function mapToLang(code: string | null | undefined): Lang {
  let c = langCodeOf(code);
  // Пустой код (игры вне платформы) — берём язык браузера.
  if (!c && typeof navigator !== "undefined") c = langCodeOf(navigator.language);
  // Язык неизвестен вовсе → русский: на нём игра написана.
  if (!c) return "ru";
  return RU_LANG_CODES.includes(c) ? "ru" : "en";
}

/**
 * Язык, выбранный игроком вручную (п. 6.9). Уважается только если язык
 * платформы с момента выбора не менялся: иначе автоопределение (п. 2.14)
 * оказалось бы навсегда перебито устаревшим сейвом.
 */
function pinnedLangOf(save: LangSave | null | undefined, sdkLang: string | null): Lang | null {
  if (!save || !isLang(save.lang) || typeof save.langPinnedOn !== "string") return null;
  if (sdkLang && langCodeOf(save.langPinnedOn) !== langCodeOf(sdkLang)) return null;
  return save.lang;
}

/** Любой валидный язык из сейва — резерв вне платформы (п. 2.14 допускает кеш выбора). */
function savedLangOf(save: LangSave | null | undefined): Lang | null {
  return save && isLang(save.lang) ? save.lang : null;
}

/**
 * Стартовый язык игры — единственный источник правды для main.tsx и useGame.
 *
 * Порядок (п. 2.14 + 6.9):
 * 1. Язык, выбранный игроком вручную, — если язык платформы не менялся.
 * 2. Иначе — код языка из SDK (`ysdk.environment.i18n.lang`), то есть
 *    автоопределение. На платформе оно важнее языка из сейва: в сейв язык
 *    попадает и при автосохранении, иначе проверка переключения языка на
 *    debug-панели (SDK mocks) давала бы «язык не переключился».
 * 3. Вне платформы (локальная разработка, ПК-сборка) — сохранённый язык,
 *    затем язык браузера.
 * 4. Неизвестный код — резервный набор ru/en.
 */
export function resolveStartLang(sdkLang: string | null, saves: (LangSave | null | undefined)[] = []): Lang {
  if (sdkLang) {
    for (const s of saves) {
      const pinned = pinnedLangOf(s, sdkLang);
      if (pinned) return pinned;
    }
    return mapToLang(sdkLang);
  }
  for (const s of saves) {
    const saved = savedLangOf(s);
    if (saved) return saved;
  }
  return mapToLang(null);
}

/**
 * Значение `langPinnedOn` при ручном выборе языка игроком. Вне платформы
 * кода языка нет — пишем пустую строку: флаг «выбрано вручную» важен и для
 * ПК-сборки (там сейв всегда приоритетнее автоопределения).
 */
export const pinLangFor = (sdkLang: string | null): string => sdkLang ?? "";

/** Чтение языка из локального сохранения — для загрузочной заглушки до старта React. */
export function readLocalLangSave(key: string): LangSave | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as LangSave) : null;
  } catch {
    return null;
  }
}

/** Подстановка {placeholders} в строки словаря. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

// ─── Контекст ────────────────────────────────────────────────

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
}

const I18nCtx = createContext<I18nValue>({ lang: "ru", setLang: () => {}, t: ru });

export const I18nProvider = I18nCtx.Provider;

export function useI18n(): I18nValue {
  return useContext(I18nCtx);
}

export function dictOf(lang: Lang): Dict {
  return lang === "en" ? en : ru;
}

/**
 * Применяет язык к документу: <html lang>, title, meta description, текст
 * загрузочной заглушки и формат чисел. Вызывается на старте (п. 2.14 — до
 * первого рендера) и при ручном выборе языка (п. 6.9).
 */
export function applyLangToDocument(lang: Lang): void {
  try {
    document.documentElement.lang = lang;
    document.documentElement.setAttribute("translate", "no");
    document.title = dictOf(lang).meta.gameName;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", dictOf(lang).meta.description);
    // Загрузочная заглушка живёт в index.html и видна до готовности React —
    // её подпись обязана следовать за языком (см. примеры в п. 2.14).
    const bootText = document.querySelector("#boot .t");
    if (bootText) bootText.textContent = dictOf(lang).meta.boot;
  } catch {
    /* noop */
  }
  setNumberLang(lang);
}
