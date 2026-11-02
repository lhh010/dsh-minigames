/**
 * 黑洞吞噬（Hole.io）确定性引擎：固定步长（TICK）的城市大世界模拟。
 * 40x30 街区格上确定性生成三类物体（小：树/灯 r6、中：车 r14、大：楼
 * r30）；玩家黑洞 + 2 个 AI 黑洞（holes[0] 恒为玩家）在街上移动，只能
 * 吞「质心距洞心 < 洞半径 x 0.85 且物体半径 < 洞半径 x 0.8」的物体；
 * 吞噬瞬间物体进入 200ms 向洞心收缩的沉没动画（SHRINK_TICKS），洞半径
 * 按面积守恒增长（r = sqrt(r^2 + objR^2 x GROWTH_K)）。口径跨过里程碑
 * 阈值即解锁更高级物体并广播浮字事件；口径差 > 1.3 倍的大洞可以咬小洞
 * 一口（面积转移、小洞变小）；120 秒（DURATION_TICKS）限时结束按口径
 * 结算排名。随机数全部走 mulberry32(seed, round)，同 seed 同输入的 tick
 * 序列完全一致（用 holeSnapshot 校验）。时间单位秒，物理单位 px。
 */

/** 固定模拟步长（秒，30 tick/s）。 */
export const TICK = 1 / 30
/** 街区格边长与网格规模（40x30 街区）。 */
export const BLOCK = 88
export const GRID_COLS = 40
export const GRID_ROWS = 30
/** 世界尺寸（px）。 */
export const WORLD_W = GRID_COLS * BLOCK
export const WORLD_H = GRID_ROWS * BLOCK
/** 街区内物体摆放区内缩（留出马路）。 */
export const LOT_INSET = 15

/** 出生口径（半径）。 */
export const START_R = 14
/** 吞噬距离因子：质心距 < 洞半径 x 0.85 才能吞。 */
export const EAT_DIST_FACTOR = 0.85
/** 吞噬尺寸因子：物体半径 < 洞半径 x 0.8 才能吞。 */
export const EAT_SIZE_FACTOR = 0.8
/** 面积成长系数：吞下后 r^2 增加 objR^2 x GROWTH_K。 */
export const GROWTH_K = 0.9
/** 沉没动画时长（tick，200ms）。 */
export const SHRINK_TICKS = 6
/** 局时长（tick，120 秒）。 */
export const DURATION_TICKS = 3600
/** 玩家 / AI 移动速度（px/s，匀速）。 */
export const PLAYER_SPEED = 150
export const AI_SPEED = 140
/** AI 数量。 */
export const AI_COUNT = 2
/** 大洞咬小洞的口径比门槛。 */
export const BITE_RATIO = 1.3
/** 一口咬走的面积占受害者面积的比例。 */
export const BITE_AREA_FRAC = 0.3
/** 同一洞两次咬人的冷却（tick）。 */
export const BITE_COOLDOWN_TICKS = 45
/** 被咬后的最小口径（不再缩小）。 */
export const MIN_R = 8

/** 口径里程碑：跨过阈值即广播浮字（阈值 = 恰好能吞下一档物体）。 */
export const MILESTONES: readonly { r: number; text: string }[] = [
  { r: 17.6, text: '口径升级！可以吞汽车了 🚗' },
  { r: 37.6, text: '口径升级！可以吞大楼了 🏢' },
  { r: 60, text: '巨型天坑！吞噬整座城 🌆' },
]

/**
 * mulberry32 确定性随机数发生器（与其它游戏互不依赖的同名实现）。
 * @param seed - 非负整数种子。
 * @param round - 局号（同 seed 不同局生成不同城市）。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export function mulberry32(seed: number, round = 1): () => number {
  let a = (Math.floor(seed) * 313 + round * 29) >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 物体三档：小（树/路灯）、中（汽车）、大（大楼）。 */
export type ObjectKind = 'tree' | 'lamp' | 'car' | 'building'

/** 各档半径（px）。 */
export const KIND_RADIUS: Record<ObjectKind, number> = {
  tree: 6,
  lamp: 6,
  car: 14,
  building: 30,
}

