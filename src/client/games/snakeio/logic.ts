/**
 * 蛇界争霸（Snake.io）确定性引擎：固定步长（TICK）的矩形竞技场蛇群模拟。
 * 与 slither 的圆形开放世界不同，本作是大逃杀规则：矩形世界四周是致命
 * 毒墙，开局宽限后中央毒圈持续收缩，圈外每 tick 掉长度；场上 AI 蛇不
 * 复活，玩家要么撞墙 / 撞蛇身而死，要么活到最后"吃鸡"。蛇身是头部位置
 * 轨迹；加速持续消耗长度并在尾部吐出光点；死亡按长度沿轨迹爆战利品。
 * AI 决策每条蛇按固定间隔轮转，随机数全部走 mulberry32(seed, round)，
 * 同 seed 同输入的 tick 序列完全一致（用 snakeioSnapshot 校验）。
 * 时间单位秒，物理单位 px。
 */

/** 固定模拟步长（秒，约 30 tick/s）。 */
export const TICK = 1 / 30
/** 矩形世界尺寸（四周毒墙，出界即死）。 */
export const WORLD_W = 2400
export const WORLD_H = 1800
/** 世界中心坐标。 */
export const CX = WORLD_W / 2
export const CY = WORLD_H / 2

/** 常规 / 加速速度（px/s）。 */
export const BASE_SPEED = 170
export const BOOST_SPEED = 310
/** 出生长度（也是最小段数基准）。 */
export const START_LENGTH = 12
/** 低于该长度不允许加速。 */
export const MIN_BOOST_LENGTH = 14
/** 加速每 tick 消耗的长度。 */
export const BOOST_COST_PER_TICK = 0.35
/** 加速每几 tick 在尾部吐一个光点。 */
export const BOOST_DROP_EVERY = 3
/** 每点光点价值的成长长度。 */
export const GROWTH_PER_VALUE = 0.5
/** 场上常规光点保有量 / 硬上限（战利品可超保有量但不过上限）。 */
export const FOOD_TARGET = 240
export const FOOD_CAP = 700
/** AI 蛇数量（不复活：活到最后即吃鸡）。 */
export const AI_COUNT = 7
/** 单条 AI 两次决策的间隔 tick 数。 */
export const AI_INTERVAL = 6
/** 毒圈宽限 tick 数（宽限期内不收缩）。 */
export const ZONE_GRACE_TICKS = 600
/** 毒圈每 tick 收缩的半径（px）。 */
export const ZONE_SHRINK_PER_TICK = 0.9
/** 毒圈最小半径。 */
export const ZONE_MIN_R = 240
/** 毒圈初始半径（覆盖整个矩形对角）。 */
export const ZONE_START_R = Math.hypot(WORLD_W, WORLD_H) / 2
/** 圈外每 tick 掉落的长度。 */
export const ZONE_DRAIN_PER_TICK = 0.2
/** 长度低于该值且在圈外即被毒死。 */
export const ZONE_LETHAL_LENGTH = 6
/** 蛇身点数上下限。 */
export const MIN_SEG = 8
export const MAX_SEG = 400

/** 最细蛇的转向角速度（rad/s），越粗越慢。 */
const TURN_RATE_BASE = 4.0
/** 粗细公式参数：th = THICKNESS_BASE + sqrt(length) * THICKNESS_K。 */
const THICKNESS_BASE = 5
const THICKNESS_K = 0.85
const THICKNESS_MAX = 24
/** 出生/摆位时轨迹点的间距（= 常规速度每 tick 位移）。 */
export const HEAD_STEP = BASE_SPEED * TICK

/**
 * mulberry32 确定性随机数发生器（与其它游戏互不依赖的同名实现）。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 平面点。 */
export interface Vec {
  x: number
  y: number
}

/** 一条蛇（玩家或 AI）；points[0] 恒为蛇头，(x,y) 与其同步。 */
export interface IoSnake {
  id: number
  /** 是否 AI（false = 玩家，恒为 snakes[0]）。 */
  ai: boolean
  name: string
  /** theme.ts accent 序号。 */
  color: number
  x: number
  y: number
  /** 实际朝向（弧度）。 */
  angle: number
  /** 期望转向指令：-1 左转 / 0 直行 / 1 右转。 */
  turn: -1 | 0 | 1
  boosting: boolean
  /** 当前长度（分数 = floor(length)）。 */
  length: number
  kills: number
  /** 长度峰值。 */
  peak: number
  alive: boolean
  /** 头部轨迹（含头）。 */
  points: Vec[]
  /** 下次可决策的 tick（AI 轮转调度用）。 */
  nextThink: number
}

