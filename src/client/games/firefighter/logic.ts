/**
 * 消防救火纯逻辑：街区网格（建筑/草地/空地）上随机起火，玩家消防员
 * 四向移动并按空格喷射锥形水柱；火沿易燃格按 seed 概率流蔓延（风向
 * 加成），建筑燃尽成黑色废墟并计入损失。全部状态可变但完全确定：同
 * 一 seed + 同一指令序列必然整局重放一致，测试直接驱动本模块。
 */

/** 确定性 32 位随机源（盘面生成 / 蔓延概率流）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 格子地物类型：建筑（不可通行、高燃值、烧毁计损失）、草地（可通行、
 * 快速蔓延、烧尽仅烧焦）、空地（道路，不燃）。 */
export type TileKind = 'building' | 'grass' | 'empty'
export type Direction = 'up' | 'down' | 'left' | 'right'
export type FirePhase = 'play' | 'clear' | 'won'

/** 相邻格点火基础概率：草快建筑慢，空地不可燃。 */
export const CATCH_GRASS = 0.32
export const CATCH_BUILDING = 0.18
/** 风向加成：下风侧邻居 ×1.8，逆风侧 ×0.45。 */
export const WIND_ALIGNED = 1.8
export const WIND_OPPOSED = 0.45
/** 每格燃值（火强度上限）：建筑高燃值难扑灭，草低燃值速燃速尽。 */
export const FUEL_BUILDING = 6
export const FUEL_GRASS = 3
/** 单次喷水对准格火强度的削减量。 */
export const WATER_DMG = 3
/** 水柱射程（格）。 */
export const SPRAY_RANGE = 4
/** 消防员碰火受伤后的冷却秒数（回撤起点，不是死亡）。 */
export const INJURE_COOLDOWN = 3
/** 火势节奏：每 FIRE_INTERVAL 秒结算一次增长+蔓延。 */
export const FIRE_INTERVAL = 0.85
/** 喷水节奏：按住空格每 WATER_INTERVAL 秒结算一次命中。 */
export const WATER_INTERVAL = 0.28
/** 关卡过关展示秒数，随后自动进入下一关。 */
export const CLEAR_TIME = 2.2

/** 一关的盘面与火情参数。 */
export interface FireLevelConfig {
  /** 网格宽（格）。 */
  w: number
  /** 网格高（格）。 */
  h: number
  /** 初始火点数。 */
  fires: number
  /** 风向单位向量（[dx, dy]），影响蔓延概率的方向加成。 */
  wind: readonly [number, number]
}

/** 5 关递进：街区更大、火点更多、风向逐关偏移。 */
export const LEVELS: readonly FireLevelConfig[] = [
  { w: 9, h: 7, fires: 2, wind: [0, 0] },
  { w: 11, h: 8, fires: 3, wind: [1, 0] },
  { w: 11, h: 8, fires: 4, wind: [-1, 0] },
  { w: 13, h: 9, fires: 5, wind: [0, 1] },
  { w: 13, h: 9, fires: 6, wind: [0, -1] },
]

/** 地物的引燃概率（空地恒 0）。 */
export function catchChance(kind: TileKind): number {
  if (kind === 'grass') return CATCH_GRASS
  if (kind === 'building') return CATCH_BUILDING
  return 0
}

/** 地物燃值（火强度上限；空地 0）。 */
export function fuelOf(kind: TileKind): number {
  if (kind === 'grass') return FUEL_GRASS
  if (kind === 'building') return FUEL_BUILDING
  return 0
}

/** 一格的完整状态：地物 + 当前火强度（0 无火）+ 是否已烧毁。 */
export interface FireCell {
  kind: TileKind
  fire: number
  burnt: boolean
}

