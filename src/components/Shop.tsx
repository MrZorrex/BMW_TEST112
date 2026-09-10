import { useEffect, useState } from "react";
import {
  Armchair,
  BadgeCheck,
  Bot,
  Brain,
  Briefcase,
  Camera,
  CarFront,
  Check,
  Coffee,
  Cpu,
  Dices,
  Droplets,
  Eye,
  Flame,
  Flashlight,
  Gauge,
  GraduationCap,
  Handshake,
  Lock,
  Megaphone,
  MousePointerClick,
  MousePointer2,
  Network,
  Paintbrush,
  Plane,
  Play,
  Server,
  Shield,
  Ship,
  Sparkles,
  Store,
  Swords,
  ToggleRight,
  TreePine,
  TrendingUp,
  Gem,
  type LucideIcon,
} from "lucide-react";
import {
  AUTO_UPGRADES,
  BOT_UPGRADES,
  CARDS,
  CASES,
  CLICK_UPGRADES,
  CRIT_UPGRADES,
  LEVEL_GROWTH,
  MODELS,
  RARITY_META,
  UPGRADE_UNLOCK_LV,
  levelGain,
  levelTotal,
  unlockedCount,
  type BotUpgradeDef,
  type CaseDef,
  type CardDef,
  type CritUpgradeDef,
  type UpgradeDef,
} from "../data/game";
import { fmt, fmtMoney, fmtRate, fmtTime } from "../game/format";
import { upgradeCost, type useGame } from "../game/useGame";
import { fill, useI18n } from "../i18n";
import { cardText, caseText, modelText, upgradeText } from "../i18n/data";
import CarImage from "./CarImage";

const ICONS: Record<string, LucideIcon> = {
  Droplets, Sparkles, Flashlight, Paintbrush, Armchair, Shield, Gauge, Camera,
  Megaphone, GraduationCap, Handshake, Briefcase, Store, Network, Ship, Plane,
  MousePointer2, ToggleRight, Bot, Brain, Server, Eye, Swords,
};

const CARD_ICONS: Record<string, LucideIcon> = {
  kofe: Coffee,
  elochka: TreePine,
  nomera: BadgeCheck,
  z1: CarFront,
  mechhand: Bot,
  bot3000: Cpu,
};

type Game = ReturnType<typeof useGame>;

interface ShopProps {
  game: Game;
  onBuyNext: () => void;
  onOpenCase: (c: CaseDef) => void;
  onWatchAd: () => void;
  adsEnabled?: boolean;
}

type Tab = "models" | "upgrades" | "luck";

