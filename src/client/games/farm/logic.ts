/**
 * 开心农场纯逻辑：网格田地状态机（荒地→翻土→已播种→生长中→成熟→收获）、
 * 三种作物（萝卜/番茄/南瓜，生长 tick 数与售价各自不同）、按天轮转的随机
 * 天气（雨=全场自动浇水 / 旱=需浇两次 / 晴=一次）、周期 ±40% 加 seed 噪声
 * 的市场行情（种子买价与作物卖价随同一指数浮动——低买种子高卖收成）。
 * 一天 = 固定 DAY_TICKS 个 tick；一关在 N 天内赚到目标金额即胜。全部为
 * 确定性纯函数（随机走注入 seed 的 mulberry32，玩家动作不消耗随机数），
 * 无 DOM、无计时器。
 */

/** 作物 id。 */
export type CropId = 'carrot' | 'tomato' | 'pumpkin'

/** 一种作物的经济与生长参数。 */
export interface CropSpec {
  /** 中文短名。 */
  name: string
  /** 从进入生长中到成熟所需 tick 数。 */
  growTicks: number
  /** 种子基准价（市场 ×1 时的买价）。 */
  seedCost: number
  /** 收成基准卖价（市场 ×1 时的售价）。 */
  sellPrice: number
  /** 果实色（渲染层与粒子共用）。 */
  color: string
}

/** 三种作物：萝卜快利薄 / 番茄中等 / 南瓜慢利厚。 */
export const CROPS: Record<CropId, CropSpec> = {
  carrot: { name: '萝卜', growTicks: 4, seedCost: 5, sellPrice: 10, color: '#ff9e64' },
  tomato: { name: '番茄', growTicks: 6, seedCost: 8, sellPrice: 17, color: '#f7768e' },
  pumpkin: { name: '南瓜', growTicks: 9, seedCost: 12, sellPrice: 30, color: '#e0af68' },
}

/** 作物选择循环顺序（Q 键切换）。 */
export const CROP_ORDER: CropId[] = ['carrot', 'tomato', 'pumpkin']

/** 一关的难度参数。 */
export interface FarmLevel {
  /** 田块列数。 */
  cols: number
  /** 田块行数。 */
  rows: number
  /** 目标金额（金钱 ≥ 此值过关）。 */
  target: number
  /** 总天数（回合数）。 */
  days: number
  /** 每天抽中干旱的概率（随关卡恶化）。 */
  droughtChance: number
}

/** 5 关递进：目标金额上涨、田块变大、干旱概率恶化。 */
export const LEVELS: FarmLevel[] = [
  { cols: 4, rows: 4, target: 120, days: 8, droughtChance: 0.12 },
  { cols: 4, rows: 4, target: 260, days: 10, droughtChance: 0.22 },
  { cols: 5, rows: 4, target: 450, days: 11, droughtChance: 0.32 },
  { cols: 5, rows: 5, target: 700, days: 12, droughtChance: 0.42 },
  { cols: 6, rows: 5, target: 1000, days: 13, droughtChance: 0.52 },
]

/** 一天包含的 tick 数。 */
export const DAY_TICKS = 20
/** 逻辑 tick 间隔（毫秒，index 层按 dt 累加驱动）。 */
export const TICK_MS = 550
/** 市场周期（tick 数）：正弦分量一个完整周期。 */
export const PRICE_PERIOD = 30
/** 市场正弦分量幅度（±40%）。 */
export const PRICE_SWING = 0.4
/** 市场 seed 噪声幅度（±15%）。 */
export const PRICE_NOISE = 0.15
/** 市场倍率上下限。 */
export const PRICE_MIN = 0.6
export const PRICE_MAX = 1.4
/** 下雨概率（非干旱份额内）。 */
export const RAIN_CHANCE = 0.18
/** 开局金钱。 */
export const START_MONEY = 40
/** 开局赠送的萝卜种子数。 */
export const START_SEEDS = 3

/** 田块状态机：荒地→翻土→已播种→生长中→成熟（收获后回到翻土）。 */
export type TileState = 'wasteland' | 'tilled' | 'planted' | 'growing' | 'mature'

/** 当天天气。 */
export type Weather = 'sunny' | 'rain' | 'drought'

