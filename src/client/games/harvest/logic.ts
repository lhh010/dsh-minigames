/**
 * 收获季节纯逻辑：轮作时间线农事规划。6×6 田格 + 一季 12 周，每周 2 个
 * 动作（播种/浇水/收获/休耕）；作物卡池与天气周序列均由注入 seed 的
 * mulberry32 派生，玩家动作不消耗随机数——同一 seed 逐动作重放完全一致。
 * 核心机制：生长计数与过熟腐烂、同科连作减产 30%、肥力消耗与豆科恢复、
 * 旱周需浇水才生长、雨周免费加速、虫周减产、温室格双倍生长；季末按
 * 资产+库存结算并结转盈余进入更难的下一季（共 5 季）。
 * 无 DOM、无计时器，全部为确定性纯函数。
 */

/** 作物 id（卡池候选，共 7 种，每季抽 4）。 */
export type CropId = 'radish' | 'wheat' | 'soybean' | 'cabbage' | 'tomato' | 'corn' | 'pumpkin'

/** 作物科别：同科连作触发减产；豆科收获后恢复肥力。 */
export type CropFamily = 'root' | 'grass' | 'legume' | 'brassica' | 'fruit'

/** 一种作物的经济与生长参数。 */
export interface CropSpec {
  /** 中文短名。 */
  name: string
  /** 科别。 */
  family: CropFamily
  /** 种子买价（播种动作时从资金扣除）。 */
  seedCost: number
  /** 从播种到成熟需要的生长周数。 */
  growWeeks: number
  /** 基准售价（收获产量公式的基数）。 */
  sellPrice: number
  /** 播种时消耗的肥力点。 */
  fertDrain: number
  /** 是否豆科（收获后该格肥力 +30）。 */
  legume: boolean
  /** 果实色（渲染层与粒子共用）。 */
  color: string
}

/** 候选作物全集：快利薄（萝卜/小麦）到慢利厚（南瓜）+ 轮作枢纽豆科。 */
export const CROP_POOL: Record<CropId, CropSpec> = {
  radish: { name: '萝卜', family: 'root', seedCost: 6, growWeeks: 3, sellPrice: 22, fertDrain: 18, legume: false, color: '#ff9e64' },
  wheat: { name: '小麦', family: 'grass', seedCost: 5, growWeeks: 4, sellPrice: 20, fertDrain: 14, legume: false, color: '#e0af68' },
  soybean: { name: '大豆', family: 'legume', seedCost: 8, growWeeks: 4, sellPrice: 30, fertDrain: 0, legume: true, color: '#9ece6a' },
  cabbage: { name: '卷心菜', family: 'brassica', seedCost: 7, growWeeks: 4, sellPrice: 28, fertDrain: 20, legume: false, color: '#73daca' },
  tomato: { name: '番茄', family: 'fruit', seedCost: 10, growWeeks: 5, sellPrice: 42, fertDrain: 24, legume: false, color: '#f7768e' },
  corn: { name: '玉米', family: 'grass', seedCost: 11, growWeeks: 6, sellPrice: 50, fertDrain: 26, legume: false, color: '#ff9e64' },
  pumpkin: { name: '南瓜', family: 'fruit', seedCost: 14, growWeeks: 7, sellPrice: 72, fertDrain: 30, legume: false, color: '#bb9af7' },
}

/** 全部候选作物 id（卡池抽取的固定顺序源）。 */
export const CROP_POOL_IDS: CropId[] = ['radish', 'wheat', 'soybean', 'cabbage', 'tomato', 'corn', 'pumpkin']

/** 每季抽入卡池的作物数。 */
export const POOL_SIZE = 4

/** 当周天气。 */
export type Weather = 'sunny' | 'rain' | 'drought' | 'pest'

/** 天气中文短名（渲染横幅与提示共用）。 */
export const WEATHER_NAME: Record<Weather, string> = {
  sunny: '晴', rain: '雨', drought: '旱', pest: '虫',
}

/** 一季的难度参数。 */
export interface SeasonSpec {
  /** 季末达标金额（资金+库存 ≥ 此值过关）。 */
  target: number
  /** 天气权重（晴/雨/旱/虫，逐季恶化）。 */
  weights: Record<Weather, number>
  /** 温室格数量（双倍生长）。 */
  greenhouses: number
}

