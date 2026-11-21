/**
 * 潜行渗透（Stealth）纯逻辑：seed 确定性房间生成（边框 + 内部墙块 + 起点 +
 * 保险柜 + 钻石 + 守卫往返/环形巡逻路线，附连通性与出生点安全校验）、守卫
 * 按节拍步进巡逻、90° 视野锥判定（扇形张角 + 格点射线遮挡 raycast）、
 * 第 4 关起守卫听觉（连续快速移动累积警觉，警觉满临时扩锥）、被抓回起点
 * （守卫同步复位）、到达保险柜过关。全部随机走注入 seed（mulberry32），
 * 同 seed 重放完全一致；无 DOM。
 */

/** mulberry32：小型确定性 32 位 PRNG。
 * @param seed 种子（任意整数，内部取无符号 32 位）
 * @returns 返回 [0,1) 均匀随机数的函数
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

/** 格坐标。 */
export interface Cell { x: number; y: number }

/** 玩家四向输入名。 */
export type Dir = 'up' | 'right' | 'down' | 'left'

/** 守卫朝向单位向量（四轴向之一）。 */
export interface Facing { dx: number; dy: number }

/** DIRS 顺序与 Dir 一一对应。 */
const DIRS: ReadonlyArray<readonly [number, number, Dir]> = [
  [0, -1, 'up'], [1, 0, 'right'], [0, 1, 'down'], [-1, 0, 'left'],
]

/** 一条守卫巡逻路线：有序格子序列 + 往返（patrol）或环形（loop）走法。 */
export interface GuardRoute {
  cells: Cell[]
  loop: boolean
  /** 每多少节拍走一步（1 = 每拍都走）。 */
  cadence: number
  /** 相位偏移（0..cadence-1），让守卫错峰起步。 */
  phase: number
  startIndex: number
  startSign: 1 | -1
}

/** 守卫运行时状态。 */
export interface GuardState {
  x: number
  y: number
  facing: Facing
  cells: Cell[]
  loop: boolean
  index: number
  sign: 1 | -1
  cadence: number
  phase: number
  startIndex: number
  startSign: 1 | -1
  /** 视野距离（格）。 */
  range: number
  /** 警觉值 0..ALERT_MAX。 */
  alert: number
  /** 最近一次警觉增益的节拍号。 */
  lastAlertBeat: number
  /** 警觉满后扩锥生效至该节拍号（不含）。 */
  alertedUntilBeat: number
}

/** 钻石（taken 表示本关已收集）。 */
export interface Diamond { x: number; y: number; taken: boolean }

/** 生成出的静态盘面。 */
export interface RoomLayout {
  cols: number
  rows: number
  /** 1 = 墙，0 = 地板；行优先 y*cols+x。 */
  walls: Uint8Array
  start: Cell
  safe: Cell
  diamonds: Cell[]
  routes: GuardRoute[]
}

/** 游戏状态（纯数据，可直接被渲染与测试读取）。 */
export interface StealthState {
  level: number
  cols: number
  rows: number
  walls: Uint8Array
  start: Cell
  safe: Cell
  diamonds: Diamond[]
  guards: GuardState[]
  player: Cell
  lives: number
  score: number
  status: 'playing' | 'cleared' | 'gameover'
  /** 总节拍数。 */
  beats: number
  /** 节拍累积毫秒。 */
  beatMs: number
  /** 被抓红闪剩余毫秒（>0 时玩家被击晕不可移动）。 */
  caughtFlashMs: number
  /** 连续快速移动计数（听觉判定用）。 */
  moveStreak: number
  /** 上一次移动时的节拍号。 */
  lastMoveBeat: number
}

/** 总关数。 */
export const LEVEL_COUNT = 5
/** 警觉满阈值。 */
export const ALERT_MAX = 3
/** 听觉半径（切比雪夫距离，格）。 */
export const HEARING_RADIUS = 2
/** 基础半锥角（度）。 */
export const BASE_HALF_DEG = 45
/** 警觉满后半锥角（度）。 */
export const ALERT_HALF_DEG = 60
/** 警觉满后视野距离加成（格）。 */
export const ALERT_RANGE_BONUS = 2
/** 警觉满后扩锥持续的节拍数。 */
export const ALERT_BEATS = 12
/** 无增益连续节拍数后警觉衰减 1。 */
export const ALERT_DECAY_BEATS = 3
/** 被抓红闪时长（毫秒）。 */
export const CAUGHT_FLASH_MS = 900
/** 每颗钻石得分。 */
export const DIAMOND_SCORE = 30
/** 过关基础分。 */
export const CLEAR_BASE = 100
/** 过关时每条剩余生命加分。 */
export const CLEAR_LIFE_BONUS = 20
/** 初始生命。 */
export const START_LIVES = 3

