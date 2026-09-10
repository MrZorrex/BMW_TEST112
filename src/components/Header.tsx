import { useEffect, useRef, useState } from "react";
import { animate, motion } from "framer-motion";
import { Bot, Crown, Flame, MousePointerClick, RotateCcw, Star, TrendingUp, Volume2, VolumeX, Zap } from "lucide-react";
import { fmtMoney, fmt, fmtTime, fmtRate } from "../game/format";
import { fill, useI18n } from "../i18n";
import Tooltip from "./Tooltip";
import LangButton from "./LangButton";

export function Ticker({ value, className }: { value: number; className?: string }) {
  const [disp, setDisp] = useState(value);
  const ref = useRef(value);
  useEffect(() => {
    const from = ref.current;
    ref.current = value;
    if (Math.abs(value - from) < 0.000001) return;
    const c = animate(from, value, {
      duration: 0.35,
      ease: "easeOut",
      onUpdate: (v) => setDisp(v),
    });
    return () => c.stop();
  }, [value]);
  return <span className={className}>{fmtMoney(disp)}</span>;
}

interface HeaderProps {
  money: number;
  clickPower: number;
  cps: number;
  botClicks: number;
  botIncome: number;
  critChance: number;
  critMult: number;
  prestige: number;
  modelName: string;
  modelBase: number;
  cardPct: number;
  botSpeedMult: number;
  clickLevels: number;
  autoLevels: number;
  boostActive: boolean;
  boostMult: number;
  boostUntil: number;
  sound: boolean;
  onToggleSound: () => void;
  onReset: () => void;
  /** Показывается только на платформе с непустым каталогом инап-покупок (п. 1.13.6). */
  onOpenPremium?: () => void;
  /** Компактный режим для низких окон (альбомный телефон): меньше высота, без чипов. */
  compact?: boolean;
}

