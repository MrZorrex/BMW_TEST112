import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AD_COOLDOWN_SECS,
  AUTO_UPGRADES,
  BOT_UPGRADES,
  CARDS,
  CLICK_UPGRADES,
  CRIT_BASE_CHANCE,
  CRIT_BASE_MULT,
  CRIT_UPGRADES,
  MODELS,
  PRESTIGE_BONUS,
  cardsByRarity,
  isUpgradeUnlocked,
  levelTotal,
  type BotUpgradeDef,
  type CardDef,
  type CaseDef,
  type CritUpgradeDef,
  type Rarity,
  type UpgradeDef,
} from "../data/game";
import { setSoundEnabled, sfxBuy, sfxWin } from "./sound";
import { cloudSave, getCloudSnapshot, getSdkLang } from "./yandex";
import { pinLangFor, resolveStartLang, type Lang } from "../i18n";
import { CASH_PILE_FALLBACK_BASE_MULT, CASH_PILE_SHARE, VIP_PERK_BONUS, VIP_PERK_ID } from "../data/products";

// ─── Типы ────────────────────────────────────────────────────

export interface GameState {
  money: number;
  totalEarned: number;
  clicks: number;
  modelIndex: number;
  clickLv: Record<string, number>;
  autoLv: Record<string, number>;
  botLv: Record<string, number>;
  critLv: Record<string, number>;
  caseOpens: Record<string, number>;
  cards: Record<string, number>;
  boostUntil: number;
  boostMult: number;
  prestige: number;
  adReadyAt: number;
  sound: boolean;
  introSeen: boolean;
  lastSeen: number;
  /** Постоянные перки из инап-покупок: id товара → 1. Переживают новые круги. */
  perks: Record<string, number>;
  /** Язык интерфейса. На платформе его задаёт автоопределение SDK (п. 2.14). */
  lang: Lang;
  /**
   * Отметка «язык выбран игроком вручную» (п. 6.9) + код языка платформы на
   * момент выбора. Нужна, чтобы автоопределение при следующем запуске не
   * перекрывалось автосохранённым значением: в сейв `lang` попадает всегда.
   * `null` — ручного выбора не было, язык всегда берётся из SDK.
   */
  langPinnedOn: string | null;
  /**
   * Токены покупок, выдача по которым уже произведена. Нужны, чтобы при
   * обрыве сети между выдачей и консумацией не выдать товар дважды:
   * повторная проверка необработанных покупок такие токены только консумирует.
   */
  grantedTokens: Record<string, number>;
}

export type Reward =
  | { kind: "cash"; amount: number }
  | { kind: "boost"; mult: number; secs: number }
  | { kind: "card"; card: CardDef; dup: boolean; dupCash: number };

export const SAVE_KEY = "bmw-perekup-save-v1";

const initialState = (): GameState => ({
  money: 0,
  totalEarned: 0,
  clicks: 0,
  modelIndex: 0,
  clickLv: {},
  autoLv: {},
  botLv: {},
  critLv: {},
  caseOpens: {},
  cards: {},
  boostUntil: 0,
  boostMult: 1,
  prestige: 0,
  adReadyAt: 0,
  sound: true,
  introSeen: false,
  lastSeen: Date.now(),
  perks: {},
  lang: resolveStartLang(getSdkLang()),
  langPinnedOn: null,
  grantedTokens: {},
});

function readLocal(): Partial<GameState> | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as Partial<GameState>) : null;
  } catch {
    return null;
  }
}

/**
 * Прогресс берётся из облака Яндекс Игр (если игрок его имеет) или из локального
 * хранилища — выигрывает более «продвинутое» сохранение. Гостевой режим работает так же.
 */
function loadState(): { state: GameState; isFresh: boolean } {
  const base = initialState();
  const local = readLocal();
  const cloud = getCloudSnapshot() as Partial<GameState> | null;

  let best: Partial<GameState> | null = null;
  if (local && cloud) {
    best = (cloud.totalEarned ?? 0) >= (local.totalEarned ?? 0) ? cloud : local;
  } else {
    best = cloud ?? local;
  }

  if (!best) return { state: base, isFresh: true };

  // Язык (п. 2.14): из сейва уважаем только ручной выбор игрока (п. 6.9). Если в
  // сейве лежит автоопределённое значение, при следующем запуске язык снова
  // берётся из SDK — иначе проверка переключения языка на debug-панели не проходит.
  const sdkLang = getSdkLang();
  const lang = resolveStartLang(sdkLang, [cloud, local]);
  const pinSource = [cloud, local].find((s) => typeof s?.langPinnedOn === "string");

  return {
    state: {
      ...base,
      ...best,
      modelIndex: Math.min(Math.max(0, best.modelIndex ?? 0), MODELS.length - 1),
      lang,
      langPinnedOn: pinSource?.langPinnedOn ?? null,
      grantedTokens: best.grantedTokens ?? {},
      perks: best.perks ?? {},
    },
    isFresh: false,
  };
}

