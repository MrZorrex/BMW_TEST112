// ─────────────────────────────────────────────────────────────
//  Данные игры «Перекуп BMW»
// ─────────────────────────────────────────────────────────────

import { A } from "../utils/assets";

export interface CarModel {
  id: string;
  name: string;
  years: string;
  year: number;
  era: string;
  base: number; // базовый доход за клик, ₽
  price: number; // цена выкупа, ₽
  img: string;
  tint: string; // акцентный цвет эпохи
  desc: string;
}



export const MODELS: CarModel[] = [
  {
    id: "dixi",
    name: "BMW 3/15 (Dixi)",
    years: "1928–1932",
    year: 1928,
    era: "1920-е",
    base: 1,
    price: 0,
    img: A("/models/dixi.jpg"),
    tint: "#8fa3b8",
    desc: "Первая автомобильная модель BMW — лицензионный Austin Seven. С этого «карлика» началась великая история.",
  },
  {
    id: "bmw303",
    name: "BMW 303",
    years: "1933–1934",
    year: 1933,
    era: "1930-е",
    base: 6,
    price: 200,
    img: A("/models/bmw303.jpg"),
    tint: "#5a6fa8",
    desc: "Первый самостоятельный автомобиль BMW: первый рядный «шестицилиндровик» и те самые ноздри решётки.",
  },
  {
    id: "bmw328",
    name: "BMW 328",
    years: "1936–1940",
    year: 1936,
    era: "1930-е",
    base: 25,
    price: 1800,
    img: A("/models/bmw328.jpg"),
    tint: "#c9d4e0",
    desc: "Легендарный родстер, громивший Mille Miglia. Икона довоенного автоспорта и первая гоночная легенда марки.",
  },
  {
    id: "bmw335",
    name: "BMW 335",
    years: "1939–1941",
    year: 1939,
    era: "1930-е",
    base: 110,
    price: 14000,
    img: A("/models/bmw335.jpg"),
    tint: "#3f7d5d",
    desc: "Полноразмерный флагман с 3,5-литровой «шестёркой» — самый мощный довоенный BMW.",
  },
  {
    id: "isetta",
    name: "BMW Isetta",
    years: "1953–1962",
    year: 1953,
    era: "1950-е",
    base: 480,
    price: 75000,
    img: A("/models/isetta.jpg"),
    tint: "#f2b24a",
    desc: "Микрокар-«пузырёк» с единственной дверью спереди. Именно он спас BMW от банкротства в 50-х.",
  },
  {
    id: "bmw502",
    name: "BMW 502",
    years: "1954–1963",
    year: 1954,
    era: "1950-е",
    base: 2000,
    price: 480_000,
    img: A("/models/bmw502.jpg"),
    tint: "#7fa8d9",
    desc: "«Барочный ангел» — первый послевоенный немецкий автомобиль с V8. Роскошь эпохи восстановления.",
  },
  {
    id: "bmw507",
    name: "BMW 507",
    years: "1956–1959",
    year: 1956,
    era: "1950-е",
    base: 9000,
    price: 4_200_000,
    img: A("/models/bmw507.jpg"),
    tint: "#e8e9ec",
    desc: "Родстер, за которым охотился сам Элвис. Сегодня — один из самых дорогих коллекционных BMW в мире.",
  },
  {
    id: "bmw700",
    name: "BMW 700",
    years: "1959–1965",
    year: 1959,
    era: "1950-е",
    base: 40000,
    price: 33_000_000,
    img: A("/models/bmw700.jpg"),
    tint: "#f0e0b8",
    desc: "Компакт, который продавался сотнями тысяч и второй раз вытащил компанию с края пропасти.",
  },
  {
    id: "bmw1500",
    name: "BMW 1500 (New Class)",
    years: "1962–1972",
    year: 1962,
    era: "1960-е",
    base: 180000,
    price: 230_000_000,
    img: A("/models/bmw1500.jpg"),
    tint: "#8fb4d9",
    desc: "«Новый класс» заложил современную ДНК BMW: спортивный люксовый седан, спасший фирму в третий раз.",
  },
  {
    id: "bmw2002",
    name: "BMW 2002",
    years: "1968–1977",
    year: 1968,
    era: "1960-е",
    base: 800000,
    price: 1_800_000_000,
    img: A("/models/bmw2002.jpg"),
    tint: "#ff8c3b",
    desc: "Культовый компакт из серии 02. Его версия Turbo стала первым серийным турбо-автомобилем Европы.",
  },
  {
    id: "csl30",
    name: "BMW 3.0 CSL (E9)",
    years: "1971–1975",
    year: 1971,
    era: "1970-е",
    base: 3_500_000,
    price: 13_000_000_000,
    img: A("/models/csl30.jpg"),
    tint: "#e8e8ea",
    desc: "«Бэтмобиль» с огромным антикрылом. Легенда кузовных гонок и родоначальник духа BMW M.",
  },
  {
    id: "e21",
    name: "BMW 3 Series (E21)",
    years: "1975–1983",
    year: 1975,
    era: "1970-е",
    base: 16_000_000,
    price: 110_000_000_000,
    img: A("/models/bmwe21.jpg"),
    tint: "#ff7a29",
    desc: "Первая «трёшка» в истории. Начало самой успешной династии спортивных седанов планеты.",
  },
  {
    id: "bmwm1",
    name: "BMW M1",
    years: "1978–1981",
    year: 1978,
    era: "1970-е",
    base: 75_000_000,
    price: 950_000_000_000,
    img: A("/models/bmwm1.jpg"),
    tint: "#f2f2f4",
    desc: "Среднемоторный суперкар, рождённый вместе с Lamborghini. Единственный серийный суперкар BMW.",
  },
  {
    id: "m3e30",
    name: "BMW M3 (E30)",
    years: "1986–1991",
    year: 1986,
    era: "1980-е",
    base: 330_000_000,
    price: 7_500_000_000_000,
    img: A("/models/m3e30.jpg"),
    tint: "#e33636",
    desc: "Омологационный зверь DTM. Один из самых желанных классических BMW на планете.",
  },
  {
    id: "m5e34",
    name: "BMW M5 (E34)",
    years: "1988–1996",
    year: 1988,
    era: "1980-е",
    base: 1_400_000_000,
    price: 62_000_000_000_000,
    img: A("/models/m5e34.jpg"),
    tint: "#d23c3c",
    desc: "Последняя «пятёрка» ручной сборки из Гархинга. Спортивный седан, ставший эталоном жанра.",
  },
  {
    id: "e850i",
    name: "BMW 850i (E31)",
    years: "1989–1999",
    year: 1989,
    era: "1980-е",
    base: 6_200_000_000,
    price: 520_000_000_000_000,
    img: A("/models/e850i.jpg"),
    tint: "#3d5474",
    desc: "Высокотехнологичное купе с V12 и выезжающими фарами. Космический корабль конца 80-х.",
  },
  {
    id: "bmwx5",
    name: "BMW X5 (E53)",
    years: "1999–2006",
    year: 1999,
    era: "1990-е",
    base: 27_000_000_000,
    price: 4_400_000_000_000_000,
    img: A("/models/bmwx5.jpg"),
    tint: "#dfe7ef",
    desc: "Первый кроссовер марки. BMW придумала формулу SAV — и захватила новый рынок.",
  },
  {
    id: "m3e46",
    name: "BMW M3 (E46)",
    years: "2000–2006",
    year: 2000,
    era: "2000-е",
    base: 120_000_000_000,
    price: 37_000_000_000_000_000,
    img: A("/models/m3e46.jpg"),
    tint: "#ffd23f",
    desc: "Современная классика: атмосферная рядная «шестёрка» S54 и идеальный баланс.",
  },
  {
    id: "bmwz4",
    name: "BMW Z4 (E85)",
    years: "2002–2008",
    year: 2002,
    era: "2000-е",
    base: 520_000_000_000,
    price: 310_000_000_000_000_000,
    img: A("/models/bmwz4.jpg"),
    tint: "#eef2f7",
    desc: "Родстер «пылающего дизайна» Криса Бэнгла. На дебюте получил награду «Дизайн года».",
  },
  {
    id: "bmwi8",
    name: "BMW i8",
    years: "2014–2020",
    year: 2014,
    era: "2010-е",
    base: 2_300_000_000_000,
    price: 2_700_000_000_000_000_000,
    img: A("/models/bmwi8.jpg"),
    tint: "#57c7ff",
    desc: "Плагин-гибридный спорткар из будущего, с дверями-крыльями и карбоновой клетью.",
  },
  {
    id: "bmwm4",
    name: "BMW M4 (G82)",
    years: "2020 — н.в.",
    year: 2020,
    era: "2020-е",
    base: 10_000_000_000_000,
    price: 24_000_000_000_000_000_000,
    img: A("/models/bmwm4.jpg"),
    tint: "#c8f04a",
    desc: "Спорная решётка, бесспорный характер: 510 сил, задний привод и дрифт-режим.",
  },
  {
    id: "bmwxm",
    name: "BMW XM",
    years: "2022 — н.в.",
    year: 2022,
    era: "2020-е",
    base: 45_000_000_000_000,
    price: 210_000_000_000_000_000_000,
    img: A("/models/bmwxm.jpg"),
    tint: "#8a93a3",
    desc: "Первый самостоятельный проект подразделения M со времён M1: 653 силы гибридной ярости.",
  },
  {
    id: "neueklasse",
    name: "BMW i3 Neue Klasse",
    years: "2026",
    year: 2026,
    era: "2020-е",
    base: 200_000_000_000_000,
    price: 1_800_000_000_000_000_000_000,
    img: A("/models/neueklasse.jpg"),
    tint: "#9adfff",
    desc: "Электрическое будущее марки: платформа Neue Klasse, 800 вольт и новая эра дизайна.",
  },
];

