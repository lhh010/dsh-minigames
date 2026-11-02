/**
 * 麻将连连看（Mahjong Link）纯逻辑：单层行列网格上按 seed+关卡生成成对牌面
 * （网格随机抽空形成孔洞图案），两张同牌且连接路径（水平/垂直线段、最多两次
 * 拐弯、不经过未消除牌；孔洞/已消格/场外一圈可通行）即可消除。包含提示对搜索、
 * 死局检测与自动洗牌、计时挑战计分（剩余时间奖励）与多关递进。全部为确定性
 * 纯函数 + 普通状态对象；index.ts 驱动动画与输入，单元测试直接驱动逻辑。
 */

/** 网格坐标（行 r、列 c；路径坐标允许 -1 / rows / cols 的场外虚拟圈）。 */
export interface Pos { r: number; c: number }

export type MahjongResult = 'none' | 'win' | 'lose'

export interface MahjongState {
  rows: number
  cols: number
  /** rows x cols；0 = 空（孔洞或已消除），> 0 = 牌面编号 1..27。 */
  grid: number[][]
  /** 原始放牌位掩码（true = 该格属于本关布局；孔洞恒为 false）。 */
  layout: boolean[][]
  /** 累计得分（跨关累加，重开清零）。 */
  score: number
  level: number
  /** 剩余挑战秒数。 */
  timeLeft: number
  timeLimit: number
  /** 本关是否用过提示（用过则过关无剩余时间奖励）。 */
  hintUsed: boolean
  result: MahjongResult
  rng: () => number
}

/** 牌桌固定网格尺寸。 */
export const GRID_ROWS = 8
export const GRID_COLS = 12
/** 花色数：筒、条、万。 */
export const SUITS = 3
/** 每花色点数 1..9。 */
export const RANKS = 9
/** 编号上限 = 27。 */
export const MAX_KINDS = SUITS * RANKS

/** 某关的牌对数（12 对起步，每关 +3，封顶 36 对 = 72 张）。 */
export function levelPairs(level: number): number {
  return Math.min(36, 12 + (level - 1) * 3)
}

/** 某关可用的牌面种数（图案复杂度随关卡递进，封顶 27）。 */
export function levelKinds(level: number): number {
  return Math.min(MAX_KINDS, 12 + (level - 1) * 3)
}

/** 某关的挑战时长（秒）：基础 100 秒 + 每对 4 秒。 */
export function levelTimeSec(level: number): number {
  return 100 + levelPairs(level) * 4
}

/** 消掉一对的基础分（关卡越高每对分越高）。 */
export function pairScore(level: number): number {
  return 10 + level * 2
}

/** 过关时的剩余时间奖励（每剩 1 秒 +3；用过提示则无奖励）。 */
export function timeBonus(state: MahjongState): number {
  return state.hintUsed ? 0 : Math.floor(state.timeLeft) * 3
}

/** 牌面编号的花色：0=筒 1=条 2=万。 */
export function suitOf(kind: number): number {
  return Math.floor((kind - 1) / RANKS)
}

/** 牌面编号的点数 1..9。 */
export function rankOf(kind: number): number {
  return ((kind - 1) % RANKS) + 1
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

/** 用 state.rng 重建指定关的布局与牌面（孔洞图案由随机抽空得到）。 */
export function generateBoard(state: MahjongState, level: number): void {
  const pairs = levelPairs(level)
  const kinds = levelKinds(level)
  const cells: Pos[] = []
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) cells.push({ r, c })
  }
  // 随机抽空：取前 pairs*2 个格子放牌，其余成为孔洞。
  const placed = new Set<string>(shuffled(cells, state.rng).slice(0, pairs * 2).map(p => p.r + ',' + p.c))
  const tiles: number[] = []
  for (let i = 0; i < pairs; i += 1) tiles.push(1 + Math.floor(state.rng() * kinds))
  const faceOrder = shuffled(tiles.flatMap(kind => [kind, kind]), state.rng)
  let next = 0
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      const has = placed.has(r + ',' + c)
      state.layout[r]![c] = has
      state.grid[r]![c] = has ? faceOrder[next++]! : 0
    }
  }
}

