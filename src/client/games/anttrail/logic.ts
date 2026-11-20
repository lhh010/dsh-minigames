/**
 * 蚁群引路（AntTrail）纯逻辑：俯视草地网格上，玩家不能直接指挥蚂蚁，
 * 只能放/撤障碍石（阻挡改道）与滴糖水（信息素吸引点，限时消退需续滴）
 * ——两种工具每关配额有限。蚁群从食物源出发随机游走，按感知半径内的
 * 信息素梯度偏转 + 随机扰动 + 障碍反弹移动；未扛食蚂蚁靠近食物源拾起
 * 食物，扛食蚂蚁回到蚁巢即得分。第 4 关起加入瓢虫天敌（沿矩形巡逻，
 * 碰到蚂蚁吃掉，可用障碍石困住）。至少 N 只（次）蚂蚁把食物搬回蚁巢
 * 即过关，5 关递进：场地更大/障碍预设更刁钻/配额更紧/N 更高。
 *
 * 确定性：随机数只通过注入 seed（mulberry32）派生的 rng（关卡布置 +
 * 蚂蚁随机扰动），物理按固定子步（SUBSTEP_MS）积分，整局可按
 * (seed, 工具操作 + 时间序列) 完整重放。时间单位全为毫秒。
 */

/** 逻辑画布宽（px）。 */
export const W = 480
/** 逻辑画布高（px），顶部 HUD_H 为信息条。 */
export const H = 600
/** 顶部 HUD 条高度（px）。 */
export const HUD_H = 30

/** 固定物理子步长（ms）：stepAntTrail 把外部 dt 累加后按此切分。 */
export const SUBSTEP_MS = 10
/** 网格边长（px）：障碍石与信息素都落在此网格上。 */
export const CELL = 20

// --- 蚂蚁参数 ---

/** 蚂蚁移动速度（px/s，恒速，方向由朝向决定）。 */
export const ANT_SPEED = 52
/** 蚂蚁碰撞半径（px）：贴墙/贴石的内缩边距。 */
export const ANT_R = 3
/** 随机游走强度（rad/子步内的扰动幅度，rng 均匀采样 ±一半）。 */
export const WANDER_RATE = 0.35
/** 信息素转向速率（rad/子步）：左右传感器值差超过阈值时偏转。 */
export const STEER_RATE = 0.3
/** 传感器探测距离（px，朝向前方左右各一）。 */
export const SENSOR_DIST = 16
/** 左右传感器相对朝向的张角（rad）。 */
export const SENSOR_ANGLE = 0.9
/** 传感器触发需要的最小值差（信息素无量纲）。 */
export const SENSOR_EPS = 0.01
/** 拾取食物判定半径（px）：未扛食蚂蚁距食物源小于此值即扛食。 */
export const PICK_R = 16
/** 回巢判定半径（px）：扛食蚂蚁距蚁巢小于此值即交付得分。 */
export const NEST_R = 18

// --- 糖水 / 信息素参数 ---

/** 一次糖水的存续时长（ms）：期间持续向所在格注入信息素，到期即停。 */
export const SUGAR_LIFE_MS = 6000
/** 每 5 个子步（50ms）做一次信息素扩散/消退。 */
export const DIFFUSE_EVERY = 5
/** 每次扩散时糖水向所在格注入的信息素量。 */
export const SUGAR_ADD = 1.0
/** 每次扩散的信息素按比例消退系数。 */
export const DECAY = 0.06
/** 每次扩散向四个非障碍邻格扩散的份额。 */
export const SPREAD = 0.14
/** 单格信息素上限。 */
export const PHER_MAX = 4

// --- 瓢虫参数 ---

/** 瓢虫巡逻速度（px/s，沿场地内缩矩形环路巡航）。 */
export const LADY_SPEED = 40
/** 瓢虫捕食半径（px）：范围内的蚂蚁被吃掉。 */
export const EAT_R = 9
/** 瓢虫前方探测距离（px）：前方格被障碍堵住即掉头。 */
export const LADY_AHEAD = 10

// --- 计分 / 流程 ---

