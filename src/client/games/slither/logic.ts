/**
 * 贪吃蛇大作战（Slither）确定性引擎：固定步长（TICK）的大世界蛇群模拟。
 * 玩家蛇 + 若干 AI 蛇在圆形世界（半径 WORLD_R）里抢光点、加速、互相围堵。
 * 蛇身是头部位置轨迹（相邻点距约一个 tick 的位移）；蛇头撞任何蛇身段
 * （自身则须越过转向直径决定的安全弧长）即死，尸体按长度沿轨迹爆出
 * 战利品光点；加速持续消耗长度并在尾部吐出光点。AI 决策按帧限额轮转
 * （每 tick 至多 AI_DECISIONS_PER_TICK 条，见 runAiSlice），绝不在单帧内
 * 对全部 AI 做完整搜索。随机数全部走 mulberry32(seed, round)，同 seed 同
 * 输入的 tick 序列完全一致（用 slitherSnapshot 校验）。时间单位秒，物理
 * 单位 px。
 */
import { decideAi, type AiContext } from './ai.ts'

/** 固定模拟步长（秒，约 30 tick/s）。 */
export const TICK = 1 / 30
/** 圆形世界半径。 */
export const WORLD_R = 1400
/** 世界圆心坐标（放在 3000x3000 的逻辑框中心）。 */
export const CX = 1500
export const CY = 1500

/** 常规 / 加速速度（px/s）。 */
export const BASE_SPEED = 165
export const BOOST_SPEED = 300
/** 出生长度（也是最小段数基准）。 */
export const START_LENGTH = 14
/** 低于该长度不允许加速。 */
export const MIN_BOOST_LENGTH = 16
/** 加速每 tick 消耗的长度。 */
export const BOOST_COST_PER_TICK = 0.4
/** 加速每几 tick 在尾部吐一个光点。 */
export const BOOST_DROP_EVERY = 3
/** 每点光点价值的成长长度。 */
export const GROWTH_PER_VALUE = 0.6
/** 场上常规光点保有量 / 硬上限（战利品可超保有量但不过上限）。 */
export const FOOD_TARGET = 320
export const FOOD_CAP = 900
/** AI 蛇数量（含等待复活者，保持在 6-10 区间）。 */
export const AI_COUNT = 8
/** AI 死亡后复活等待 tick 数。 */
export const AI_RESPAWN_TICKS = 90
/** 单条 AI 两次决策的最小间隔 tick 数。 */
export const AI_INTERVAL = 8
/** 每 tick 最多决策的 AI 条数（分帧预算）。 */
export const AI_DECISIONS_PER_TICK = 2
/** 蛇身点数上下限。 */
export const MIN_SEG = 10
export const MAX_SEG = 420

/** 最细蛇的转向角速度（rad/s），越粗越慢。 */
const TURN_RATE_BASE = 3.8
/** 粗细公式参数：th = THICKNESS_BASE + sqrt(length) * THICKNESS_K。 */
const THICKNESS_BASE = 5
const THICKNESS_K = 0.9
const THICKNESS_MAX = 26
/** 出生/摆位时轨迹点的间距（= 常规速度每 tick 位移）。 */
export const HEAD_STEP = BASE_SPEED * TICK
/** 网格单元边长（段碰撞空间哈希）。 */
const CELL = 150

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

/** AI 三档性格：吃点 / 围猎 / 谨慎。 */
export type Personality = 'grazer' | 'hunter' | 'guardian'

/** 一条蛇（玩家或 AI）；points[0] 恒为蛇头，(x,y) 与其同步。 */
export interface SlitherSnake {
  id: number
  /** 是否 AI（false = 玩家，恒为 snakes[0]）。 */
  ai: boolean
  name: string
  /** theme.ts accent 序号。 */
  color: number
  personality: Personality
  x: number
  y: number
  /** 实际朝向（弧度）。 */
  angle: number
  /** 期望朝向；每 tick 只能以转向角速度上限逼近。 */
  targetAngle: number
  boosting: boolean
  /** 当前长度（分数 = floor(length)）。 */
  length: number
  kills: number
  /** 长度峰值。 */
  peak: number
  alive: boolean
  /** 头部轨迹（含头）。 */
  points: Vec[]
  /** 下次可决策的 tick（AI 分帧调度用）。 */
  nextThink: number
}