/** 城市里一件可吞物体；沉没期间 x/y/r 由引擎逐 tick 收缩更新。 */
export interface CityObject {
  id: number
  kind: ObjectKind
  x: number
  y: number
  r: number
  /** 摆放朝向（车的车身方向，渲染用）。 */
  angle: number
  /** 是否正在被吞（收缩动画中）。 */
  sinking: boolean
  /** 开始沉没的 tick。 */
  sinkTick: number
  /** 沉没起点（收缩插值用）。 */
  sinkX: number
  sinkY: number
  sinkR: number
  /** 吞下它的洞下标。 */
  eater: number
}

/** 一个黑洞（玩家或 AI）；holes[0] 恒为玩家。 */
export interface Hole {
  id: number
  ai: boolean
  name: string
  x: number
  y: number
  /** 口径（半径）。 */
  r: number
  /** 吞下的物体数（玩家分数）。 */
  eaten: number
  /** 已越过的里程碑下标（只前进）。 */
  milestone: number
  /** 咬人冷却剩余 tick。 */
  biteCooldown: number
  /** 移动速度（px/s）。 */
  speed: number
}

/** 单步内产生、供渲染层消费的可视事件。 */
export type HoleEvent =
  | { type: 'milestone'; x: number; y: number; text: string; holeId: number }
  | { type: 'bite'; x: number; y: number; eaterId: number; victimId: number }

/** 结算时单个洞的排名行。 */
export interface HoleRankRow {
  name: string
  ai: boolean
  r: number
  eaten: number
  rank: number
}

/** 时间到结算数据。 */
export interface HoleStats {
  seconds: number
  rows: HoleRankRow[]
}

/** 一局游戏的完整可测状态。 */
export interface HoleState {
  tick: number
  rng: () => number
  nextObjectId: number
  objects: CityObject[]
  /** 静态物体空间哈希（按 BLOCK 单元格存对象引用；沉没/移除对象跳过）。 */
  grid: CityObject[][]
  holes: Hole[]
  events: HoleEvent[]
  over: boolean
  stats: HoleRankRow[] | null
}

/** 玩家一 tick 的输入：黑洞匀速逼近的目标点（世界坐标）。 */
export interface HoleInput {
  targetX: number
  targetY: number
}

/**
 * 吞噬判定：质心距与物体半径双门槛。
 * @param holeR - 洞半径。
 * @param objR - 物体半径。
 * @param dist - 质心距。
 * @returns true 表示可吞。
 */
export function canSwallow(holeR: number, objR: number, dist: number): boolean {
  return objR < holeR * EAT_SIZE_FACTOR && dist < holeR * EAT_DIST_FACTOR
}

/**
 * 吞下一件物体后的新口径（面积守恒式成长）。
 * @param r - 当前半径。
 * @param objR - 物体半径。
 * @returns 新半径。
 */
export function radiusAfterEat(r: number, objR: number): number {
  return Math.sqrt(r * r + objR * objR * GROWTH_K)
}

/** ---------------- 确定性城市生成 ---------------- */

/** 街区内物体摆放区（左右各内缩 LOT_INSET）。 */
function lotRange(i: number): { lo: number; hi: number } {
  const lo = i * BLOCK + LOT_INSET
  return { lo, hi: lo + BLOCK - LOT_INSET * 2 }
}

/**
 * 按街区格确定性生成一件物体（或 null）。
 * @param rng - 局随机源。
 * @param col - 街区列。
 * @param row - 街区行。
 * @param id - 物体 id。
 * @returns 物体，或该格无物体时 null。
 */
