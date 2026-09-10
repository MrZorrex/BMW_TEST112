import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, BadgeDollarSign, Flame, Lock, Sparkles, Trophy } from "lucide-react";
import { PRESTIGE_BONUS, type CarModel } from "../data/game";
import { fmtMoney } from "../game/format";
import { sfxClick } from "../game/sound";
import { useViewport } from "../game/useViewport";
import { fill, useI18n } from "../i18n";
import { modelText } from "../i18n/data";
import CarImage from "./CarImage";

interface FloatText {
  id: number;
  x: number;
  y: number;
  text: string;
  crit: boolean;
  auto?: boolean;
}

interface CarStageProps {
  model: CarModel;
  next: CarModel | null;
  money: number;
  modelIndex: number;
  botIncome: number;
  cps: number;
  critChance: number;
  critMult: number;
  prestige: number;
  canPrestige: boolean;
  onClick: () => { gain: number; crit: boolean };
  sound: boolean;
  onBuyNext: () => void;
  onPrestige: () => void;
  /** Компактный режим для низких окон: без описания, меньше отступы. */
  compact?: boolean;
}

let floatId = 0;
let coinId = 0;

interface Coin {
  id: number;
  x: number;
  text: string;
}

export default function CarStage({
  model,
  next,
  money,
  modelIndex,
  botIncome,
  cps,
  critChance,
  critMult,
  prestige,
  canPrestige,
  onClick,
  sound,
  onBuyNext,
  onPrestige,
  compact = false,
}: CarStageProps) {
  const { t, lang } = useI18n();
  const { isFine } = useViewport();
  const [coins, setCoins] = useState<Coin[]>([]);
  const [floats, setFloats] = useState<FloatText[]>([]);
  const [flash, setFlash] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const mt = modelText(lang, model);

  const spawnFloat = useCallback(
    (text: string, x: number, y: number, crit = false, auto = false) => {
      const id = ++floatId;
      setFloats((f) => [...f.slice(-24), { id, x, y, text, crit, auto }]);
      setTimeout(() => setFloats((f) => f.filter((fl) => fl.id !== id)), 950);
    },
    []
  );

  const doClickAt = useCallback(
    (x: number, y: number) => {
      const { gain, crit } = onClick();
      if (sound) sfxClick(crit);
      if (crit) {
        setFlash(true);
        setTimeout(() => setFlash(false), 180);
      }
      spawnFloat(`+${fmtMoney(gain)}`, x + (Math.random() * 40 - 20), y - 10, crit);
    },
    [onClick, sound, spawnFloat]
  );

  const handlePointer = useCallback(
    (e: React.PointerEvent) => {
      const rect = stageRef.current?.getBoundingClientRect();
      const x = rect ? e.clientX - rect.left : 200;
      const y = rect ? e.clientY - rect.top : 200;
      doClickAt(x, y);
    },
    [doClickAt]
  );

  // Клавиатурное управление на десктопе (п. 1.6.2.4): Пробел/Enter кликают.
  // Не зависит от раскладки — используются только коды клавиш.
  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "Enter") return;
      e.preventDefault();
      if (e.repeat && e.code === "Enter") return;
      const rect = stageRef.current?.getBoundingClientRect();
      const x = rect ? rect.width * (0.35 + Math.random() * 0.3) : 200;
      const y = rect ? rect.height * (0.35 + Math.random() * 0.3) : 200;
      doClickAt(x, y);
    },
    [doClickAt]
  );

  // авто-флоаты от автокликера — чтобы гараж жил своей жизнью
  useEffect(() => {
    if (botIncome <= 0) return;
    const iv = setInterval(() => {
      const rect = stageRef.current?.getBoundingClientRect();
      const x = rect ? rect.width * (0.2 + Math.random() * 0.6) : 200;
      const y = rect ? rect.height * (0.3 + Math.random() * 0.4) : 200;
      spawnFloat(`+${fmtMoney(botIncome * 1.6)}`, x, y, false, true);
    }, 1600);
    return () => clearInterval(iv);
  }, [botIncome, spawnFloat]);

  // монетки пассивного дохода — видно, что деньги капают
  useEffect(() => {
    if (cps <= 0) return;
    const iv = setInterval(() => {
      const rect = stageRef.current?.getBoundingClientRect();
      const w = rect?.width ?? 400;
      const id = ++coinId;
      setCoins((c) => [
        ...c.slice(-10),
        { id, x: w * (0.08 + Math.random() * 0.84), text: `+${fmtMoney(cps * 1.2)}` },
      ]);
      setTimeout(() => setCoins((c) => c.filter((x) => x.id !== id)), 1500);
    }, 1200);
    return () => clearInterval(iv);
  }, [cps]);

  const afford = next ? money >= next.price : false;
  const progress = next ? Math.min(1, money / next.price) : 1;

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-line bg-panel">
      {/* фон */}
      <div className="stage-grid absolute inset-0" />
      <div
        className="absolute inset-0 transition-colors duration-1000"
        style={{
          background: `radial-gradient(65% 55% at 50% 42%, ${model.tint}14, transparent 70%)`,
        }}
      />
      <div className="vignette absolute inset-0" />
      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-none absolute inset-0 z-20 bg-gold/25"
          />
        )}
      </AnimatePresence>

      {/* шапка сцены */}
      <div className={`relative z-10 flex flex-wrap items-start justify-between gap-3 ${compact ? "p-3" : "p-5 sm:p-6"}`}>
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.2em]"
              style={{ background: `${model.tint}22`, color: model.tint }}
            >
              {mt.era}
            </span>
            <span className="text-[11px] font-semibold text-white/40">{mt.years}</span>
          </div>
          <AnimatePresence mode="wait">
            <motion.h1
              key={model.id + lang}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
              className={`font-display text-balance font-black leading-tight text-white ${
                compact ? "text-xl" : "text-2xl sm:text-4xl"
              }`}
            >
              {model.name}
            </motion.h1>
          </AnimatePresence>
          {!compact && (
            <AnimatePresence mode="wait">
              <motion.p
                key={model.id + lang + "-d"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, delay: 0.08 }}
                className="mt-2 max-w-lg text-[13px] font-medium leading-relaxed text-white/55"
              >
                {mt.desc}
              </motion.p>
            </AnimatePresence>
          )}
        </div>
        {!compact && (
          <div className="hidden shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-night/50 px-4 py-3 backdrop-blur sm:flex">
            <BadgeDollarSign className="size-5 text-mint" />
            <div className="leading-tight">
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/40">{t.stage.clickBase}</div>
              <div className="tabular font-display text-sm font-bold text-mint">{fmtMoney(model.base)}</div>
            </div>
          </div>
        )}
      </div>

      {/* зона клика */}
      <div
        ref={stageRef}
        onPointerDown={handlePointer}
        onKeyDown={handleKey}
        tabIndex={0}
        className="stage-kb relative z-10 flex min-h-[180px] flex-1 cursor-pointer touch-manipulation select-none items-center justify-center p-4 sm:p-6"
        role="button"
        aria-label={fill(t.stage.clickAria, { name: model.name })}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={model.id}
            initial={{ opacity: 0, x: 80, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -80, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 210, damping: 26 }}
            whileTap={{ scale: 0.965 }}
            className="relative w-full max-w-3xl"
          >
            <div className="animate-floaty">
              <div
                className="relative overflow-hidden rounded-2xl border shadow-2xl"
                style={{
                  borderColor: `${model.tint}30`,
                  boxShadow: `0 30px 90px -30px ${model.tint}55, 0 10px 40px rgba(0,0,0,.6)`,
                }}
              >
                <CarImage
                  model={model}
                  eager
                  className="pointer-events-none aspect-[1200/627] w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-night/45 via-transparent to-transparent" />
              </div>
              {/* отражение-пол */}
              <div
                className="mx-auto mt-3 h-5 w-3/4 rounded-[100%] blur-xl transition-colors duration-1000"
                style={{ background: `radial-gradient(closest-side, ${model.tint}40, transparent)` }}
              />
            </div>
          </motion.div>
        </AnimatePresence>

        {/* всплывающие числа */}
        {floats.map((f) => (
          <motion.span
            key={f.id}
            initial={{ opacity: 1, y: 0, scale: f.crit ? 1.4 : f.auto ? 0.9 : 1 }}
            animate={{ opacity: 0, y: -90, scale: f.crit ? 1.6 : f.auto ? 1 : 1.15 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className={`tabular pointer-events-none absolute z-30 font-display font-black ${
              f.crit
                ? "text-xl text-gold sm:text-2xl"
                : f.auto
                  ? "text-[11px] text-teal-300/90"
                  : "text-base text-white sm:text-lg"
            }`}
            style={{
              left: f.x,
              top: f.y,
              textShadow: f.crit ? "0 0 24px rgba(245,197,66,.8)" : "0 2px 12px rgba(0,0,0,.8)",
            }}
          >
            {f.crit && t.stage.critPrefix}
            {f.text}
          </motion.span>
        ))}

        {/* монетки пассивного дохода */}
        {coins.map((c) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 0, scale: 0.7 }}
            animate={{ opacity: [0, 1, 1, 0], y: -150, scale: 1 }}
            transition={{ duration: 1.5, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
            className="pointer-events-none absolute bottom-6 z-20 flex items-center gap-1"
            style={{ left: c.x }}
          >
            <span className="grid size-5 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-[9px] font-black text-amber-950 shadow-[0_0_12px_rgba(245,197,66,.6)]">
              ₽
            </span>
            <span className="tabular font-display text-[11px] font-black text-mint drop-shadow-[0_2px_6px_rgba(0,0,0,.9)]">
              {c.text}
            </span>
          </motion.div>
        ))}

        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.28em] text-white/25">
          {t.stage.clickHint}
          {isFine && ` · ${t.stage.kbHint}`}
        </div>

        {/* крит-инфо */}
        <div className="pointer-events-none absolute left-4 top-2 z-20 flex items-center gap-1.5 rounded-full border border-gold/25 bg-night/50 px-2.5 py-1 backdrop-blur">
          <Flame className="size-3 text-gold" />
          <span className="tabular text-[10px] font-black text-gold/90">
            {fill(t.stage.critBadge, { p: Math.round(critChance * 100), m: critMult })}
          </span>
        </div>
      </div>

      {/* CTA выкупа / новый круг */}
      <div className={`relative z-10 border-t border-line bg-night/60 backdrop-blur ${compact ? "p-3" : "p-4 sm:p-5"}`}>
        {next ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="relative hidden size-14 shrink-0 overflow-hidden rounded-xl border border-white/10 sm:block">
                <CarImage model={next} className="size-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold">
                  <span className="truncate text-white/70">
                    {t.stage.nextLabel}
                    <span className="text-white">{next.name}</span>
                  </span>
                  <span className="tabular shrink-0 text-white/45">
                    {fmtMoney(money)} <span className="text-white/25">/ {fmtMoney(next.price)}</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-bmw to-bmw-soft"
                    animate={{ width: `${progress * 100}%` }}
                    transition={{ type: "spring", stiffness: 120, damping: 20 }}
                  />
                </div>
              </div>
            </div>
            <button
              onClick={onBuyNext}
              disabled={!afford}
              className={`tap-min shrink-0 rounded-2xl px-6 py-3.5 font-display text-sm font-black tracking-wide transition ${
                afford
                  ? "shine-btn bg-gradient-to-r from-bmw to-bmw-soft text-white shadow-[0_10px_35px_-8px_rgba(28,105,212,.8)] hover:brightness-110 active:scale-95"
                  : "border border-white/10 bg-white/5 text-white/35"
              }`}
            >
              {afford ? (
                <span className="flex items-center gap-2">
                  {t.stage.buy} <ArrowUpRight className="size-4" />
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Lock className="size-4" /> {fmtMoney(next.price)}
                </span>
              )}
            </button>
          </div>
        ) : canPrestige ? (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-3">
              <Trophy className="size-8 shrink-0 text-gold" />
              <div>
                <div className="font-display text-sm font-black text-gold">{t.stage.allCollected}</div>
                <div className="text-[11px] font-semibold text-white/45">
                  {fill(t.stage.lapComplete, { n: prestige + 1 })}
                </div>
              </div>
            </div>
            <button
              onClick={onPrestige}
              className="shine-btn tap-min flex shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-gold px-5 py-3.5 font-display text-[12px] font-black tracking-wide text-night shadow-[0_10px_35px_-8px_rgba(245,197,66,.7)] transition hover:brightness-110 active:scale-95"
            >
              <Sparkles className="size-4" />
              {fill(t.stage.newLapForever, { p: Math.round(PRESTIGE_BONUS * 100) })}
            </button>
          </div>
        ) : null}
      </div>

      {/* индикатор модели */}
      <div className="pointer-events-none absolute right-5 top-5 z-20 hidden font-display text-[64px] font-black leading-none text-white/[0.04] xl:block">
        {String(modelIndex + 1).padStart(2, "0")}
      </div>
    </section>
  );
}