export interface FirefighterState {
  seed: number
  level: number
  grid: FireCell[][]
  /** 消防员格子坐标。 */
  px: number
  py: number
  /** 出生/回撤点（受伤后撤回此处）。 */
  startX: number
  startY: number
  facing: Direction
  /** 是否正按住空格喷水。 */
  spraying: boolean
  /** 受伤冷却剩余秒数（>0 时不能移动与喷水）。 */
  cooldown: number
  /** 本关已烧毁的建筑数。 */
  levelLoss: number
  /** 整局累计烧毁建筑数。 */
  totalLoss: number
  /** 累计得分。 */
  score: number
  /** 进入本关时的得分快照（重开本关回滚到该值）。 */
  scoreAtLevelStart: number
  phase: FirePhase
  /** 过关展示倒计时（phase === 'clear'）。 */
  clearTimer: number
  fireTimer: number
  waterTimer: number
  t: number
  rng: () => number
}

/** 关卡派生 seed：同 (seed, level) 盘面完全一致。 */
export function mapSeed(seed: number, level: number): number {
  return (seed + level * 7919) >>> 0
}

const DIR_DELTA: Record<Direction, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}

const NEIGHBOR_ORDER: readonly (readonly [number, number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0]]

/** 按关卡 seed 生成街区：地物分布、消防员起点（左下空地）、初始火点
 * （建筑/草地上、离起点曼哈顿距离 ≥ 4）。 */
function generateBoard(seed: number, level: number): {
  grid: FireCell[][]
  startX: number
  startY: number
} {
  const cfg = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, level - 1))]!
  const rng = mulberry32((mapSeed(seed, level) ^ 0x7af1e5b3) >>> 0)
  const grid: FireCell[][] = []
  for (let y = 0; y < cfg.h; y += 1) {
    const row: FireCell[] = []
    for (let x = 0; x < cfg.w; x += 1) {
      const r = rng()
      const kind: TileKind = r < 0.32 ? 'building' : r < 0.58 ? 'grass' : 'empty'
      row.push({ kind, fire: 0, burnt: false })
    }
    grid.push(row)
  }
  // 起点：自左下角向右上找第一块空地（保证存在——找不到时退化为清空 (0, h-1)）。
  let sx = -1
  let sy = -1
  outer: for (let y = cfg.h - 1; y >= 0; y -= 1) {
    for (let x = 0; x < cfg.w; x += 1) {
      if (grid[y]![x]!.kind === 'empty') {
        sx = x
        sy = y
        break outer
      }
    }
  }
  if (sx < 0) {
    sx = 0
    sy = cfg.h - 1
    grid[sy]![0]!.kind = 'empty'
  }
  // 火点：优先建筑/草地且离起点足够远；候选不足时逐步放宽距离。
  let placed = 0
  for (let minDist = 4; placed < cfg.fires && minDist >= 0; minDist -= 1) {
    for (let attempt = 0; attempt < 300 && placed < cfg.fires; attempt += 1) {
      const x = Math.floor(rng() * cfg.w)
      const y = Math.floor(rng() * cfg.h)
      const cell = grid[y]![x]!
      if (cell.kind === 'empty' || cell.fire > 0) continue
      if (Math.abs(x - sx) + Math.abs(y - sy) < minDist) continue
      cell.fire = 1
      placed += 1
    }
  }
  return { grid, startX: sx, startY: sy }
}

/** 建立第 level 关的初始状态（score 从 0 起）。 */
export function createState(seed: number, level = 1): FirefighterState {
  const state: FirefighterState = {
    seed,
    level,
    grid: [],
    px: 0,
    py: 0,
    startX: 0,
    startY: 0,
    facing: 'up',
    spraying: false,
    cooldown: 0,
    levelLoss: 0,
    totalLoss: 0,
    score: 0,
    scoreAtLevelStart: 0,
    phase: 'play',
    clearTimer: 0,
    fireTimer: 0,
    waterTimer: 0,
    t: 0,
    rng: mulberry32((mapSeed(seed, level) ^ 0x25f13c77) >>> 0),
  }
  loadLevel(state, level)
  return state
}