/** 建立指定关的全新状态（rng 决定全部随机性，同 seed 同关卡结果确定）。 */
export function createMahjongState(rng: () => number = Math.random, level = 1): MahjongState {
  const state: MahjongState = {
    rows: GRID_ROWS,
    cols: GRID_COLS,
    grid: Array.from({ length: GRID_ROWS }, () => Array.from({ length: GRID_COLS }, () => 0)),
    layout: Array.from({ length: GRID_ROWS }, () => Array.from({ length: GRID_COLS }, () => false)),
    score: 0,
    level,
    timeLeft: levelTimeSec(level),
    timeLimit: levelTimeSec(level),
    hintUsed: false,
    result: 'none',
    rng,
  }
  generateBoard(state, level)
  return state
}

/** 场外虚拟圈（-1 / rows / cols 一圈）恒可通行；两枚待消端点的格子自身可通行。 */
function passable(grid: number[][], r: number, c: number, a: Pos, b: Pos): boolean {
  if (r < 0 || r >= grid.length || c < 0 || c >= grid[0]!.length) return true
  if ((r === a.r && c === a.c) || (r === b.r && c === b.c)) return true
  return grid[r]![c] === 0
}

/** 同行或同列两点之间的线段是否无阻（不含两端点自身）。 */
function lineClear(grid: number[][], p: Pos, q: Pos, a: Pos, b: Pos): boolean {
  if (p.r === q.r && p.c === q.c) return true
  if (p.r === q.r) {
    const c1 = Math.min(p.c, q.c)
    const c2 = Math.max(p.c, q.c)
    for (let c = c1 + 1; c < c2; c += 1) {
      if (!passable(grid, p.r, c, a, b)) return false
    }
    return true
  }
  if (p.c === q.c) {
    const r1 = Math.min(p.r, q.r)
    const r2 = Math.max(p.r, q.r)
    for (let r = r1 + 1; r < r2; r += 1) {
      if (!passable(grid, r, p.c, a, b)) return false
    }
    return true
  }
  return false
}

/**
 * 求两枚同牌之间的合法连接路径（水平/垂直线段，最多两次拐弯）。
 * @param grid - 当前牌面网格。
 * @param a - 起点牌格。
 * @param b - 终点牌格。
 * @returns 折线拐点序列（含两端点），无合法路径时返回 null。
 */
export function findPath(grid: number[][], a: Pos, b: Pos): Pos[] | null {
  if (a.r === b.r && a.c === b.c) return null
  // 0 拐：同行或同列直连。
  if ((a.r === b.r || a.c === b.c) && lineClear(grid, a, b, a, b)) return [a, b]
  // 1 拐：矩形两角任选其一。
  const corner1: Pos = { r: a.r, c: b.c }
  const corner2: Pos = { r: b.r, c: a.c }
  for (const corner of [corner1, corner2]) {
    if (corner.r === a.r && corner.c === a.c) continue
    if (corner.r === b.r && corner.c === b.c) continue
    if (passable(grid, corner.r, corner.c, a, b)
      && lineClear(grid, a, corner, a, b) && lineClear(grid, corner, b, a, b)) {
      return [a, corner, b]
    }
  }
  // 2 拐：先沿 a 所在行（列）走到中间列（行）z，再纵向（横向）走到 b 所在行（列）。
  const rows = grid.length
  const cols = grid[0]!.length
  for (let z = -1; z <= cols; z += 1) {
    const p1: Pos = { r: a.r, c: z }
    const p2: Pos = { r: b.r, c: z }
    if (!passable(grid, p1.r, p1.c, a, b) || !passable(grid, p2.r, p2.c, a, b)) continue
    if (lineClear(grid, a, p1, a, b) && lineClear(grid, p1, p2, a, b) && lineClear(grid, p2, b, a, b)) {
      return [a, p1, p2, b]
    }
  }
  for (let z = -1; z <= rows; z += 1) {
    const p1: Pos = { r: z, c: a.c }
    const p2: Pos = { r: z, c: b.c }
    if (!passable(grid, p1.r, p1.c, a, b) || !passable(grid, p2.r, p2.c, a, b)) continue
    if (lineClear(grid, a, p1, a, b) && lineClear(grid, p1, p2, a, b) && lineClear(grid, p2, b, a, b)) {
      return [a, p1, p2, b]
    }
  }
  return null
}

