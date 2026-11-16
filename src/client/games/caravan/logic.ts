/**
 * 丝路商队纯逻辑：多城套利经营的完整规则引擎，与渲染完全解耦。
 *
 * 核心模型：seed 生成连通城市图（道路带移动/耗水），五种商品按
 * 「城市基准差价 × 正弦波动 × 城市相关噪声」逐日定价；到访过的城市
 * 行情精确，未到访城市显示 ±20% 模糊价。每天可在城中按仓位买卖，
 * 沿道路移动（耗移动力与水，绿洲补水），空格结束今天并翻开事件卡
 * （战乱涨价 / 丰收跌价 / 税吏征税）。限定天数内资产达标即过关。
 *
 * 所有随机都走注入 seed（mulberry32 单步推进的整数状态），同 seed
 * 同操作序列必然得到逐字段相同的状态——全程可重放。
 */

/** 逻辑画布尺寸（渲染与逻辑共享的固定坐标系）。 */
export const W = 960
export const H = 600

/** 商品种数（茶/丝绸/香料/瓷/宝石）。 */
export const GOOD_COUNT = 5

/** 未到访城市的行情模糊幅度（显示价 ±20%）。 */
export const FOG_PCT = 0.2

/** 战乱/丰收事件的持续天数。 */
export const EVENT_DAYS = 2

/** 绿洲道路经过时的补水量。 */
export const OASIS_WATER = 3

/** 事件卡种类：war 某商品涨价、harvest 某商品跌价、tax 征税、none 无事。 */
export type EventKind = 'war' | 'harvest' | 'tax' | 'none'

/** 一张已翻开的事件卡（战乱/丰收附商品下标与幅度，税吏附税率）。 */
export interface EventCard {
  kind: EventKind
  good: number
  scale: number
  label: string
}

/** 生效中的行情事件：第 good 种商品在 until（含）之前按 scale 放大价格。 */
export interface ActiveEvent {
  good: number
  until: number
  scale: number
}

/** 一种商品的名称与基准单价。 */
export interface Good {
  name: string
  base: number
}

/** 五种商品：基准价从茶到宝石递增，构成风险/收益梯度。 */
export const GOODS: readonly Good[] = [
  { name: '茶', base: 12 },
  { name: '香料', base: 22 },
  { name: '丝绸', base: 34 },
  { name: '瓷', base: 52 },
  { name: '宝石', base: 90 },
]

/** 一条道路：通往邻城，耗 moveCost 点移动力与 waterCost 点水；绿洲途经补水。 */
export interface Road {
  to: number
  moveCost: number
  waterCost: number
  oasis: boolean
}

/** 一座城市：卷轴坐标、逐商品基准差价与波动相位、邻接道路。 */
export interface City {
  name: string
  x: number
  y: number
  mult: number[]
  phase: number[]
  roads: Road[]
}

/** 一关参数：城市数、天数、资产目标、骆驼数（=仓位=每日移动力）与水囊上限。 */
export interface LevelConfig {
  cities: number
  days: number
  goal: number
  camels: number
  waterCap: number
  money: number
}

/** 五关递进：城市更多、天数更长、目标更高，骆驼与水囊也逐渐宽裕。 */
export const LEVELS: readonly LevelConfig[] = [
  { cities: 6, days: 12, goal: 650, camels: 3, waterCap: 8, money: 300 },
  { cities: 6, days: 14, goal: 1200, camels: 4, waterCap: 9, money: 320 },
  { cities: 7, days: 16, goal: 2000, camels: 4, waterCap: 9, money: 360 },
  { cities: 7, days: 18, goal: 3000, camels: 5, waterCap: 10, money: 400 },
  { cities: 8, days: 20, goal: 4200, camels: 6, waterCap: 11, money: 450 },
]

/** 生成完毕的世界：城市图 + 逐日逐城逐商品的噪声表（确定性）。 */
export interface CaravanWorld {
  level: number
  config: LevelConfig
  cities: City[]
  /** noise[city][good][day]：全局相关分量 + 城市本地分量。 */
  noise: number[][][]
}