/** 就地装载第 level 关盘面（保留累计分与损失）。 */
function loadLevel(state: FirefighterState, level: number): void {
  state.level = level
  const board = generateBoard(state.seed, level)
  state.grid = board.grid
  state.startX = board.startX
  state.startY = board.startY
  state.px = board.startX
  state.py = board.startY
  state.facing = 'up'
  state.spraying = false
  state.cooldown = 0
  state.levelLoss = 0
  state.phase = 'play'
  state.clearTimer = 0
  state.fireTimer = 0
  state.waterTimer = 0
  state.rng = mulberry32((mapSeed(state.seed, level) ^ 0x25f13c77) >>> 0)
}

/** 重开本关：盘面重生成（同 seed 同布局），得分回滚到进关快照。 */
export function restartLevel(state: FirefighterState): void {
  state.totalLoss -= state.levelLoss
  state.score = state.scoreAtLevelStart
  loadLevel(state, state.level)
}

/** 过关结算分：损失建筑越多罚越重，保底 100。 */
export function levelBonus(loss: number): number {
  return Math.max(100, 900 - loss * 150)
}

/** 当前火点格数。 */
export function fireCount(state: FirefighterState): number {
  let n = 0
  for (const row of state.grid) {
    for (const cell of row) {
      if (cell.fire > 0) n += 1
    }
  }
  return n
}

/** 消防员能否站上 (x, y)：界内且非建筑（含废墟，建筑残骸不可通行）。 */
export function walkable(state: FirefighterState, x: number, y: number): boolean {
  const cfg = LEVELS[state.level - 1]!
  if (x < 0 || x >= cfg.w || y < 0 || y >= cfg.h) return false
  return state.grid[y]![x]!.kind !== 'building'
}

/** 朝 dir 移动一格：朝向总是更新；目标为建筑/出界则原地不动（绕行由
 * 玩家自行完成）；冷却中不移动。移动进火格立即受伤回撤。
 * @returns 是否实际移动。
 */
export function movePlayer(state: FirefighterState, dir: Direction): boolean {
  if (state.phase !== 'play' || state.cooldown > 0) return false
  state.facing = dir
  const [dx, dy] = DIR_DELTA[dir]
  const nx = state.px + dx
  const ny = state.py + dy
  if (!walkable(state, nx, ny)) return false
  state.px = nx
  state.py = ny
  checkInjury(state)
  return true
}

/** 消防员所在格是否有火，有则受伤：回撤起点 + 冷却 3 秒。 */
function checkInjury(state: FirefighterState): void {
  const cell = state.grid[state.py]![state.px]!
  if (cell.fire > 0) {
    state.px = state.startX
    state.py = state.startY
    state.cooldown = INJURE_COOLDOWN
    state.spraying = false
  }
}

/** 喷水锥形覆盖格集合（纯函数，不含界内检查）：面向方向第 d 格允许
 * 垂直向 ±⌊d/2⌋ 格，d = 1..range。 */
export function sprayCells(x: number, y: number, dir: Direction, range = SPRAY_RANGE): { x: number; y: number }[] {
  const [dx, dy] = DIR_DELTA[dir]
  const px = dy !== 0 ? 1 : 0 // 垂直方向分量
  const py = dx !== 0 ? 1 : 0
  const cells: { x: number; y: number }[] = []
  for (let d = 1; d <= range; d += 1) {
    const half = Math.floor(d / 2)
    for (let off = -half; off <= half; off += 1) {
      cells.push({ x: x + dx * d + px * off, y: y + dy * d + py * off })
    }
  }
  return cells
}

/** 结算一次喷水：锥形内每格火强度 -WATER_DMG，归零即熄灭。
 * @returns 熄灭的火点数。 */
