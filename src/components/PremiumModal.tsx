import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Check, Coins, Crown, Loader2, LogIn, X } from "lucide-react";
import type { useGame } from "../game/useGame";
import { buyProduct, consumeProduct, getPlayerName, listPurchases, openAuthDialog, type YaProduct } from "../game/yandex";
import { VIP_PERK_ID, productMetaById } from "../data/products";
import { fmtMoney } from "../game/format";
import { sfxBuy, sfxFail, sfxWin } from "../game/sound";
import { fill, useI18n } from "../i18n";
import { productEffect } from "../i18n/data";

/**
 * Витрина инап-покупок. Каталог, цены и иконка портальной валюты — строго из
 * SDK (требования 1.13.2, 1.13.4, 1.13.6). Вне Яндекс Игр модалка не открывается:
 * кнопка входа в неё показывается только при непустом каталоге на платформе.
 */
export default function PremiumModal({
  catalog,
  game,
  playerAuthorized,
  onClose,
  onSynced,
}: {
  catalog: YaProduct[];
  game: ReturnType<typeof useGame>;
  playerAuthorized: boolean;
  onClose: () => void;
  /** вызывается после успешной выдачи — App сохранит прогресс (п. 1.9/1.13.3) */
  onSynced: () => void;
}) {
  const { t, lang } = useI18n();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [owned, setOwned] = useState<Record<string, boolean>>({});
  const [authorized, setAuthorized] = useState(playerAuthorized);

  // постоянные покупки, уже активные у игрока (п. 1.13.1 — проверка необработанных)
  useEffect(() => {
    void listPurchases().then((list) => {
      const map: Record<string, boolean> = {};
      for (const p of list) map[p.productID] = true;
      setOwned(map);
    });
  }, []);

  const buy = async (product: YaProduct) => {
    if (busyId) return;
    setBusyId(product.id);
    setError(null);
    const meta = productMetaById(product.id);
    try {
      const purchase = await buyProduct(product.id);
      if (!purchase) {
        setError(t.premium.errClosed);
        sfxFail();
        return;
      }
      if (game.isTokenGranted(purchase.purchaseToken)) {
        // выдача уже была (повторный вызов после обрыва сети) — только консумируем
        if (meta?.kind !== "permanent") await consumeProduct(purchase.purchaseToken);
        setDoneId(product.id);
        setTimeout(() => setDoneId(null), 2200);
        return;
      }
      // выдача товара строго соответствует описанию (п. 1.13.5)
      if (meta?.kind === "permanent" || product.id === VIP_PERK_ID) {
        game.grantPerk(product.id);
      } else {
        game.grantCash(game.cashPileAmount());
      }
      game.markTokenGranted(purchase.purchaseToken);
      // сначала фиксируем выдачу в данных игрока, потом консумируем (п. 1.13.1):
      // если сеть оборвётся, стартовая проверка не выдаст товар повторно
      await new Promise((r) => setTimeout(r, 60));
      onSynced();
      // расходные покупки консумируем сразу после выдачи (п. 1.13.1)
      if (meta?.kind !== "permanent") {
        await consumeProduct(purchase.purchaseToken);
      } else {
        setOwned((o) => ({ ...o, [product.id]: true }));
      }
      sfxBuy();
      sfxWin();
      confetti({ particleCount: 110, spread: 70, origin: { y: 0.6 }, colors: ["#f5c542", "#ffffff", "#1c69d4"] });
      setDoneId(product.id);
      setTimeout(() => setDoneId(null), 2200);
    } catch {
      setError(t.premium.errFailed);
      sfxFail();
    } finally {
      setBusyId(null);
    }
  };

  const login = async () => {
    const ok = await openAuthDialog();
    if (ok) setAuthorized(true);
  };

  const playerName = authorized ? getPlayerName() : "";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-night/90 p-4 backdrop-blur-lg"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 16, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-deep my-auto w-full max-w-[560px] overflow-hidden rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl border border-gold/30 bg-gold/15">
              <Crown className="size-5 text-gold" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-gold/80">{t.premium.overTitle}</div>
              <h2 className="font-display text-lg font-black text-white">{t.premium.title}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="tap-min-sm grid size-8 shrink-0 place-items-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          {!authorized && (
            <div className="flex items-center gap-3 rounded-2xl border border-bmw/25 bg-bmw/[0.08] p-3">
              <LogIn className="size-4 shrink-0 text-bmw-soft" />
              <p className="flex-1 text-[11.5px] font-semibold leading-snug text-white/65">
                {t.premium.loginText}
              </p>
              <button
                onClick={() => void login()}
                className="tap-min-sm shrink-0 rounded-xl bg-bmw px-3.5 py-2 text-[11px] font-black text-white transition hover:brightness-110 active:scale-95"
              >
                {t.premium.loginBtn}
              </button>
            </div>
          )}

          {catalog.map((product) => {
            const meta = productMetaById(product.id);
            const isOwned = owned[product.id] || (meta?.kind === "permanent" && !!game.s.perks[product.id]);
            const busy = busyId === product.id;
            const done = doneId === product.id;
            const effect = meta ? productEffect(lang, product.id, meta.effect) : "";
            return (
              <div
                key={product.id}
                className="flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5"
              >
                <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-gold/25 bg-gold/[0.08]">
                  {product.imageURI ? (
                    <img src={product.imageURI} alt="" className="size-full object-cover" />
                  ) : (
                    <Coins className="size-6 text-gold" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-extrabold text-white">{product.title}</div>
                  <div className="mt-0.5 text-[11px] font-medium leading-snug text-white/50">
                    {product.description || effect}
                  </div>
                  {meta && (
                    <div className="mt-1 text-[11px] font-bold text-mint/80">
                      {product.id === "cash_pile" ? fill(t.premium.cashNow, { x: fmtMoney(game.cashPileAmount()) }) : ""}
                      {effect}
                    </div>
                  )}
                </div>
                <button
                  disabled={busy || isOwned}
                  onClick={() => void buy(product)}
                  className={`tap-min-sm flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2.5 font-display text-[12px] font-black tracking-wide transition active:scale-95 ${
                    isOwned
                      ? "border border-mint/30 bg-mint/10 text-mint"
                      : done
                        ? "border border-mint/40 bg-mint/15 text-mint"
                        : "shine-btn bg-gradient-to-r from-amber-500 to-gold text-night shadow-[0_8px_25px_-8px_rgba(245,197,66,.7)] hover:brightness-110 disabled:opacity-60"
                  }`}
                >
                  {isOwned ? (
                    <>
                      <Check className="size-3.5" /> {t.premium.owned}
                    </>
                  ) : busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      {/* цена и иконка валюты — из SDK (п. 1.13.2/1.13.4) */}
                      <span className="tabular">{product.priceValue}</span>
                      <img src={product.getPriceCurrencyImage("svg")} alt={product.priceCurrencyCode} className="size-3.5" />
                    </>
                  )}
                </button>
              </div>
            );
          })}

          {error && <div className="rounded-xl border border-mred/30 bg-mred/10 px-3.5 py-2.5 text-[11.5px] font-bold text-mred">{error}</div>}

          <p className="px-1 text-[10px] font-medium leading-relaxed text-white/30">
            {t.premium.payNoteA}
            {playerName ? fill(t.premium.payNoteUser, { name: playerName }) : ""}
            {t.premium.payNoteB}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