/** 一个光点（食物 / 战利品）。 */
export interface SlitherFood {
  x: number
  y: number
  r: number
  value: number
  color: number
}

/** 单步内产生、供渲染层消费的可视事件。 */
export type SlitherEvent =
  | { type: 'death'; x: number; y: number; color: number; victimId: number; killerId: number; length: number }

/** 玩家死亡结算数据。 */
export interface SlitherStats {
  peak: number
  kills: number
  seconds: number
}

/** 一局游戏的完整可测状态。 */
export interface SlitherState {
  tick: number
  rng: () => number
  nextId: number
  /** snakes[0] 恒为玩家；死亡 AI 保留在数组中（alive=false）。 */
  snakes: SlitherSnake[]
  foods: SlitherFood[]
  /** 待复活 AI 的到期 tick。 */
  respawns: number[]
  events: SlitherEvent[]
  over: boolean
  stats: SlitherStats | null
  /** AI 分帧轮转游标。 */
  aiCursor: number
}

/** 玩家一 tick 的输入。 */
export interface SlitherInput {
  /** 期望朝向（弧度，世界坐标）。 */
  angle: number
  /** 是否按住加速（长度不足时引擎自行忽略）。 */
  boost: boolean
}

/** 归一化角度到 [-PI, PI)。 */
export function normAngle(a: number): number {
  const two = Math.PI * 2
  return ((((a + Math.PI) % two) + two) % two) - Math.PI
}

/** 蛇身粗细（渲染半径 & 碰撞判定共用）。 */
export function thicknessOf(s: SlitherSnake): number {
  return Math.min(THICKNESS_MAX, THICKNESS_BASE + Math.sqrt(Math.max(1, s.length)) * THICKNESS_K)
}

/** 转向角速度（rad/s）：越粗越慢，加速时再乘 0.8。 */
export function turnRate(s: SlitherSnake): number {
  const base = TURN_RATE_BASE / (1 + (thicknessOf(s) - THICKNESS_BASE) / 18)
  return s.boosting ? base * 0.8 : base
}

/** 单 tick 允许的最大转向角（弧度）。 */
export function turnRatePerTick(s: SlitherSnake): number {
  return turnRate(s) * TICK
}

/** 当前速度（px/s）。 */
export function speedOf(s: SlitherSnake): number {
  return s.boosting ? BOOST_SPEED : BASE_SPEED
}

/** 自撞豁免弧长：约两个当前转向直径再加余量。 */
export function selfClearPx(s: SlitherSnake): number {
  return (2 * speedOf(s)) / turnRate(s) + 40
}

/** 长度对应的轨迹点数。 */
export function needSegments(length: number): number {
  return Math.min(MAX_SEG, Math.max(MIN_SEG, Math.round(length)))
}

/** AI 昵称池（按 rng 取用，确定性）。 */
const AI_NAMES = ['小蛇蛇', '光速蜗牛', '夜叉', '青花', '电鳗', '软软', '大胃王', '波比', '阿滑', '闪电', '彩虹糖', '泥鳅'] as const
/** AI 性格轮转表。 */
const PERSONALITIES: Personality[] = ['hunter', 'grazer', 'guardian', 'grazer', 'hunter', 'guardian', 'grazer', 'hunter']

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
  personality: Personality
  x: number
  y: number
  angle: number
  length?: number
}): SlitherSnake {
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
    personality: opts.personality,
    x: opts.x,
    y: opts.y,
    angle: opts.angle,
    targetAngle: opts.angle,
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
export function placeSnake(s: SlitherSnake, x: number, y: number, angle: number, length?: number): void {
  const next = makeSnake({
    id: s.id, ai: s.ai, name: s.name, color: s.color, personality: s.personality,
    x, y, angle, length: length ?? s.length,
  })
  s.x = next.x
  s.y = next.y
  s.angle = next.angle
  s.targetAngle = next.targetAngle
  s.length = next.length
  s.peak = next.peak
  s.points = next.points
  s.boosting = false
}

/** 世界内随机点（半径比例均匀）。 */
function randomInWorld(rng: () => number, ratio: number): Vec {
  const a = rng() * Math.PI * 2
  const r = WORLD_R * ratio * Math.sqrt(rng())
  return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r }
}