/** 5 季递进：目标金额上涨、天气恶化、第 3 季起引入温室格。 */
export const SEASONS: SeasonSpec[] = [
  { target: 220, weights: { sunny: 0.55, rain: 0.2, drought: 0.15, pest: 0.1 }, greenhouses: 0 },
  { target: 360, weights: { sunny: 0.45, rain: 0.2, drought: 0.2, pest: 0.15 }, greenhouses: 0 },
  { target: 520, weights: { sunny: 0.4, rain: 0.2, drought: 0.22, pest: 0.18 }, greenhouses: 4 },
  { target: 720, weights: { sunny: 0.35, rain: 0.2, drought: 0.25, pest: 0.2 }, greenhouses: 6 },
  { target: 950, weights: { sunny: 0.3, rain: 0.18, drought: 0.28, pest: 0.24 }, greenhouses: 9 },
]

/** 田格边长（6×6）。 */
export const GRID = 6
/** 一季总周数。 */
export const WEEKS_PER_SEASON = 12
/** 每周可用动作数。 */
export const ACTIONS_PER_WEEK = 2
/** 成熟后再经 2 个周末即腐烂。 */
export const ROT_WEEKS = 2
/** 同科连作产量乘数。 */
export const CONTINUITY_MULT = 0.7
/** 每个虫周的产量质量乘数。 */
export const PEST_MULT = 0.8
/** 产量质量下限。 */
export const QUALITY_MIN = 0.4
/** 休耕动作恢复的肥力点。 */
export const FALLOW_GAIN = 25
/** 豆科收获恢复的肥力点。 */
export const LEGUME_GAIN = 30
/** 肥力上限。 */
export const FERT_MAX = 100
/** 每季基础启动资金（另加上一季结转盈余）。 */
export const START_MONEY = 60

/** 一块田格。 */
export interface HarvestTile {
  /** 当前肥力（0..100，影响产量）。 */
  fertility: number
  /** 在种作物；空地为 null。 */
  crop: CropId | null
  /** 已累计生长周数（>= growWeeks 即成熟）。 */
  growth: number
  /** 本周是否已被浇水（旱周生长的必要条件）。 */
  watered: boolean
  /** 产量质量乘数（虫害递减）。 */
  quality: number
  /** 成熟后已经过的周数（>= ROT_WEEKS 腐烂）。 */
  overWeeks: number
  /** 上一次在该格种植的科别（连作判定基准）。 */
  lastFamily: CropFamily | null
  /** 是否温室格（周末生长 +2 而非 +1）。 */
  greenhouse: boolean
}

/** 季末结算结果（渲染层结算面板用）。 */
export interface SeasonResult {
  /** 是否达标。 */
  passed: boolean
  /** 结算时资产（资金+库存）。 */
  assets: number
  /** 本季目标。 */
  target: number
}

/** 一局状态。 */
export interface HarvestState {
  phase: 'playing' | 'seasonEnd' | 'won' | 'lost'
  /** 0 起的季节下标。 */
  seasonIndex: number
  /** 本季派生随机流的种子（下一季结转时复用）。 */
  seed: number
  /** 当前周（1..WEEKS_PER_SEASON）。 */
  week: number
  /** 本周剩余动作数。 */
  actionsLeft: number
  /** 当周天气。 */
  weather: Weather
  /** 全季天气序列（下标 week-1）。 */
  weatherSeq: Weather[]
  money: number
  /** 库存价值（收获入账，季末折算成资金）。 */
  inventoryValue: number
  /** 行优先田格。 */
  tiles: HarvestTile[]
  /** 本季作物卡池（seed 派生，4 张）。 */
  cardPool: CropId[]
  /** 选中的卡池下标（播种用）。 */
  selectedCard: number
  /** 最近一条事件提示（渲染层显示）。 */
  lastEvent: string
  /** 季末结算结果；进行期为 null。 */
  seasonResult: SeasonResult | null
}

/** mulberry32：注入 seed 的确定性 0..1 随机流。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 按权重四选一天气（确定性）。 */
function pickWeather(rng: () => number, weights: Record<Weather, number>): Weather {
  const r = rng()
  let acc = weights.sunny
  if (r < acc) return 'sunny'
  acc += weights.rain
  if (r < acc) return 'rain'
  acc += weights.drought
  if (r < acc) return 'drought'
  return 'pest'
}

/**
 * 创建一季初始状态：卡池、天气序列、温室格均由 seed+season 派生。
 * @param seed - 注入的随机种子。
 * @param seasonIndex - 0 起的季节下标。
 * @param carryMoney - 上一季结转盈余（加在基础启动资金上）。
 * @returns 新的进行期一局状态。
 */