/** 一个光点（食物 / 战利品）。 */
export interface IoFood {
  x: number
  y: number
  r: number
  value: number
  color: number
}

/** 单步内产生、供渲染层消费的可视事件。 */
export type IoEvent =
  | { type: 'death'; x: number; y: number; color: number; victimId: number; killerId: number; length: number }

/** 玩家死亡/吃鸡结算数据。 */
export interface IoStats {
  peak: number
  kills: number
  seconds: number
  /** true = 吃鸡（活到最后）。 */
  win: boolean
  /** 最终名次（1 = 第一）。 */
  rank: number
}

/** 一局游戏的完整可测状态。 */
export interface IoState {
  tick: number
  rng: () => number
  nextId: number
  /** snakes[0] 恒为玩家；死亡蛇保留在数组中（alive=false）。 */
  snakes: IoSnake[]
  foods: IoFood[]
  events: IoEvent[]
  over: boolean
  stats: IoStats | null
}

/** 玩家一 tick 的输入。 */
export interface IoInput {
  /** 转向指令：-1 左转 / 0 直行 / 1 右转。 */
  turn: -1 | 0 | 1
  /** 是否按住加速（长度不足时引擎自行忽略）。 */
  boost: boolean
}

/** 归一化角度到 [-PI, PI)。 */
export function normAngle(a: number): number {
  const two = Math.PI * 2
  return ((((a + Math.PI) % two) + two) % two) - Math.PI
}

/** 蛇身粗细（渲染半径 & 碰撞判定共用）。 */
export function thicknessOf(s: IoSnake): number {
  return Math.min(THICKNESS_MAX, THICKNESS_BASE + Math.sqrt(Math.max(1, s.length)) * THICKNESS_K)
}

/** 转向角速度（rad/s）：越粗越慢，加速时再乘 0.82。 */
export function turnRate(s: IoSnake): number {
  const base = TURN_RATE_BASE / (1 + (thicknessOf(s) - THICKNESS_BASE) / 17)
  return s.boosting ? base * 0.82 : base
}

/** 单 tick 允许的最大转向角（弧度）。 */
export function turnRatePerTick(s: IoSnake): number {
  return turnRate(s) * TICK
}

/** 当前速度（px/s）。 */
export function speedOf(s: IoSnake): number {
  return s.boosting ? BOOST_SPEED : BASE_SPEED
}

/**
 * 当前毒圈半径（px）：宽限期内恒为初始值，之后线性收缩到 ZONE_MIN_R。
 * @param tick - 当前 tick 数。
 * @returns 毒圈半径。
 */
export function zoneRadiusAt(tick: number): number {
  if (tick <= ZONE_GRACE_TICKS) return ZONE_START_R
  const r = ZONE_START_R - (tick - ZONE_GRACE_TICKS) * ZONE_SHRINK_PER_TICK
  return Math.max(ZONE_MIN_R, r)
}

/** 点是否在毒圈外。 */
export function outsideZone(tick: number, x: number, y: number): boolean {
  return Math.hypot(x - CX, y - CY) > zoneRadiusAt(tick)
}

/** 长度对应的轨迹点数。 */
export function needSegments(length: number): number {
  return Math.min(MAX_SEG, Math.max(MIN_SEG, Math.round(length)))
}

/** AI 昵称池（按 rng 取用，确定性）。 */
const AI_NAMES = ['青鳞', '疾风', '毒牙', '大蛇丸', '竹叶青', '响尾', '吞天', '菜花', '眼镜', '滑鳞'] as const

/**
 * 构造一条蛇（轨迹为头后方的一条直线）。
 * @param opts - id/坐标/朝向等必填字段与可选覆盖。
 * @returns 新蛇（alive=true）。
 */
export function makeSnake(opts: {
  id: number
  ai: boolean
  name: string
  color: number
  x: number
  y: number
  angle: number
  length?: number
}): IoSnake {
  const length = opts.length ?? START_LENGTH
  const n = needSegments(length)
  const dx = -Math.cos(opts.angle) * HEAD_STEP
  const dy = -Math.sin(opts.angle) * HEAD_STEP
  const points: Vec[] = []
  for (let i = 0; i < n; i += 1) points.push({ x: opts.x + dx * i, y: opts.y + dy * i })
  return {
    id: opts.id,
    ai: opts.ai,
    name: opts.name,
    color: opts.color,
    x: opts.x,
    y: opts.y,
    angle: opts.angle,
    turn: 0,
    boosting: false,
    length,
    kills: 0,
    peak: length,
    alive: true,
    points,
    nextThink: 0,
  }
}