/** 距所有存活蛇头的最小距离。 */
function minHeadDist(state: SlitherState, x: number, y: number): number {
  let best = Infinity
  for (const s of state.snakes) {
    if (!s.alive) continue
    const d = Math.hypot(s.x - x, s.y - y)
    if (d < best) best = d
  }
  return best
}

/** 距任意存活蛇身段的最小距离（出生保护用）。 */
function minBodyDist(state: SlitherState, x: number, y: number): number {
  let best = Infinity
  for (const s of state.snakes) {
    if (!s.alive) continue
    for (let i = 0; i < s.points.length; i += 3) {
      const p = s.points[i]!
      const d = Math.hypot(p.x - x, p.y - y)
      if (d < best) best = d
    }
  }
  return best
}

/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同 seed 不同局轨迹不同）。
 * @returns 初始状态。
 */
export function createSlither(seed: number, round = 1): SlitherState {
  const rng = mulberry32((Math.floor(seed) * 313 + round * 29) >>> 0)
  const state: SlitherState = {
    tick: 0,
    rng,
    nextId: 1,
    snakes: [],
    foods: [],
    respawns: [],
    events: [],
    over: false,
    stats: null,
    aiCursor: 0,
  }
  const pa = rng() * Math.PI * 2
  const player = makeSnake({
    id: 0, ai: false, name: '你', color: 0, personality: 'grazer',
    x: CX, y: CY, angle: pa, length: START_LENGTH,
  })
  state.nextId = 1
  state.snakes.push(player)
  for (let i = 0; i < AI_COUNT; i += 1) {
    let p = randomInWorld(rng, 0.8)
    for (let attempt = 0; attempt < 24 && minHeadDist(state, p.x, p.y) < 300; attempt += 1) p = randomInWorld(rng, 0.8)
    state.snakes.push(makeSnake({
      id: state.nextId,
      ai: true,
      name: AI_NAMES[(i + round) % AI_NAMES.length]!,
      color: 1 + ((i * 3 + round) % 7),
      personality: PERSONALITIES[i % PERSONALITIES.length]!,
      x: p.x,
      y: p.y,
      angle: rng() * Math.PI * 2,
      length: START_LENGTH + Math.floor(rng() * 26),
    }))
    state.nextId += 1
  }
  for (const s of state.snakes) s.nextThink = (s.ai ? 1 + Math.floor(rng() * AI_INTERVAL) : 0)
  for (let i = 0; i < FOOD_TARGET; i += 1) spawnOneFood(state, 1)
  return state
}

/** 生成一个常规光点（世界内、随机色）。 */
function spawnOneFood(state: SlitherState, value: number): void {
  const p = randomInWorld(state.rng, 0.97)
  state.foods.push({
    x: p.x,
    y: p.y,
    r: 3 + state.rng() * 1.5,
    value,
    color: Math.floor(state.rng() * 8),
  })
}