function makeCellObject(rng: () => number, col: number, row: number, id: number): CityObject | null {
  const xs = lotRange(col)
  const ys = lotRange(row)
  const cx = xs.lo + (xs.hi - xs.lo) / 2
  const cy = ys.lo + (ys.hi - ys.lo) / 2
  const inLot = (): { x: number; y: number } => {
    return { x: xs.lo + rng() * (xs.hi - xs.lo), y: ys.lo + rng() * (ys.hi - ys.lo) }
  }
  const base = (kind: ObjectKind, x: number, y: number, angle: number): CityObject => {
    return { id, kind, x, y, r: KIND_RADIUS[kind], angle, sinking: false, sinkTick: 0, sinkX: 0, sinkY: 0, sinkR: 0, eater: -1 }
  }
  const roll = rng()
  if (roll < 0.24) {
    return base('building', cx + (rng() - 0.5) * 10, cy + (rng() - 0.5) * 10, 0)
  }
  if (roll < 0.6) {
    const p = inLot()
    return base('car', p.x, p.y, rng() * Math.PI)
  }
  if (roll < 0.72) {
    // 路灯固定在摆放区角落。
    return base('lamp', xs.lo + 4, ys.lo + 4, 0)
  }
  if (roll < 0.94) {
    const p = inLot()
    return base('tree', p.x, p.y, 0)
  }
  return null
}

/**
 * 新开一局：生成城市、玩家洞（世界中心）与 2 个 AI 洞（对角）。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同 seed 不同局城市不同）。
 * @returns 初始状态。
 */
export function createHole(seed: number, round = 1): HoleState {
  const rng = mulberry32(seed, round)
  const state: HoleState = {
    tick: 0,
    rng,
    nextObjectId: 1,
    objects: [],
    grid: [],
    holes: [],
    events: [],
    over: false,
    stats: null,
  }
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const obj = makeCellObject(rng, col, row, state.nextObjectId)
      if (obj !== null) {
        state.objects.push(obj)
        state.nextObjectId += 1
      }
    }
  }
  state.holes.push({ id: 0, ai: false, name: '你', x: WORLD_W / 2, y: WORLD_H / 2, r: START_R, eaten: 0, milestone: 0, biteCooldown: 0, speed: PLAYER_SPEED })
  const aiSpots: readonly { x: number; y: number; name: string }[] = [
    { x: WORLD_W * 0.2, y: WORLD_H * 0.2, name: '赤洞' },
    { x: WORLD_W * 0.8, y: WORLD_H * 0.8, name: '绯洞' },
  ]
  for (let i = 0; i < AI_COUNT; i += 1) {
    const spot = aiSpots[i % aiSpots.length]!
    state.holes.push({ id: i + 1, ai: true, name: spot.name, x: spot.x, y: spot.y, r: START_R, eaten: 0, milestone: 0, biteCooldown: 0, speed: AI_SPEED })
  }
  rebuildGrid(state)
  return state
}

/** 用当前 objects 重建静态物体空间哈希（生成/测试摆位后调用）。 */
export function rebuildGrid(state: HoleState): void {
  const cols = GRID_COLS + 1
  const cells: CityObject[][] = []
  for (const obj of state.objects) {
    const cx = Math.floor(obj.x / BLOCK)
    const cy = Math.floor(obj.y / BLOCK)
    if (cx < 0 || cy < 0 || cx >= cols || cy >= GRID_ROWS + 1) continue
    const k = cx + cy * cols
    let list = cells[k]
    if (list === undefined) {
      list = []
      cells[k] = list
    }
    list.push(obj)
  }
  state.grid = cells
}

/**
 * 测试摆位：整体替换物体集并重建哈希。
 * @param state - 目标状态。
 * @param objects - 新物体集（id 任意，沉没字段会被重置）。
 */
export function placeObjects(state: HoleState, objects: CityObject[]): void {
  state.objects = objects
  for (const obj of objects) {
    obj.sinking = false
    obj.eater = -1
  }
  rebuildGrid(state)
}

/** ---------------- 移动与吞噬 ---------------- */

/** 匀速逼近目标点并夹在世界内。 */
function moveToward(hole: Hole, tx: number, ty: number): void {
  const dx = tx - hole.x
  const dy = ty - hole.y
  const dist = Math.hypot(dx, dy)
  const step = hole.speed * TICK
  if (dist > 1e-6 && dist > step) {
    hole.x += (dx / dist) * step
    hole.y += (dy / dist) * step
  } else {
    hole.x = tx
    hole.y = ty
  }
  hole.x = Math.max(0, Math.min(WORLD_W, hole.x))
  hole.y = Math.max(0, Math.min(WORLD_H, hole.y))
}

