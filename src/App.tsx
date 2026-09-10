import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Bot, CarFront, Coins, Dices, MousePointerClick, Sparkles, Star, Store, TrendingUp, X } from "lucide-react";
import Header from "./components/Header";
import Timeline from "./components/Timeline";
import CarStage from "./components/CarStage";
import Shop from "./components/Shop";
import GachaModal from "./components/GachaModal";
import UnlockModal from "./components/UnlockModal";
import PremiumModal from "./components/PremiumModal";
import { useGame, type Reward } from "./game/useGame";
import { useViewport } from "./game/useViewport";
import { CASES, MODELS, PRESTIGE_BONUS, type CarModel, type CaseDef } from "./data/game";
import { VIP_PERK_ID, productMetaById } from "./data/products";
import { fmtMoney } from "./game/format";
import { setSoundSuspended, sfxFail } from "./game/sound";
import { I18nProvider, applyLangToDocument, dictOf, fill, useI18n } from "./i18n";
import {
  consumeProduct,
  gameplayStart,
  gameplayStop,
  getCatalog,
  isPlayerAuthorized,
  isYandex,
  listPurchases,
  loadingReady,
  onAccountDialog,
  onPlatformPause,
  showInterstitial,
  showRewardedVideo,
  type YaProduct,
} from "./game/yandex";

/** Монетизация обязательна для публикации (требование 1.12). */
export const ADS_ENABLED = true;

type Game = ReturnType<typeof useGame>;

export default function App() {
  const game = useGame();

  // Язык документа следует за языком игры (п. 2.10, 8.2.3, 5.1.3).
  useEffect(() => {
    applyLangToDocument(game.s.lang);
  }, [game.s.lang]);

  return (
    <I18nProvider value={{ lang: game.s.lang, setLang: game.setLang, t: dictOf(game.s.lang) }}>
      <GameUI game={game} />
    </I18nProvider>
  );
}