/** 每关配置（守卫数 / 盘面尺寸 / 节拍间隔 / 视野 / 钻石数 / 听觉）。 */
export interface LevelConfig {
  guards: number
  cols: number
  rows: number
  beatMs: number
  range: number
  diamonds: number
  hearing: boolean
}

const LEVELS: readonly LevelConfig[] = [
  { guards: 2, cols: 13, rows: 11, beatMs: 900, range: 4, diamonds: 2, hearing: false },
  { guards: 2, cols: 14, rows: 11, beatMs: 800, range: 4, diamonds: 2, hearing: false },
  { guards: 3, cols: 15, rows: 12, beatMs: 720, range: 5, diamonds: 3, hearing: false },
  { guards: 3, cols: 16, rows: 12, beatMs: 640, range: 5, diamonds: 3, hearing: true },
  { guards: 4, cols: 17, rows: 13, beatMs: 560, range: 6, diamonds: 3, hearing: true },
]

/** 取第 level 关（1 起，越界钳制到 1..LEVEL_COUNT）的配置。
 * @param level 关卡号（1 起）
 * @returns 该关配置
 */
export function levelConfig(level: number): LevelConfig {
  const l = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level)))
  return LEVELS[l - 1]!
}

/** 该格是否为墙（越界按墙处理）。
 * @param s 读取 walls/cols/rows 的对象
 * @param x 列
 * @param y 行
 */
export function isWall(s: { walls: Uint8Array; cols: number; rows: number }, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= s.cols || y >= s.rows) return true
  return s.walls[y * s.cols + x] === 1
}

/** 切比雪夫距离（听觉与出生间距判定用）。 */
function cheb(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

/** 由位移推朝向（拐角处竖直分量优先，保证确定性）。 */
function facingOf(dx: number, dy: number): Facing {
  if (dy !== 0) return { dx: 0, dy: dy > 0 ? 1 : -1 }
  return { dx: dx > 0 ? 1 : -1, dy: 0 }
}

/** 格点射线遮挡：from 到 to 的连线（两端点除外）穿过任一墙格即被挡。
 * @param s 含 walls/cols/rows 的状态
 * @param from 起点格
 * @param to 终点格
 * @returns true 表示视线通畅
 */
export function hasLineOfSight(
  s: { walls: Uint8Array; cols: number; rows: number }, from: Cell, to: Cell,
): boolean {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return true
  const steps = Math.ceil(dist / 0.2)
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps
    const cx = Math.round(from.x + dx * t)
    const cy = Math.round(from.y + dy * t)
    if (cx === from.x && cy === from.y) continue
    if (cx === to.x && cy === to.y) continue
    if (isWall(s, cx, cy)) return false
  }
  return true
}

/** 守卫当前有效视野距离（警觉满时 +ALERT_RANGE_BONUS）。
 * @param state 用于读取 beats 的状态
 * @param guard 目标守卫
 */
export function effectiveRange(state: StealthState, guard: GuardState): number {
  return state.beats < guard.alertedUntilBeat ? guard.range + ALERT_RANGE_BONUS : guard.range
}

/** 守卫当前有效半锥角（弧度；警觉满时更宽）。
 * @param state 用于读取 beats 的状态
 * @param guard 目标守卫
 */
export function effectiveHalfRad(state: StealthState, guard: GuardState): number {
  return state.beats < guard.alertedUntilBeat
    ? (ALERT_HALF_DEG * Math.PI) / 180
    : (BASE_HALF_DEG * Math.PI) / 180
}

/** 判定守卫能否看见 target 格：距离 + 扇形张角 + 墙遮挡。
 * @param state 完整状态（提供 beats 与墙）
 * @param guard 目标守卫
 * @param target 被观测格
 */