export default function Header(p: HeaderProps) {
  const { t } = useI18n();
  const prestigePct = Math.round(p.prestige * 40);
  const cardPctText = `+${Math.round(p.cardPct * 100)}%`;

  return (
    <header className="pt-safe relative z-30 border-b border-line bg-panel/70 backdrop-blur-xl">
      <div
        className={`mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-6 ${
          p.compact ? "py-1.5" : "py-2.5 sm:py-3"
        }`}
      >
        {/* Лого + кнопки */}
        <div className="flex flex-1 items-center gap-3">
          <div
            className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-bmw-deep to-night ${
              p.compact ? "size-8" : "size-10 sm:size-11"
            }`}
          >
            <div className="m-stripes absolute inset-x-1.5 top-1.5 h-1 rounded-full" />
            <span className="font-display text-[9px] font-bold tracking-widest text-bmw-soft sm:text-[10px]">BMW</span>
          </div>
          {/* Кнопки стоят сразу после BMW-иконки: баланс ниже на мобильных и не наезжает на них. */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {p.onOpenPremium && (
              <button
                onClick={p.onOpenPremium}
                className="tap-min-sm grid size-10 place-items-center rounded-lg border border-gold/30 bg-gold/10 text-gold transition hover:bg-gold/20 sm:size-9"
                title={t.header.premiumTitle}
              >
                <Crown className="size-4" />
              </button>
            )}
            <button
              onClick={p.onToggleSound}
              className="tap-min-sm grid size-10 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white sm:size-9"
              title={p.sound ? t.header.soundOn : t.header.soundOff}
            >
              {p.sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
            <button
              onClick={p.onReset}
              className="tap-min-sm grid size-10 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition hover:border-mred/40 hover:bg-mred/10 hover:text-mred sm:size-9"
              title={t.header.resetTitle}
            >
              <RotateCcw className="size-4" />
            </button>
            <LangButton />
          </div>
          {!p.compact && (
            <div className="leading-tight">
              <div className="font-display text-xs font-bold tracking-wide sm:text-sm">{t.header.logo}</div>
              <div className="hidden text-[10px] font-medium text-white/45 sm:block">{t.header.tagline}</div>
            </div>
          )}
        </div>

        {/* Баланс */}
        <div className="order-3 mt-1 flex w-full items-end justify-between gap-2 px-1 sm:order-none sm:mt-0 sm:mx-0 sm:w-auto sm:flex-1 sm:justify-center">
          <Tooltip
            color="#ffffff"
            align="left"
            title={t.header.balanceTitle}
            lines={[
              { label: t.header.balanceCash, value: fmtMoney(p.money) },
              { label: t.header.balanceCar, value: p.modelName, accent: "#5aa9ff" },
              { label: t.header.balanceBase, value: fmtMoney(p.modelBase), accent: "#43e0a0" },
            ]}
            hint={t.header.balanceHint}
          >
            <div className="min-w-0 cursor-help">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
                {t.header.balanceLabel}
              </div>
              <Ticker
                value={p.money}
                className={`tabular font-display block truncate font-black text-white ${
                  p.compact ? "text-xl" : "text-2xl sm:text-3xl"
                }`}
              />
            </div>
          </Tooltip>

          {!p.compact && (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
              {/* Клик */}
              <Tooltip
                color="#5aa9ff"
                title={t.header.clickTitle}
                lines={[
                  { label: t.header.clickNow, value: `+${fmt(p.clickPower)} ₽`, accent: "#5aa9ff" },
                  { label: t.header.modelBase, value: fmtMoney(p.modelBase) },
                  { label: t.header.clickUpgrades, value: fill(t.common.levelFmt, { lv: p.clickLevels }) },
                  { label: t.header.cardBonus, value: cardPctText, accent: "#f5c542" },
                  ...(p.prestige > 0
                    ? [{ label: t.header.lapBonus, value: `+${prestigePct}%`, accent: "#f5c542" }]
                    : []),
                  ...(p.boostActive
                    ? [{ label: t.header.activeBoost, value: `×${p.boostMult}`, accent: "#f5c542" }]
                    : []),
                ]}
                hint={t.header.clickHint}
              >
                <div className="flex cursor-help items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-bmw-soft transition hover:border-bmw/40 hover:bg-bmw/10">
                  <MousePointerClick className="size-3.5" />
                  <span className="tabular">+{fmt(p.clickPower)} ₽</span>
                </div>
              </Tooltip>

              {/* Пассив */}
              <Tooltip
                color="#43e0a0"
                title={t.header.passiveTitle}
                lines={[
                  { label: t.header.passiveNow, value: `${fmt(p.cps)} ₽${t.common.perSec}`, accent: "#43e0a0" },
                  { label: t.header.passiveUpgrades, value: fill(t.common.levelFmt, { lv: p.autoLevels }) },
                  { label: t.header.modelBase, value: fmtMoney(p.modelBase) },
                  { label: t.header.cardBonus, value: cardPctText, accent: "#f5c542" },
                  ...(p.prestige > 0
                    ? [{ label: t.header.lapBonus, value: `+${prestigePct}%`, accent: "#f5c542" }]
                    : []),
                ]}
                hint={t.header.passiveHint}
              >
                <PassiveChip cps={p.cps} />
              </Tooltip>

              {/* Автокликер */}
              {p.botClicks > 0 && (
                <Tooltip
                  color="#5eead4"
                  title={t.header.botTitle}
                  lines={[
                    { label: t.header.botSpeed, value: `${fmtRate(p.botClicks)} ${t.common.clicksPerSec}`, accent: "#5eead4" },
                    { label: t.header.botBrings, value: `+${fmt(p.botIncome)} ₽${t.common.perSec}`, accent: "#43e0a0" },
                    { label: t.header.botCardSpeed, value: `+${Math.round((p.botSpeedMult - 1) * 100)}%`, accent: "#f5c542" },
                  ]}
                  hint={t.header.botHint}
                >
                  <div className="flex cursor-help items-center gap-1.5 rounded-full border border-teal-400/25 bg-teal-400/10 px-3 py-1 text-xs font-bold text-teal-300 transition hover:border-teal-400/50">
                    <Bot className="size-3.5" />
                    <span className="tabular">{fmtRate(p.botClicks)} {t.common.clicksPerSec}</span>
                  </div>
                </Tooltip>
              )}

              {/* Крит */}
              <Tooltip
                color="#f5c542"
                title={t.header.critTitle}
                lines={[
                  { label: t.header.critChance, value: `${Math.round(p.critChance * 100)}%`, accent: "#f5c542" },
                  { label: t.header.critMult, value: `×${p.critMult}`, accent: "#f5c542" },
                  { label: t.header.critClickPays, value: `+${fmt(p.clickPower * p.critMult)} ₽`, accent: "#43e0a0" },
                ]}
                hint={t.header.critHint}
              >
                <div className="flex cursor-help items-center gap-1.5 rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-xs font-bold text-gold transition hover:border-gold/50">
                  <Flame className="size-3.5" />
                  <span className="tabular">
                    {Math.round(p.critChance * 100)}% · ×{p.critMult}
                  </span>
                </div>
              </Tooltip>

              {/* Престиж */}
              {p.prestige > 0 && (
                <Tooltip
                  color="#f5c542"
                  title={t.header.prestigeTitle}
                  lines={[
                    { label: t.header.prestigeLaps, value: String(p.prestige) },
                    { label: t.header.prestigeBonus, value: `+${prestigePct}%`, accent: "#f5c542" },
                    { label: t.header.prestigeNext, value: `+${prestigePct + 40}%`, accent: "#43e0a0" },
                  ]}
                  hint={t.header.prestigeHint}
                >
                  <div className="flex cursor-help items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-black text-gold transition hover:border-gold/60">
                    <Star className="size-3.5" />
                    <span className="tabular">
                      {t.header.lap} {p.prestige + 1} · +{prestigePct}%
                    </span>
                  </div>
                </Tooltip>
              )}

              {/* Буст */}
              {p.boostActive && (
                <Tooltip
                  color="#f5c542"
                  title={t.header.boostTitle}
                  lines={[
                    { label: t.header.boostMult, value: `×${p.boostMult}`, accent: "#f5c542" },
                    { label: t.header.boostApplies, value: t.header.boostAppliesTo },
                  ]}
                  hint={t.header.boostHint}
                >
                  <BoostChip until={p.boostUntil} mult={p.boostMult} />
                </Tooltip>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function PassiveChip({ cps }: { cps: number }) {
  const { t } = useI18n();
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (cps <= 0) return;
    const iv = setInterval(() => setPulse((v) => v + 1), 1000);
    return () => clearInterval(iv);
  }, [cps]);

  return (
    <div className="relative flex cursor-help items-center gap-1.5 overflow-hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-mint transition hover:border-mint/40 hover:bg-mint/10">
      {cps > 0 && (
        <motion.span
          key={pulse}
          initial={{ x: "-120%", opacity: 0.55 }}
          animate={{ x: "120%", opacity: 0 }}
          transition={{ duration: 1, ease: "linear" }}
          className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-mint/25 to-transparent"
        />
      )}
      <motion.span
        key={`i${pulse}`}
        animate={cps > 0 ? { y: [0, -3, 0], scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 0.5 }}
        className="relative"
      >
        <TrendingUp className="size-3.5" />
      </motion.span>
      <span className="tabular relative">{fmt(cps)} ₽{t.common.perSec}</span>
    </div>
  );
}

function BoostChip({ until, mult }: { until: number; mult: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => force((v) => v + 1), 500);
    return () => clearInterval(iv);
  }, []);
  const left = Math.max(0, (until - Date.now()) / 1000);
  return (
    <div className="flex animate-pulse cursor-help items-center gap-1.5 rounded-full border border-gold/40 bg-gold/15 px-3 py-1 text-xs font-black text-gold">
      <Zap className="size-3.5" />
      <span className="tabular">
        ×{mult} · {fmtTime(left)}
      </span>
    </div>
  );
}