export const ERAS = ["1920-е", "1930-е", "1940-е", "1950-е", "1960-е", "1970-е", "1980-е", "1990-е", "2000-е", "2010-е", "2020-е"];

// ── Престиж (новый круг) ────────────────────────────────────

export const PRESTIGE_BONUS = 0.4; // +40% ко всему доходу за каждый пройденный круг

// ── Реклама ─────────────────────────────────────────────────

export const AD_COOLDOWN_SECS = 150; // 2.5 минуты между просмотрами
export const AD_DURATION_SECS = 7; // длительность «рекламы»

// ── Криты ───────────────────────────────────────────────────

export const CRIT_BASE_CHANCE = 0.05;
export const CRIT_BASE_MULT = 3;

// ── Рост отдачи прокачки ────────────────────────────────────
// Каждый следующий уровень апгрейда даёт на 3% больше предыдущего
export const LEVEL_GROWTH = 1.03;

/** Сколько даст СЛЕДУЮЩИЙ уровень (lv — текущий уровень) */
export const levelGain = (base: number, lv: number) => base * Math.pow(LEVEL_GROWTH, lv);

/** Суммарный вклад всех купленных уровней */
export const levelTotal = (base: number, lv: number) =>
  lv <= 0 ? 0 : (base * (Math.pow(LEVEL_GROWTH, lv) - 1)) / (LEVEL_GROWTH - 1);