export function guardSees(state: StealthState, guard: GuardState, target: Cell): boolean {
  const dx = target.x - guard.x
  const dy = target.y - guard.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return true
  if (dist > effectiveRange(state, guard)) return false
  const cos = (dx * guard.facing.dx + dy * guard.facing.dy) / dist
  if (cos < Math.cos(effectiveHalfRad(state, guard)) - 1e-9) return false
  return hasLineOfSight(state, guard, target)
}

/** 任一守卫是否看见玩家。
 * @param state 完整状态
 */
export function spotPlayer(state: StealthState): boolean {
  return state.guards.some(g => guardSees(state, g, state.player))
}

/** 由路线构造守卫初始运行时状态。
 * @param route 巡逻路线
 * @param range 视野距离（格）
 */
function toGuard(route: GuardRoute, range: number): GuardState {
  const idx = Math.min(route.startIndex, route.cells.length - 1)
  const cur = route.cells[idx]!
  const nxt = route.cells[Math.min(idx + 1, route.cells.length - 1)]!
  return {
    x: cur.x, y: cur.y,
    facing: facingOf(nxt.x - cur.x, nxt.y - cur.y),
    cells: route.cells, loop: route.loop,
    index: idx, sign: route.startSign,
    cadence: route.cadence, phase: route.phase,
    startIndex: idx, startSign: route.startSign,
    range, alert: 0, lastAlertBeat: -999, alertedUntilBeat: -1,
  }
}

/** 从 start 对地板做 BFS，返回可达格集合（x*cols+y 编码）。 */
function reachability(layout: { walls: Uint8Array; cols: number; rows: number }, start: Cell): Set<number> {
  const seen = new Set<number>()
  const queue: Cell[] = [start]
  seen.add(start.y * layout.cols + start.x)
  while (queue.length > 0) {
    const c = queue.shift()!
    for (const d of DIRS) {
      const nx = c.x + d[0]
      const ny = c.y + d[1]
      const key = ny * layout.cols + nx
      if (seen.has(key) || isWall(layout, nx, ny)) continue
      seen.add(key)
      queue.push({ x: nx, y: ny })
    }
  }
  return seen
}