/** 每次交付食物的即时加分。 */
export const SCORE_PER_DELIVERY = 20
/** 过关时的固定加分。 */
export const WIN_BONUS = 60
/** 过关后停留展示时长（ms），随后自动进入下一关。 */
export const WIN_LINGER_MS = 1600

/** 一关的难度配置。 */
export interface AntTrailLevel {
  /** 本关蚂蚁数（15-30）。 */
  antCount: number
  /** 过关需要的交付次数 N。 */
  need: number
  /** 玩家可放的障碍石配额。 */
  stoneQuota: number
  /** 玩家可滴的糖水次数配额。 */
  sugarQuota: number
  /** 限时（ms）。 */
  timeLimitMs: number
  /** 瓢虫数量（第 4 关起 ≥1）。 */
  ladybugs: number
  /** 场地内缩（px）：越小场地越大。 */
  inset: number
  /** 预设障碍样式。 */
  preset: 'none' | 'wall-v' | 'double-v' | 'cross' | 'maze'
}

/** 5 关递进配置：蚁群变大、场地变大、预设更刁钻、配额更紧、N 更高。 */
export const LEVELS: AntTrailLevel[] = [
  { antCount: 16, need: 4, stoneQuota: 8, sugarQuota: 10, timeLimitMs: 90_000, ladybugs: 0, inset: 40, preset: 'none' },
  { antCount: 20, need: 6, stoneQuota: 7, sugarQuota: 9, timeLimitMs: 95_000, ladybugs: 0, inset: 28, preset: 'wall-v' },
  { antCount: 24, need: 8, stoneQuota: 6, sugarQuota: 8, timeLimitMs: 100_000, ladybugs: 0, inset: 16, preset: 'double-v' },
  { antCount: 26, need: 10, stoneQuota: 6, sugarQuota: 7, timeLimitMs: 110_000, ladybugs: 1, inset: 8, preset: 'cross' },
  { antCount: 30, need: 12, stoneQuota: 5, sugarQuota: 6, timeLimitMs: 120_000, ladybugs: 2, inset: 2, preset: 'maze' },
]

/** 轴对齐矩形。 */
export interface Rect { x: number, y: number, w: number, h: number }

/** 一只蚂蚁：位置、朝向（rad）、是否扛食。 */
export interface Ant { x: number, y: number, heading: number, carrying: boolean }

/** 一滴糖水：位置与剩余存续时长。 */
export interface SugarDrop { x: number, y: number, lifeMs: number }

/** 一只瓢虫：位置、当前巡逻路点下标（0-3）与巡回方向（1 顺 / -1 逆）。 */
export interface Ladybug { x: number, y: number, wpIndex: number, dir: number }

/** 游戏阶段。 */
export type AntTrailPhase = 'playing' | 'won' | 'lost' | 'campaign-won'

/** 整局状态：campaign 从第 0 关打到第 4 关，跨关累计分数。 */
export interface AntTrailState {
  seed: number
  levelIndex: number
  phase: AntTrailPhase
  /** 网格列数 / 行数（由关卡 inset 决定）。 */
  cols: number
  rows: number
  /** 本关草地矩形（不含顶部 HUD）。 */
  field: Rect
  /** 障碍石占用（网格一维化，preset 与玩家共用）。 */
  stones: boolean[]
  /** 每格障碍石归属：0 无、1 预设、2 玩家（撤玩家石返还配额）。 */
  stoneOwner: Uint8Array
  /** 玩家已放置的障碍石数（撤除返还）。 */
  stonesUsed: number
  /** 玩家已滴糖水次数。 */
  sugarsUsed: number
  drops: SugarDrop[]
  /** 信息素场（网格一维化，与 stones 同下标）。 */
  pher: Float32Array
  ants: Ant[]
  ladybugs: Ladybug[]
  /** 食物源（场地左侧中部）与蚁巢（右侧中部）。 */
  food: { x: number, y: number }
  nest: { x: number, y: number }
  delivered: number
  score: number
  timeLeftMs: number
  elapsedMs: number
  winTimerMs: number
  stepAccumulatorMs: number
  /** 已执行的子步总数（驱动每 5 步一次的信息素扩散）。 */
  substeps: number
  /** 由 seed 派生的确定性随机源（布置 + 蚂蚁扰动）。 */
  rng: () => number
}

