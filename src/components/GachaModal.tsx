import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { ChevronDown, ChevronUp, FastForward, Gem } from "lucide-react";
import { RARITY_META, cardsByRarity, type CardDef, type CaseDef, type Rarity } from "../data/game";
import type { Reward } from "../game/useGame";
import { fmtMoney } from "../game/format";
import { fill, useI18n, type Dict } from "../i18n";
import { cardText, caseText, rarityLabel } from "../i18n/data";
import { CardFace } from "./Shop";
import {
  sfxRewardBoost,
  sfxRewardCard,
  sfxRewardCash,
  sfxSpinStart,
  sfxTick,
  sfxTickRare,
} from "../game/sound";
import { A } from "../utils/assets";

// ── Геометрия ленты ────────────────────────────────────────────
const CELL_W = 128;
const CELL_H = 192;
const CELL_GAP = 12;
const STRIDE = CELL_W + CELL_GAP;
const TOTAL = 66; // ячеек в ленте
const WIN_INDEX = 56; // где лежит выигрыш — почти в конце, чтобы полоса «пробежала»
const SPIN_MS = 6400; // полная длительность прокрутки
const HOLD_MS = 850; // пауза на призовой ячейке перед экраном результата

interface Visual {
  kind: "cash" | "boost" | "card";
  card?: CardDef;
  amount?: number;
  mult?: number;
}

/**
 * Лента собирается по настоящим весам КОНКРЕТНОГО контейнера —
 * «Тольятти» и «Мюнхен» прокручивают разный состав.
 */
function randomVisual(c: CaseDef, base: number): Visual {
  const w = c.weights;
  const total = w.cash + w.boost + w.common + w.rare + w.epic + w.legend;
  let r = Math.random() * total;
  const pick = (key: keyof typeof w) => {
    if (r < w[key]) return true;
    r -= w[key];
    return false;
  };
  if (pick("cash")) {
    const amount = base > 0 ? base * (c.cashMin + Math.random() * (c.cashMax - c.cashMin)) : undefined;
    return { kind: "cash", amount };
  }
  if (pick("boost")) return { kind: "boost", mult: c.boostMult };
  let rarity: Rarity = "common";
  if (pick("common")) rarity = "common";
  else if (pick("rare")) rarity = "rare";
  else if (pick("epic")) rarity = "epic";
  else rarity = "legend";
  const pool = cardsByRarity(rarity);
  return { kind: "card", card: pool[Math.floor(Math.random() * pool.length)] };
}

function Cell({ v, t, lang }: { v: Visual; t: Dict; lang: "ru" | "en" }) {
  if (v.kind === "cash")
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1.5 rounded-xl border border-mint/25 bg-mint/[0.07] p-1.5">
        <img src={A("/rewards/cash.jpg")} alt={t.gacha.cash} className="h-[118px] w-full rounded-lg object-cover" />
        <span className="text-[9px] font-black uppercase tracking-widest text-mint/80">{t.gacha.cash}</span>
        {v.amount !== undefined && (
          <span className="tabular -mt-1 text-[10px] font-extrabold text-mint/60">+{fmtMoney(v.amount)}</span>
        )}
      </div>
    );
  if (v.kind === "boost")
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1.5 rounded-xl border border-gold/25 bg-gold/[0.07] p-1.5">
        <img src={A("/rewards/boost.jpg")} alt={t.gacha.boostWord} className="h-[118px] w-full rounded-lg object-cover" />
        <span className="tabular text-[9px] font-black uppercase tracking-widest text-gold/80">
          {fill(t.gacha.boostCell, { m: v.mult ?? 0 })}
        </span>
      </div>
    );
  const meta = RARITY_META[v.card!.rarity];
  const ct = cardText(lang, v.card!);
  return (
    <div
      className="flex size-full flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border p-1.5"
      style={{ borderColor: `${meta.color}40`, background: `${meta.color}0d` }}
    >
      {v.card!.img ? (
        <img src={v.card!.img} alt="" className="h-[104px] w-full rounded-md object-cover" />
      ) : (
        <Gem className="size-8" style={{ color: meta.color }} />
      )}
      <span className="line-clamp-1 px-0.5 text-[8.5px] font-extrabold text-white/75">{ct.name}</span>
      <span
        className="rounded-full px-1.5 py-px text-[7px] font-black uppercase tracking-widest"
        style={{ background: `${meta.color}22`, color: meta.color }}
      >
        {rarityLabel(lang, v.card!.rarity, meta.label)}
      </span>
    </div>
  );
}

interface GachaModalProps {
  reward: Reward;
  caseDef: CaseDef;
  /** база текущей модели — чтобы суммы кэша на ленте совпадали с экономикой */
  modelBase?: number;
  onClose: () => void;
}

