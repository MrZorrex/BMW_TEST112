import type { Rarity } from "../data/game";

/** Языки игры. Русский — для ru/be/kk/uk/uz, английский — для остальных (п. 2.10, резервный набор). */
export type Lang = "ru" | "en";

export const LANGS: Lang[] = ["ru", "en"];

/** Коды интерфейса Яндекс Игр, для которых выбирается русский язык. */
export const RU_LANG_CODES = ["ru", "be", "kk", "uk", "uz"];

/**
 * Локализованные строки данных игры (по id сущностей).
 * Всё опционально: отсутствующее значение = fallback на русский текст
 * из data/game.ts и data/products.ts (там — исходный русский язык).
 */
export interface DataDict {
  eras?: string[];
  models?: Record<string, { era?: string; years?: string; desc?: string }>;
  upgrades?: Record<string, { name?: string; flavor?: string }>;
  cards?: Record<string, { name?: string; note?: string }>;
  cases?: Record<string, { name?: string; tagline?: string }>;
  rarity?: Partial<Record<Rarity, string>>;
  products?: Record<string, string>;
}

export const isLang = (v: unknown): v is Lang => v === "ru" || v === "en";