export function upgradeCost(def: { cost: number; growth: number }, lv: number): number {
  return def.cost * Math.pow(def.growth, lv);
}

function sumPct(defs: UpgradeDef[], lv: Record<string, number>) {
  return defs.reduce((acc, d) => acc + levelTotal(d.pct, lv[d.id] ?? 0), 0);
}

function sumBot(defs: BotUpgradeDef[], lv: Record<string, number>) {
  return defs.reduce((acc, d) => acc + levelTotal(d.cps, lv[d.id] ?? 0), 0);
}

// ─── Хук ─────────────────────────────────────────────────────

export function useGame() {
  const loaded = useMemo(loadState, []);
  const [s, setS] = useState<GameState>(loaded.state);

  // Пауза игрового процесса: полноэкранная реклама, стартовый рекламный блок
  // платформы, диалог покупки (п. 4.7). Доход не капает, таймер буста заморожен.
  const [paused, setPausedState] = useState(false);
  const pausedRef = useRef(false);
  const pausedBoostRef = useRef(0);
  const pausedAtRef = useRef(0);
  const setPaused = useCallback((v: boolean) => {
    if (v === pausedRef.current) return;
    pausedRef.current = v;
    setPausedState(v);
    if (v) {
      pausedAtRef.current = Date.now();
      pausedBoostRef.current = stateRef.current.boostUntil;
    } else {
      const delta = Date.now() - pausedAtRef.current;
      const frozenBoost = pausedBoostRef.current;
      if (delta > 0 && frozenBoost > 0) {
        // сдвигаем только буст, переживший паузу без изменений (выданный
        // наградой за рекламу во время паузы продлевать не нужно)
        setS((p) => (p.boostUntil === frozenBoost ? { ...p, boostUntil: p.boostUntil + delta } : p));
      }
    }
  }, []);

  useEffect(() => {
    setSoundEnabled(s.sound);
  }, [s.sound]);

  const model = MODELS[s.modelIndex];
  const next = MODELS[s.modelIndex + 1] ?? null;

  const cardMult = useMemo(
    () => 1 + CARDS.reduce((acc, c) => acc + c.pct * (s.cards[c.id] ?? 0), 0),
    [s.cards]
  );

  const botSpeedMult = useMemo(
    () => 1 + CARDS.reduce((acc, c) => acc + (c.botPct ?? 0) * (s.cards[c.id] ?? 0), 0),
    [s.cards]
  );

  const prestigeMult = 1 + PRESTIGE_BONUS * s.prestige;
  const boostActive = s.boostUntil > Date.now();
  const boostF = boostActive ? s.boostMult : 1;
  // постоянный перк из инап-покупки «Перекуп года»
  const perkMult = 1 + VIP_PERK_BONUS * (s.perks[VIP_PERK_ID] ?? 0);

  // крит: базовый шанс + прокачка + карты удачи
  const critCardPct = useMemo(
    () => CARDS.reduce((acc, c) => acc + (c.critPct ?? 0) * (s.cards[c.id] ?? 0), 0),
    [s.cards]
  );
  const critChanceDef = CRIT_UPGRADES[0];
  const critPowerDef = CRIT_UPGRADES[1];
  const critChance = Math.min(
    0.75,
    CRIT_BASE_CHANCE + critChanceDef.step * (s.critLv[critChanceDef.id] ?? 0) + critCardPct
  );
  const critMult = CRIT_BASE_MULT + critPowerDef.step * (s.critLv[critPowerDef.id] ?? 0);

  const clickPower = useMemo(
    () => model.base * (1 + sumPct(CLICK_UPGRADES, s.clickLv)) * cardMult * boostF * prestigeMult * perkMult,
    [model, s.clickLv, cardMult, boostF, prestigeMult, perkMult]
  );

  const cps = useMemo(
    () => model.base * sumPct(AUTO_UPGRADES, s.autoLv) * cardMult * boostF * prestigeMult * perkMult,
    [model, s.autoLv, cardMult, boostF, prestigeMult, perkMult]
  );

  // автокликер
  const botClicksRaw = useMemo(() => sumBot(BOT_UPGRADES, s.botLv), [s.botLv]);
  const botClicks = botClicksRaw * botSpeedMult; // автокликов в секунду
  // автоклики тоже критуют — считаем средний множитель
  const avgCritMult = 1 + critChance * (critMult - 1);
  const botIncome = botClicks * clickPower * avgCritMult; // ₽/с от автокликера

  // оффлайн-доход (однократно при загрузке)
  const offlineGain = useMemo(() => {
    if (loaded.isFresh) return 0;
    const st = loaded.state;
    const m = MODELS[st.modelIndex];
    const cm = 1 + CARDS.reduce((acc, c) => acc + c.pct * (st.cards[c.id] ?? 0), 0);
    const bm = 1 + CARDS.reduce((acc, c) => acc + (c.botPct ?? 0) * (st.cards[c.id] ?? 0), 0);
    const pm = 1 + PRESTIGE_BONUS * (st.prestige ?? 0);
    const clickPow = m.base * (1 + sumPct(CLICK_UPGRADES, st.clickLv)) * cm * pm;
    const autoCps = m.base * sumPct(AUTO_UPGRADES, st.autoLv) * cm * pm;
    const botC = sumBot(BOT_UPGRADES, st.botLv ?? {}) * bm;
    const rate = autoCps + botC * clickPow;
    if (rate <= 0) return 0;
    const secs = Math.min(Math.max(0, (Date.now() - st.lastSeen) / 1000), 8 * 3600);
    return rate * secs * 0.01;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appliedOffline = useRef(false);
  useEffect(() => {
    if (!appliedOffline.current && offlineGain > 0) {
      appliedOffline.current = true;
      setS((p) => ({ ...p, money: p.money + offlineGain, totalEarned: p.totalEarned + offlineGain }));
    }
  }, [offlineGain]);

  // тик пассивного дохода + автокликер + истечение буста
  const incomeRef = useRef(0);
  incomeRef.current = cps + botIncome;
  useEffect(() => {
    const iv = setInterval(() => {
      if (pausedRef.current) return;
      setS((p) => {
        const expired = p.boostUntil !== 0 && p.boostUntil <= Date.now();
        const gain = incomeRef.current / 10;
        if (!expired && gain <= 0) return p;
        return {
          ...p,
          money: p.money + gain,
          totalEarned: p.totalEarned + gain,
          boostUntil: expired ? 0 : p.boostUntil,
          boostMult: expired ? 1 : p.boostMult,
        };
      });
    }, 100);
    return () => clearInterval(iv);
  }, []);

  // автосохранение
  const stateRef = useRef(s);
  stateRef.current = s;
  useEffect(() => {
    // локальная копия — часто; облако Яндекс Игр — раз в 20 сек (лимит 100 запросов / 5 мин)
    const save = (toCloud = false, flush = false) => {
      const snapshot = { ...stateRef.current, lastSeen: Date.now() };
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
      } catch { /* noop */ }
      if (toCloud) void cloudSave(snapshot, flush);
    };

    const ivLocal = setInterval(() => save(false), 2500);
    const ivCloud = setInterval(() => save(true), 20_000);

    const onHide = () => {
      if (document.visibilityState === "hidden") save(true, true);
    };
    const onUnload = () => save(true, true);
    // п. 1.9 — прогресс не теряется при смене ориентации экрана
    const onOrient = () => save(true, true);

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onUnload);
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("orientationchange", onOrient);

    return () => {
      clearInterval(ivLocal);
      clearInterval(ivCloud);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onUnload);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("orientationchange", onOrient);
    };
  }, []);

  /** Немедленное сохранение после значимых действий (п. 1.9). */
  const saveNow = useCallback(() => {
    const snapshot = { ...stateRef.current, lastSeen: Date.now() };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    } catch { /* noop */ }
    void cloudSave(snapshot, true);
  }, []);

  const click = useCallback((): { gain: number; crit: boolean } => {
    const crit = Math.random() < critChance;
    const gain = clickPower * (crit ? critMult : 1);
    setS((p) => ({
      ...p,
      money: p.money + gain,
      totalEarned: p.totalEarned + gain,
      clicks: p.clicks + 1,
    }));
    return { gain, crit };
  }, [clickPower, critChance, critMult]);

  const buyNext = useCallback((): boolean => {
    if (!next || s.money < next.price) return false;
    setS((p) => ({
      ...p,
      money: p.money - next.price,
      modelIndex: p.modelIndex + 1,
    }));
    sfxWin();
    return true;
  }, [next, s.money]);

  const buyUpgrade = useCallback(
    (def: UpgradeDef, kind: "click" | "auto"): boolean => {
      const map = kind === "click" ? "clickLv" : "autoLv";
      const chain = kind === "click" ? CLICK_UPGRADES : AUTO_UPGRADES;
      const lvMap = kind === "click" ? s.clickLv : s.autoLv;
      if (!isUpgradeUnlocked(chain, def.id, lvMap)) return false;
      const lv = lvMap[def.id] ?? 0;
      const cost = upgradeCost(def, lv);
      if (s.money < cost) return false;
      setS((p) => ({
        ...p,
        money: p.money - cost,
        [map]: { ...(p as any)[map], [def.id]: lv + 1 },
      }));
      sfxBuy();
      return true;
    },
    [s.money, s.clickLv, s.autoLv]
  );

  const buyBot = useCallback(
    (def: BotUpgradeDef): boolean => {
      if (!isUpgradeUnlocked(BOT_UPGRADES, def.id, s.botLv)) return false;
      const lv = s.botLv[def.id] ?? 0;
      const cost = upgradeCost(def, lv);
      if (s.money < cost) return false;
      setS((p) => ({
        ...p,
        money: p.money - cost,
        botLv: { ...p.botLv, [def.id]: lv + 1 },
      }));
      sfxBuy();
      return true;
    },
    [s.money, s.botLv]
  );

  const buyCrit = useCallback(
    (def: CritUpgradeDef): boolean => {
      if (!isUpgradeUnlocked(CRIT_UPGRADES, def.id, s.critLv)) return false;
      const lv = s.critLv[def.id] ?? 0;
      if (lv >= def.maxLv) return false;
      const cost = upgradeCost(def, lv);
      if (s.money < cost) return false;
      setS((p) => ({
        ...p,
        money: p.money - cost,
        critLv: { ...p.critLv, [def.id]: lv + 1 },
      }));
      sfxBuy();
      return true;
    },
    [s.money, s.critLv]
  );

  /**
   * Цена контейнера НЕ привязана к машине: startPrice × priceGrowth^открытия —
   * прогрессия как у прокачки. Каждое открытие делает контейнер дороже,
   * поэтому рандом не бесконечно выгоден, но смена авто цену не дёргает.
   */
  const casePrice = useCallback(
    (c: CaseDef) => c.startPrice * Math.pow(c.priceGrowth, s.caseOpens[c.id] ?? 0),
    [s.caseOpens]
  );

  const rollCase = useCallback(
    (c: CaseDef, free = false): Reward | null => {
      const price = casePrice(c);
      if (!free && s.money < price) return null;

      const w = c.weights;
      const total = w.cash + w.boost + w.common + w.rare + w.epic + w.legend;
      let r = Math.random() * total;
      const pick = (key: keyof typeof w) => {
        if (r < w[key]) return true;
        r -= w[key];
        return false;
      };

      let reward: Reward;
      if (pick("cash")) {
        const amount = model.base * (c.cashMin + Math.random() * (c.cashMax - c.cashMin));
        reward = { kind: "cash", amount };
      } else if (pick("boost")) {
        reward = { kind: "boost", mult: c.boostMult, secs: c.boostSecs };
      } else {
        let rarity: Rarity = "common";
        if (pick("common")) rarity = "common";
        else if (pick("rare")) rarity = "rare";
        else if (pick("epic")) rarity = "epic";
        else rarity = "legend";
        const pool = cardsByRarity(rarity);
        const card = pool[Math.floor(Math.random() * pool.length)];
        const dup = (s.cards[card.id] ?? 0) > 0;
        reward = { kind: "card", card, dup, dupCash: dup ? price * (0.8 + Math.random()) : 0 };
      }

      // применяем награду сразу, модалка — только шоу
      setS((p) => {
        const st = {
          ...p,
          money: free ? p.money : p.money - price,
          // бесплатные контейнеры за рекламу не удорожают платные
          caseOpens: free ? p.caseOpens : { ...p.caseOpens, [c.id]: (p.caseOpens[c.id] ?? 0) + 1 },
        };
        if (reward.kind === "cash") {
          st.money += reward.amount;
          st.totalEarned += reward.amount;
        } else if (reward.kind === "boost") {
          st.boostMult = reward.mult;
          st.boostUntil = Date.now() + reward.secs * 1000;
        } else {
          if (reward.dup) {
            st.money += reward.dupCash;
            st.totalEarned += reward.dupCash;
          } else {
            st.cards = { ...p.cards, [reward.card.id]: (p.cards[reward.card.id] ?? 0) + 1 };
          }
        }
        return st;
      });

      if (!free) sfxBuy();
      return reward;
    },
    [s.money, s.cards, model, casePrice]
  );

  const completeAdWatch = useCallback(() => {
    setS((p) => ({ ...p, adReadyAt: Date.now() + AD_COOLDOWN_SECS * 1000 }));
  }, []);

  // ── Инап-покупки ────────────────────────────────────────────

  /** Сумма выдачи расходного товара cash_pile: доля цены следующей машины. */
  const cashPileAmount = useCallback((): number => {
    const base = next ? next.price * CASH_PILE_SHARE : model.base * CASH_PILE_FALLBACK_BASE_MULT;
    return Math.max(1, Math.round(base));
  }, [next, model]);

  /** Начислить наличные (расходная покупка). */
  const grantCash = useCallback((amount: number) => {
    setS((p) => ({ ...p, money: p.money + amount, totalEarned: p.totalEarned + amount }));
    sfxWin();
  }, []);

  /** Активировать постоянный перк (идемпотентно — для постоянных покупок). */
  const grantPerk = useCallback((id: string) => {
    setS((p) => (p.perks[id] ? p : { ...p, perks: { ...p.perks, [id]: 1 } }));
    sfxWin();
  }, []);

  /** Проверка / отметка выданных покупок — защита от двойной выдачи (п. 1.13.1). */
  const isTokenGranted = useCallback(
    (token: string) => !!stateRef.current.grantedTokens[token],
    []
  );
  const markTokenGranted = useCallback((token: string) => {
    setS((p) => (p.grantedTokens[token] ? p : { ...p, grantedTokens: { ...p.grantedTokens, [token]: 1 } }));
  }, []);

  /**
   * Смена языка игроком вручную (п. 6.9). Запоминаем не только сам язык, но и
   * код языка платформы на момент выбора: пока он не изменился, выбор игрока
   * приоритетнее автоопределения; при смене языка платформы (в т. ч. моком на
   * debug-панели модерации) снова выигрывает SDK (п. 2.14).
   */
  const setLang = useCallback(
    (l: Lang) => {
      const pinnedOn = pinLangFor(getSdkLang());
      setS((p) => (p.lang === l && p.langPinnedOn === pinnedOn ? p : { ...p, lang: l, langPinnedOn: pinnedOn }));
    },
    []
  );

  // Выбор языка — настройка, а не прогресс: пишем сейв сразу после коммита
  // (в самом setLang нельзя — там состояние ещё старое), не дожидаясь тика
  // автосейва: игрок мог закрыть вкладку через секунду после переключения.
  const langBootstrapped = useRef(false);
  useEffect(() => {
    if (!langBootstrapped.current) {
      langBootstrapped.current = true;
      return; // первый рендер — язык пришёл из сейва/SDK, сохранять нечего
    }
    saveNow();
  }, [s.lang, s.langPinnedOn, saveNow]);

  const canPrestige = s.modelIndex === MODELS.length - 1;

  const prestigeReset = useCallback(() => {
    setS((p) => ({
      ...initialState(),
      sound: p.sound,
      lang: p.lang,
      langPinnedOn: p.langPinnedOn,
      grantedTokens: p.grantedTokens,
      introSeen: true,
      prestige: p.prestige + 1,
    }));
    sfxWin();
  }, []);

  const toggleSound = useCallback(() => setS((p) => ({ ...p, sound: !p.sound })), []);
  const markIntroSeen = useCallback(() => setS((p) => ({ ...p, introSeen: true })), []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch { /* noop */ }
    // язык и отметка о ручном выборе — настройки, а не прогресс: переживают полный сброс
    setS((p) => ({ ...initialState(), lang: p.lang, langPinnedOn: p.langPinnedOn }));
  }, []);

  const totalCardPct = useMemo(
    () => CARDS.reduce((acc, c) => acc + c.pct * (s.cards[c.id] ?? 0), 0),
    [s.cards]
  );

  return {
    s,
    model,
    next,
    cardMult,
    totalCardPct,
    clickPower,
    cps,
    botClicks,
    botIncome,
    botSpeedMult,
    critChance,
    critMult,
    boostActive,
    prestigeMult,
    canPrestige,
    offlineGain,
    paused,
    setPaused,
    setLang,
    isFresh: loaded.isFresh,
    click,
    saveNow,
    perkMult,
    cashPileAmount,
    grantCash,
    grantPerk,
    isTokenGranted,
    markTokenGranted,
    buyNext,
    buyUpgrade,
    buyBot,
    buyCrit,
    rollCase,
    casePrice,
    completeAdWatch,
    prestigeReset,
    toggleSound,
    markIntroSeen,
    reset,
  };
}