/** 复活一条 AI 蛇（远离所有现存蛇身）。 */
function spawnAiSnake(state: SlitherState): void {
  let p = randomInWorld(state.rng, 0.75)
  for (let attempt = 0; attempt < 24 && minBodyDist(state, p.x, p.y) < 320; attempt += 1) p = randomInWorld(state.rng, 0.75)
  const snake = makeSnake({
    id: state.nextId,
    ai: true,
    name: AI_NAMES[Math.floor(state.rng() * AI_NAMES.length)]!,
    color: 1 + Math.floor(state.rng() * 7),
    personality: PERSONALITIES[Math.floor(state.rng() * PERSONALITIES.length)]!,
    x: p.x,
    y: p.y,
    angle: state.rng() * Math.PI * 2,
    length: START_LENGTH + Math.floor(state.rng() * 26),
  })
  snake.nextThink = state.tick + 1 + Math.floor(state.rng() * AI_INTERVAL)
  state.nextId += 1
  state.snakes.push(snake)
}

/** ---------------- 段碰撞空间哈希 ---------------- */

/** 蛇身段空间哈希网格；cells 按 (cx + cy*cols) 存 (蛇下标+1)*1024+段号。 */
export interface SegmentGrid {
  cells: number[][]
  cols: number
}

/** 用所有存活蛇的当前轨迹段重建网格（每 tick 至多重建两次：AI 感知 + 碰撞）。 */
export function buildSegmentGrid(state: SlitherState): SegmentGrid {
  const cols = Math.ceil((WORLD_R * 2 + 400) / CELL)
  const cells: number[][] = []
  for (const s of state.snakes) {
    if (!s.alive) continue
    const idx = state.snakes.indexOf(s)
    for (let i = 0; i < s.points.length; i += 1) {
      const p = s.points[i]!
      const cx = Math.floor(p.x / CELL)
      const cy = Math.floor(p.y / CELL)
      if (cx < 0 || cy < 0 || cx >= cols || cy >= cols) continue
      const k = cx + cy * cols
      let list = cells[k]
      if (list === undefined) {
        list = []
        cells[k] = list
      }
      list.push((idx + 1) * 1024 + i)
    }
  }
  return { cells, cols }
}

/**
 * 查询 (x,y) 半径 r 内的段，逐段回调。
 * @param grid - buildSegmentGrid 的结果。
 * @param x - 查询中心 x。
 * @param y - 查询中心 y。
 * @param r - 查询半径（会扩展到覆盖单元格）。
 * @param cb - 命中回调（蛇下标 + 段号）；返回 true 提前终止。
 */
export function querySegmentGrid(
  grid: SegmentGrid, x: number, y: number, r: number,
  cb: (snakeIdx: number, segIdx: number) => boolean,
): void {
  const cx0 = Math.max(0, Math.floor((x - r) / CELL))
  const cy0 = Math.max(0, Math.floor((y - r) / CELL))
  const cx1 = Math.min(grid.cols - 1, Math.floor((x + r) / CELL))
  const cy1 = Math.min(grid.cols - 1, Math.floor((y + r) / CELL))
  for (let cy = cy0; cy <= cy1; cy += 1) {
    for (let cx = cx0; cx <= cx1; cx += 1) {
      const list = grid.cells[cx + cy * grid.cols]
      if (list === undefined) continue
      for (let k = 0; k < list.length; k += 1) {
        const pack = list[k]!
        if (cb(Math.floor(pack / 1024) - 1, pack % 1024)) return
      }
    }
  }
}

/** ---------------- AI 分帧调度 ---------------- */

/**
 * 本 tick 的 AI 决策切片：从 aiCursor 起轮转，至多处理
 * AI_DECISIONS_PER_TICK 条到期 AI；危险感知基于本 tick 起始位置的段网格。
 */