export default function Shop({ game, onBuyNext, onOpenCase, onWatchAd, adsEnabled = false }: ShopProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("models");
  const { s } = game;

  const totalLv =
    Object.values(s.clickLv).reduce((a, b) => a + b, 0) +
    Object.values(s.autoLv).reduce((a, b) => a + b, 0) +
    Object.values(s.botLv).reduce((a, b) => a + b, 0);
  const cardsOwned = Object.keys(s.cards).length;

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-line bg-panel">
      {/* табы */}
      <div className="grid grid-cols-3 gap-1 border-b border-line bg-night/50 p-2">
        {(
          [
            { id: "models", label: t.shop.tabModels, badge: `${s.modelIndex + 1}` },
            { id: "upgrades", label: t.shop.tabUpgrades, badge: totalLv > 0 ? String(totalLv) : "" },
            { id: "luck", label: t.shop.tabLuck, badge: cardsOwned > 0 ? String(cardsOwned) : "" },
          ] as const
        ).map((tabDef) => (
          <button
            key={tabDef.id}
            onClick={() => setTab(tabDef.id)}
            className={`tap-min relative rounded-xl px-2 py-2.5 text-[12px] font-extrabold uppercase tracking-wider transition sm:text-[13px] ${
              tab === tabDef.id ? "bg-white/10 text-white" : "text-white/40 hover:bg-white/5 hover:text-white/70"
            }`}
          >
            {tabDef.label}
            {tabDef.badge && (
              <span className="ml-1.5 rounded-full bg-bmw/25 px-1.5 py-0.5 text-[9px] font-black text-bmw-soft">
                {tabDef.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "models" && <ModelsTab game={game} onBuyNext={onBuyNext} />}
        {tab === "upgrades" && <UpgradesTab game={game} />}
        {tab === "luck" && (
          <LuckTab game={game} onOpenCase={onOpenCase} onWatchAd={onWatchAd} adsEnabled={adsEnabled} />
        )}
      </div>

      {/* футер-статистика */}
      <div className="grid grid-cols-3 divide-x divide-white/5 border-t border-line bg-night/50 text-center">
        {[
          { v: fmt(s.clicks), l: t.shop.statClicks },
          { v: fmt(s.totalEarned) + " ₽", l: t.shop.statEarned },
          { v: `+${Math.round(game.totalCardPct * 100)}%`, l: t.shop.statLuck },
        ].map((x) => (
          <div key={x.l} className="px-1 py-2.5">
            <div className="tabular font-display text-[12px] font-bold text-white/85">{x.v}</div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-white/30">{x.l}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ─── Модели ──────────────────────────────────────────────────

function ModelsTab({ game, onBuyNext }: { game: Game; onBuyNext: () => void }) {
  const { t, lang } = useI18n();
  const { s } = game;
  return (
    <div className="flex flex-col gap-2">
      {MODELS.map((m, i) => {
        const owned = i < s.modelIndex;
        const current = i === s.modelIndex;
        const next = i === s.modelIndex + 1;
        const locked = i > s.modelIndex + 1;
        const afford = next && s.money >= m.price;
        const mt = modelText(lang, m);
        return (
          <div
            key={m.id}
            className={`flex items-center gap-3 rounded-2xl border p-2 transition ${
              current
                ? "border-bmw/50 bg-bmw/10"
                : next
                  ? "border-white/15 bg-white/[0.04]"
                  : owned
                    ? "border-white/5 bg-transparent opacity-50"
                    : "border-white/5 bg-transparent opacity-40"
            }`}
          >
            <div className="relative size-14 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10">
              <CarImage
                model={m}
                className={`size-full object-cover ${locked ? "blur-md grayscale" : ""}`}
              />
              {locked && (
                <div className="absolute inset-0 grid place-items-center bg-night/30">
                  <Lock className="size-4 text-white/50" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`truncate text-[13px] font-extrabold ${current ? "text-white" : "text-white/80"}`}>
                {locked ? "???" : m.name}
              </div>
              <div className="text-[10.5px] font-semibold text-white/35">
                {mt.years} · {mt.era}
              </div>
              {!locked && (
                <div className="tabular text-[10.5px] font-bold text-mint/80">+{fmt(m.base)} ₽{t.common.perClick}</div>
              )}
            </div>
            <div className="shrink-0">
              {current && (
                <span className="rounded-full bg-bmw px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white">
                  {t.shop.inGarage}
                </span>
              )}
              {owned && (
                <span className="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white/40">
                  <Check className="size-3" /> {t.shop.sold}
                </span>
              )}
              {next && (
                <button
                  onClick={onBuyNext}
                  disabled={!afford}
                  className={`tabular tap-min-sm rounded-xl px-3 py-2 font-display text-[11px] font-black transition ${
                    afford
                      ? "bg-gradient-to-r from-bmw to-bmw-soft text-white hover:brightness-110 active:scale-95"
                      : "border border-white/10 bg-white/5 text-white/35"
                  }`}
                >
                  {fmtMoney(m.price)}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Прокачка ────────────────────────────────────────────────

function UpgradeRow({
  def,
  kind,
  game,
}: {
  def: UpgradeDef;
  kind: "click" | "auto";
  game: Game;
}) {
  const { t, lang } = useI18n();
  const { s, model, cardMult } = game;
  const lv = (kind === "click" ? s.clickLv : s.autoLv)[def.id] ?? 0;
  const cost = upgradeCost(def, lv);
  const afford = s.money >= cost;
  const Icon = ICONS[def.icon] ?? Sparkles;
  const ut = upgradeText(lang, def.id, def);
  // отдача именно СЛЕДУЮЩЕГО уровня — каждый уровень мощнее предыдущего
  const perLevel = levelGain(def.pct, lv) * model.base * cardMult * game.prestigeMult;
  const owned = levelTotal(def.pct, lv) * model.base * cardMult * game.prestigeMult;
  const unit = kind === "auto" ? ` ₽${t.common.perSec}` : " ₽";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-2.5 transition hover:border-white/10">
      <div
        className={`grid size-11 shrink-0 place-items-center rounded-xl border ${
          kind === "click" ? "border-bmw/25 bg-bmw/10 text-bmw-soft" : "border-mint/20 bg-mint/10 text-mint"
        }`}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[13px] font-extrabold text-white/90">{ut.name}</span>
          {lv > 0 && (
            <span className="shrink-0 rounded bg-white/10 px-1.5 py-px text-[9px] font-black text-white/60">
              {fill(t.common.levelFmt, { lv })}
            </span>
          )}
        </div>
        <div className="truncate text-[10.5px] font-medium text-white/35">{ut.flavor}</div>
        <div className={`tabular text-[10.5px] font-bold ${kind === "click" ? "text-bmw-soft/90" : "text-mint/90"}`}>
          +{fmt(perLevel)}{unit} {t.shop.forNextLevel}
          {lv > 0 && <span className="text-white/30"> {fill(t.shop.nowGain, { x: fmt(owned) })}</span>}
        </div>
      </div>
      <button
        onClick={() => game.buyUpgrade(def, kind)}
        disabled={!afford}
        className={`tabular tap-min-sm shrink-0 rounded-xl px-3 py-2 font-display text-[11px] font-black transition ${
          afford
            ? kind === "click"
              ? "bg-gradient-to-r from-bmw to-bmw-soft text-white hover:brightness-110 active:scale-95"
              : "bg-gradient-to-r from-emerald-600 to-mint text-night hover:brightness-110 active:scale-95"
            : "border border-white/10 bg-white/5 text-white/35"
        }`}
      >
        {fmtMoney(cost)}
      </button>
    </div>
  );
}

function BotRow({ def, game }: { def: BotUpgradeDef; game: Game }) {
  const { t, lang } = useI18n();
  const { s } = game;
  const lv = s.botLv[def.id] ?? 0;
  const cost = upgradeCost(def, lv);
  const afford = s.money >= cost;
  const Icon = ICONS[def.icon] ?? Bot;
  const ut = upgradeText(lang, def.id, def);
  const perLevel = levelGain(def.cps, lv) * game.botSpeedMult;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-2.5 transition hover:border-white/10">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-teal-400/25 bg-teal-400/10 text-teal-300">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[13px] font-extrabold text-white/90">{ut.name}</span>
          {lv > 0 && (
            <span className="shrink-0 rounded bg-white/10 px-1.5 py-px text-[9px] font-black text-white/60">
              {fill(t.common.levelFmt, { lv })}
            </span>
          )}
        </div>
        <div className="truncate text-[10.5px] font-medium text-white/35">{ut.flavor}</div>
        <div className="tabular text-[10.5px] font-bold text-teal-300/90">
          +{fmtRate(perLevel)} {t.common.clicksPerSec} {t.shop.forNextLevel}
          {lv > 0 && (
            <span className="text-white/30"> {fill(t.shop.nowRate, { x: fmtRate(levelTotal(def.cps, lv) * game.botSpeedMult) })}</span>
          )}
        </div>
      </div>
      <button
        onClick={() => game.buyBot(def)}
        disabled={!afford}
        className={`tabular tap-min-sm shrink-0 rounded-xl px-3 py-2 font-display text-[11px] font-black transition ${
          afford
            ? "bg-gradient-to-r from-teal-600 to-teal-400 text-night hover:brightness-110 active:scale-95"
            : "border border-white/10 bg-white/5 text-white/35"
        }`}
      >
        {fmtMoney(cost)}
      </button>
    </div>
  );
}

function CritRow({ def, game }: { def: CritUpgradeDef; game: Game }) {
  const { t, lang } = useI18n();
  const { s } = game;
  const lv = s.critLv[def.id] ?? 0;
  const maxed = lv >= def.maxLv;
  const cost = upgradeCost(def, lv);
  const afford = s.money >= cost && !maxed;
  const Icon = ICONS[def.icon] ?? Flame;
  const ut = upgradeText(lang, def.id, def);
  const stepFmt = (def.step * 100).toFixed(1).replace(".", lang === "en" ? "." : ",").replace(/\.0$/, "").replace(/,0$/, "");
  const perLevel =
    def.id === "critChance" ? fill(t.shop.critChanceStep, { x: stepFmt }) : fill(t.shop.critPowerStep, { x: def.step });
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-2.5 transition hover:border-white/10">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-gold/25 bg-gold/10 text-gold">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[13px] font-extrabold text-white/90">{ut.name}</span>
          <span className="shrink-0 rounded bg-white/10 px-1.5 py-px text-[9px] font-black text-white/60">
            {lv}/{def.maxLv}
          </span>
        </div>
        <div className="truncate text-[10.5px] font-medium text-white/35">{ut.flavor}</div>
        <div className="tabular text-[10.5px] font-bold text-gold/90">{perLevel} {t.shop.perLevel}</div>
      </div>
      <button
        onClick={() => game.buyCrit(def)}
        disabled={!afford}
        className={`tabular tap-min-sm shrink-0 rounded-xl px-3 py-2 font-display text-[11px] font-black transition ${
          afford
            ? "bg-gradient-to-r from-amber-500 to-gold text-night hover:brightness-110 active:scale-95"
            : "border border-white/10 bg-white/5 text-white/35"
        }`}
      >
        {maxed ? t.common.max : fmtMoney(cost)}
      </button>
    </div>
  );
}

function NextUnlockHint({
  defs,
  lv,
}: {
  defs: { id: string; name: string; flavor: string }[];
  lv: Record<string, number>;
}) {
  const { t, lang } = useI18n();
  const open = unlockedCount(defs, lv);
  if (open >= defs.length) return null;
  const prev = defs[open - 1];
  const have = lv[prev.id] ?? 0;
  const prevName = upgradeText(lang, prev.id, prev).name;
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-2.5">
      <Lock className="size-3.5 shrink-0 text-white/25" />
      <span className="text-[10.5px] font-semibold leading-snug text-white/30">
        {fill(t.shop.unlockHint, { name: prevName, n: UPGRADE_UNLOCK_LV })}{" "}
        <span className="tabular text-white/45">
          ({have}/{UPGRADE_UNLOCK_LV})
        </span>
      </span>
    </div>
  );
}

function UpgradesTab({ game }: { game: Game }) {
  const { t } = useI18n();
  const { s } = game;
  const clickOpen = unlockedCount(CLICK_UPGRADES, s.clickLv);
  const critOpen = unlockedCount(CRIT_UPGRADES, s.critLv);
  const autoOpen = unlockedCount(AUTO_UPGRADES, s.autoLv);
  const botOpen = unlockedCount(BOT_UPGRADES, s.botLv);

  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-black uppercase tracking-[0.2em] text-bmw-soft">
          <MousePointerClick className="size-3.5" /> {t.shop.secClick}
        </h3>
        <div className="flex flex-col gap-2">
          {CLICK_UPGRADES.slice(0, clickOpen).map((d) => (
            <UpgradeRow key={d.id} def={d} kind="click" game={game} />
          ))}
          <NextUnlockHint defs={CLICK_UPGRADES} lv={s.clickLv} />
        </div>
        <p className="mt-1.5 px-1 text-[10px] font-medium leading-relaxed text-white/30">
          {fill(t.shop.levelNote, { p: Math.round((LEVEL_GROWTH - 1) * 100) })}
        </p>
      </section>
      <section>
        <h3 className="mb-2 flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-[0.2em] text-gold">
          <span className="flex items-center gap-1.5">
            <Flame className="size-3.5" /> {t.shop.secCrit}
          </span>
          <span className="tabular rounded-full bg-gold/10 px-2 py-0.5 text-[9px] text-gold">
            {Math.round(game.critChance * 100)}% · ×{game.critMult}
          </span>
        </h3>
        <div className="flex flex-col gap-2">
          {CRIT_UPGRADES.slice(0, critOpen).map((d) => (
            <CritRow key={d.id} def={d} game={game} />
          ))}
          <NextUnlockHint defs={CRIT_UPGRADES} lv={s.critLv} />
        </div>
        <p className="mt-1.5 px-1 text-[10px] font-medium leading-relaxed text-white/30">
          {t.shop.critNote}
        </p>
      </section>
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-black uppercase tracking-[0.2em] text-mint">
          <TrendingUp className="size-3.5" /> {t.shop.secPassive}
        </h3>
        <div className="flex flex-col gap-2">
          {AUTO_UPGRADES.slice(0, autoOpen).map((d) => (
            <UpgradeRow key={d.id} def={d} kind="auto" game={game} />
          ))}
          <NextUnlockHint defs={AUTO_UPGRADES} lv={s.autoLv} />
        </div>
      </section>
      <section>
        <h3 className="mb-2 flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-[0.2em] text-teal-300">
          <span className="flex items-center gap-1.5">
            <Bot className="size-3.5" /> {t.shop.secBot}
          </span>
          {game.botClicks > 0 && (
            <span className="tabular rounded-full bg-teal-400/10 px-2 py-0.5 text-[9px] text-teal-300">
              Σ {fmtRate(game.botClicks)} {t.common.clicksPerSec}
            </span>
          )}
        </h3>
        <div className="flex flex-col gap-2">
          {BOT_UPGRADES.slice(0, botOpen).map((d) => (
            <BotRow key={d.id} def={d} game={game} />
          ))}
          <NextUnlockHint defs={BOT_UPGRADES} lv={s.botLv} />
        </div>
        <p className="mt-1.5 px-1 text-[10px] font-medium leading-relaxed text-white/30">
          {t.shop.botNote}
        </p>
      </section>
    </div>
  );
}

// ─── Удача ───────────────────────────────────────────────────

function OddsRow({ c }: { c: CaseDef }) {
  const { t } = useI18n();
  const w = c.weights;
  const total = w.cash + w.boost + w.common + w.rare + w.epic + w.legend;
  const items = [
    { label: t.shop.oddsCash, v: w.cash, color: "#43e0a0" },
    { label: t.shop.oddsBoost, v: w.boost, color: "#f5c542" },
    { label: t.shop.oddsCommon, v: w.common, color: RARITY_META.common.color },
    { label: t.shop.oddsRare, v: w.rare, color: RARITY_META.rare.color },
    { label: t.shop.oddsEpic, v: w.epic, color: RARITY_META.epic.color },
    { label: t.shop.oddsLegend, v: w.legend, color: RARITY_META.legend.color },
  ];
  return (
    <div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/5">
        {items.map((it) => (
          <div key={it.label} style={{ width: `${(it.v / total) * 100}%`, background: it.color }} className="h-full" />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
        {items.map((it) => (
          <span key={it.label} className="flex items-center gap-1 text-[9.5px] font-bold text-white/40">
            <span className="size-1.5 rounded-full" style={{ background: it.color }} />
            {it.label} {Math.round((it.v / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export function CardFace({ card, count, size = "md" }: { card: CardDef; count?: number; size?: "sm" | "md" }) {
  const { t, lang } = useI18n();
  const meta = RARITY_META[card.rarity];
  const Icon = CARD_ICONS[card.id] ?? Gem;
  const owned = (count ?? 1) > 0;
  const ct = cardText(lang, card);
  const bonusText = card.botPct
    ? fill(t.shop.cardAuto, { x: Math.round(card.botPct * 100) })
    : card.critPct
      ? fill(t.shop.cardCrit, { x: Math.round(card.critPct * 100) })
      : `+${Math.round(card.pct * 100)}%`;
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-xl border ${size === "sm" ? "aspect-[4/5]" : ""}`}
      style={{
        borderColor: owned ? `${meta.color}55` : "rgba(255,255,255,.08)",
        background: owned ? `${meta.color}10` : "rgba(255,255,255,.02)",
        boxShadow: owned && card.rarity !== "common" ? `0 0 24px -8px ${meta.glow}` : undefined,
      }}
    >
      {card.img && !failed ? (
        <img
          src={card.img}
          alt={ct.name}
          className={`w-full object-cover ${size === "sm" ? "h-[58%]" : "h-28"} ${owned ? "" : "grayscale opacity-30"}`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className={`grid w-full place-items-center ${size === "sm" ? "h-[58%]" : "h-28"}`}>
          <Icon className={size === "sm" ? "size-7" : "size-10"} style={{ color: owned ? meta.color : "rgba(255,255,255,.2)" }} />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col justify-between p-2">
        <div className={`line-clamp-2 font-extrabold leading-tight ${size === "sm" ? "text-[10px]" : "text-sm"} ${owned ? "text-white/90" : "text-white/30"}`}>
          {owned ? ct.name : "???"}
        </div>
        {owned && (
          <div className="tabular mt-0.5 font-black" style={{ color: meta.color, fontSize: size === "sm" ? 9 : 12 }}>
            {bonusText}
          </div>
        )}
      </div>
      {owned && (count ?? 1) > 1 && (
        <span className="tabular absolute right-1.5 top-1.5 rounded-full bg-night/80 px-1.5 py-0.5 text-[9px] font-black text-white backdrop-blur">
          ×{count}
        </span>
      )}
    </div>
  );
}

function AdCard({ readyAt, onWatchAd }: { readyAt: number; onWatchAd: () => void }) {
  const { t } = useI18n();
  const [, force] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => force((v) => v + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const left = Math.max(0, Math.ceil((readyAt - Date.now()) / 1000));
  const ready = left <= 0;
  return (
    <div className="overflow-hidden rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/[0.09] via-transparent to-transparent p-3.5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-[14px] font-extrabold text-white">{t.shop.adTitle}</div>
          <div className="text-[11px] font-medium text-white/40">
            {t.shop.adLead} <span className="text-gold">{t.shop.adFreeCase}</span>
          </div>
        </div>
        <Play className="size-5 shrink-0 text-gold" />
      </div>
      <button
        onClick={onWatchAd}
        disabled={!ready}
        className={`tap-min w-full rounded-xl py-2.5 font-display text-[11px] font-black tracking-wide transition ${
          ready
            ? "shine-btn bg-gradient-to-r from-amber-500 to-gold text-night hover:brightness-110 active:scale-[0.98]"
            : "border border-white/10 bg-white/5 text-white/35"
        }`}
      >
        {ready ? t.shop.adWatch : fill(t.shop.adWait, { t: fmtTime(left) })}
      </button>
    </div>
  );
}

function LuckTab({
  game,
  onOpenCase,
  onWatchAd,
  adsEnabled,
}: {
  game: Game;
  onOpenCase: (c: CaseDef) => void;
  onWatchAd: () => void;
  adsEnabled: boolean;
}) {
  const { t, lang } = useI18n();
  const { s } = game;
  return (
    <div className="flex flex-col gap-3">
      {(game.totalCardPct > 0 || game.botSpeedMult > 1) && (
        <div className="flex flex-col gap-1.5">
          {game.totalCardPct > 0 && (
            <div className="flex items-center gap-2 rounded-2xl border border-gold/25 bg-gold/10 px-3 py-2.5">
              <Gem className="size-4 shrink-0 text-gold" />
              <span className="text-[12px] font-extrabold text-gold">
                {fill(t.shop.luckCollection, { x: Math.round(game.totalCardPct * 100) })}
              </span>
            </div>
          )}
          {game.botSpeedMult > 1 && (
            <div className="flex items-center gap-2 rounded-2xl border border-teal-400/25 bg-teal-400/10 px-3 py-2.5">
              <Bot className="size-4 shrink-0 text-teal-300" />
              <span className="text-[12px] font-extrabold text-teal-300">
                {fill(t.shop.botFaster, { x: Math.round((game.botSpeedMult - 1) * 100) })}
              </span>
            </div>
          )}
        </div>
      )}

      {adsEnabled && <AdCard readyAt={s.adReadyAt} onWatchAd={onWatchAd} />}

      {CASES.map((c) => {
        const price = game.casePrice(c);
        const afford = s.money >= price;
        const opens = s.caseOpens[c.id] ?? 0;
        const ct = caseText(lang, c);
        return (
          <div key={c.id} className="glass rounded-2xl p-3.5">
            <div className="mb-1 flex items-start justify-between gap-2">
              <div>
                <div className="text-[14px] font-extrabold text-white">{ct.name}</div>
                <div className="text-[11px] font-medium text-white/40">{ct.tagline}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Dices className="size-5 text-bmw-soft" />
                {opens > 0 && (
                  <span className="tabular rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-black text-white/45">
                    ×{opens}
                  </span>
                )}
              </div>
            </div>
            <div className="my-3">
              <OddsRow c={c} />
            </div>
            <button
              onClick={() => onOpenCase(c)}
              disabled={!afford}
              className={`tap-min w-full rounded-xl py-3 font-display text-[12px] font-black tracking-wide transition ${
                afford
                  ? "shine-btn bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-[0_10px_30px_-8px_rgba(168,85,247,.7)] hover:brightness-110 active:scale-[0.98]"
                  : "border border-white/10 bg-white/5 text-white/35"
              }`}
            >
              {fill(t.shop.openCase, { price: fmtMoney(price) })}
            </button>
            <p className="mt-1.5 text-center text-[9.5px] font-semibold text-white/25">
              {fill(t.shop.caseGrowth, { x: Math.round((c.priceGrowth - 1) * 100) })}
            </p>
          </div>
        );
      })}

      <div className="mt-1">
        <h3 className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
          {fill(t.shop.collection, { a: Object.keys(s.cards).length, b: CARDS.length })}
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {CARDS.map((card) => (
            <CardFace key={card.id} card={card} count={s.cards[card.id] ?? 0} size="sm" />
          ))}
        </div>
        <p className="mt-2 px-1 text-[10px] font-medium leading-relaxed text-white/30">
          {t.shop.dupNote}
        </p>
      </div>
    </div>
  );
}
