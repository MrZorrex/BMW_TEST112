import type { CarModel, CardDef, CaseDef, Rarity } from "../data/game";
import { ERAS } from "../data/game";
import type { Lang } from "./types";
import { ru } from "./ru";
import { en } from "./en";

const dataOf = (lang: Lang) => (lang === "en" ? en.data : ru.data);

/** Локализованные названия эпох для таймлайна. */
export function localizedEras(lang: Lang): string[] {
  return dataOf(lang).eras ?? ERAS;
}

/** Короткая подпись эпохи под таймлайном: «1920» / «’20». */
export function shortEra(lang: Lang, era: string): string {
  if (lang === "en") {
    const m = era.match(/(\d{2})(\d{2})s$/);
    return m ? `’${m[2]}` : era;
  }
  return era.replace("-е", "");
}

/** Локализованные текстовые поля модели (имя у всех моделей одинаковое). */
export function modelText(lang: Lang, m: CarModel): { era: string; years: string; desc: string } {
  const o = dataOf(lang).models?.[m.id];
  return { era: o?.era ?? m.era, years: o?.years ?? m.years, desc: o?.desc ?? m.desc };
}

export function upgradeText(
  lang: Lang,
  id: string,
  fb: { name: string; flavor: string }
): { name: string; flavor: string } {
  const o = dataOf(lang).upgrades?.[id];
  return { name: o?.name ?? fb.name, flavor: o?.flavor ?? fb.flavor };
}

export function cardText(lang: Lang, card: CardDef): { name: string; note: string } {
  const o = dataOf(lang).cards?.[card.id];
  return { name: o?.name ?? card.name, note: o?.note ?? card.note };
}

export function caseText(lang: Lang, c: CaseDef): { name: string; tagline: string } {
  const o = dataOf(lang).cases?.[c.id];
  return { name: o?.name ?? c.name, tagline: o?.tagline ?? c.tagline };
}

export function rarityLabel(lang: Lang, r: Rarity, fallback: string): string {
  return dataOf(lang).rarity?.[r] ?? fallback;
}

/** Локализованное описание эффекта инап-товара (п. 1.13.5 — выдача = описанию). */
export function productEffect(lang: Lang, id: string, fallback: string): string {
  return dataOf(lang).products?.[id] ?? fallback;
}