function runAiSlice(state: SlitherState): void {
  const due = state.snakes.some(s => s.ai && s.alive && s.nextThink <= state.tick)
  if (!due) {
    state.aiCursor = (state.aiCursor + 1) % Math.max(1, state.snakes.length)
    return
  }
  const grid = buildSegmentGrid(state)
  let decided = 0
  const n = state.snakes.length
  for (let k = 0; k < n && decided < AI_DECISIONS_PER_TICK; k += 1) {
    const idx = (state.aiCursor + k) % n
    const s = state.snakes[idx]
    if (s === undefined || !s.ai || !s.alive || s.nextThink > state.tick) continue
    const self = s
    const ctx: AiContext = {
      worldR: WORLD_R,
      cx: CX,
      cy: CY,
      baseSpeed: BASE_SPEED,
      danger(x: number, y: number): number {
        let count = 0
        querySegmentGrid(grid, x, y, 42, (_j, _seg) => {
          count += 1
          return false
        })
        return count
      },
    }
    const decision = decideAi(state, self, ctx)
    self.targetAngle = decision.angle
    self.boosting = decision.boost && self.length > MIN_BOOST_LENGTH + 8
    self.nextThink = state.tick + AI_INTERVAL
    decided += 1
  }
  state.aiCursor = (state.aiCursor + 1) % Math.max(1, n)
}

/** ---------------- 移动 / 进食 / 加速 ---------------- */

/**
 * 推进一条存活蛇一 tick：转向、位移、轨迹、加速耗长与吐点、进食。
 * maxTurn 由 stepSlither 在本 tick 一切状态变更之前统一预算，保证外部
 * 用 tick 开始时的 turnRatePerTick 可精确重构转向上界（测试用）。
 */