/**
 * 洞对周围物体做吞噬检查（空间哈希查询；命中即置沉没并立即成长）。
 * @param state - 目标状态。
 * @param idx - 洞下标。
 */
function swallowAround(state: HoleState, idx: number): void {
  const hole = state.holes[idx]!
  const reach = hole.r * EAT_DIST_FACTOR + KIND_RADIUS.building
  const cols = GRID_COLS + 1
  const cx0 = Math.max(0, Math.floor((hole.x - reach) / BLOCK))
  const cy0 = Math.max(0, Math.floor((hole.y - reach) / BLOCK))
  const cx1 = Math.min(cols - 1, Math.floor((hole.x + reach) / BLOCK))
  const cy1 = Math.min(GRID_ROWS, Math.floor((hole.y + reach) / BLOCK))
  for (let cy = cy0; cy <= cy1; cy += 1) {
    for (let cx = cx0; cx <= cx1; cx += 1) {
      const list = state.grid[cx + cy * cols]
      if (list === undefined) continue
      for (const obj of list) {
        if (obj.sinking) continue
        if (canSwallow(hole.r, obj.r, Math.hypot(obj.x - hole.x, obj.y - hole.y))) {
          obj.sinking = true
          obj.sinkTick = state.tick
          obj.sinkX = obj.x
          obj.sinkY = obj.y
          obj.sinkR = obj.r
          obj.eater = idx
          hole.r = radiusAfterEat(hole.r, obj.r)
          hole.eaten += 1
          checkMilestone(state, hole)
        }
      }
    }
  }
}

/** 口径跨过里程碑阈值即推进并广播浮字事件（只前进不回退）。 */
function checkMilestone(state: HoleState, hole: Hole): void {
  while (hole.milestone < MILESTONES.length && hole.r >= MILESTONES[hole.milestone]!.r) {
    const ms = MILESTONES[hole.milestone]!
    state.events.push({ type: 'milestone', x: hole.x, y: hole.y, text: ms.text, holeId: hole.id })
    hole.milestone += 1
  }
}

/** 推进沉没动画：向吞下者当前位置插值收缩，完毕后从场上移除。 */
function tickSinking(state: HoleState): void {
  if (!state.objects.some(obj => obj.sinking)) return
  const keep: CityObject[] = []
  for (const obj of state.objects) {
    if (!obj.sinking) {
      keep.push(obj)
      continue
    }
    const t = (state.tick - obj.sinkTick) / SHRINK_TICKS
    if (t >= 1) continue
    const eater = state.holes[obj.eater]
    const tx = eater !== undefined ? eater.x : obj.sinkX
    const ty = eater !== undefined ? eater.y : obj.sinkY
    obj.x = obj.sinkX + (tx - obj.sinkX) * t
    obj.y = obj.sinkY + (ty - obj.sinkY) * t
    obj.r = obj.sinkR * (1 - t)
    keep.push(obj)
  }
  state.objects = keep
  // 沉没对象仍留在 grid 里（按 sinking 标记跳过），无需重建。
}

/** ---------------- AI ---------------- */

/**
 * AI 目标：优先追咬得起的小洞（口径差够大且在感知半径内），否则朝最近
 * 的可吞物体移动；无可吞物时回世界中心。
 * @param state - 目标状态。
 * @param idx - AI 洞下标。
 * @returns 目标点。
 */
function aiTarget(state: HoleState, idx: number): { x: number; y: number } {
  const self = state.holes[idx]!
  for (let i = 0; i < state.holes.length; i += 1) {
    if (i === idx) continue
    const other = state.holes[i]!
    const d = Math.hypot(other.x - self.x, other.y - self.y)
    if (d < 420 && self.r > other.r * BITE_RATIO) return { x: other.x, y: other.y }
  }
  let best: CityObject | null = null
  let bestD = Infinity
  for (const obj of state.objects) {
    if (obj.sinking || obj.r >= self.r * EAT_SIZE_FACTOR) continue
    const d = Math.hypot(obj.x - self.x, obj.y - self.y)
    if (d < bestD) {
      bestD = d
      best = obj
    }
  }
  if (best !== null) return { x: best.x, y: best.y }
  return { x: WORLD_W / 2, y: WORLD_H / 2 }
}

