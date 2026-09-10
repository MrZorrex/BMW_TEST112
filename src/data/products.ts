/**
 * Локальные метаданные инап-покупок.
 *
 * id товаров обязаны совпадать с id, созданными в Консоли разработчика
 * (Инап-покупки → Инапы). Цена, название и иконка валюты в UI берутся из
 * SDK-каталога (payments.getCatalog) — требование п. 1.13.2/1.13.6.
 * Здесь — только то, что платформа не хранит: тип выдачи и локальные подробности.
 */

export type ProductKind = "consumable" | "permanent";

export interface ProductMeta {
  id: string;
  kind: ProductKind;
  /** короткая строка эффекта — показываем игроку перед покупкой (п. 1.13.5) */
  effect: string;
}

/** Множитель дохода от постоянного товара «Перекуп года» (perk id = product id). */
export const VIP_PERK_ID = "vip_dealer";
export const VIP_PERK_BONUS = 0.25; // +25% к клику, пассиву и автокликеру

/** Доля цены следующей машины, выдаваемая расходным товаром cash_pile. */
export const CASH_PILE_SHARE = 0.35;
/** Фолбэк для последней модели (следующей нет): доля от базы текущей. */
export const CASH_PILE_FALLBACK_BASE_MULT = 50_000;

export const PRODUCTS: ProductMeta[] = [
  {
    id: "cash_pile",
    kind: "consumable",
    effect: `Сразу выдаёт наличные: ${Math.round(CASH_PILE_SHARE * 100)}% от цены следующей машины. Можно покупать многократно.`,
  },
  {
    id: "vip_dealer",
    kind: "permanent",
    effect: `Навсегда +${Math.round(VIP_PERK_BONUS * 100)}% ко всему доходу: клик, пассив и автокликер. Сохраняется при новых кругах.`,
  },
];

export const productMetaById = (id: string): ProductMeta | null => PRODUCTS.find((p) => p.id === id) ?? null;