/**
 * 重摆一条蛇（测试/摆位用）：改坐标朝向并重置为直线轨迹。
 * @param s - 目标蛇。
 * @param x - 新头 x。
 * @param y - 新头 y。
 * @param angle - 新朝向。
 * @param length - 可选新长度。
 */
export function placeSnake(s: IoSnake, x: number, y: number, angle: number, length?: number): void {
  const next = makeSnake({
    id: s.id, ai: s.ai, name: s.name, color: s.color,
    x, y, angle, length: length ?? s.length,
  })
  s.x = next.x
  s.y = next.y
  s.angle = next.angle
  s.turn = 0
  s.length = next.length
  s.peak = Math.max(s.peak, next.length)
  s.points = next.points
  s.boosting = false
}

/** 矩形世界内随机点（留边距）。 */
function randomInWorld(rng: () => number, margin: number): Vec {
  return {
    x: margin + rng() * (WORLD_W - margin * 2),
    y: margin + rng() * (WORLD_H - margin * 2),
  }
}

/** 距所有存活蛇头的最小距离。 */
function minHeadDist(state: IoState, x: number, y: number): number {
  let best = Infinity
  for (const s of state.snakes) {
    if (!s.alive) continue
    const d = Math.hypot(s.x - x, s.y - y)
    if (d < best) best = d
  }
  return best
}

/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同 seed 不同局轨迹不同）。
 * @returns 初始状态。
 */
export function createSnakeio(seed: number, round = 1): IoState {
  const rng = mulberry32((Math.floor(seed) * 733 + round * 41) >>> 0)
  const state: IoState = {
    tick: 0,
    rng,
    nextId: 1,
    snakes: [],
    foods: [],
    events: [],
    over: false,
    stats: null,
  }
  const pa = rng() * Math.PI * 2
  state.snakes.push(makeSnake({
    id: 0, ai: false, name: '你', color: 0,
    x: CX, y: CY, angle: pa, length: START_LENGTH,
  }))
  for (let i = 0; i < AI_COUNT; i += 1) {
    let p = randomInWorld(rng, 200)
    for (let attempt = 0; attempt < 24 && minHeadDist(state, p.x, p.y) < 280; attempt += 1) p = randomInWorld(rng, 200)
    state.snakes.push(makeSnake({
      id: state.nextId,
      ai: true,
      name: AI_NAMES[(i + round) % AI_NAMES.length]!,
      color: 1 + ((i * 3 + round) % 7),
      x: p.x,
      y: p.y,
      angle: rng() * Math.PI * 2,
      length: START_LENGTH + Math.floor(rng() * 22),
    }))
    state.nextId += 1
  }
  for (const s of state.snakes) s.nextThink = s.ai ? 1 + Math.floor(rng() * AI_INTERVAL) : 0
  for (let i = 0; i < FOOD_TARGET; i += 1) spawnOneFood(state, 1)
  return state
}

/** 生成一个常规光点（世界内、随机色）。 */
function spawnOneFood(state: IoState, value: number): void {
  const p = randomInWorld(state.rng, 30)
  state.foods.push({
    x: p.x,
    y: p.y,
    r: 3 + state.rng() * 1.5,
    value,
    color: Math.floor(state.rng() * 8),
  })
}

/** ---------------- AI（简单确定性决策） ---------------- */

/**
 * 一条 AI 蛇的决策：最近威胁优先——圈外 / 近墙则朝世界中心转；否则
 * 朝可见范围内最近的光点转；两者都无则轻微游走。加速仅当长度富余且
 * 目标在圈外很远时短暂开启（省长度逃命）。
 */
function thinkAi(state: IoState, s: IoSnake): void {
  const zoneR = zoneRadiusAt(state.tick)
  const distCenter = Math.hypot(s.x - CX, s.y - CY)
  let want = Math.atan2(CY - s.y, CX - s.x)
  let urgency = false
  // 毒圈与墙壁威胁：距中心的安全半径取毒圈半径与世界内切矩形的较小者。
  const margin = 140
  const safeR = Math.min(zoneR - 60,
    Math.min((WORLD_W / 2 - margin) / Math.max(1e-6, Math.abs(Math.cos(want))),
      (WORLD_H / 2 - margin) / Math.max(1e-6, Math.abs(Math.sin(want)))))
  if (distCenter > safeR) {
    urgency = true
  } else {
    // 找可见范围内最近光点。
    const vision = 320
    let best: IoFood | null = null
    let bestD = vision
    for (const f of state.foods) {
      const d = Math.hypot(f.x - s.x, f.y - s.y)
      if (d < bestD) { bestD = d; best = f }
    }
    if (best !== null) want = Math.atan2(best.y - s.y, best.x - s.x)
    else want = s.angle + (state.rng() - 0.5) * 1.2
  }
  const diff = normAngle(want - s.angle)
  s.turn = diff > 0.02 ? 1 : diff < -0.02 ? -1 : 0
  s.boosting = urgency && s.length > MIN_BOOST_LENGTH + 10 && distCenter > zoneR
}