/** 单次尝试生成一张盘面；任一约束不满足返回 null 由外层换种子重试。 */
function tryRoom(seed: number, level: number): RoomLayout | null {
  const cfg = levelConfig(level)
  const rand = mulberry32(seed)
  const cols = cfg.cols
  const rows = cfg.rows
  const walls = new Uint8Array(cols * rows)
  for (let x = 0; x < cols; x += 1) { walls[x] = 1; walls[(rows - 1) * cols + x] = 1 }
  for (let y = 0; y < rows; y += 1) { walls[y * cols] = 1; walls[y * cols + cols - 1] = 1 }
  const density = 0.13 + level * 0.012
  for (let y = 1; y < rows - 1; y += 1) {
    for (let x = 1; x < cols - 1; x += 1) if (rand() < density) walls[y * cols + x] = 1
  }
  const clearAround = (c: Cell): void => {
    walls[c.y * cols + c.x] = 0
    for (const d of DIRS) {
      const nx = c.x + d[0]
      const ny = c.y + d[1]
      if (nx > 0 && ny > 0 && nx < cols - 1 && ny < rows - 1) walls[ny * cols + nx] = 0
    }
  }
  const pick = (test: (c: Cell) => boolean): Cell | null => {
    for (let t = 0; t < 60; t += 1) {
      const c = { x: 1 + Math.floor(rand() * (cols - 2)), y: 1 + Math.floor(rand() * (rows - 2)) }
      if (rand() < 0.5) continue
      if (!isWall({ walls, cols, rows }, c.x, c.y) && test(c)) return c
    }
    return null
  }
  const start = pick(c => c.x <= Math.floor(cols / 3))
  if (start === null) return null
  clearAround(start)
  const safe = pick(c => c.x >= cols - 1 - Math.floor(cols / 3)
    && Math.abs(c.x - start.x) + Math.abs(c.y - start.y) >= Math.floor((cols + rows) / 2))
  if (safe === null) return null
  clearAround(safe)
  const reach = reachability({ walls, cols, rows }, start)
  if (!reach.has(safe.y * cols + safe.x)) return null
  const used = new Set<number>()
  used.add(start.y * cols + start.x)
  used.add(safe.y * cols + safe.x)
  for (let y = start.y - 1; y <= start.y + 1; y += 1) {
    for (let x = start.x - 1; x <= start.x + 1; x += 1) used.add(y * cols + x)
  }
  const diamonds: Cell[] = []
  for (let t = 0; t < 80 && diamonds.length < cfg.diamonds; t += 1) {
    const c = { x: 1 + Math.floor(rand() * (cols - 2)), y: 1 + Math.floor(rand() * (rows - 2)) }
    const key = c.y * cols + c.x
    if (!reach.has(key) || used.has(key)) continue
    if (Math.abs(c.x - start.x) + Math.abs(c.y - start.y) < 3) continue
    used.add(key)
    diamonds.push(c)
  }
  if (diamonds.length < cfg.diamonds) return null
  const free = (c: Cell): boolean => reach.has(c.y * cols + c.x) && !used.has(c.y * cols + c.x)
    && cheb(c, start) >= 3 && cheb(c, safe) >= 2
  const routes: GuardRoute[] = []
  for (let gi = 0; gi < cfg.guards; gi += 1) {
    let placed = false
    for (let t = 0; t < 50 && !placed; t += 1) {
      const wantLoop = gi % 2 === 1
      if (wantLoop) {
        const w = 3 + Math.floor(rand() * 3)
        const h = 3 + Math.floor(rand() * 3)
        const ox = 1 + Math.floor(rand() * (cols - w - 2))
        const oy = 1 + Math.floor(rand() * (rows - h - 2))
        const ring: Cell[] = []
        for (let x = ox; x < ox + w; x += 1) ring.push({ x, y: oy })
        for (let y = oy + 1; y < oy + h; y += 1) ring.push({ x: ox + w - 1, y })
        for (let x = ox + w - 2; x >= ox; x -= 1) ring.push({ x, y: oy + h - 1 })
        for (let y = oy + h - 2; y > oy; y -= 1) ring.push({ x: ox, y })
        if (ring.every(free)) {
          for (const c of ring) used.add(c.y * cols + c.x)
          routes.push({ cells: ring, loop: true, cadence: rand() < 0.6 ? 1 : 2, phase: 0, startIndex: 0, startSign: 1 })
          placed = true
        }
      } else {
        const d = DIRS[Math.floor(rand() * 4)]!
        const len = 3 + Math.floor(rand() * 4)
        const ox = 1 + Math.floor(rand() * (cols - 2))
        const oy = 1 + Math.floor(rand() * (rows - 2))
        const line: Cell[] = []
        for (let i = 0; i < len; i += 1) line.push({ x: ox + d[0] * i, y: oy + d[1] * i })
        if (line.every(c => c.x > 0 && c.y > 0 && c.x < cols - 1 && c.y < rows - 1 && free(c))) {
          for (const c of line) used.add(c.y * cols + c.x)
          routes.push({
            cells: line, loop: false, cadence: rand() < 0.6 ? 1 : 2,
            phase: 0, startIndex: Math.floor(rand() * line.length),
            startSign: rand() < 0.5 ? 1 : -1,
          })
          placed = true
        }
      }
    }
    if (!placed) return null
  }
  return { cols, rows, walls, start, safe, diamonds, routes }
}