/** 一局的全部可变状态；world 由同 seed 确定性生成。 */
export interface CaravanState {
  world: CaravanWorld
  seed: number
  day: number
  cityIdx: number
  money: number
  water: number
  movePoints: number
  cargo: number[]
  visited: boolean[]
  selectedGood: number
  /** 事件抽取的整数随机状态（mulberry32 单步）。 */
  rngS: number
  activeEvents: ActiveEvent[]
  lastCard: EventCard | null
  phase: 'playing' | 'won' | 'lost'
  log: string[]
}

/**
 * mulberry32 随机源：返回 [0,1) 的函数（世界生成用一次性闭包版本）。
 * @param seed - 任意 32 位整数种子。
 * @returns 逐次调用返回确定性伪随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 推进状态内的整数随机状态并返回 [0,1)（事件抽取用，保证状态可序列化重放）。
 * @param s - 商队状态（原地推进 rngS）。
 * @returns 确定性伪随机数。
 */
export function rand(s: CaravanState): number {
  s.rngS = (s.rngS + 0x6d2b79f5) | 0
  let t = s.rngS
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** 城市名录与卷轴布局（按城市数取用，坐标为画布像素）。 */
const CITY_LAYOUTS: Record<number, Array<{ name: string; x: number; y: number }>> = {
  6: [
    { name: '长安', x: 80, y: 200 },
    { name: '敦煌', x: 210, y: 120 },
    { name: '楼兰', x: 340, y: 230 },
    { name: '于阗', x: 300, y: 400 },
    { name: '撒马尔罕', x: 480, y: 170 },
    { name: '巴格达', x: 600, y: 340 },
  ],
  7: [
    { name: '长安', x: 70, y: 210 },
    { name: '敦煌', x: 190, y: 110 },
    { name: '楼兰', x: 320, y: 210 },
    { name: '于阗', x: 280, y: 400 },
    { name: '喀什', x: 430, y: 330 },
    { name: '撒马尔罕', x: 510, y: 160 },
    { name: '巴格达', x: 620, y: 280 },
  ],
  8: [
    { name: '长安', x: 60, y: 220 },
    { name: '敦煌', x: 170, y: 110 },
    { name: '楼兰', x: 300, y: 190 },
    { name: '于阗', x: 260, y: 390 },
    { name: '喀什', x: 410, y: 340 },
    { name: '撒马尔罕', x: 490, y: 150 },
    { name: '巴格达', x: 590, y: 300 },
    { name: '君士坦丁堡', x: 640, y: 130 },
  ],
}

/** 向城市对的两侧邻接表各加一条道路（双向，参数相同）。 */
function addRoadPair(cities: City[], a: number, b: number, moveCost: number, waterCost: number, oasis: boolean): void {
  cities[a]!.roads.push({ to: b, moveCost, waterCost, oasis })
  cities[b]!.roads.push({ to: a, moveCost, waterCost, oasis })
}

/**
 * 生成一关的世界：seed 决定道路网、基准差价、波动相位与逐日噪声。
 * 环状道路保证连通，再按 seed 补 2-3 跳的商道捷径。
 * @param seed - 种子。
 * @param level - 0 起的关序号。
 * @returns 确定性生成的世界。
 */
export function createWorld(seed: number, level: number): CaravanWorld {
  const config = LEVELS[level]!
  const rng = mulberry32((seed ^ (level * 0x9e3779b9)) | 0)
  const layout = CITY_LAYOUTS[config.cities]!
  const n = config.cities

  const cities: City[] = layout.map((spot) => {
    const mult: number[] = []
    const phase: number[] = []
    for (let g = 0; g < GOOD_COUNT; g += 1) {
      mult.push(0.6 + rng() * 0.5)
      phase.push(rng() * Math.PI * 2)
    }
    // 强制每城各有一种特产（便宜）与一种紧俏货（贵），保证套利空间。
    const cheap = Math.floor(rng() * GOOD_COUNT)
    let dear = Math.floor(rng() * GOOD_COUNT)
    if (dear === cheap) dear = (dear + 1) % GOOD_COUNT
    mult[cheap] = 0.55 + rng() * 0.15
    mult[dear] = 1.45 + rng() * 0.25
    return { name: spot.name, x: spot.x, y: spot.y, mult, phase, roads: [] }
  })

  // 环道（连通骨架）+ seed 决定的跨城商道。
  const linked = new Set<string>()
  const key = (a: number, b: number): string => (a < b ? a + '-' + b : b + '-' + a)
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n
    const cost = rng() < 0.5 ? 1 : 2
    linked.add(key(i, j))
    addRoadPair(cities, i, j, cost, cost + (rng() < 0.3 ? 1 : 0), rng() < 0.25)
  }
  for (let i = 0; i < n; i += 1) {
    for (const jump of [2, 3]) {
      if (jump >= n - 1) continue
      const j = (i + jump) % n
      if (rng() < (jump === 2 ? 0.55 : 0.3) && !linked.has(key(i, j))) {
        linked.add(key(i, j))
        const cost = jump === 2 ? 2 : 3
        addRoadPair(cities, i, j, cost, cost, rng() < 0.3)
      }
    }
  }

  // 逐日噪声：全局分量（城市间相关）+ 本地分量，预生成整张表保证重放一致。
  const globalNoise: number[][] = []
  for (let g = 0; g < GOOD_COUNT; g += 1) {
    const col: number[] = []
    for (let d = 0; d <= config.days; d += 1) col.push((rng() * 2 - 1) * 0.08)
    globalNoise.push(col)
  }
  const noise: number[][][] = []
  for (let c = 0; c < n; c += 1) {
    const byGood: number[][] = []
    for (let g = 0; g < GOOD_COUNT; g += 1) {
      const col: number[] = []
      for (let d = 0; d <= config.days; d += 1) col.push(globalNoise[g]![d]! + (rng() * 2 - 1) * 0.05)
      byGood.push(col)
    }
    noise.push(byGood)
  }

  return { level, config, cities, noise }
}