/** ---------------- 移动 / 进食 / 加速 / 毒圈 ---------------- */

/**
 * 推进一条存活蛇一 tick：转向、位移、轨迹、加速耗长与吐点、进食、
 * 圈外掉长。maxTurn 由 stepSnakeio 在本 tick 一切状态变更之前统一预算，
 * 保证外部用 tick 开始时的 turnRatePerTick 可精确重构转向上界。
 */
function moveSnake(state: IoState, s: IoSnake, maxTurn: number): void {
  s.angle = normAngle(s.angle + s.turn * maxTurn)
  if (s.boosting && s.length <= MIN_BOOST_LENGTH) s.boosting = false
  const v = speedOf(s)
  s.x += Math.cos(s.angle) * v * TICK
  s.y += Math.sin(s.angle) * v * TICK
  s.points.unshift({ x: s.x, y: s.y })
  if (s.boosting) {
    s.length = Math.max(6, s.length - BOOST_COST_PER_TICK)
    if (state.tick % BOOST_DROP_EVERY === 0 && state.foods.length < FOOD_CAP) {
      const tail = s.points[s.points.length - 1]!
      state.foods.push({ x: tail.x, y: tail.y, r: 3.5, value: 1, color: s.color })
    }
  }
  if (outsideZone(state.tick, s.x, s.y)) s.length -= ZONE_DRAIN_PER_TICK
  const need = needSegments(s.length)
  while (s.points.length > need) s.points.pop()
  // 进食：头圆 vs 光点圆。
  const eatR = thicknessOf(s) * 0.5 + 8
  for (let i = state.foods.length - 1; i >= 0; i -= 1) {
    const f = state.foods[i]!
    const rr = eatR + f.r
    const dx = f.x - s.x
    const dy = f.y - s.y
    if (dx * dx + dy * dy <= rr * rr) {
      s.length += f.value * GROWTH_PER_VALUE
      if (s.length > s.peak) s.peak = s.length
      state.foods.splice(i, 1)
    }
  }
}

/** ---------------- 死亡与战利品 ---------------- */

/** 沿轨迹每 3 点爆一个战利品光点（总价值约 length*0.55）。 */
function dropLoot(state: IoState, s: IoSnake): void {
  const count = Math.max(4, Math.floor(s.points.length / 3))
  const value = Math.max(1, Math.min(6, Math.round((s.length * 0.55) / count)))
  for (let k = 0; k < count; k += 1) {
    if (state.foods.length >= FOOD_CAP) return
    const p = s.points[Math.min(s.points.length - 1, k * 3)]!
    state.foods.push({
      x: p.x + (state.rng() - 0.5) * 10,
      y: p.y + (state.rng() - 0.5) * 10,
      r: 4 + value * 0.6,
      value,
      color: s.color,
    })
  }
}

/** 处理一批死亡：击杀计费、爆战利品、玩家结束 / AI 出局。 */
function processDeaths(state: IoState, deaths: { victim: IoSnake; killerId: number }[]): void {
  for (const d of deaths) {
    const v = d.victim
    v.alive = false
    v.boosting = false
    const killer = state.snakes.find(s => s.id === d.killerId)
    if (killer !== undefined && killer !== v && killer.alive) killer.kills += 1
    dropLoot(state, v)
    state.events.push({ type: 'death', x: v.x, y: v.y, color: v.color, victimId: v.id, killerId: d.killerId, length: v.length })
  }
}

/**
 * 头 vs 毒墙 / 毒圈致死 / 一切蛇身段的判定；蛇头撞蛇身段即死
 * （含它蛇与越过约两个转向直径的自身段）。
 */
