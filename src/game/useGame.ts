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
import { cloudSave, getCloudSnapshot, getPlayerId, getSdkLang, withTimeout } from "./yandex";
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

/** Сохранение = состояние + служебные поля записи. */
type SaveData = Partial<GameState> & {
  /** Время записи (мс). По нему выбирается самое свежее сохранение. */
  savedAt?: number;
  /** id игрока, которому принадлежит запись (гость или аккаунт Яндекса). */
  owner?: string;
};

/** Облако: не чаще раза в 5 с после действий (лимит setData — 100 запросов за 5 мин). */
const CLOUD_GAP_MS = 5_000;
/** Облако без действий игрока (деньги от кликов и пассива) — раз в 20 с. */
const CLOUD_IDLE_MS = 20_000;
/** Локальная копия денег от кликов и пассива. */
const LOCAL_EVERY_MS = 2_000;
/** Оффлайн-доход и приветствие «Пока вас не было» — только после отсутствия от минуты. */
const OFFLINE_MIN_SECS = 60;

function readLocal(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as SaveData) : null;
  } catch {
    return null;
  }
}

const savedTime = (d: SaveData) => (typeof d.savedAt === "number" ? d.savedAt : (d.lastSeen ?? 0));

/**
 * Какое сохранение брать при запуске (п. 1.9, 1.13.3):
 * - есть только одно — его;
 * - локальная копия принадлежит другому игроку (смена аккаунта на этом
 *   устройстве) — верим облаку текущего игрока;
 * - иначе — более свежее по времени записи.
 * Сравнивать «по прогрессу» (totalEarned) нельзя: покупка машины или прокачки
 * его не меняет, а новый круг обнуляет — и свежий локальный сейв проигрывал бы
 * облаку 20-секундной давности, откатывая покупки после обновления страницы.
 */
function pickSave(local: SaveData | null, cloud: SaveData | null): SaveData | null {
  if (!local || !cloud) return local ?? cloud;
  const me = getPlayerId();
  if (me && local.owner && local.owner !== me) return cloud;
  return savedTime(local) > savedTime(cloud) ? local : cloud;
}