/**
 * 创建一局：长安（0 号城）出发，水囊满、移动力满、行情已精确。
 * @param seed - 种子（同 seed 同关必然生成相同世界与事件序列）。
 * @param level - 0 起的关序号。
 * @returns 初始状态（phase 恒为 playing）。
 */
export function createCaravan(seed: number, level: number): CaravanState {
  if (level < 0 || level >= LEVELS.length) throw new Error('caravan: level out of range: ' + level)
  const world = createWorld(seed, level)
  const cfg = world.config
  return {
    world,
    seed,
    day: 1,
    cityIdx: 0,
    money: cfg.money,
    water: cfg.waterCap,
    movePoints: cfg.camels,
    cargo: [0, 0, 0, 0, 0],
    visited: world.cities.map((_, i) => i === 0),
    selectedGood: 0,
    rngS: (seed ^ 0x51ab3d) | 0,
    activeEvents: [],
    lastCard: null,
    phase: 'playing',
    log: ['商队自长安启程。'],
  }
}

/**
 * 无事件的原始行情：基准价 × 城市差价 ×（正弦波动 + 城市相关噪声）。
 * @param world - 世界。
 * @param city - 城市下标。
 * @param good - 商品下标。
 * @param day - 天数（1 起）。
 * @returns 取整后的原始单价（≥1）。
 */
export function rawPrice(world: CaravanWorld, city: number, good: number, day: number): number {
  const c = world.cities[city]!
  const wave = 1 + 0.2 * Math.sin(day * 0.9 + c.phase[good]!) + world.noise[city]![good]![Math.min(day, world.config.days)]!
  return Math.max(1, Math.round(GOODS[good]!.base * c.mult[good]! * wave))
}

/**
 * 当前生效单价：原始行情再乘生效中的战乱/丰收事件幅度。
 * @param s - 商队状态。
 * @param city - 城市下标。
 * @param good - 商品下标。
 * @param day - 天数（默认当天）。
 * @returns 取整后的成交单价。
 */