/** Следующее улучшение в категории открывается на этом уровне предыдущего */
export const UPGRADE_UNLOCK_LV = 5;

/** Сколько улучшений в цепочке уже открыто (первое всегда доступно). */
export function unlockedCount(defs: { id: string }[], lv: Record<string, number>): number {
  let n = 1;
  for (let i = 0; i < defs.length - 1; i++) {
    if ((lv[defs[i].id] ?? 0) >= UPGRADE_UNLOCK_LV) n += 1;
    else break;
  }
  return Math.min(n, defs.length);
}

/** Можно ли покупать улучшение: предыдущее в той же категории прокачано до порога. */
export function isUpgradeUnlocked(defs: { id: string }[], id: string, lv: Record<string, number>): boolean {
  const i = defs.findIndex((d) => d.id === id);
  if (i <= 0) return i === 0;
  return (lv[defs[i - 1].id] ?? 0) >= UPGRADE_UNLOCK_LV;
}

// ── Прокачка клика ────────────────────────────────────────────

export interface UpgradeDef {
  id: string;
  name: string;
  flavor: string;
  pct: number; // доля от базы модели за уровень
  cost: number; // стартовая цена
  growth: number; // рост цены за уровень
  icon: string;
}

export const CLICK_UPGRADES: UpgradeDef[] = [
  { id: "wash", name: "Мойка до блеска", flavor: "Чистая тачка продаёт сама себя", pct: 0.12, cost: 40, growth: 4.6, icon: "Droplets" },
  { id: "dryclean", name: "Химчистка салона", flavor: "Запах нового авто — из баллончика", pct: 0.18, cost: 650, growth: 4.7, icon: "Sparkles" },
  { id: "polish", name: "Полировка фар", flavor: "Взгляд уверенный, как у акулы", pct: 0.3, cost: 12_000, growth: 4.8, icon: "Flashlight" },
  { id: "paint", name: "Локальная покраска", flavor: "Ни одного скола. Почти", pct: 0.55, cost: 190_000, growth: 4.9, icon: "Paintbrush" },
  { id: "leather", name: "Перетяжка в кожу", flavor: "Клиент плачет — но платит", pct: 1, cost: 3_200_000, growth: 5.0, icon: "Armchair" },
  { id: "ceramic", name: "Керамика + тонер", flavor: "Блестит даже ночью", pct: 1.8, cost: 52_000_000, growth: 5.1, icon: "Shield" },
  { id: "stage2", name: "Stage 2 тюнинг", flavor: "Пацаны с района одобряют", pct: 3.2, cost: 900_000_000, growth: 5.2, icon: "Gauge" },
  { id: "photoset", name: "Профи-фотосет", flavor: "Объявление собирает миллион просмотров", pct: 6, cost: 17_000_000_000, growth: 5.3, icon: "Camera" },
];