/** 一块田地。 */
export interface FarmTile {
  state: TileState
  /** 已播种的作物；未播种为 null。 */
  crop: CropId | null
  /** 浇水满足次数。 */
  waterCount: number
  /** 当前天气要求的浇水次数（晴/雨 1，旱 2；换天时未浇水的重算）。 */
  waterNeed: number
  /** 生长中已推进的 tick 数。 */
  growth: number
}

/** 一局状态。 */
export interface FarmState {
  phase: 'playing' | 'won' | 'lost'
  /** 0 起的关卡下标。 */
  levelIndex: number
  /** 当前天数（1 起）。 */
  day: number
  /** 今天已流逝 tick 数。 */
  tickInDay: number
  /** 开局以来的总 tick 数。 */
  tickTotal: number
  /** 今天天气。 */
  weather: Weather
  money: number
  /** 当前市场倍率。 */
  marketMult: number
  /** 每个 tick（含开局）的市场倍率历史，渲染层画走势。 */
  marketHistory: number[]
  /** 按行优先排列的田块。 */
  tiles: FarmTile[]
  /** 种子库存。 */
  seedStock: Record<CropId, number>
  /** 当前待种作物（点击已翻土地块时消耗其一）。 */
  selectedCrop: CropId
  rng: () => number
}

/**
 * mulberry32 确定性伪随机数发生器（与 burger/avalanche 同构造）。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 抽一天天气：先判干旱，再在余下份额里按 RAIN_CHANCE 判雨。
 * @param rng - 注入的随机源（消耗一次）。
 * @param droughtChance - 本关干旱概率。
 * @returns 今日天气。
 */
export function rollWeather(rng: () => number, droughtChance: number): Weather {
  const r = rng()
  if (r < droughtChance) return 'drought'
  if (r < droughtChance + RAIN_CHANCE) return 'rain'
  return 'sunny'
}

/**
 * 第 tickTotal 个 tick 的市场倍率：1 ± 40% 正弦周期 + seed 噪声，钳制在
 * [PRICE_MIN, PRICE_MAX]。
 * @param tickTotal - 开局以来的总 tick 数。
 * @param rng - 注入的随机源（消耗一次，噪声）。
 * @returns 本 tick 的市场倍率。
 */
export function computeMarketMult(tickTotal: number, rng: () => number): number {
  const base = 1 + PRICE_SWING * Math.sin((2 * Math.PI * tickTotal) / PRICE_PERIOD)
  const noise = (rng() - 0.5) * 2 * PRICE_NOISE
  return Math.min(PRICE_MAX, Math.max(PRICE_MIN, base + noise))
}

/**
 * 当前买一颗种子的实付价。
 * @param state - 游戏状态。
 * @param crop - 作物 id。
 * @returns 取整后的买价。
 */
export function seedBuyCost(state: FarmState, crop: CropId): number {
  return Math.max(1, Math.round(CROPS[crop].seedCost * state.marketMult))
}

/**
 * 当前卖出一茬收成的实收价。
 * @param state - 游戏状态。
 * @param crop - 作物 id。
 * @returns 取整后的卖价。
 */
export function cropSellPrice(state: FarmState, crop: CropId): number {
  return Math.round(CROPS[crop].sellPrice * state.marketMult)
}

/**
 * 创建一关初始状态：首日天气与首 tick 市场倍率即行确定（消耗两次 rng），
 * 田块全部为荒地。
 * @param seed - 注入的随机种子，同种子逐局可复现。
 * @param levelIndex - 0 起的关卡下标（越界钳到最后一关）。
 * @returns 就绪的 FarmState（phase='playing'）。
 */
export function createFarmState(seed: number, levelIndex: number): FarmState {
  const idx = Math.min(LEVELS.length - 1, Math.max(0, levelIndex))
  const level = LEVELS[idx]!
  const rng = mulberry32(seed)
  const mult = computeMarketMult(0, rng)
  return {
    phase: 'playing',
    levelIndex: idx,
    day: 1,
    tickInDay: 0,
    tickTotal: 0,
    weather: rollWeather(rng, level.droughtChance),
    money: START_MONEY,
    marketMult: mult,
    marketHistory: [mult],
    tiles: Array.from({ length: level.cols * level.rows }, () => ({
      state: 'wasteland', crop: null, waterCount: 0, waterNeed: 1, growth: 0,
    })),
    seedStock: { carrot: START_SEEDS, tomato: 0, pumpkin: 0 },
    selectedCrop: 'carrot',
    rng,
  }
}