export function applyWater(state: FirefighterState): number {
  if (state.phase !== 'play' || state.cooldown > 0) return 0
  const cfg = LEVELS[state.level - 1]!
  let extinguished = 0
  for (const cell of sprayCells(state.px, state.py, state.facing)) {
    if (cell.x < 0 || cell.x >= cfg.w || cell.y < 0 || cell.y >= cfg.h) continue
    const target = state.grid[cell.y]![cell.x]!
    if (target.fire <= 0) continue
    target.fire = Math.max(0, target.fire - WATER_DMG)
    if (target.fire === 0) extinguished += 1
  }
  checkClear(state)
  return extinguished
}

/** 风向对邻居引燃概率的倍率。 */
export function windMultiplier(wind: readonly [number, number], dx: number, dy: number): number {
  const dot = dx * wind[0] + dy * wind[1]
  if (dot > 0) return WIND_ALIGNED
  if (dot < 0) return WIND_OPPOSED
  return 1
}

/** 结算一次火势 tick：先增长/燃尽（快照遍历），再按概率流蔓延，最后
 * 检查消防员所在格起火受伤与全灭过关。 */
export function fireTick(state: FirefighterState): void {
  if (state.phase !== 'play') return
  const cfg = LEVELS[state.level - 1]!
  const burning: { x: number; y: number }[] = []
  for (let y = 0; y < cfg.h; y += 1) {
    for (let x = 0; x < cfg.w; x += 1) {
      if (state.grid[y]![x]!.fire > 0) burning.push({ x, y })
    }
  }
  // 增长与燃尽：强度 +1，达到地物燃值即烧毁（建筑计损失）。
  for (const { x, y } of burning) {
    const cell = state.grid[y]![x]!
    cell.fire += 1
    if (cell.fire >= fuelOf(cell.kind)) {
      cell.fire = 0
      cell.burnt = true
      if (cell.kind === 'building') {
        state.levelLoss += 1
        state.totalLoss += 1
      }
    }
  }
  // 蔓延：对每个燃烧格的四个邻居按 catchChance × windMultiplier 掷点。
  for (const { x, y } of burning) {
    for (const [dx, dy] of NEIGHBOR_ORDER) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || nx >= cfg.w || ny < 0 || ny >= cfg.h) continue
      const target = state.grid[ny]![nx]!
      if (target.fire > 0 || target.burnt) continue
      const chance = catchChance(target.kind) * windMultiplier(cfg.wind, dx, dy)
      if (chance > 0 && state.rng() < chance) target.fire = 1
    }
  }
  checkInjury(state)
  checkClear(state)
}

/** 全灭判定：无火点即过关计分，进入展示期。 */
function checkClear(state: FirefighterState): void {
  if (state.phase === 'play' && fireCount(state) === 0) {
    state.phase = 'clear'
    state.clearTimer = CLEAR_TIME
    state.spraying = false
    state.score += levelBonus(state.levelLoss)
  }
}

/** 推进 dt 秒（上游已钳制 dt）。过关展示倒计时归零后自动装载下一关，
 * 第五关完成进入整局通关。 */
export function step(state: FirefighterState, dt: number): void {
  if (state.phase === 'clear') {
    state.t += dt
    state.clearTimer -= dt
    if (state.clearTimer <= 0) {
      if (state.level >= LEVELS.length) {
        state.phase = 'won'
      } else {
        state.scoreAtLevelStart = state.score
        loadLevel(state, state.level + 1)
      }
    }
    return
  }
  if (state.phase !== 'play') return
  state.t += dt
  if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - dt)
  state.waterTimer += dt
  while (state.waterTimer >= WATER_INTERVAL) {
    state.waterTimer -= WATER_INTERVAL
    applyWater(state)
  }
  state.fireTimer += dt
  while (state.fireTimer >= FIRE_INTERVAL) {
    state.fireTimer -= FIRE_INTERVAL
    fireTick(state)
    if (state.phase !== 'play') break
  }
}