export function createHarvestState(seed: number, seasonIndex: number, carryMoney = 0): HarvestState {
  const spec = SEASONS[seasonIndex]!
  const rng = mulberry32((seed ^ Math.imul(seasonIndex + 1, 0x9e3779b9)) >>> 0)
  const weatherSeq: Weather[] = []
  for (let i = 0; i < WEEKS_PER_SEASON; i += 1) weatherSeq.push(pickWeather(rng, spec.weights))
  // 卡池：Fisher-Yates 洗牌后取前 POOL_SIZE 张
  const deck = [...CROP_POOL_IDS]
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = deck[i]!
    deck[i] = deck[j]!
    deck[j] = tmp
  }
  const cardPool = deck.slice(0, POOL_SIZE)
  // 温室格：从 36 格中不重复抽取 greenhouses 个
  const greenSet = new Set<number>()
  while (greenSet.size < spec.greenhouses) greenSet.add(Math.floor(rng() * GRID * GRID))
  const tiles: HarvestTile[] = []
  for (let i = 0; i < GRID * GRID; i += 1) {
    tiles.push({
      fertility: FERT_MAX, crop: null, growth: 0, watered: false,
      quality: 1, overWeeks: 0, lastFamily: null, greenhouse: greenSet.has(i),
    })
  }
  return {
    phase: 'playing',
    seasonIndex,
    seed,
    week: 1,
    actionsLeft: ACTIONS_PER_WEEK,
    weather: weatherSeq[0]!,
    weatherSeq,
    money: START_MONEY + carryMoney,
    inventoryValue: 0,
    tiles,
    cardPool,
    selectedCard: 0,
    lastEvent: '第 1 周 · ' + WEATHER_NAME[weatherSeq[0]!],
    seasonResult: null,
  }
}

/** 当前总资产（资金 + 库存价值），计分与达标判定共用。 */
export function totalAssets(state: HarvestState): number {
  return state.money + state.inventoryValue
}

/** 田格是否已有成熟可收作物（growth 达标且未腐烂）。 */
export function isMature(tile: HarvestTile): boolean {
  return tile.crop !== null && tile.growth >= CROP_POOL[tile.crop].growWeeks
}

/**
 * 在田格上播种当前选中卡：扣种子钱、扣肥力、记录科别。
 * @param state - 一局状态。
 * @param index - 田格下标（0..35）。
 * @returns 是否成功（进行期、有动作、空格、资金足够）。
 */
export function plantCrop(state: HarvestState, index: number): boolean {
  const tile = state.tiles[index]
  if (state.phase !== 'playing' || state.actionsLeft <= 0 || tile === undefined) return false
  if (tile.crop !== null) return false
  const cropId = state.cardPool[state.selectedCard]!
  const spec = CROP_POOL[cropId]
  if (state.money < spec.seedCost) return false
  state.money -= spec.seedCost
  tile.crop = cropId
  tile.growth = 0
  tile.quality = 1
  tile.overWeeks = 0
  tile.watered = false
  tile.fertility = Math.max(0, tile.fertility - spec.fertDrain)
  state.actionsLeft -= 1
  state.lastEvent = '播种' + spec.name + '（-' + spec.seedCost + '）'
  return true
}

/**
 * 浇水：立即 +1 生长并满足旱周需水要求。
 * @param state - 一局状态。
 * @param index - 田格下标。
 * @returns 是否成功（进行期、有动作、有种植物且未成熟）。
 */
export function waterTile(state: HarvestState, index: number): boolean {
  const tile = state.tiles[index]
  if (state.phase !== 'playing' || state.actionsLeft <= 0 || tile === undefined) return false
  if (tile.crop === null || isMature(tile)) return false
  tile.growth += 1
  tile.watered = true
  state.actionsLeft -= 1
  state.lastEvent = '浇水：' + CROP_POOL[tile.crop].name + '生长 +1'
  return true
}

/**
 * 收获成熟作物：产量 = 售价 × 肥力系数 × 质量 × 连作乘数，入库存；
 * 豆科额外恢复该格肥力。
 * @param state - 一局状态。
 * @param index - 田格下标。
 * @returns 成功时返回入账价值，失败返回 null。
 */