function GameUI({ game }: { game: Game }) {
  const { t } = useI18n();
  const vp = useViewport();
  const { s } = game;

  // ВАЖНО: isYandex() вычисляется при рендере (после initYandex в main.tsx),
  // а не на уровне модуля — иначе реклама никогда не включится на платформе.
  const adsActive = ADS_ENABLED && isYandex();

  // ── Раскладка под ориентацию и устройство (п. 1.10) ──
  const compact = vp.isShort; // низкое окно: альбомный телефон, сплющенное окно
  const twoCol = !vp.isNarrow || (compact && vp.w >= 680); // две колонки: десктоп + альбом
  const [mobileTab, setMobileTab] = useState<"stage" | "shop">("stage");
  // на узких невысоких портретах сцена тоже компактная — всё влезает без прокрутки (п. 1.10.4)
  const stageCompact = compact || (!twoCol && vp.h < 720);

  const [unlock, setUnlock] = useState<CarModel | null>(null);
  const [gacha, setGacha] = useState<{ reward: Reward; caseDef: CaseDef } | null>(null);
  const [prestigeOpen, setPrestigeOpen] = useState(false);
  const [showOffline, setShowOffline] = useState(game.offlineGain > 0);
  const [showIntro, setShowIntro] = useState(!game.s.introSeen);
  const [resetOpen, setResetOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  // каталог инап-покупок из SDK; кнопка магазина видна, только если он непуст (п. 1.13.6)
  const [catalog, setCatalog] = useState<YaProduct[]>([]);
  const [authorized, setAuthorized] = useState(isPlayerAuthorized());
  // показ полноэкранной рекламы — геймплей на паузе (п. 4.7)
  const [adActive, setAdActive] = useState(false);
  // пауза от платформы: стартовый рекламный блок, окно покупки, смена вкладки (п. 1.19.4)
  const [platformPaused, setPlatformPaused] = useState(false);

  // ── SDK Яндекс Игр: готовность, разметка геймплея, паузы ──
  useEffect(() => {
    loadingReady(); // п. 1.19.2 — игра готова к взаимодействию
    return () => gameplayStop();
  }, []);

  // ── Инап-покупки: каталог + обработка необработанных покупок (п. 1.13.1) ──
  useEffect(() => {
    if (!isYandex()) return;
    void (async () => {
      const cat = await getCatalog();
      setCatalog(cat);
      setAuthorized(isPlayerAuthorized());
      const purchases = await listPurchases();
      if (!purchases.length) return;
      let granted = false;
      for (const p of purchases) {
        const meta = productMetaById(p.productID);
        const permanent = meta?.kind === "permanent" || p.productID === VIP_PERK_ID;
        if (game.isTokenGranted(p.purchaseToken)) {
          // выдача уже была — повторяться нельзя, только восстанавливаем эффект/консумируем
          if (permanent) game.grantPerk(p.productID);
          else await consumeProduct(p.purchaseToken);
          continue;
        }
        if (permanent) {
          game.grantPerk(p.productID); // постоянная покупка — восстанавливаем эффект
        } else {
          // расходная покупка без консумации (сбой сети) — выдаём и консумируем
          game.grantCash(game.cashPileAmount());
          await consumeProduct(p.purchaseToken);
        }
        game.markTokenGranted(p.purchaseToken);
        granted = true;
      }
      if (granted) {
        await new Promise((r) => setTimeout(r, 60));
        game.saveNow(); // п. 1.9 / 1.13.3 — прогресс фиксируем сразу
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inMenuRef = useRef(true);
  useEffect(() => {
    // геймплей идёт, когда не открыто ни одно модальное окно, нет рекламы и платформа не на паузе
    const inMenu =
      showIntro || prestigeOpen || !!unlock || !!gacha || premiumOpen || resetOpen || adActive || platformPaused;
    inMenuRef.current = inMenu;
    if (inMenu) gameplayStop();
    else gameplayStart();
  }, [showIntro, prestigeOpen, unlock, gacha, premiumOpen, resetOpen, adActive, platformPaused]);

  useEffect(() => {
    // п. 1.3 — при потере фокуса звук останавливается; разметка геймплея — по вкладке
    const suspend = () => {
      setSoundSuspended(true);
      gameplayStop();
    };
    const resume = () => {
      setSoundSuspended(false);
      if (!inMenuRef.current) gameplayStart();
    };
    const onVis = () => (document.visibilityState === "hidden" ? suspend() : resume());

    window.addEventListener("blur", suspend);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", onVis);

    // п. 1.19.4 — паузы платформы: стартовый рекламный блок (у него нет колбэков!),
    // окно покупки, сворачивание. Звук и игровой процесс — на паузу (п. 4.7).
    onPlatformPause(
      () => {
        setSoundSuspended(true);
        setPlatformPaused(true);
        game.setPaused(true);
      },
      () => {
        if (document.visibilityState === "visible") setSoundSuspended(false);
        setPlatformPaused(false);
        game.setPaused(false);
      }
    );

    // смена игрового аккаунта: сохраняем текущий прогресс и перезагружаемся,
    // чтобы подхватить сохранения вновь выбранного игрока
    onAccountDialog(
      () => {},
      () => {
        game.saveNow();
        window.location.reload();
      }
    );

    // п. 1.6.2.7 — контекстное меню не открывается по игровому полю
    const onCtx = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", onCtx);

    return () => {
      window.removeEventListener("blur", suspend);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("contextmenu", onCtx);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // предзагрузка следующих машин
  useEffect(() => {
    for (let i = 1; i <= 2; i++) {
      const m = MODELS[s.modelIndex + i];
      if (m) {
        const im = new Image();
        im.src = m.img;
      }
    }
  }, [s.modelIndex]);

  // Полноэкранная реклама в логических паузах (требования 4.4, антифрод РСЯ):
  // только после значимых событий (закрытие модалок), не чаще раза в 3 минуты
  // и не раньше минуты от старта сессии — никогда «голым» таймером по кликающему игроку.
  const sessionStart = useRef(Date.now());
  const lastInterstitial = useRef(0);
  const adActiveRef = useRef(false);
  adActiveRef.current = adActive;
  const maybeInterstitial = useCallback(() => {
    if (!adsActive || adActiveRef.current) return;
    const now = Date.now();
    if (now - sessionStart.current < 60_000) return;
    if (now - lastInterstitial.current < 3 * 60_000) return;
    lastInterstitial.current = now;
    adActiveRef.current = true;
    setAdActive(true); // п. 4.7 — игровой процесс на паузе на время рекламы
    game.setPaused(true);
    const finish = (shown: boolean) => {
      if (!shown) lastInterstitial.current = 0; // не показалась — разрешаем повтор
      adActiveRef.current = false;
      setAdActive(false);
      game.setPaused(false);
    };
    void showInterstitial({ onClose: (wasShown) => finish(!!wasShown), onError: () => finish(false) });
  }, [adsActive, game]);

  const closeUnlock = useCallback(() => {
    setUnlock(null);
    maybeInterstitial();
  }, [maybeInterstitial]);

  const closeGacha = useCallback(() => {
    setGacha(null);
    maybeInterstitial();
  }, [maybeInterstitial]);

  const closePremium = useCallback(() => {
    setPremiumOpen(false);
    maybeInterstitial();
  }, [maybeInterstitial]);

  const buyNext = useCallback(() => {
    const nextModel = game.next;
    if (game.buyNext() && nextModel) {
      setUnlock(nextModel);
      game.saveNow(); // п. 1.9 — прогресс фиксируется сразу после значимого действия
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.next, game.s.money, game.saveNow]);

  const openCase = useCallback(
    (c: CaseDef) => {
      const r = game.rollCase(c);
      if (r) {
        setGacha({ reward: r, caseDef: c });
        game.saveNow(); // п. 1.9 — прогресс фиксируется сразу после значимого действия
      } else {
        sfxFail();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.rollCase, game.saveNow]
  );

  // Rewarded Video: смотрит рекламу Яндекса → получает бесплатный контейнер (требование 4.5).
  const watchAd = useCallback(() => {
    if (!adsActive || Date.now() < game.s.adReadyAt || adActiveRef.current) return;
    adActiveRef.current = true;
    setAdActive(true); // п. 4.7
    game.setPaused(true);
    void showRewardedVideo({
      onRewarded: () => {
        game.completeAdWatch();
        const freeCase = CASES[0];
        const r = game.rollCase(freeCase, true);
        if (r) setGacha({ reward: r, caseDef: freeCase });
      },
      onClose: () => {
        adActiveRef.current = false;
        setAdActive(false);
        game.setPaused(false);
      },
      onError: () => {
        adActiveRef.current = false;
        setAdActive(false);
        game.setPaused(false);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.s.adReadyAt, game.completeAdWatch, game.rollCase, adsActive]);

  const doPrestige = useCallback(() => {
    game.prestigeReset();
    setPrestigeOpen(false);
    setUnlock(null);
    setGacha(null);
    game.saveNow();
    confetti({ particleCount: 160, spread: 90, origin: { y: 0.5 }, colors: ["#f5c542", "#ffffff", "#1c69d4"] });
    maybeInterstitial();
  }, [game, maybeInterstitial]);

  // Подтверждение — собственная модалка, а не window.confirm:
  // нативные диалоги в iframe платформы ненадёжны (п. 1.14).
  const confirmReset = useCallback(() => {
    game.reset();
    setUnlock(null);
    setGacha(null);
    setShowOffline(false);
    setPrestigeOpen(false);
    setResetOpen(false);
    setShowIntro(true);
  }, [game]);

  useEffect(() => {
    if (!showOffline) return;
    const t = setTimeout(() => setShowOffline(false), 8000);
    return () => clearTimeout(t);
  }, [showOffline]);

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden">
      <div className="noise-overlay" />

      {/* фоновое свечение */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/4 size-[520px] rounded-full bg-bmw/10 blur-[140px]" />
        <div className="absolute -bottom-40 right-1/5 size-[460px] rounded-full bg-fuchsia-900/15 blur-[140px]" />
      </div>

      <div className="shrink-0">
        <Header
          money={s.money}
          clickPower={game.clickPower}
          cps={game.cps}
          botClicks={game.botClicks}
          botIncome={game.botIncome}
          critChance={game.critChance}
          critMult={game.critMult}
          prestige={s.prestige}
          modelName={game.model.name}
          modelBase={game.model.base}
          cardPct={game.totalCardPct}
          botSpeedMult={game.botSpeedMult}
          clickLevels={Object.values(s.clickLv).reduce((a, b) => a + b, 0)}
          autoLevels={Object.values(s.autoLv).reduce((a, b) => a + b, 0)}
          boostActive={game.boostActive}
          boostMult={s.boostMult}
          boostUntil={s.boostUntil}
          sound={s.sound}
          onToggleSound={game.toggleSound}
          onReset={() => setResetOpen(true)}
          onOpenPremium={catalog.length > 0 ? () => setPremiumOpen(true) : undefined}
          compact={compact}
        />
        {!compact && <Timeline modelIndex={s.modelIndex} />}
      </div>

      {/* Игровое поле без прокрутки страницы (п. 1.10.2, 1.10.4):
          десктоп и альбом — сцена и магазин рядом; портрет телефона —
          один вид на экран с переключением через нижнюю навигацию. */}
      <main className="relative z-10 min-h-0 flex-1 overflow-hidden">
        {twoCol ? (
          <div
            className={
              vp.isNarrow
                ? "grid h-full grid-cols-[minmax(0,1fr)_320px] content-stretch gap-3 p-3"
                : "mx-auto grid h-full max-w-[1600px] content-stretch gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]"
            }
          >
            <CarStage
              model={game.model}
              next={game.next}
              money={s.money}
              modelIndex={s.modelIndex}
              botIncome={game.botIncome}
              cps={game.cps}
              critChance={game.critChance}
              critMult={game.critMult}
              prestige={s.prestige}
              canPrestige={game.canPrestige}
              sound={s.sound}
              onClick={game.click}
              onBuyNext={buyNext}
              onPrestige={() => setPrestigeOpen(true)}
              compact={stageCompact}
            />
            <Shop game={game} onBuyNext={buyNext} onOpenCase={openCase} onWatchAd={watchAd} adsEnabled={adsActive} />
          </div>
        ) : (
          <div className="flex h-full flex-col p-3">
            <div className="flex min-h-0 flex-1 flex-col">
              {mobileTab === "stage" ? (
                <CarStage
                  model={game.model}
                  next={game.next}
                  money={s.money}
                  modelIndex={s.modelIndex}
                  botIncome={game.botIncome}
                  cps={game.cps}
                  critChance={game.critChance}
                  critMult={game.critMult}
                  prestige={s.prestige}
                  canPrestige={game.canPrestige}
                  sound={s.sound}
                  onClick={game.click}
                  onBuyNext={buyNext}
                  onPrestige={() => setPrestigeOpen(true)}
                  compact={stageCompact}
                />
              ) : (
                <Shop game={game} onBuyNext={buyNext} onOpenCase={openCase} onWatchAd={watchAd} adsEnabled={adsActive} />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Нижняя навигация для портрета телефона: гараж / магазин одной рукой (п. 1.10.4) */}
      {!twoCol && (
        <nav className="pb-safe z-30 shrink-0 border-t border-line bg-panel/80 backdrop-blur-xl">
          <div className="grid grid-cols-2 gap-2 p-2">
            {(
              [
                { id: "stage", label: t.nav.stage, Icon: CarFront },
                { id: "shop", label: t.nav.shop, Icon: Store },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => setMobileTab(item.id)}
                aria-pressed={mobileTab === item.id}
                className={`tap-min flex items-center justify-center gap-2 rounded-2xl py-2.5 font-display text-[12px] font-black uppercase tracking-wider transition ${
                  mobileTab === item.id
                    ? "bg-bmw/20 text-white shadow-[inset_0_0_0_1px_rgba(28,105,212,.5)]"
                    : "text-white/40 hover:bg-white/5 hover:text-white/70"
                }`}
              >
                <item.Icon className="size-4" />
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* модалки */}
      <AnimatePresence>
        {gacha && (
          <GachaModal
            key="gacha"
            reward={gacha.reward}
            caseDef={gacha.caseDef}
            modelBase={game.model.base}
            onClose={closeGacha}
          />
        )}
        {unlock && <UnlockModal key={unlock.id} model={unlock} onClose={closeUnlock} />}
        {prestigeOpen && (
          <PrestigeModal
            key="prestige"
            prestige={s.prestige}
            onConfirm={doPrestige}
            onClose={() => setPrestigeOpen(false)}
          />
        )}
        {premiumOpen && catalog.length > 0 && (
          <PremiumModal
            key="premium"
            catalog={catalog}
            game={game}
            playerAuthorized={authorized}
            onClose={closePremium}
            onSynced={() => game.saveNow()}
          />
        )}
        {resetOpen && (
          <ResetModal key="reset" onConfirm={confirmReset} onClose={() => setResetOpen(false)} />
        )}
      </AnimatePresence>

      {/* оффлайн-бонус */}
      <AnimatePresence>
        {showOffline && !showIntro && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className="glass fixed bottom-4 left-4 z-40 flex max-w-xs items-center gap-3 rounded-2xl p-4 shadow-2xl"
          >
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-mint/15 text-mint">
              <Coins className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold text-white">{t.app.offlineTitle}</div>
              <div className="tabular text-[12px] font-bold text-mint">{fill(t.app.offlineGain, { x: fmtMoney(game.offlineGain) })}</div>
            </div>
            <button
              onClick={() => setShowOffline(false)}
              className="tap-min-sm ml-auto grid size-7 shrink-0 place-items-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* интро */}
      <AnimatePresence>
        {showIntro && (
          <IntroModal
            onStart={() => {
              game.markIntroSeen();
              setShowIntro(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Модалка престижа ────────────────────────────────────────

function PrestigeModal({
  prestige,
  onConfirm,
  onClose,
}: {
  prestige: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const current = Math.round(prestige * PRESTIGE_BONUS * 100);
  const next = Math.round((prestige + 1) * PRESTIGE_BONUS * 100);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-night/90 p-4 backdrop-blur-lg"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.88, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-deep my-auto w-full max-w-[480px] overflow-hidden rounded-3xl"
      >
        <div className="flex flex-col items-center gap-3 border-b border-line bg-gradient-to-b from-gold/10 to-transparent px-6 pb-6 pt-8 text-center">
          <motion.div
            initial={{ rotate: -20, scale: 0.5 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 12, delay: 0.1 }}
            className="grid size-16 place-items-center rounded-3xl border border-gold/30 bg-gold/15"
          >
            <Star className="size-8 text-gold" />
          </motion.div>
          <h2 className="font-display text-xl font-black text-white">{t.app.prestigeTitle}</h2>
          <p className="max-w-sm text-[12.5px] font-medium leading-relaxed text-white/55">{t.app.prestigeBody}</p>
        </div>

        <div className="space-y-3 p-5">
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <span className="text-[12px] font-bold text-white/50">{t.app.prestigeCurrent}</span>
            <span className="tabular font-display text-sm font-black text-white/70">+{current}%</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-gold/25 bg-gold/[0.07] px-4 py-3">
            <span className="flex items-center gap-1.5 text-[12px] font-bold text-gold">
              <Sparkles className="size-3.5" /> {t.app.prestigeAfter}
            </span>
            <span className="tabular font-display text-base font-black text-gold">+{next}%</span>
          </div>
          <p className="px-1 text-[10.5px] font-medium leading-relaxed text-white/30">{t.app.prestigeNote}</p>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={onClose}
              className="tap-min rounded-2xl border border-white/10 bg-white/5 py-3.5 font-display text-[12px] font-black tracking-wide text-white/60 transition hover:bg-white/10"
            >
              {t.app.stay}
            </button>
            <button
              onClick={onConfirm}
              className="shine-btn tap-min rounded-2xl bg-gradient-to-r from-amber-500 to-gold py-3.5 font-display text-[12px] font-black tracking-wide text-night shadow-[0_10px_35px_-8px_rgba(245,197,66,.7)] transition hover:brightness-110 active:scale-[0.98]"
            >
              {t.app.newLap}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Подтверждение сброса прогресса ──────────────────────────

function ResetModal({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const { t } = useI18n();
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
        className="glass-deep my-auto w-full max-w-[420px] overflow-hidden rounded-3xl p-6 text-center"
      >
        <div className="mx-auto grid size-14 place-items-center rounded-3xl border border-mred/30 bg-mred/10">
          <X className="size-7 text-mred" />
        </div>
        <h2 className="mt-3 font-display text-lg font-black text-white">{t.app.resetTitle}</h2>
        <p className="mt-1.5 text-[12.5px] font-medium leading-relaxed text-white/55">{t.app.resetBody}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onClose}
            className="tap-min rounded-2xl border border-white/10 bg-white/5 py-3.5 font-display text-[12px] font-black tracking-wide text-white/60 transition hover:bg-white/10"
          >
            {t.app.keepIt}
          </button>
          <button
            onClick={onConfirm}
            className="tap-min rounded-2xl border border-mred/40 bg-mred/15 py-3.5 font-display text-[12px] font-black tracking-wide text-mred transition hover:bg-mred/25 active:scale-[0.98]"
          >
            {t.app.resetAll}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Интро ───────────────────────────────────────────────────

function IntroModal({ onStart }: { onStart: () => void }) {
  const { t } = useI18n();
  const vp = useViewport();
  const bullets = [
    { icon: MousePointerClick, text: t.app.introBullets[0] },
    { icon: TrendingUp, text: t.app.introBullets[1] },
    { icon: Coins, text: t.app.introBullets[2] },
    { icon: Dices, text: t.app.introBullets[3] },
    { icon: Bot, text: t.app.introBullets[4] },
  ];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-night/90 p-4 backdrop-blur-lg"
    >
      <motion.div
        initial={{ scale: 0.9, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
        className="glass-deep my-auto w-full max-w-[520px] overflow-hidden rounded-3xl"
      >
        <div className="relative h-36 overflow-hidden sm:h-44">
          <img src={MODELS[0].img} alt={MODELS[0].name} className="size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e14] via-[#0a0e14]/30 to-transparent" />
          <div className="m-stripes absolute left-5 top-5 h-1.5 w-24 rounded-full" />
          <div className="absolute bottom-4 left-5 right-5">
            <h1 className="font-display text-2xl font-black text-white sm:text-3xl">{t.app.introTitle}</h1>
            <p className="text-[12px] font-bold text-white/60">{t.app.introSub}</p>
          </div>
        </div>

        <div className="space-y-2.5 p-5 sm:p-6">
          {bullets.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.08 }}
              className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-2.5 sm:p-3"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-bmw/15 text-bmw-soft">
                <b.icon className="size-4.5" />
              </div>
              <span className="text-[12.5px] font-semibold text-white/70">{b.text}</span>
            </motion.div>
          ))}

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            onClick={onStart}
            className="shine-btn tap-min mt-2 w-full rounded-2xl bg-gradient-to-r from-bmw to-bmw-soft py-4 font-display text-sm font-black tracking-wide text-white shadow-[0_10px_35px_-8px_rgba(28,105,212,.8)] transition hover:brightness-110 active:scale-[0.98]"
          >
            {t.app.introStart}
          </motion.button>

          {/* Полное описание управления (п. 2.2): тач — тапы, ПК — мышь и Пробел */}
          <p className="pt-1 text-center text-[11px] font-semibold text-white/35">
            {vp.isFine ? t.app.controlsPC : t.app.controlsTouch}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