/** 两格是否为可消对：均为牌面、同编号且存在合法路径。 */
export function canRemove(grid: number[][], a: Pos, b: Pos): boolean {
  const ka = grid[a.r]?.[a.c] ?? 0
  const kb = grid[b.r]?.[b.c] ?? 0
  if (ka === 0 || ka !== kb) return false
  return findPath(grid, a, b) !== null
}

/**
 * 消除一对同牌：计分并在清空全场时结算过关（含剩余时间奖励）。
 * @returns 用于动画的路径拐点序列；不可消时返回 null。
 */
export function removePair(state: MahjongState, a: Pos, b: Pos): Pos[] | null {
  if (state.result !== 'none') return null
  const path = findPath(state.grid, a, b)
  if (path === null) return null
  const ka = state.grid[a.r]![a.c]!
  const kb = state.grid[b.r]![b.c]!
  if (ka === 0 || ka !== kb) return null
  state.grid[a.r]![a.c] = 0
  state.grid[b.r]![b.c] = 0
  state.score += pairScore(state.level)
  if (pairsRemaining(state.grid) === 0) {
    state.score += timeBonus(state)
    state.result = 'win'
  }
  return path
}

/** 剩余未消对数。 */
export function pairsRemaining(grid: number[][]): number {
  let count = 0
  for (const row of grid) {
    for (const kind of row) if (kind !== 0) count += 1
  }
  return count / 2
}

/** 暴力搜索第一对可消牌（小牌面可直接用；大搜索请用 ai.ts 分帧版）。 */
export function findHintPair(grid: number[][]): [Pos, Pos] | null {
  const byKind = new Map<number, Pos[]>()
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < grid[0]!.length; c += 1) {
      const kind = grid[r]![c]!
      if (kind === 0) continue
      const list = byKind.get(kind) ?? []
      list.push({ r, c })
      byKind.set(kind, list)
    }
  }
  const kinds = [...byKind.keys()].sort((x, y) => x - y)
  for (const kind of kinds) {
    const positions = byKind.get(kind)!
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const a = positions[i]!
        const b = positions[j]!
        if (findPath(grid, a, b) !== null) return [a, b]
      }
    }
  }
  return null
}

/** 是否仍存在可消对（false 即死局）。 */
export function hasAnyMatch(grid: number[][]): boolean {
  return findHintPair(grid) !== null
}

/**
 * 死局洗牌：保持牌面多重集不变，重排各格编号，直到出现可消对（最多尝试 64 次）。
 * @returns 洗牌后是否存在可消对。
 */
export function shuffleTiles(state: MahjongState): boolean {
  const cells: Pos[] = []
  const kinds: number[] = []
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      const kind = state.grid[r]![c]!
      if (kind !== 0) {
        cells.push({ r, c })
        kinds.push(kind)
      }
    }
  }
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const order = shuffled(kinds, state.rng)
    cells.forEach((cell, i) => {
      state.grid[cell.r]![cell.c] = order[i]!
    })
    if (hasAnyMatch(state.grid)) return true
  }
  return hasAnyMatch(state.grid)
}

/** 计时推进：到 0 秒判负（已有结果则不动）。 */
export function tickTime(state: MahjongState, dtSec: number): void {
  if (state.result !== 'none') return
  state.timeLeft = Math.max(0, state.timeLeft - dtSec)
  if (state.timeLeft === 0) state.result = 'lose'
}

/** 进入下一关：保留累计分，重建更大更复杂（封顶前）的牌面。 */
export function advanceLevel(state: MahjongState): void {
  state.level += 1
  state.timeLimit = levelTimeSec(state.level)
  state.timeLeft = state.timeLimit
  state.hintUsed = false
  state.result = 'none'
  generateBoard(state, state.level)
}

/** 重开当前关：清零得分并重建本关牌面。 */
export function restartLevel(state: MahjongState): void {
  state.score = 0
  state.timeLimit = levelTimeSec(state.level)
  state.timeLeft = state.timeLimit
  state.hintUsed = false
  state.result = 'none'
  generateBoard(state, state.level)
}