/**
 * mulberry32 确定性随机数发生器：同 seed 产生同一 [0,1) 序列。
 * @param seed - 32 位整数种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 两点距离。 */
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

/** 本关草地矩形（不含顶部 HUD）。 */
export function fieldRect(level: AntTrailLevel): Rect {
  return { x: level.inset, y: HUD_H + level.inset, w: W - level.inset * 2, h: H - HUD_H - level.inset * 2 }
}

/** 网格下标（一维）；col/row 越界返回 -1。 */
function cellIndex(st: AntTrailState, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= st.cols || row >= st.rows) return -1
  return col + row * st.cols
}

/**
 * 逻辑坐标所在网格的下标（一维）。
 * @param st - 游戏状态。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @returns 一维下标，场地外返回 -1。
 */
export function cellAt(st: AntTrailState, x: number, y: number): number {
  const col = Math.floor((x - st.field.x) / CELL)
  const row = Math.floor((y - st.field.y) / CELL)
  return cellIndex(st, col, row)
}

/** 网格中心坐标。 */
function cellCenter(st: AntTrailState, index: number): { x: number, y: number } {
  const col = index % st.cols
  const row = Math.floor(index / st.cols)
  return { x: st.field.x + col * CELL + CELL / 2, y: st.field.y + row * CELL + CELL / 2 }
}

/**
 * 位置是否被挡住（碰墙、越界或所在格是障碍石）。以点近似蚂蚁身体。
 * @param st - 游戏状态。
 * @param x - 目标 x。
 * @param y - 目标 y。
 * @returns true 表示不能进入该位置。
 */
export function isBlocked(st: AntTrailState, x: number, y: number): boolean {
  const f = st.field
  if (x < f.x + ANT_R || x > f.x + f.w - ANT_R || y < f.y + ANT_R || y > f.y + f.h - ANT_R) return true
  const i = cellAt(st, x, y)
  return i < 0 || st.stones[i] === true
}

/**
 * 查询某点信息素浓度（就近格，不插值）。
 * @param st - 游戏状态。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @returns 浓度（场地外为 0）。
 */
export function pheromoneAt(st: AntTrailState, x: number, y: number): number {
  const i = cellAt(st, x, y)
  return i < 0 ? 0 : st.pher[i] ?? 0
}

/** 一格是否允许落石：不在食物源/蚁巢附近。 */
function stoneAllowedAt(st: AntTrailState, index: number): boolean {
  const c = cellCenter(st, index)
  return dist(c.x, c.y, st.food.x, st.food.y) >= 40 && dist(c.x, c.y, st.nest.x, st.nest.y) >= 40
}

/** 应用关卡预设障碍（避开食物源/蚁巢附近与已占格）。 */
function applyPreset(st: AntTrailState, preset: AntTrailLevel['preset']): void {
  const set = (col: number, row: number): void => {
    const i = cellIndex(st, col, row)
    if (i >= 0 && stoneAllowedAt(st, i)) {
      st.stones[i] = true
      st.stoneOwner[i] = 1
    }
  }
  const midCol = Math.floor(st.cols / 2)
  const midRow = Math.floor(st.rows / 2)
  if (preset === 'wall-v') {
    for (let row = 0; row < st.rows; row += 1) {
      if (row >= midRow - 1 && row <= midRow + 1) continue
      set(midCol, row)
    }
  } else if (preset === 'double-v') {
    const c1 = Math.floor(st.cols / 3)
    const c2 = Math.floor((st.cols * 2) / 3)
    for (let row = 0; row < st.rows; row += 1) {
      if (row > 3) set(c1, row) // 第一堵墙上端留口
      if (row < st.rows - 4) set(c2, row) // 第二堵墙下端留口
    }
  } else if (preset === 'cross') {
    for (let row = 0; row < st.rows; row += 1) {
      if (row >= midRow - 1 && row <= midRow + 1) continue
      set(midCol, row)
    }
    for (let col = 0; col < st.cols; col += 1) {
      if (col >= midCol - 1 && col <= midCol + 1) continue
      set(col, midRow)
    }
  } else if (preset === 'maze') {
    for (let k = 1; k <= 4; k += 1) {
      const col = Math.floor((st.cols * k) / 5)
      const topGap = k % 2 === 1 // 奇数墙上口、偶数墙下口，交错蛇形
      for (let row = 0; row < st.rows; row += 1) {
        if (topGap ? row < 4 : row > st.rows - 5) continue
        set(col, row)
      }
    }
  }
}