function moveSnake(state: SlitherState, s: SlitherSnake, maxTurn: number): void {
  s.angle = normAngle(s.angle + Math.max(-maxTurn, Math.min(maxTurn, normAngle(s.targetAngle - s.angle))))
  if (s.boosting && s.length <= MIN_BOOST_LENGTH) s.boosting = false
  const v = speedOf(s)
  s.x += Math.cos(s.angle) * v * TICK
  s.y += Math.sin(s.angle) * v * TICK
  s.points.unshift({ x: s.x, y: s.y })
  if (s.boosting) {
    s.length = Math.max(6, s.length - BOOST_COST_PER_TICK)
    if (state.tick % BOOST_DROP_EVERY === 0 && s.points.length > 0 && state.foods.length < FOOD_CAP) {
      const tail = s.points[s.points.length - 1]!
      state.foods.push({ x: tail.x, y: tail.y, r: 3.5, value: 1, color: s.color })
    }
  }
  const need = needSegments(s.length)
  while (s.points.length > need) s.points.pop()
  // 进食：头圆 vs 光点圆。
  const th = thicknessOf(s)
  const eatR = th * 0.5 + 8
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

/** 蛇头到第 seg 段的轨迹弧长。 */
function arcFromHead(s: SlitherSnake, seg: number): number {
  let sum = 0
  for (let i = 1; i <= seg && i < s.points.length; i += 1) {
    const a = s.points[i - 1]!
    const b = s.points[i]!
    sum += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return sum
}

/** 沿轨迹每 3 点爆一个战利品光点（总价值约 length*0.55）。 */
function dropLoot(state: SlitherState, s: SlitherSnake): void {
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

/** 处理一批死亡：击杀计费、爆战利品、玩家结束 / AI 入复活队列。 */
function processDeaths(state: SlitherState, deaths: { victim: SlitherSnake; killerIdx: number }[]): void {
  for (const d of deaths) {
    const v = d.victim
    v.alive = false
    v.boosting = false
    const killer = d.killerIdx >= 0 ? state.snakes[d.killerIdx] : undefined
    if (killer !== undefined && killer !== v && killer.alive) killer.kills += 1
    dropLoot(state, v)
    state.events.push({ type: 'death', x: v.x, y: v.y, color: v.color, victimId: v.id, killerId: killer !== undefined ? killer.id : -1, length: v.length })
    if (!v.ai) {
      state.over = true
      state.stats = { peak: Math.floor(v.peak), kills: v.kills, seconds: state.tick * TICK }
    } else {
      state.respawns.push(state.tick + AI_RESPAWN_TICKS)
    }
  }
}

/** 头 vs 一切蛇身段（含它蛇与越过安全弧长的自身段）与边界判定。 */
function resolveCollisions(state: SlitherState): void {
  const grid = buildSegmentGrid(state)
  const deaths: { victim: SlitherSnake; killerIdx: number }[] = []
  for (let i = 0; i < state.snakes.length; i += 1) {
    const s = state.snakes[i]!
    if (!s.alive) continue
    // 边界：蛇头出世界圆即死。
    if (Math.hypot(s.x - CX, s.y - CY) > WORLD_R) {
      deaths.push({ victim: s, killerIdx: -1 })
      continue
    }
    const thSelf = thicknessOf(s)
    let killerIdx = -1
    querySegmentGrid(grid, s.x, s.y, 60, (j, seg) => {
      const o = state.snakes[j]
      if (o === undefined || !o.alive) return false
      if (o === s && arcFromHead(s, seg) < selfClearPx(s)) return false
      const p = o.points[seg]
      if (p === undefined) return false
      const d = Math.hypot(p.x - s.x, p.y - s.y)
      if (d < thSelf * 0.45 + thicknessOf(o) * 0.8) {
        killerIdx = j
        return true
      }
      return false
    })
    if (killerIdx >= 0) deaths.push({ victim: s, killerIdx })
  }
  if (deaths.length > 0) processDeaths(state, deaths)
}

/** 补充常规光点（每 tick 至多 2 个）。 */
function spawnFood(state: SlitherState): void {
  for (let i = 0; i < 2 && state.foods.length < FOOD_TARGET; i += 1) spawnOneFood(state, 1)
}

/** 到期的 AI 复活。 */
function respawnDue(state: SlitherState): void {
  if (state.respawns.length === 0) return
  const remaining: number[] = []
  for (const due of state.respawns) {
    if (due <= state.tick) spawnAiSnake(state)
    else remaining.push(due)
  }
  state.respawns = remaining
}

/**
 * 推进恰好一个固定步长：AI 分帧决策 -> 全蛇移动/进食 -> 碰撞死亡 ->
 * 光点补充 -> AI 复活。玩家死亡置 over 并填充 stats（之后本函数直接返回）。
 * @param state - 目标状态（原地推进）。
 * @param input - 玩家本 tick 输入。
 */
export function stepSlither(state: SlitherState, input: SlitherInput): void {
  state.events.length = 0
  if (state.over) return
  const player = state.snakes[0]!
  // 转向上限在本 tick 任何状态（含加速开关）变更之前统一快照。
  const limits = state.snakes.map(s => turnRatePerTick(s))
  if (player.alive) {
    player.targetAngle = normAngle(input.angle)
    player.boosting = input.boost && player.length > MIN_BOOST_LENGTH
  }
  runAiSlice(state)
  for (let i = 0; i < state.snakes.length; i += 1) {
    const s = state.snakes[i]!
    if (s.alive) moveSnake(state, s, limits[i] ?? turnRatePerTick(s))
  }
  resolveCollisions(state)
  if (!state.over) {
    spawnFood(state)
    respawnDue(state)
  }
  state.tick += 1
}

/**
 * 玩家当前名次（按长度，1 = 最长；含所有存活蛇）。
 * @param state - 目标状态。
 * @returns 名次；玩家死亡时返回 -1。
 */
export function playerRank(state: SlitherState): number {
  const player = state.snakes[0]!
  if (!player.alive) return -1
  let rank = 1
  for (const s of state.snakes) {
    if (s !== player && s.alive && s.length > player.length) rank += 1
  }
  return rank
}

/**
 * 确定性重放校验快照：tick、各蛇头坐标/朝向/长度、光点数。
 * @param state - 目标状态。
 * @returns 可直接字符串比较的状态摘要。
 */
export function slitherSnapshot(state: SlitherState): string {
  let s = 't' + state.tick + 'f' + state.foods.length + 'o' + (state.over ? 1 : 0)
  for (const sn of state.snakes) {
    s += '|' + sn.id + (sn.alive
      ? ',' + sn.x.toFixed(2) + ',' + sn.y.toFixed(2) + ',' + sn.angle.toFixed(4) + ',' + sn.length.toFixed(2) + ',' + sn.kills
      : ',dead')
  }
  return s
}