export function harvestTile(state: HarvestState, index: number): number | null {
  const tile = state.tiles[index]
  if (state.phase !== 'playing' || state.actionsLeft <= 0 || tile === undefined) return null
  if (!isMature(tile) || tile.crop === null) return null
  const spec = CROP_POOL[tile.crop]
  const fertFactor = 0.5 + tile.fertility / (FERT_MAX * 2)
  const streak = tile.lastFamily === spec.family ? CONTINUITY_MULT : 1
  const value = Math.max(1, Math.round(spec.sellPrice * fertFactor * tile.quality * streak))
  state.inventoryValue += value
  tile.lastFamily = spec.family
  if (spec.legume) tile.fertility = Math.min(FERT_MAX, tile.fertility + LEGUME_GAIN)
  tile.crop = null
  tile.growth = 0
  tile.quality = 1
  tile.overWeeks = 0
  tile.watered = false
  state.actionsLeft -= 1
  state.lastEvent = '收获' + spec.name + '，入库存 +' + value + (streak < 1 ? '（连作减产）' : '')
  return value
}

/**
 * 休耕空地：恢复肥力（不消耗种子钱）。
 * @param state - 一局状态。
 * @param index - 田格下标。
 * @returns 是否成功（进行期、有动作、空地）。
 */
export function fallowTile(state: HarvestState, index: number): boolean {
  const tile = state.tiles[index]
  if (state.phase !== 'playing' || state.actionsLeft <= 0 || tile === undefined) return false
  if (tile.crop !== null) return false
  tile.fertility = Math.min(FERT_MAX, tile.fertility + FALLOW_GAIN)
  state.actionsLeft -= 1
  state.lastEvent = '休耕：肥力 +' + FALLOW_GAIN
  return true
}

/**
 * 推进到下一周：结算本周末生长/过熟，随后刷新天气、动作与虫害质量；
 * 第 12 周后进入季末结算。
 * @param state - 一局状态。
 */
export function nextWeek(state: HarvestState): void {
  if (state.phase !== 'playing') return
  let rotted = 0
  for (const tile of state.tiles) {
    if (tile.crop === null) continue
    if (isMature(tile)) {
      tile.overWeeks += 1
      if (tile.overWeeks >= ROT_WEEKS) {
        tile.crop = null
        tile.growth = 0
        tile.quality = 1
        tile.overWeeks = 0
        rotted += 1
      }
    } else {
      const stalled = state.weather === 'drought' && !tile.watered
      if (!stalled) {
        tile.growth += (tile.greenhouse ? 2 : 1) + (state.weather === 'rain' ? 1 : 0)
      }
    }
    tile.watered = false
  }
  state.week += 1
  if (state.week > WEEKS_PER_SEASON) {
    settleSeason(state)
    return
  }
  state.actionsLeft = ACTIONS_PER_WEEK
  state.weather = state.weatherSeq[state.week - 1]!
  let msg = '第 ' + state.week + ' 周 · ' + WEATHER_NAME[state.weather]
  if (rotted > 0) msg = '过熟腐烂 ×' + rotted + '；' + msg
  if (state.weather === 'pest') {
    for (const tile of state.tiles) {
      if (tile.crop !== null) tile.quality = Math.max(QUALITY_MIN, tile.quality * PEST_MULT)
    }
    msg += '（虫害：在种作物减产）'
  } else if (state.weather === 'drought') {
    msg += '（旱：需浇水才生长）'
  } else if (state.weather === 'rain') {
    msg += '（雨：全场免费生长 +1）'
  }
  state.lastEvent = msg
}

/** 季末结算：库存折算入资金，按目标判定过关/失败/通关。 */
function settleSeason(state: HarvestState): void {
  const assets = totalAssets(state)
  state.money += state.inventoryValue
  state.inventoryValue = 0
  const target = SEASONS[state.seasonIndex]!.target
  const passed = assets >= target
  state.seasonResult = { passed, assets, target }
  if (!passed) {
    state.phase = 'lost'
  } else if (state.seasonIndex >= SEASONS.length - 1) {
    state.phase = 'won'
  } else {
    state.phase = 'seasonEnd'
  }
  state.lastEvent = passed ? '季末结算：' + assets + ' ≥ ' + target + '，达标！' : '季末结算：' + assets + ' < ' + target + '，失败。'
}

/**
 * 进入下一季（seasonEnd 后）：结转盈余 = 结算资产 - 目标。
 * @param state - 已结算的 seasonEnd 状态。
 * @returns 新季状态；非 seasonEnd 期原样返回 null。
 */
export function nextSeason(state: HarvestState): HarvestState | null {
  if (state.phase !== 'seasonEnd') return null
  const carry = Math.max(0, state.seasonResult!.assets - state.seasonResult!.target)
  return createHarvestState(state.seed, state.seasonIndex + 1, carry)
}