/**
 * 用 seed 派生 rng 重置当前关卡：食物源在左、蚁巢在右，蚂蚁群在食物源
 * 周围出生（未扛食，第一步即拾食），瓢虫锚在巡逻环角点，全部由
 * (seed, levelIndex) 决定。
 * @param st - 游戏状态（levelIndex 已指向目标关）。
 */
export function startLevel(st: AntTrailState): void {
  const level = LEVELS[st.levelIndex]!
  const f = fieldRect(level)
  const rng = mulberry32((st.seed ^ 0x5bd1e995) + (st.levelIndex + 1) * 6151)

  st.phase = 'playing'
  st.field = f
  st.cols = Math.floor(f.w / CELL)
  st.rows = Math.floor(f.h / CELL)
  st.stones = new Array<boolean>(st.cols * st.rows).fill(false)
  st.stoneOwner = new Uint8Array(st.cols * st.rows)
  st.stonesUsed = 0
  st.sugarsUsed = 0
  st.drops = []
  st.pher = new Float32Array(st.cols * st.rows)
  st.delivered = 0
  st.timeLeftMs = level.timeLimitMs
  st.elapsedMs = 0
  st.winTimerMs = 0
  st.stepAccumulatorMs = 0
  st.substeps = 0
  st.rng = rng

  st.food = { x: f.x + 28, y: f.y + f.h / 2 }
  st.nest = { x: f.x + f.w - 28, y: f.y + f.h / 2 }

  applyPreset(st, level.preset)

  st.ants = []
  for (let i = 0; i < level.antCount; i += 1) {
    const ang = rng() * Math.PI * 2
    const r = 4 + rng() * 10
    const x = st.food.x + Math.cos(ang) * r
    const y = st.food.y + Math.sin(ang) * r
    st.ants.push({ x, y, heading: rng() * Math.PI * 2, carrying: false })
  }

  st.ladybugs = []
  const wps = ladybugWaypoints(st)
  for (let i = 0; i < level.ladybugs; i += 1) {
    const wp = wps[i % wps.length]!
    st.ladybugs.push({ x: wp.x, y: wp.y, wpIndex: (i + 1) % wps.length, dir: 1 })
  }
}

/**
 * 开新战役。
 * @param seed - 随机种子（默认取自 Math.random，测试注入固定值）。
 * @returns 第 0 关初始状态。
 */
export function createAntTrail(seed: number = Math.floor(Math.random() * 0x7fffffff)): AntTrailState {
  const st: AntTrailState = {
    seed,
    levelIndex: 0,
    phase: 'playing',
    cols: 0,
    rows: 0,
    field: { x: 0, y: 0, w: 0, h: 0 },
    stones: [],
    stoneOwner: new Uint8Array(0),
    stonesUsed: 0,
    sugarsUsed: 0,
    drops: [],
    pher: new Float32Array(0),
    ants: [],
    ladybugs: [],
    food: { x: 0, y: 0 },
    nest: { x: 0, y: 0 },
    delivered: 0,
    score: 0,
    timeLeftMs: 0,
    elapsedMs: 0,
    winTimerMs: 0,
    stepAccumulatorMs: 0,
    substeps: 0,
    rng: mulberry32(seed),
  }
  startLevel(st)
  return st
}

/**
 * 玩家工具 1：在逻辑坐标处放/撤一块障碍石。放到已占格即撤除；撤玩家
 * 石返还配额（预设石撤除不返还也不计费）。食物源/蚁巢附近与场地外无效。
 * @param st - 游戏状态。
 * @param x - 点击逻辑 x。
 * @param y - 点击逻辑 y。
 * @returns true 表示本次操作生效。
 */