export const AUTO_UPGRADES: UpgradeDef[] = [
  { id: "avito", name: "Объявление на Авито", flavor: "«Не битый, не крашеный»", pct: 0.06, cost: 260, growth: 4.6, icon: "Megaphone" },
  { id: "student", name: "Студент-наводчик", flavor: "Приводит клиентов за процент", pct: 0.11, cost: 5600, growth: 4.7, icon: "GraduationCap" },
  { id: "market", name: "Свой человек на рынке", flavor: "Знает, кому что впарить", pct: 0.18, cost: 88_000, growth: 4.8, icon: "Handshake" },
  { id: "manager", name: "Менеджер по продажам", flavor: "Продаёт даже зимой", pct: 0.32, cost: 1_500_000, growth: 4.9, icon: "Briefcase" },
  { id: "showroom", name: "Автосалон у МКАД", flavor: "Кофе, кожа, кредит за 5 минут", pct: 0.6, cost: 28_000_000, growth: 5.0, icon: "Store" },
  { id: "network", name: "Дилерская сеть", flavor: "Салоны в трёх городах", pct: 1.1, cost: 520_000_000, growth: 5.1, icon: "Network" },
  { id: "import", name: "Импорт из Европы", flavor: "Пригоняем под заказ", pct: 2, cost: 10_000_000_000, growth: 5.2, icon: "Ship" },
  { id: "export", name: "Экспорт в Дубай", flavor: "Шейхи берут два", pct: 3.6, cost: 180_000_000_000, growth: 5.3, icon: "Plane" },
];

// ── Автокликер ────────────────────────────────────────────────

export interface BotUpgradeDef {
  id: string;
  name: string;
  flavor: string;
  cps: number; // автокликов в секунду за уровень
  cost: number;
  growth: number;
  icon: string;
}