function resolveCollisions(state: IoState): void {
  const deaths: { victim: IoSnake; killerId: number }[] = []
  for (const s of state.snakes) {
    if (!s.alive) continue
    if (s.x < 0 || s.x > WORLD_W || s.y < 0 || s.y > WORLD_H) {
      deaths.push({ victim: s, killerId: -1 })
      continue
    }
    if (s.length < ZONE_LETHAL_LENGTH) {
      deaths.push({ victim: s, killerId: -1 })
      continue
    }
    const thSelf = thicknessOf(s)
    const selfClear = (2 * speedOf(s)) / turnRate(s) + 40
    let hit = -1
    let arc = 0
    outer: for (const o of state.snakes) {
      if (!o.alive) continue
      const th = thSelf * 0.45 + thicknessOf(o) * 0.8
      for (let i = 0; i < o.points.length; i += 1) {
        const p = o.points[i]!
        if (o === s) {
          arc += i === 0 ? 0 : Math.hypot(p.x - o.points[i - 1]!.x, p.y - o.points[i - 1]!.y)
          if (arc < selfClear) continue
        }
        if (Math.hypot(p.x - s.x, p.y - s.y) < th) { hit = o.id; break outer }
      }
    }
    if (hit >= 0) deaths.push({ victim: s, killerId: hit })
  }
  if (deaths.length > 0) processDeaths(state, deaths)
}

/** 补充常规光点（每 tick 至多 2 个）。 */
function spawnFood(state: IoState): void {
  for (let i = 0; i < 2 && state.foods.length < FOOD_TARGET; i += 1) spawnOneFood(state, 1)
}

/**
 * 玩家当前名次（按长度，1 = 最长；含所有存活蛇）。
 * @param state - 目标状态。
 * @returns 名次；玩家死亡时返回 -1。
 */
export function playerRank(state: IoState): number {
  const player = state.snakes[0]!
  if (!player.alive) return -1
  let rank = 1
  for (const s of state.snakes) {
    if (s !== player && s.alive && s.length > player.length) rank += 1
  }
  return rank
}

/**
 * 推进恰好一个固定步长：AI 轮转决策 -> 全蛇移动/进食/圈外掉长 ->
 * 碰撞死亡 -> 光点补充 -> 结算（玩家死 / 吃鸡）。
 * 玩家死亡或吃鸡置 over 并填充 stats（之后本函数直接返回）。
 * @param state - 目标状态（原地推进）。
 * @param input - 玩家本 tick 输入。
 */
export function stepSnakeio(state: IoState, input: IoInput): void {
  state.events.length = 0
  if (state.over) return
  const player = state.snakes[0]!
  // 转向上限在本 tick 任何状态（含加速开关）变更之前统一快照。
  const limits = state.snakes.map(s => turnRatePerTick(s))
  if (player.alive) {
    player.turn = input.turn
    player.boosting = input.boost && player.length > MIN_BOOST_LENGTH
  }
  for (const s of state.snakes) {
    if (s.ai && s.alive && s.nextThink <= state.tick) {
      thinkAi(state, s)
      s.nextThink = state.tick + AI_INTERVAL
    }
  }
  for (let i = 0; i < state.snakes.length; i += 1) {
    const s = state.snakes[i]!
    if (s.alive) moveSnake(state, s, limits[i] ?? turnRatePerTick(s))
  }
  resolveCollisions(state)
  if (!state.over) spawnFood(state)
  // 结算：玩家死亡（撞/毒）或吃鸡（AI 全灭且玩家存活）。
  if (!player.alive) {
    state.over = true
    state.stats = {
      peak: Math.floor(player.peak),
      kills: player.kills,
      seconds: state.tick * TICK,
      win: false,
      rank: 1 + state.snakes.filter(s => s.ai && s.alive).length,
    }
  } else if (state.snakes.some(s => s.ai) && !state.snakes.some(s => s.ai && s.alive)) {
    state.over = true
    state.stats = {
      peak: Math.floor(player.peak),
      kills: player.kills,
      seconds: state.tick * TICK,
      win: true,
      rank: 1,
    }
  }
  state.tick += 1
}

/**
 * 确定性重放校验快照：tick、各蛇头坐标/朝向/长度、光点数、结束态。
 * @param state - 目标状态。
 * @returns 可直接字符串比较的状态摘要。
 */
export function snakeioSnapshot(state: IoState): string {
  let s = 't' + state.tick + 'f' + state.foods.length + 'o' + (state.over ? 1 : 0)
  for (const sn of state.snakes) {
    s += '|' + sn.id + (sn.alive
      ? ',' + sn.x.toFixed(2) + ',' + sn.y.toFixed(2) + ',' + sn.angle.toFixed(4) + ',' + sn.length.toFixed(2) + ',' + sn.kills
      : ',dead')
  }
  return s
}