export function toggleStone(st: AntTrailState, x: number, y: number): boolean {
  if (st.phase !== 'playing') return false
  const i = cellAt(st, x, y)
  if (i < 0) return false
  if (st.stones[i] === true) {
    st.stones[i] = false
    if (st.stoneOwner[i] === 2) st.stonesUsed -= 1
    st.stoneOwner[i] = 0
    st.pher[i] = 0
    return true
  }
  if (st.stonesUsed >= LEVELS[st.levelIndex]!.stoneQuota) return false
  if (!stoneAllowedAt(st, i)) return false
  st.stones[i] = true
  st.stoneOwner[i] = 2
  st.stonesUsed += 1
  return true
}

/**
 * 玩家工具 2：在逻辑坐标处滴一滴糖水（消耗一次配额）。障碍格、场地外
 * 与食物源/蚁巢近旁无效；存续 SUGAR_LIFE_MS，期间持续注入信息素。
 * @param st - 游戏状态。
 * @param x - 点击逻辑 x。
 * @param y - 点击逻辑 y。
 * @returns true 表示本次操作生效。
 */
export function dropSugar(st: AntTrailState, x: number, y: number): boolean {
  if (st.phase !== 'playing') return false
  if (st.sugarsUsed >= LEVELS[st.levelIndex]!.sugarQuota) return false
  const i = cellAt(st, x, y)
  if (i < 0 || st.stones[i] === true || !stoneAllowedAt(st, i)) return false
  st.drops.push({ x, y, lifeMs: SUGAR_LIFE_MS })
  st.sugarsUsed += 1
  return true
}

/** 瓢虫巡逻环路四角（场地内缩矩形）。 */
export function ladybugWaypoints(st: AntTrailState): Array<{ x: number, y: number }> {
  const f = st.field
  const m = 46
  return [
    { x: f.x + m, y: f.y + m },
    { x: f.x + f.w - m, y: f.y + m },
    { x: f.x + f.w - m, y: f.y + f.h - m },
    { x: f.x + m, y: f.y + f.h - m },
  ]
}

/** 蚂蚁感知信息素并偏转 + 随机扰动（每子步一次）。 */
function steerAnt(st: AntTrailState, ant: Ant): void {
  const left = pheromoneAt(st, ant.x + Math.cos(ant.heading - SENSOR_ANGLE) * SENSOR_DIST, ant.y + Math.sin(ant.heading - SENSOR_ANGLE) * SENSOR_DIST)
  const right = pheromoneAt(st, ant.x + Math.cos(ant.heading + SENSOR_ANGLE) * SENSOR_DIST, ant.y + Math.sin(ant.heading + SENSOR_ANGLE) * SENSOR_DIST)
  if (left > right + SENSOR_EPS) ant.heading -= STEER_RATE
  else if (right > left + SENSOR_EPS) ant.heading += STEER_RATE
  ant.heading += (st.rng() - 0.5) * WANDER_RATE
}

/** 蚂蚁按朝向恒速移动，x/y 两轴分别撞石/撞墙反弹。 */
function moveAnt(st: AntTrailState, ant: Ant, dt: number): void {
  const vx = Math.cos(ant.heading) * ANT_SPEED
  const vy = Math.sin(ant.heading) * ANT_SPEED
  const nx = ant.x + vx * dt
  if (!isBlocked(st, nx, ant.y)) ant.x = nx
  else ant.heading = Math.PI - ant.heading // 水平反弹
  const ny = ant.y + vy * dt
  if (!isBlocked(st, ant.x, ny)) ant.y = ny
  else ant.heading = -ant.heading // 垂直反弹
}

/**
 * 信息素扩散 + 消退（每 DIFFUSE_EVERY 个子步一次）：糖水先向所在格
 * 注入，随后每格按 DECAY 消退、把 SPREAD 份额分给非障碍邻格。
 */
function diffuse(st: AntTrailState): void {
  for (const drop of st.drops) {
    const i = cellAt(st, drop.x, drop.y)
    if (i >= 0) st.pher[i] = Math.min(PHER_MAX, (st.pher[i] ?? 0) + SUGAR_ADD)
  }
  const next = new Float32Array(st.pher.length)
  for (let row = 0; row < st.rows; row += 1) {
    for (let col = 0; col < st.cols; col += 1) {
      const i = cellIndex(st, col, row)
      if (st.stones[i] === true) continue
      const v = (st.pher[i] ?? 0) * (1 - DECAY)
      if (v <= 0.0005) continue
      const keep = v * (1 - SPREAD)
      const share = (v * SPREAD) / 4
      next[i] = next[i]! + keep
      const neighbors = [cellIndex(st, col - 1, row), cellIndex(st, col + 1, row), cellIndex(st, col, row - 1), cellIndex(st, col, row + 1)]
      for (const n of neighbors) {
        if (n >= 0 && st.stones[n] !== true) next[n] = next[n]! + share
      }
    }
  }
  st.pher = next
}