export default function GachaModal({ reward, caseDef, modelBase = 0, onClose }: GachaModalProps) {
  const { t, lang } = useI18n();
  const [phase, setPhase] = useState<"spin" | "land" | "reveal">("spin");
  const boxRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const holdRef = useRef(0);
  const targetRef = useRef(0);
  const landedRef = useRef(false);
  const lastCellRef = useRef(-1);
  const t0Ref = useRef(0);

  // призовая ячейка останавливается не ровно по центру, а с естественным джиттером
  const jitter = useMemo(() => (Math.random() - 0.5) * CELL_W * 0.56, [reward]);

  const strip = useMemo<Visual[]>(() => {
    const arr = Array.from({ length: TOTAL }, () => randomVisual(caseDef, modelBase));
    const win: Visual =
      reward.kind === "card"
        ? { kind: "card", card: reward.card }
        : reward.kind === "boost"
          ? { kind: "boost", mult: reward.mult }
          : { kind: "cash", amount: reward.amount };
    arr[WIN_INDEX] = win;
    return arr;
  }, [reward, caseDef, modelBase]);

  const computeTarget = () => {
    const w = boxRef.current?.clientWidth ?? 640;
    targetRef.current = -(WIN_INDEX * STRIDE + CELL_W / 2 + jitter - w / 2);
  };

  /** Сдвигает ленту и играет тик по РЕАЛЬНОМУ положению указателя. */
  const applyX = (x: number) => {
    const el = stripRef.current;
    if (el) el.style.transform = `translate3d(${x}px,0,0)`;
    const w = boxRef.current?.clientWidth ?? 640;
    const idx = Math.max(0, Math.min(TOTAL - 1, Math.floor((w / 2 - x) / STRIDE)));
    if (idx !== lastCellRef.current) {
      lastCellRef.current = idx;
      const v = strip[idx];
      if (!v) return;
      if (v.kind === "card" && (v.card!.rarity === "epic" || v.card!.rarity === "legend")) sfxTickRare();
      else sfxTick();
    }
  };

  const land = () => {
    if (landedRef.current) return;
    landedRef.current = true;
    setPhase("land");
    holdRef.current = window.setTimeout(() => setPhase("reveal"), HOLD_MS);
  };

  const skip = () => {
    cancelAnimationFrame(rafRef.current);
    computeTarget();
    applyX(targetRef.current);
    land();
  };

  // ── Прокрутка: rAF + easeOutQuart, тики синхронны с реальной позицией ──
  useEffect(() => {
    computeTarget();
    sfxSpinStart();
    t0Ref.current = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0Ref.current) / SPIN_MS);
      const e = 1 - Math.pow(1 - t, 4); // быстрый старт → длинное плавное торможение
      applyX(targetRef.current * e);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else land();
    };
    rafRef.current = requestAnimationFrame(step);
    const onResize = () => computeTarget();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // страховочная очистка таймеров
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(holdRef.current);
    },
    []
  );

  // ── Звук получения предмета — сразу в момент остановки ленты ──
  useEffect(() => {
    if (phase !== "land") return;
    if (reward.kind === "cash") sfxRewardCash();
    else if (reward.kind === "boost") sfxRewardBoost();
    else sfxRewardCard(reward.card.rarity);
  }, [phase, reward]);

  // конфетти на экране результата для эпиков и легенд
  useEffect(() => {
    if (phase !== "reveal") return;
    if (reward.kind === "card" && (reward.card.rarity === "epic" || reward.card.rarity === "legend")) {
      const colors = reward.card.rarity === "legend" ? ["#f5c542", "#fff3c4", "#1c69d4"] : ["#c58bff", "#5cb1eb", "#ffffff"];
      confetti({ particleCount: 130, spread: 75, origin: { y: 0.6 }, colors });
      setTimeout(() => confetti({ particleCount: 70, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors }), 250);
      setTimeout(() => confetti({ particleCount: 70, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors }), 400);
    }
  }, [phase, reward]);

  const accent =
    reward.kind === "cash" ? "#43e0a0" : reward.kind === "boost" ? "#f5c542" : RARITY_META[reward.card.rarity].color;

  const resultTitle =
    reward.kind === "cash"
      ? t.gacha.cashPrize
      : reward.kind === "boost"
        ? t.gacha.superMode
        : reward.dup
          ? t.gacha.dupToCash
          : t.gacha.newCard;

  const caseName = caseText(lang, caseDef).name;
  const cardName = reward.kind === "card" ? cardText(lang, reward.card).name : "";
  const cardNote = reward.kind === "card" ? cardText(lang, reward.card).note : "";
  const cardRarityLabel =
    reward.kind === "card" ? rarityLabel(lang, reward.card.rarity, RARITY_META[reward.card.rarity].label) : "";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-night/85 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="glass-deep my-auto max-h-full w-full max-w-[760px] overflow-y-auto rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-fuchsia-400">{caseName}</div>
            <div className="font-display text-lg font-black text-white">
              {phase === "reveal" ? resultTitle : t.gacha.opening}
            </div>
          </div>
          {phase === "spin" && (
            <button
              onClick={skip}
              className="tap-min-sm flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-[10.5px] font-black uppercase tracking-widest text-white/45 transition hover:bg-white/10 hover:text-white/80"
            >
              <FastForward className="size-3.5" />
              {t.gacha.skip}
            </button>
          )}
        </div>

        {phase !== "reveal" ? (
          <div className="relative py-7">
            <div ref={boxRef} className="relative overflow-hidden" style={{ height: CELL_H }}>
              {/* Лента. Позицией управляет rAF — тики щёлкают точно по указателю. */}
              <div
                ref={stripRef}
                className="absolute left-0 top-0 flex will-change-transform"
                style={{ gap: CELL_GAP }}
              >
                {strip.map((v, i) => (
                  <div key={i} style={{ width: CELL_W, height: CELL_H }} className="shrink-0">
                    <Cell v={v} t={t} lang={lang} />
                  </div>
                ))}
              </div>

              {/* затемнение краёв */}
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-28 bg-gradient-to-r from-night to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-28 bg-gradient-to-l from-night to-transparent" />

              {/* центральная линия-указатель */}
              <div
                className="pointer-events-none absolute bottom-0 left-1/2 top-0 z-20 w-px -translate-x-1/2 transition-colors duration-300"
                style={{
                  background: phase === "land" ? accent : "rgba(255,255,255,.4)",
                  boxShadow: phase === "land" ? `0 0 12px ${accent}` : "none",
                }}
              />

              {/* рамка-прицел: белая в полёте, цвета приза на остановке */}
              <div
                className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 rounded-xl border-2 transition-all duration-300"
                style={{
                  width: CELL_W,
                  height: CELL_H,
                  borderColor: phase === "land" ? accent : "rgba(255,255,255,.9)",
                  boxShadow:
                    phase === "land"
                      ? `0 0 26px ${accent}80, inset 0 0 18px ${accent}30`
                      : "0 0 18px rgba(255,255,255,.28)",
                }}
              />
              <ChevronUp className="pointer-events-none absolute left-1/2 top-[-10px] z-20 size-5 -translate-x-1/2 text-white drop-shadow-[0_0_5px_rgba(255,255,255,.8)]" />
              <ChevronDown className="pointer-events-none absolute bottom-[-10px] left-1/2 z-20 size-5 -translate-x-1/2 text-white drop-shadow-[0_0_5px_rgba(255,255,255,.8)]" />
            </div>

            <div className="mt-4 text-center text-[10.5px] font-bold uppercase tracking-[0.22em] text-white/25">
              {phase === "spin" ? t.gacha.spinning : t.gacha.landed}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 px-6 py-8">
            {reward.kind === "card" ? (
              <motion.div
                initial={{ scale: 0.4, rotate: -8, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 15 }}
                className="w-52"
              >
                <CardFace card={reward.card} count={1} size="md" />
              </motion.div>
            ) : (
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 15 }}
                className={`grid size-28 place-items-center rounded-3xl border ${
                  reward.kind === "cash" ? "border-mint/30 bg-mint/10" : "border-gold/30 bg-gold/10"
                }`}
              >
                <img
                  src={reward.kind === "cash" ? A("/rewards/cash.jpg") : A("/rewards/boost.jpg")}
                  alt={reward.kind === "cash" ? t.gacha.cash : t.gacha.boostWord}
                  className="size-full rounded-3xl object-cover p-1"
                />
              </motion.div>
            )}

            <div className="text-center">
              {reward.kind === "card" ? (
                <>
                  <div
                    className="font-display text-xl font-black"
                    style={{ color: RARITY_META[reward.card.rarity].color }}
                  >
                    {cardName}
                  </div>
                  <div className="mt-1 text-[13px] font-semibold text-white/55">
                    {reward.dup
                      ? fill(t.gacha.dupHave, { x: fmtMoney(reward.dupCash) })
                      : reward.card.botPct
                        ? fill(t.gacha.cardBotForever, { note: cardNote, x: Math.round(reward.card.botPct * 100) })
                        : reward.card.critPct
                          ? fill(t.gacha.cardCritForever, { note: cardNote })
                          : fill(t.gacha.cardIncomeForever, { note: cardNote, x: Math.round(reward.card.pct * 100) })}
                  </div>
                  <div
                    className="mt-2 inline-block rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest"
                    style={{
                      background: `${RARITY_META[reward.card.rarity].color}20`,
                      color: RARITY_META[reward.card.rarity].color,
                    }}
                  >
                    {cardRarityLabel}
                  </div>
                </>
              ) : reward.kind === "cash" ? (
                <>
                  <div className="tabular font-display text-3xl font-black text-mint">+{fmtMoney(reward.amount)}</div>
                  <div className="mt-1 text-[13px] font-semibold text-white/55">{t.gacha.cashNote}</div>
                </>
              ) : (
                <>
                  <div className="font-display text-3xl font-black text-gold">
                    {fill(t.gacha.boostGain, { m: reward.mult })}
                  </div>
                  <div className="mt-1 text-[13px] font-semibold text-white/55">
                    {fill(t.gacha.boostLasts, { s: reward.secs })}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={onClose}
              className="shine-btn tap-min mt-2 rounded-2xl bg-gradient-to-r from-bmw to-bmw-soft px-10 py-3.5 font-display text-sm font-black tracking-wide text-white shadow-[0_10px_35px_-8px_rgba(28,105,212,.8)] transition hover:brightness-110 active:scale-95"
            >
              {t.gacha.claim}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