export const BOT_UPGRADES: BotUpgradeDef[] = [
  { id: "nephew", name: "Племянник с мышкой", flavor: "Работает за пиццу", cps: 0.15, cost: 1800, growth: 4.7, icon: "MousePointer2" },
  { id: "button2000", name: "Кнопка-автомат 2000", flavor: "Тяжёлая, зато честная", cps: 0.35, cost: 38_000, growth: 4.85, icon: "ToggleRight" },
  { id: "robot", name: "Робот-перекуп", flavor: "Не спит, не паникует", cps: 0.9, cost: 800_000, growth: 5.0, icon: "Bot" },
  { id: "neuro", name: "Нейроторг", flavor: "Торгуется лучше тебя", cps: 2.2, cost: 19_000_000, growth: 5.15, icon: "Brain" },
  { id: "server", name: "Серверная на районе", flavor: "Кликает со всего города", cps: 6, cost: 450_000_000, growth: 5.3, icon: "Server" },
];

// ── Прокачка крита ────────────────────────────────────────────

export interface CritUpgradeDef {
  id: "critChance" | "critPower";
  name: string;
  flavor: string;
  step: number; // прирост за уровень
  maxLv: number;
  cost: number;
  growth: number;
  icon: string;
}

export const CRIT_UPGRADES: CritUpgradeDef[] = [
  {
    id: "critChance",
    name: "Чуйка на клиента",
    flavor: "Видишь, кто готов переплатить",
    step: 0.006, // +0.6% шанса
    maxLv: 15,
    cost: 7000,
    growth: 4.4,
    icon: "Eye",
  },
  {
    id: "critPower",
    name: "Козырь в рукаве",
    flavor: "«Только для вас, по-братски»",
    step: 0.35, // +0.35× к множителю
    maxLv: 12,
    cost: 34_000,
    growth: 4.6,
    icon: "Swords",
  },
];

// ── Удача (контейнеры и карты) ────────────────────────────────

export type Rarity = "common" | "rare" | "epic" | "legend";

export const RARITY_META: Record<Rarity, { label: string; color: string; glow: string }> = {
  common: { label: "Обычная", color: "#9fb2c8", glow: "rgba(159,178,200,.35)" },
  rare: { label: "Редкая", color: "#5aa9ff", glow: "rgba(90,169,255,.45)" },
  epic: { label: "Эпическая", color: "#c58bff", glow: "rgba(197,139,255,.5)" },
  legend: { label: "Легенда", color: "#f5c542", glow: "rgba(245,197,66,.55)" },
};

export interface CardDef {
  id: string;
  name: string;
  rarity: Rarity;
  pct: number; // постоянный бонус ко ВСЕМУ доходу
  botPct?: number; // постоянный бонус к скорости автокликера
  critPct?: number; // постоянный бонус к шансу крита
  img?: string;
  note: string;
}