/** 单个固定子步：糖水计时、信息素扩散、蚂蚁感知/移动/拾食/交付、瓢虫巡逻捕食、计时与过关推进。 */
function substep(st: AntTrailState): void {
  const dt = SUBSTEP_MS / 1000

  if (st.phase === 'won') {
    st.winTimerMs += SUBSTEP_MS
    st.elapsedMs += SUBSTEP_MS
    if (st.winTimerMs >= WIN_LINGER_MS) {
      if (st.levelIndex + 1 >= LEVELS.length) st.phase = 'campaign-won'
      else {
        st.levelIndex += 1
        startLevel(st)
      }
    }
    return
  }
  if (st.phase !== 'playing') return

  st.elapsedMs += SUBSTEP_MS
  st.substeps += 1
  st.timeLeftMs -= SUBSTEP_MS

  for (let i = st.drops.length - 1; i >= 0; i -= 1) {
    const d = st.drops[i]!
    d.lifeMs -= SUBSTEP_MS
    if (d.lifeMs <= 0) st.drops.splice(i, 1)
  }
  if (st.substeps % DIFFUSE_EVERY === 0) diffuse(st)

  for (const ant of st.ants) {
    steerAnt(st, ant)
    moveAnt(st, ant, dt)
    if (!ant.carrying && dist(ant.x, ant.y, st.food.x, st.food.y) < PICK_R) ant.carrying = true
    if (ant.carrying && dist(ant.x, ant.y, st.nest.x, st.nest.y) < NEST_R) {
      ant.carrying = false
      st.delivered += 1
      st.score += SCORE_PER_DELIVERY
      if (st.delivered >= LEVELS[st.levelIndex]!.need) {
        st.phase = 'won'
        st.winTimerMs = 0
        st.score += WIN_BONUS
      }
    }
  }

  const wps = ladybugWaypoints(st)
  for (const bug of st.ladybugs) {
    const wp = wps[bug.wpIndex]!
    const d = dist(bug.x, bug.y, wp.x, wp.y)
    if (d < 5) {
      bug.wpIndex = (bug.wpIndex + bug.dir + wps.length) % wps.length
      continue
    }
    const ux = (wp.x - bug.x) / d
    const uy = (wp.y - bug.y) / d
    if (isBlocked(st, bug.x + ux * LADY_AHEAD, bug.y + uy * LADY_AHEAD)) {
      // 前方被障碍石堵住：掉头改巡回方向（可被玩家用石头困死）。
      bug.dir = -bug.dir
      bug.wpIndex = (bug.wpIndex + bug.dir + wps.length) % wps.length
      continue
    }
    bug.x += ux * LADY_SPEED * dt
    bug.y += uy * LADY_SPEED * dt
  }
  for (let i = st.ants.length - 1; i >= 0; i -= 1) {
    const ant = st.ants[i]!
    for (const bug of st.ladybugs) {
      if (dist(ant.x, ant.y, bug.x, bug.y) < EAT_R) {
        st.ants.splice(i, 1)
        break
      }
    }
  }

  if (st.phase === 'playing' && (st.timeLeftMs <= 0 || st.ants.length === 0)) st.phase = 'lost'
}

/**
 * 推进模拟：把外部 dt（ms）累加后按固定子步切分执行。
 * @param st - 游戏状态。
 * @param dtMs - 距上一帧的毫秒数。
 */
export function stepAntTrail(st: AntTrailState, dtMs: number): void {
  if (st.phase === 'lost' || st.phase === 'campaign-won') return
  st.stepAccumulatorMs += Math.max(0, dtMs)
  while (st.stepAccumulatorMs >= SUBSTEP_MS) {
    st.stepAccumulatorMs -= SUBSTEP_MS
    substep(st)
  }
}