/** 手工兜底盘面：种子重试全部失败时使用的确定性安全布局。 */
function fallbackRoom(level: number): RoomLayout {
  const cfg = levelConfig(level)
  const cols = Math.max(11, cfg.cols)
  const rows = Math.max(9, cfg.rows)
  const walls = new Uint8Array(cols * rows)
  for (let x = 0; x < cols; x += 1) { walls[x] = 1; walls[(rows - 1) * cols + x] = 1 }
  for (let y = 0; y < rows; y += 1) { walls[y * cols] = 1; walls[y * cols + cols - 1] = 1 }
  const midY = Math.floor(rows / 2)
  walls[2 * cols + Math.floor(cols / 2)] = 1
  walls[(rows - 3) * cols + Math.floor(cols / 2)] = 1
  const start = { x: 1, y: midY }
  const safe = { x: cols - 2, y: rows - 2 }
  // 兜底路线全部限制在右半区（x ≥ half），与左中部的起点保持足够距离，
  // 任何初始朝向都照不到出生点。
  const half = Math.floor(cols / 2) + 1
  const routeA: Cell[] = []
  for (let x = half; x <= cols - 3; x += 1) routeA.push({ x, y: 1 })
  const routeB: Cell[] = []
  for (let x = half; x <= cols - 3; x += 1) routeB.push({ x, y: rows - 2 })
  const routeC: Cell[] = []
  for (let y = 2; y <= rows - 3; y += 1) routeC.push({ x: cols - 3, y })
  const routeD: Cell[] = []
  for (let y = 2; y <= rows - 3; y += 1) routeD.push({ x: half, y })
  const pool: GuardRoute[] = [
    { cells: routeA, loop: false, cadence: 1, phase: 0, startIndex: 0, startSign: 1 },
    { cells: routeB, loop: false, cadence: 1, phase: 0, startIndex: 1, startSign: 1 },
    { cells: routeC, loop: false, cadence: 1, phase: 0, startIndex: 0, startSign: 1 },
    { cells: routeD, loop: false, cadence: 1, phase: 0, startIndex: 0, startSign: 1 },
  ]
  const diamonds: Cell[] = [{ x: cols - 2, y: 1 }, { x: 1, y: rows - 2 }, { x: half - 1, y: midY }]
  return { cols, rows, walls, start, safe, diamonds: diamonds.slice(0, cfg.diamonds), routes: pool.slice(0, cfg.guards) }
}

/** 生成第 level 关盘面：换种子重试至多 60 次，仍失败用兜底布局。
 * @param seed 确定性种子
 * @param level 关卡号（1 起）
 * @returns 满足连通 / 出生安全约束的盘面
 */
export function generateRoom(seed: number, level: number): RoomLayout {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const room = tryRoom((seed + attempt * 0x9e3779b9) >>> 0, level)
    if (room !== null) {
      // 出生点安全：任何守卫初始位置与朝向都不得照到起点。
      const check: StealthState = {
        level, cols: room.cols, rows: room.rows, walls: room.walls,
        start: room.start, safe: room.safe, diamonds: [],
        guards: room.routes.map(r => toGuard(r, levelConfig(level).range)),
        player: { ...room.start }, lives: 1, score: 0, status: 'playing',
        beats: 0, beatMs: 0, caughtFlashMs: 0, moveStreak: 0, lastMoveBeat: -999,
      }
      if (!spotPlayer(check)) return room
    }
  }
  return fallbackRoom(level)
}

/** 创建一关的初始状态。
 * @param seed 确定性种子（同 seed 同盘面）
 * @param level 关卡号（1 起）
 * @param lives 初始生命（默认 START_LIVES）
 * @param score 携带分数（跨关累计）
 */
export function createStealthState(seed: number, level: number, lives: number = START_LIVES, score: number = 0): StealthState {
  const room = generateRoom(seed, level)
  const cfg = levelConfig(level)
  return {
    level, cols: room.cols, rows: room.rows, walls: room.walls,
    start: room.start, safe: room.safe,
    diamonds: room.diamonds.map(d => ({ x: d.x, y: d.y, taken: false })),
    guards: room.routes.map(r => toGuard(r, cfg.range)),
    player: { ...room.start },
    lives, score, status: 'playing',
    beats: 0, beatMs: 0, caughtFlashMs: 0,
    moveStreak: 0, lastMoveBeat: -999,
  }
}

/** 守卫沿路线走一步（往返到端点折返 / 环形循环），并更新朝向。
 * @param guard 目标守卫
 */
export function stepGuard(guard: GuardState): void {
  const n = guard.cells.length
  if (n < 2) return
  let next: number
  if (guard.loop) {
    next = (guard.index + 1) % n
  } else {
    next = guard.index + guard.sign
    if (next < 0 || next >= n) {
      guard.sign = (guard.sign === 1 ? -1 : 1) as 1 | -1
      next = guard.index + guard.sign
    }
  }
  const cur = guard.cells[guard.index]!
  const cell = guard.cells[next]!
  guard.facing = facingOf(cell.x - cur.x, cell.y - cur.y)
  guard.index = next
  guard.x = cell.x
  guard.y = cell.y
}

/** 被抓处理：扣 1 命、玩家与全部守卫回初始位、红闪；命尽进入 gameover。
 * @param state 完整状态
 * @returns true 表示本次调用触发了被抓
 */