export function priceAt(s: CaravanState, city: number, good: number, day: number = s.day): number {
  let price = rawPrice(s.world, city, good, day)
  for (const e of s.activeEvents) {
    if (e.good === good && day <= e.until) price = Math.max(1, Math.round(price * e.scale))
  }
  return price
}

/** 整数混淆哈希：把若干整数揉成一个 32 位值（模糊价的确定性来源）。 */
function hashNumbers(parts: number[]): number {
  let h = 2166136261
  for (const p of parts) {
    h ^= p | 0
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * 未到访城市的模糊显示价：真值乘 ±20% 的确定性扰动，与到访状态解耦。
 * @param s - 商队状态。
 * @param city - 城市下标。
 * @param good - 商品下标。
 * @returns 到访过则等于真值；否则为真值 ±20% 的抖动值。
 */
export function visiblePrice(s: CaravanState, city: number, good: number): number {
  const exact = priceAt(s, city, good)
  if (s.visited[city] === true) return exact
  const pct = (hashNumbers([s.seed, s.day, city * GOOD_COUNT + good]) % 41 - 20) / 100
  return Math.max(1, Math.round(exact * (1 + pct)))
}

/** 仓位上限 = 骆驼数（每峰骆驼驮一件货）。 */
export function capacity(s: CaravanState): number {
  return s.world.config.camels
}

/** 已占仓位（各商品件数之和）。 */
export function cargoUsed(s: CaravanState): number {
  return s.cargo.reduce((sum, n) => sum + n, 0)
}

/** 资产额 = 银钱 + 全部存货按当前城市行情的估值。 */
export function netWorth(s: CaravanState): number {
  let worth = s.money
  for (let g = 0; g < GOOD_COUNT; g += 1) worth += s.cargo[g]! * priceAt(s, s.cityIdx, g)
  return worth
}

/** 资产达标即过关（在买卖/结算后随时检查）。 */
function checkWin(s: CaravanState): void {
  if (s.phase === 'playing' && netWorth(s) >= s.world.config.goal) s.phase = 'won'
}

function pushLog(s: CaravanState, msg: string): void {
  s.log.push(msg)
  if (s.log.length > 6) s.log.shift()
}

/**
 * 在当前城市买入商品：校验仓位与银钱，按当日单价整额结算。
 * @param s - 商队状态。
 * @param good - 商品下标。
 * @param qty - 件数（>0）。
 * @returns 成功与否；失败时状态不变。
 */
export function buy(s: CaravanState, good: number, qty: number): boolean {
  if (s.phase !== 'playing' || qty <= 0) return false
  const total = priceAt(s, s.cityIdx, good) * qty
  if (cargoUsed(s) + qty > capacity(s) || s.money < total) return false
  s.money -= total
  s.cargo[good] = s.cargo[good]! + qty
  pushLog(s, '买入 ' + qty + ' 件' + GOODS[good]!.name + '，花去 ' + total + ' 文。')
  checkWin(s)
  return true
}

/**
 * 在当前城市卖出商品：校验存货，按当日单价整额入账。
 * @param s - 商队状态。
 * @param good - 商品下标。
 * @param qty - 件数（>0）。
 * @returns 成功与否；失败时状态不变。
 */
export function sell(s: CaravanState, good: number, qty: number): boolean {
  if (s.phase !== 'playing' || qty <= 0 || s.cargo[good]! < qty) return false
  const total = priceAt(s, s.cityIdx, good) * qty
  s.money += total
  s.cargo[good] = s.cargo[good]! - qty
  pushLog(s, '卖出 ' + qty + ' 件' + GOODS[good]!.name + '，入账 ' + total + ' 文。')
  checkWin(s)
  return true
}

/** 找一条从当前城市通往 to 的道路；不相邻返回 undefined。 */
export function roadTo(s: CaravanState, to: number): Road | undefined {
  return s.world.cities[s.cityIdx]!.roads.find((r) => r.to === to)
}

/**
 * 移动是否合法：相邻、移动力足够、水足够，且对局进行中。
 * @param s - 商队状态。
 * @param to - 目标城市下标。
 */
export function canMove(s: CaravanState, to: number): boolean {
  if (s.phase !== 'playing') return false
  const road = roadTo(s, to)
  if (road === undefined) return false
  return s.movePoints >= road.moveCost && s.water >= road.waterCost
}

/**
 * 商队启程：扣移动力与水，抵达后该城行情精确化；绿洲道路补水（不超上限）。
 * @param s - 商队状态。
 * @param to - 相邻目标城市下标。
 * @returns 成功与否；失败时状态不变。
 */
export function move(s: CaravanState, to: number): boolean {
  if (!canMove(s, to)) return false
  const road = roadTo(s, to)!
  s.movePoints -= road.moveCost
  s.water -= road.waterCost
  if (road.oasis) s.water = Math.min(s.world.config.waterCap, s.water + OASIS_WATER)
  s.cityIdx = to
  s.visited[to] = true
  pushLog(s, '抵达' + s.world.cities[to]!.name + '。')
  checkWin(s)
  return true
}

/**
 * 抽一张事件卡（推进状态随机源；仅供 endDay 与测试调用）。
 * @param s - 商队状态。
 * @returns 事件卡：三成无事，战乱/丰收/税吏各约两成多。
 */
export function drawCard(s: CaravanState): EventCard {
  const r = rand(s)
  const good = Math.floor(rand(s) * GOOD_COUNT) % GOOD_COUNT
  if (r < 0.3) return { kind: 'none', good, scale: 1, label: '一路平安' }
  if (r < 0.55) return { kind: 'war', good, scale: 1.5, label: '战乱！' + GOODS[good]!.name + '价格飞涨' }
  if (r < 0.8) return { kind: 'harvest', good, scale: 0.65, label: '丰收，' + GOODS[good]!.name + '价跌' }
  return { kind: 'tax', good, scale: 0.05, label: '税吏查验，征收 5% 现钱' }
}

/**
 * 让一张事件卡生效（战乱/丰收挂入生效表，税吏立即扣现钱）。
 * @param s - 商队状态。
 * @param card - 事件卡。
 */
export function applyCard(s: CaravanState, card: EventCard): void {
  s.lastCard = card
  if (card.kind === 'war') {
    s.activeEvents = s.activeEvents.filter((e) => e.good !== card.good)
    s.activeEvents.push({ good: card.good, until: s.day + EVENT_DAYS, scale: card.scale })
    pushLog(s, card.label + '。')
  } else if (card.kind === 'harvest') {
    s.activeEvents = s.activeEvents.filter((e) => e.good !== card.good)
    s.activeEvents.push({ good: card.good, until: s.day + EVENT_DAYS, scale: card.scale })
    pushLog(s, card.label + '。')
  } else if (card.kind === 'tax') {
    const due = Math.ceil(s.money * card.scale)
    if (due > 0) {
      s.money -= due
      pushLog(s, '税吏征去 ' + due + ' 文。')
    }
  }
}

/**
 * 结束今天：天数 +1、城中补给水囊、移动力回满、过期事件失效、翻开
 * 新事件卡；越过期限后按资产额判定胜负。
 * @param s - 商队状态（非 playing 时为空操作）。
 */
export function endDay(s: CaravanState): void {
  if (s.phase !== 'playing') return
  s.day += 1
  s.movePoints = s.world.config.camels
  s.water = s.world.config.waterCap
  s.activeEvents = s.activeEvents.filter((e) => s.day <= e.until)
  if (s.day <= s.world.config.days) applyCard(s, drawCard(s))
  if (s.day > s.world.config.days) {
    s.phase = netWorth(s) >= s.world.config.goal ? 'won' : 'lost'
    if (s.phase === 'lost') pushLog(s, '期限已至，商队黯然收场。')
    else pushLog(s, '期限前达成目标！')
  }
  checkWin(s)
}