/** Прогресс берётся из облака Яндекс Игр или из локального хранилища — см. pickSave. Гостевой режим работает так же. */
function loadState(): { state: GameState; isFresh: boolean } {
  const base = initialState();
  const local = readLocal();
  const cloud = getCloudSnapshot() as SaveData | null;

  const best = pickSave(local, cloud);
  if (!best) return { state: base, isFresh: true };
  // служебные поля записи в состояние игры не попадают
  const { savedAt: _savedAt, owner: _owner, ...bestState } = best;

  // Язык (п. 2.14): из сейва уважаем только ручной выбор игрока (п. 6.9). Если в
  // сейве лежит автоопределённое значение, при следующем запуске язык снова
  // берётся из SDK — иначе проверка переключения языка на debug-панели не проходит.
  const sdkLang = getSdkLang();
  const lang = resolveStartLang(sdkLang, [cloud, local]);
  const pinSource = [cloud, local].find((s) => typeof s?.langPinnedOn === "string");

  return {
    state: {
      ...base,
      ...bestState,
      modelIndex: Math.min(Math.max(0, bestState.modelIndex ?? 0), MODELS.length - 1),
      lang,
      langPinnedOn: pinSource?.langPinnedOn ?? null,
      grantedTokens: bestState.grantedTokens ?? {},
      perks: bestState.perks ?? {},
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
  // округляем до сотых: 3 + 0.35 × 12 в плавающей точке = 7.199999999999999
  const critMult = Math.round((CRIT_BASE_MULT + critPowerDef.step * (s.critLv[critPowerDef.id] ?? 0)) * 100) / 100;

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
    if (secs < OFFLINE_MIN_SECS) return 0; // обычное обновление страницы — не «отсутствие»
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

  // ── Сохранение прогресса (п. 1.9, 1.11, 1.13.3) ─────────────
  // Локальная копия пишется синхронно сразу после каждого значимого действия
  // (эффект по полям прогресса ниже) и каждые 2 с — для денег от кликов и
  // пассива. Облако Яндекс Игр — сразу после действия, но не чаще раза в 5 с,
  // плюс при сворачивании, уходе со страницы и смене ориентации.
  const stateRef = useRef(s);
  stateRef.current = s;
  /** Сохранения выключены: игрок сменил аккаунт, ждём перезагрузки (см. abandonLocal). */
  const savesOff = useRef(false);
  const lastCloudAt = useRef(0);
  const cloudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const snapshot = useCallback((): SaveData => {
    const now = Date.now();
    return { ...stateRef.current, lastSeen: now, savedAt: now, owner: getPlayerId() };
  }, []);

  const writeLocal = useCallback((snap: SaveData) => {
    if (savesOff.current) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(snap));
    } catch {
      /* хранилище недоступно — остаётся облако */
    }
  }, []);

  const pushCloud = useCallback((snap: SaveData): Promise<void> => {
    if (savesOff.current) return Promise.resolve();
    if (cloudTimer.current) {
      clearTimeout(cloudTimer.current);
      cloudTimer.current = null;
    }
    lastCloudAt.current = Date.now();
    return cloudSave(snap, true);
  }, []);

  /** Облако после действия: сразу, если давно не писали, иначе — одним запросом в конце окна. */
  const scheduleCloud = useCallback(() => {
    if (cloudTimer.current || savesOff.current) return;
    const wait = Math.max(0, lastCloudAt.current + CLOUD_GAP_MS - Date.now());
    cloudTimer.current = setTimeout(() => {
      cloudTimer.current = null;
      void pushCloud(snapshot());
    }, wait);
  }, [pushCloud, snapshot]);

  // Запрос сохранения из обработчиков выполняется ПОСЛЕ коммита состояния
  // (эффект ниже): в сейв попадает результат действия, а не состояние до него.
  const [saveReq, setSaveReq] = useState(0);
  const syncWaiters = useRef<Array<() => void>>([]);

  /** Сохранить результат текущего действия: локально — сразу, облако — с троттлингом. */
  const saveNow = useCallback(() => setSaveReq((n) => n + 1), []);

  /**
   * То же, но облако — немедленно и с ожиданием ответа. Для выдачи инап-покупок:
   * сначала выдача зафиксирована в данных игрока, потом консумация (п. 1.13.1).
   */
  const saveNowAndSync = useCallback(
    () =>
      new Promise<void>((resolve) => {
        syncWaiters.current.push(resolve);
        setSaveReq((n) => n + 1);
      }),
    []
  );

  useEffect(() => {
    if (saveReq === 0) return;
    const snap = snapshot();
    writeLocal(snap);
    const waiters = syncWaiters.current.splice(0);
    if (waiters.length > 0) {
      void withTimeout(pushCloud(snap), 6000, "cloud-sync")
        .catch(() => {})
        .finally(() => waiters.forEach((w) => w()));
    } else {
      scheduleCloud();
    }
  }, [saveReq, snapshot, writeLocal, pushCloud, scheduleCloud]);

  // Любое изменение прогресса — покупка машины, прокачка, контейнер, награда за
  // рекламу, новый круг, выдача инапа, настройки — сразу в сохранение (п. 1.9).
  // Деньги от кликов и пассива сюда не входят: их пишет частый таймер ниже.
  const progressBooted = useRef(false);
  useEffect(() => {
    if (!progressBooted.current) {
      progressBooted.current = true;
      return; // первый рендер — состояние только что загружено
    }
    saveNow();
  }, [
    s.modelIndex,
    s.clickLv,
    s.autoLv,
    s.botLv,
    s.critLv,
    s.caseOpens,
    s.cards,
    s.prestige,
    s.perks,
    s.grantedTokens,
    s.adReadyAt,
    s.boostMult,
    s.sound,
    s.introSeen,
    s.lang,
    s.langPinnedOn,
    saveNow,
  ]);

  useEffect(() => {
    const ivLocal = setInterval(() => writeLocal(snapshot()), LOCAL_EVERY_MS);
    const ivCloud = setInterval(() => {
      if (Date.now() - lastCloudAt.current >= CLOUD_IDLE_MS - 500) void pushCloud(snapshot());
    }, CLOUD_IDLE_MS);

    // уход со страницы / сворачивание / поворот: локально — всегда, облако —
    // если есть что отправить (отложенный запрос или прошло больше 2 с)
    const flush = () => {
      const snap = snapshot();
      writeLocal(snap);
      if (cloudTimer.current || Date.now() - lastCloudAt.current > 2000) void pushCloud(snap);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    // п. 1.9 — прогресс не теряется при смене ориентации экрана
    window.addEventListener("orientationchange", flush);

    return () => {
      clearInterval(ivLocal);
      clearInterval(ivCloud);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("orientationchange", flush);
    };
  }, [snapshot, writeLocal, pushCloud]);

  /**
   * Смена игрового аккаунта (диалог выбора аккаунта, sdk-events): локальную копию
   * помечаем устаревшей и до перезагрузки больше ничего не пишем — ни локально,
   * ни в облако. После перезагрузки прогресс берётся из облака выбранного игрока,
   * а локальная копия остаётся только запасной на случай недоступной сети.
   */
  const abandonLocal = useCallback(() => {
    if (cloudTimer.current) {
      clearTimeout(cloudTimer.current);
      cloudTimer.current = null;
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...stateRef.current, savedAt: 0, owner: "" }));
    } catch {
      /* noop */
    }
    savesOff.current = true;
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
  }, []);

  /** Активировать постоянный перк (идемпотентно — для постоянных покупок). */
  const grantPerk = useCallback((id: string) => {
    setS((p) => (p.perks[id] ? p : { ...p, perks: { ...p.perks, [id]: 1 } }));
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

  const canPrestige = s.modelIndex === MODELS.length - 1;

  const prestigeReset = useCallback(() => {
    setS((p) => ({
      ...initialState(),
      sound: p.sound,
      lang: p.lang,
      langPinnedOn: p.langPinnedOn,
      grantedTokens: p.grantedTokens,
      // постоянные инап-перки переживают новый круг — так обещает описание товара (п. 1.13.5)
      perks: p.perks,
      introSeen: true,
      prestige: p.prestige + 1,
    }));
    sfxWin();
  }, []);

  const toggleSound = useCallback(() => setS((p) => ({ ...p, sound: !p.sound })), []);
  const markIntroSeen = useCallback(() => setS((p) => ({ ...p, introSeen: true })), []);

  const reset = useCallback(() => {
    // Язык и ручной выбор языка — настройки, а постоянные перки и отметки
    // выданных покупок — оплаченные товары, а не прогресс: всё это переживает
    // полный сброс. Новое состояние сразу уходит в сохранение (локально и в облако).
    setS((p) => ({
      ...initialState(),
      lang: p.lang,
      langPinnedOn: p.langPinnedOn,
      perks: p.perks,
      grantedTokens: p.grantedTokens,
    }));
    saveNow();
  }, [saveNow]);

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
    saveNowAndSync,
    abandonLocal,
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