export function catchPlayer(state: StealthState): boolean {
  if (state.status !== 'playing') return false
  state.lives -= 1
  state.caughtFlashMs = CAUGHT_FLASH_MS
  state.player = { ...state.start }
  state.moveStreak = 0
  for (const g of state.guards) {
    g.index = g.startIndex
    g.sign = g.startSign
    g.x = g.cells[g.index]!.x
    g.y = g.cells[g.index]!.y
    const nxt = g.cells[Math.min(g.index + 1, g.cells.length - 1)]!
    g.facing = facingOf(nxt.x - g.x, nxt.y - g.y)
    g.alert = 0
    g.alertedUntilBeat = -1
  }
  if (state.lives <= 0) state.status = 'gameover'
  return true
}

/** 推进一个守卫节拍：到拍守卫走一步、警觉衰减、然后做视野判定。
 * @param state 完整状态
 * @returns true 表示本拍玩家被抓
 */
export function doBeat(state: StealthState): boolean {
  state.beats += 1
  for (const g of state.guards) {
    if ((state.beats - g.phase) % g.cadence === 0) stepGuard(g)
    if (g.alert > 0 && state.beats >= g.alertedUntilBeat
      && state.beats - g.lastAlertBeat >= ALERT_DECAY_BEATS) {
      g.alert -= 1
      g.lastAlertBeat = state.beats
    }
  }
  if (state.status !== 'playing') return false
  if (spotPlayer(state)) return catchPlayer(state)
  return false
}

/** 玩家朝 dir 走一格（若为地板）：吃钻石、听觉警觉累积、终点/被抓判定。
 * @param state 完整状态
 * @param dir 四向输入
 * @returns moved 是否移动；diamond 是否吃到钻石；cleared 是否过关；caught 是否被抓
 */
export function movePlayer(state: StealthState, dir: Dir): { moved: boolean; diamond: boolean; cleared: boolean; caught: boolean } {
  const result = { moved: false, diamond: false, cleared: false, caught: false }
  if (state.status !== 'playing' || state.caughtFlashMs > 0) return result
  const d = DIRS.find(v => v[2] === dir)!
  const nx = state.player.x + d[0]
  const ny = state.player.y + d[1]
  if (isWall(state, nx, ny)) return result
  state.player = { x: nx, y: ny }
  result.moved = true
  for (const gem of state.diamonds) {
    if (!gem.taken && gem.x === nx && gem.y === ny) {
      gem.taken = true
      state.score += DIAMOND_SCORE
      result.diamond = true
    }
  }
  // 听觉：与上一移同拍或相邻拍连续移动视为加速；附近有听觉守卫则警觉 +1。
  if (state.beats - state.lastMoveBeat <= 1) state.moveStreak += 1
  else state.moveStreak = 1
  state.lastMoveBeat = state.beats
  if (state.moveStreak >= 2 && levelConfig(state.level).hearing) {
    for (const g of state.guards) {
      if (cheb(g, state.player) <= HEARING_RADIUS) {
        g.alert = Math.min(ALERT_MAX, g.alert + 1)
        g.lastAlertBeat = state.beats
        if (g.alert >= ALERT_MAX) g.alertedUntilBeat = state.beats + ALERT_BEATS
      }
    }
  }
  if (nx === state.safe.x && ny === state.safe.y) {
    state.status = 'cleared'
    state.score += CLEAR_BASE + state.lives * CLEAR_LIFE_BONUS
    result.cleared = true
    return result
  }
  if (spotPlayer(state)) result.caught = catchPlayer(state)
  return result
}

/** 帧推进：衰减红闪、按关卡节拍间隔累积触发守卫节拍。
 * @param state 完整状态
 * @param dtMs 距上一帧毫秒
 */
export function tickStealth(state: StealthState, dtMs: number): void {
  if (state.caughtFlashMs > 0) state.caughtFlashMs = Math.max(0, state.caughtFlashMs - dtMs)
  if (state.status !== 'playing') return
  state.beatMs += Math.max(0, dtMs)
  const interval = levelConfig(state.level).beatMs
  let guard = true
  while (guard && state.beatMs >= interval) {
    state.beatMs -= interval
    doBeat(state)
    guard = state.status === 'playing'
  }
}
