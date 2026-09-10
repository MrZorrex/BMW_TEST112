import type { Lang } from "../i18n/types";

const SUF_RU = ["", " тыс.", " млн", " млрд", " трлн", " квадрлн", " квинтлн", " секстлн", " септлн"];
const SUF_EN = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc"];

let numLang: Lang = "ru";

/** Устанавливается из applyLangToDocument при смене языка игры. */
export function setNumberLang(lang: Lang): void {
  numLang = lang;
}

/**
 * Срез хвостовых нулей и разделителя: `1.50` → `1.5`, `1.00` → `1`.
 * Разделитель вставляет уже после среза — то, что число дробное, определяет
 * точка от toFixed(), а не локальный разделитель (в RU он запятая).
 */
function trimZeros(value: string, decSep: string): string {
  const dot = value.indexOf(".");
  if (dot < 0) return value; // дробной части нет — обрезать нечего (важно: 200 ≠ 2)
  const frac = value.slice(dot + 1).replace(/0+$/, "");
  return frac ? `${value.slice(0, dot)}${decSep}${frac}` : value.slice(0, dot);
}

export function fmt(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n < 0) return "-" + fmt(-n);
  if (n === 0) return "0";
  const en = numLang === "en";
  const SUF = en ? SUF_EN : SUF_RU;
  const decSep = en ? "." : ",";
  if (n < 1000) {
    // мелкие значения не округляем в ноль — иначе прокачка выглядит бесполезной
    const decimals = n < 1 ? 2 : n < 10 ? 2 : n < 100 ? 1 : 0;
    return trimZeros(n.toFixed(decimals), decSep);
  }
  let tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUF.length) tier = SUF.length - 1;
  const scaled = n / Math.pow(10, tier * 3);
  let decimals = 0;
  if (scaled < 10) decimals = 2;
  else if (scaled < 100) decimals = 1;
  return trimZeros(scaled.toFixed(decimals), decSep) + SUF[tier];
}

export function fmtMoney(n: number): string {
  return fmt(n) + " ₽";
}

export function fmtRate(v: number): string {
  return v.toLocaleString(numLang === "en" ? "en-US" : "ru-RU", { maximumFractionDigits: 2 });
}

export function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