/** ---------------- 洞对洞咬合 ---------------- */

/** 口径差超门槛且贴近的大洞咬小洞一口：面积转移 + 事件 + 冷却。 */
function resolveBites(state: HoleState): void {
  for (let a = 0; a < state.holes.length; a += 1) {
    const big = state.holes[a]!
    if (big.biteCooldown > 0) continue
    for (let b = 0; b < state.holes.length; b += 1) {
      if (a === b) continue
      const small = state.holes[b]!
      const dist = Math.hypot(small.x - big.x, small.y - big.y)
      if (big.r <= small.r * BITE_RATIO) continue
      if (dist >= big.r * EAT_DIST_FACTOR) continue
      // 一口咬走小洞 BITE_AREA_FRAC 的面积。
      const biteArea = small.r * small.r * BITE_AREA_FRAC
      small.r = Math.max(MIN_R, Math.sqrt(small.r * small.r - biteArea))
      big.r = Math.sqrt(big.r * big.r + biteArea)
      big.biteCooldown = BITE_COOLDOWN_TICKS
      checkMilestone(state, big)
      state.events.push({ type: 'bite', x: small.x, y: small.y, eaterId: big.id, victimId: small.id })
    }
  }
}

/** ---------------- 主步进 ---------------- */

/**
 * 推进恰好一个固定步长：玩家按输入目标匀速移动 -> AI 决策移动 -> 冷却
 * 递减 -> 吞噬检查 -> 洞对洞咬合 -> 沉没动画 -> 计时。时间到置 over 并
 * 填充结算排名 rows（此后本函数直接返回）。
 * @param state - 目标状态（原地推进）。
 * @param input - 玩家本 tick 输入（目标点）。
 */
export function stepHole(state: HoleState, input: HoleInput): void {
  state.events.length = 0
  if (state.over) return
  const player = state.holes[0]!
  moveToward(player, input.targetX, input.targetY)
  for (let i = 1; i < state.holes.length; i += 1) {
    const ai = state.holes[i]!
    const target = aiTarget(state, i)
    moveToward(ai, target.x, target.y)
  }
  for (const hole of state.holes) {
    if (hole.biteCooldown > 0) hole.biteCooldown -= 1
  }
  for (let i = 0; i < state.holes.length; i += 1) swallowAround(state, i)
  resolveBites(state)
  tickSinking(state)
  state.tick += 1
  if (state.tick >= DURATION_TICKS) finish(state)
}

/** 时间到：按口径面积结算排名。 */
function finish(state: HoleState): void {
  state.over = true
  const sorted = [...state.holes].sort((a, b) => b.r * b.r - a.r * a.r)
  state.stats = sorted.map((hole, i) => ({ name: hole.name, ai: hole.ai, r: hole.r, eaten: hole.eaten, rank: i + 1 }))
}

/**
 * 玩家当前名次（按口径面积，1 = 最大）。
 * @param state - 目标状态。
 * @returns 名次。
 */
export function playerRank(state: HoleState): number {
  const player = state.holes[0]!
  let rank = 1
  for (const hole of state.holes) {
    if (hole !== player && hole.r > player.r) rank += 1
  }
  return rank
}

/**
 * 确定性重放校验快照：tick、各洞坐标/口径/吞数、场上物体数。
 * @param state - 目标状态。
 * @returns 可直接字符串比较的状态摘要。
 */
export function holeSnapshot(state: HoleState): string {
  let s = 't' + state.tick + 'o' + state.objects.length + 'x' + (state.over ? 1 : 0)
  for (const hole of state.holes) {
    s += '|' + hole.id + ',' + hole.x.toFixed(2) + ',' + hole.y.toFixed(2) + ',' + hole.r.toFixed(3) + ',' + hole.eaten
  }
  return s
}