export const CARDS: CardDef[] = [
  { id: "kofe", name: "Кофе из салона", rarity: "common", pct: 0.015, img: A("/cards/kofe.jpg"), note: "Клиент расслаблен — торг легче" },
  { id: "elochka", name: "Пахучая ёлочка", rarity: "common", pct: 0.015, img: A("/cards/elochka.jpg"), note: "Новая машина пахнет именно так" },
  { id: "nomera", name: "Красивые номера", rarity: "common", pct: 0.015, img: A("/cards/nomera.jpg"), note: "А777АА продают сами себя" },
  { id: "turbo2002", name: "BMW 2002 Turbo", rarity: "rare", pct: 0.06, img: A("/models/bmw2002.jpg"), note: "Первый турбо серийник Европы" },
  { id: "z1", name: "BMW Z1", rarity: "rare", pct: 0.06, img: A("/cards/z1.jpg"), note: "Двери уезжают вниз. Магия" },
  { id: "csi850", name: "BMW 850CSi", rarity: "rare", pct: 0.06, img: A("/models/e850i.jpg"), note: "V12, механика, легенда 90-х" },
  { id: "mechhand", name: "Механическая рука", rarity: "rare", pct: 0, botPct: 0.35, img: A("/cards/mechhand.jpg"), note: "Автокликер работает бодрее" },
  { id: "luckycoin", name: "Счастливая монета", rarity: "rare", pct: 0, critPct: 0.01, img: A("/cards/luckycoin.jpg"), note: "+1% к шансу крита" },
  { id: "m3e30c", name: "BMW M3 (E30)", rarity: "epic", pct: 0.11, img: A("/models/m3e30.jpg"), note: "Король DTM" },
  { id: "m5e34c", name: "BMW M5 (E34)", rarity: "epic", pct: 0.11, img: A("/models/m5e34.jpg"), note: "Ручная сборка, Гархинг" },
  { id: "z4m", name: "BMW Z4 M Coupé", rarity: "epic", pct: 0.11, img: A("/models/bmwz4.jpg"), note: "Двигатель S54 и улыбка" },
  { id: "bot3000", name: "Автокликер X-3000", rarity: "epic", pct: 0, botPct: 0.6, img: A("/cards/bot3000.jpg"), note: "Запрещён в трёх странах" },
  { id: "goldtongue", name: "Золотой язык", rarity: "epic", pct: 0, critPct: 0.02, img: A("/cards/goldtongue.jpg"), note: "+2% к шансу крита" },
  { id: "m1c", name: "BMW M1", rarity: "legend", pct: 0.2, img: A("/models/bmwm1.jpg"), note: "Суперкар, рождённый M GmbH" },
  { id: "c507", name: "BMW 507", rarity: "legend", pct: 0.2, img: A("/models/bmw507.jpg"), note: "Родстер Элвиса Пресли" },
  { id: "cslc", name: "BMW 3.0 CSL «Бэтмобиль»", rarity: "legend", pct: 0.2, img: A("/models/csl30.jpg"), note: "Антикрыло, победы, культ" },
];

export interface CaseDef {
  id: string;
  name: string;
  tagline: string;
  /**
   * Цена НЕ зависит от выкупленной машины: startPrice × priceGrowth^открытия —
   * та же модель прогрессии, что и у прокачки (cost × growth^уровень).
   */
  startPrice: number;
  /** Во сколько раз дорожает контейнер после каждого открытия */
  priceGrowth: number;
  cashMin: number; // кэш-дроп: mult × база
  cashMax: number;
  boostMult: number;
  boostSecs: number;
  weights: { cash: number; boost: number; common: number; rare: number; epic: number; legend: number };
}

export const CASES: CaseDef[] = [
  {
    id: "tolyatti",
    name: "Контейнер из Тольятти",
    tagline: "Суровый рандом авторынка",
    // Доступен почти сразу (старт ~3 цены Dixi→303), растёт средне: +50% за открытие.
    startPrice: 600,
    priceGrowth: 1.5,
    cashMin: 100,
    cashMax: 340,
    boostMult: 2,
    boostSecs: 75,
    weights: { cash: 30, boost: 24, common: 27, rare: 13, epic: 4.5, legend: 1.5 },
  },
  {
    id: "munich",
    name: "Контейнер из Мюнхена",
    tagline: "Прямиком с автосалона на Петровке",
    // Премиум: старт в 3.75× дороже Тольятти, зато рост чуть мягче (+48% за
    // открытие) — в прогрессии держится в коридоре 3–4 цены Тольятти. Первый
    // контейнер открывается в эре 328, дальше машины дорожают быстрее цены —
    // хотя бы одно открытие за 1–2 машины гарантировано.
    startPrice: 2250,
    priceGrowth: 1.48,
    cashMin: 800,
    cashMax: 2600,
    boostMult: 3,
    boostSecs: 100,
    weights: { cash: 16, boost: 18, common: 15, rare: 24, epic: 17, legend: 10 },
  },
];

export const cardsByRarity = (r: Rarity) => CARDS.filter((c) => c.rarity === r);