/** actOnTile 的语境化动作结果。 */
export type TileActionResult =
  | 'tilled' | 'planted' | 'watered' | 'harvested'
  | 'rain-free' | 'no-seed' | 'not-ready' | 'busy'

/**
 * 点击田块的语境化下一动作：荒地→翻土；翻土→播种（消耗所选种子）；
 * 已播种→浇水（雨天免浇）；生长中→无操作；成熟→收获并按当前市价卖出。
 * @param state - 游戏状态，原地更新（收获可能触发过关）。
 * @param index - 田块下标（越界返回 'busy'）。
 * @returns 动作结果，供渲染层给粒子/提示。
 */
export function actOnTile(state: FarmState, index: number): TileActionResult {
  if (state.phase !== 'playing') return 'busy'
  const tile = state.tiles[index]
  if (tile === undefined) return 'busy'
  if (tile.state === 'wasteland') {
    tile.state = 'tilled'
    return 'tilled'
  }
  if (tile.state === 'tilled') {
    if (state.seedStock[state.selectedCrop] <= 0) return 'no-seed'
    state.seedStock[state.selectedCrop] -= 1
    tile.state = 'planted'
    tile.crop = state.selectedCrop
    tile.waterCount = 0
    tile.waterNeed = state.weather === 'drought' ? 2 : 1
    tile.growth = 0
    return 'planted'
  }
  if (tile.state === 'planted') {
    if (state.weather === 'rain') return 'rain-free'
    tile.waterCount += 1
    return 'watered'
  }
  if (tile.state === 'mature') {
    const crop = tile.crop
    if (crop !== null) state.money += cropSellPrice(state, crop)
    tile.state = 'tilled'
    tile.crop = null
    tile.waterCount = 0
    tile.waterNeed = 1
    tile.growth = 0
    if (state.money >= LEVELS[state.levelIndex]!.target) state.phase = 'won'
    return 'harvested'
  }
  return 'not-ready'
}

/**
 * 按当前市价购买一颗所选作物种子（金钱不足返回 false）。
 * @param state - 游戏状态，原地更新。
 * @param crop - 作物 id（同时切换待种作物）。
 * @returns 是否购买成功。
 */
export function buySeed(state: FarmState, crop: CropId): boolean {
  if (state.phase !== 'playing') return false
  const cost = seedBuyCost(state, crop)
  if (state.money < cost) return false
  state.money -= cost
  state.seedStock[crop] += 1
  state.selectedCrop = crop
  return true
}

/**
 * 切换待种作物（仅游戏进行中有效）。
 * @param state - 游戏状态，原地更新。
 * @param crop - 作物 id。
 */
export function selectCrop(state: FarmState, crop: CropId): void {
  if (state.phase === 'playing') state.selectedCrop = crop
}

/**
 * 推进一个逻辑 tick：更新市场 → 雨天自动浇满已播地块 → 满足浇水的转入
 * 生长中 → 生长推进/成熟；当天 tick 用尽则换天（重抽天气、重算未浇地块
 * 需水量），总天数用尽按金钱判胜负。
 * @param state - 游戏状态，原地更新。
 */
export function tickFarm(state: FarmState): void {
  if (state.phase !== 'playing') return
  state.tickTotal += 1
  state.marketMult = computeMarketMult(state.tickTotal, state.rng)
  state.marketHistory.push(state.marketMult)
  for (const tile of state.tiles) {
    if (tile.state === 'planted') {
      if (state.weather === 'rain') tile.waterCount = tile.waterNeed
      if (tile.waterCount >= tile.waterNeed) tile.state = 'growing'
    }
    if (tile.state === 'growing') {
      tile.growth += 1
      if (tile.crop !== null && tile.growth >= CROPS[tile.crop].growTicks) {
        tile.state = 'mature'
      }
    }
  }
  state.tickInDay += 1
  if (state.tickInDay < DAY_TICKS) return
  state.tickInDay = 0
  const level = LEVELS[state.levelIndex]!
  if (state.day >= level.days) {
    state.phase = state.money >= level.target ? 'won' : 'lost'
    return
  }
  state.day += 1
  state.weather = rollWeather(state.rng, level.droughtChance)
  for (const tile of state.tiles) {
    if (tile.state === 'planted') {
      tile.waterNeed = state.weather === 'drought' ? 2 : 1
    }
  }
}
