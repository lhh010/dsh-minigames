/**
 * 太极 (Taiji) 纯逻辑。本实现采用简化规则（经典 Taiji 的双格 tile 规则
 * 过于复杂，见棋盘化说明）：n×n 盘（n 为偶数），盘面分预置白圈格（锁定
 * 颜色的给定格，必须放置）与自由格；玩家在自由格放置黑/白 tile，胜利
 * 条件为 ——① 全盘填满；② 每行每列恰好一半黑一半白；③ 任意正交相邻
 * 两格颜色不同（因此终局必为棋盘着色）。
 *
 * 生成：随机选一个棋盘着色（两种极性之一）作为唯一解，随机抽取若干格
 * 作为白圈预置格（密度随关卡下降）；受限求解器枚举两种棋盘着色对给定
 * 格的一致性以验证唯一解，不唯一则重掷（只要存在至少一个给定格，两种
 * 极性必然互斥，解必唯一）。
 */

/** 各关卡的盘面边长（n 为偶数，共 5 关，5→8 表示关卡数与最大边长）。 */
export const LEVEL_SIZES = [4, 6, 6, 8, 8] as const

/** 格子颜色：0 空、1 黑、2 白。 */
export const EMPTY = 0
export const BLACK = 1
export const WHITE = 2
export type CellValue = 0 | 1 | 2

/** 各关卡的白圈预置格密度（1 基关卡 → 占比，关卡越高越少）。 */
const CLUE_DENSITY = [0.5, 0.4, 0.3, 0.22, 0.15]

/** 一个生成的太极关卡。 */
export interface TaijiPuzzle {
  /** 盘面边长（偶数）。 */
  size: number
  /** 白圈预置格：格下标 → 锁定颜色（黑 1 / 白 2），不可更改。 */
  clues: ReadonlyMap<number, CellValue>
  /** 生成解（棋盘着色，黑 1 / 白 2）。 */
  solution: readonly CellValue[]
  /** 求解器是否证明恰好一个解。 */
  unique: boolean
}

/** mulberry32 PRNG：小而快，按种子确定。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x9e3779f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 1 基关卡的盘面边长（超过第 5 关后循环）。 */
export function levelSize(level: number): number {
  return LEVEL_SIZES[(level - 1) % LEVEL_SIZES.length]!
}

/** 过关得分：基础 100×关卡 + 随秒衰减的时间奖励（5/秒，封顶 3000）。 */
export function computeScore(level: number, seconds: number): number {
  return 100 * level + Math.max(0, 3000 - Math.floor(seconds) * 5)
}

/**
 * 受限求解器：枚举两种棋盘着色（极性 0/1），统计与全部给定格一致的
 * 数量，最多数到 2。棋盘着色格值：极性 p 下 (r+c+p)%2===0 为黑。
 * @param size - 盘面边长。
 * @param clues - 给定格（下标 → 颜色）。
 * @returns 与给定格一致的棋盘着色数量（0..2）。
 */
export function countSolutions(size: number, clues: ReadonlyMap<number, CellValue>): number {
  let count = 0
  for (let parity = 0; parity < 2; parity += 1) {
    let ok = true
    for (const [cell, v] of clues) {
      const r = Math.floor(cell / size)
      const c = cell % size
      const expected = ((r + c + parity) % 2 === 0 ? BLACK : WHITE) as CellValue
      if (expected !== v) {
        ok = false
        break
      }
    }
    if (ok) {
      count += 1
      if (count >= 2) return count
    }
  }
  return count
}

/**
 * 纯胜利判定：全盘填满、每行每列黑白各半、任意正交相邻两格不同色，
 * 且所有给定格保持锁定颜色。
 * @param puzzle - 当前关卡。
 * @param grid - 玩家盘面（0 空 / 1 黑 / 2 白）。
 * @returns 是否满足全部胜利条件。
 */
export function isWon(puzzle: TaijiPuzzle, grid: readonly CellValue[]): boolean {
  const size = puzzle.size
  const half = size / 2
  for (let cell = 0; cell < size * size; cell += 1) {
    const v = grid[cell] ?? EMPTY
    if (v !== BLACK && v !== WHITE) return false
    const clue = puzzle.clues.get(cell)
    if (clue !== undefined && clue !== v) return false
    const r = Math.floor(cell / size)
    const c = cell % size
    if (c + 1 < size && grid[cell + 1] === v) return false
    if (r + 1 < size && grid[cell + size] === v) return false
  }
  for (let i = 0; i < size; i += 1) {
    let rowBlack = 0
    let colBlack = 0
    for (let j = 0; j < size; j += 1) {
      if (grid[i * size + j] === BLACK) rowBlack += 1
      if (grid[j * size + i] === BLACK) colBlack += 1
    }
    if (rowBlack !== half || colBlack !== half) return false
  }
  return true
}

/** 冲突报告：越界行列与相邻同色对，供渲染红色提示。 */
export interface TaijiConflicts {
  /** 黑格数不等于 n/2 的行下标集合。 */
  rows: ReadonlySet<number>
  /** 黑格数不等于 n/2 的列下标集合。 */
  cols: ReadonlySet<number>
  /** 处在冲突行/列或与邻格同色的格下标集合。 */
  cells: ReadonlySet<number>
}

/**
 * 找出当前盘面的冲突（仅统计已放置格；空格不计入黑白数）。行/列越界
 * 判定：已满且黑数≠n/2，或黑数>n/2（仍可补救的欠数不算冲突）。
 * @param size - 盘面边长。
 * @param grid - 玩家盘面。
 * @returns 冲突行列与冲突格集合。
 */
export function findConflicts(size: number, grid: readonly CellValue[]): TaijiConflicts {
  const half = size / 2
  const rows = new Set<number>()
  const cols = new Set<number>()
  const cells = new Set<number>()
  for (let i = 0; i < size; i += 1) {
    let rowBlack = 0
    let rowFilled = 0
    let colBlack = 0
    let colFilled = 0
    for (let j = 0; j < size; j += 1) {
      const rv = grid[i * size + j] ?? EMPTY
      const cv = grid[j * size + i] ?? EMPTY
      if (rv !== EMPTY) {
        rowFilled += 1
        if (rv === BLACK) rowBlack += 1
      }
      if (cv !== EMPTY) {
        colFilled += 1
        if (cv === BLACK) colBlack += 1
      }
    }
    if (rowBlack > half || (rowFilled === size && rowBlack !== half)) rows.add(i)
    if (colBlack > half || (colFilled === size && colBlack !== half)) cols.add(i)
  }
  for (let i = 0; i < size; i += 1) {
    if (rows.has(i)) for (let j = 0; j < size; j += 1) cells.add(i * size + j)
    if (cols.has(i)) for (let j = 0; j < size; j += 1) cells.add(j * size + i)
  }
  for (let cell = 0; cell < size * size; cell += 1) {
    const v = grid[cell] ?? EMPTY
    if (v === EMPTY) continue
    const r = Math.floor(cell / size)
    const c = cell % size
    if (c + 1 < size && grid[cell + 1] === v) {
      cells.add(cell)
      cells.add(cell + 1)
    }
    if (r + 1 < size && grid[cell + size] === v) {
      cells.add(cell)
      cells.add(cell + size)
    }
  }
  return { rows, cols, cells }
}

/**
 * 由种子确定性地生成一关：随机棋盘着色极性为解，按关卡密度随机抽取
 * 白圈给定格；受限求解器验证唯一解，否则换种子重掷（保底尝试 8 次）。
 * @param seed - 种子（不同关卡用不同种子）。
 * @param size - 盘面边长（偶数）。
 * @param level - 1 基关卡号，决定给定格密度。
 * @returns 唯一解的关卡。
 */
export function puzzleFromSeed(seed: number, size: number, level: number): TaijiPuzzle {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const rng = mulberry32(seed + attempt * 0x9e3779b1)
    const parity = rng() < 0.5 ? 0 : 1
    const total = size * size
    const solution: CellValue[] = []
    for (let cell = 0; cell < total; cell += 1) {
      const r = Math.floor(cell / size)
      const c = cell % size
      solution.push(((r + c + parity) % 2 === 0 ? BLACK : WHITE) as CellValue)
    }
    const density = CLUE_DENSITY[Math.min(CLUE_DENSITY.length, Math.max(1, level)) - 1]!
    const clueCount = Math.max(1, Math.round(total * density))
    const order: number[] = []
    for (let i = 0; i < total; i += 1) order.push(i)
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      const tmp = order[i]!
      order[i] = order[j]!
      order[j] = tmp
    }
    const clues = new Map<number, CellValue>()
    for (let i = 0; i < clueCount; i += 1) clues.set(order[i]!, solution[order[i]!]!)
    if (countSolutions(size, clues) === 1) {
      return { size, clues, solution, unique: true }
    }
  }
  // 理论不可达：任一给定格即排除另一极性。保守回退到中心格给定。
  const fallback = new Map<number, CellValue>([[0, BLACK]])
  const solution: CellValue[] = []
  for (let cell = 0; cell < size * size; cell += 1) {
    const r = Math.floor(cell / size)
    const c = cell % size
    solution.push(((r + c) % 2 === 0 ? BLACK : WHITE) as CellValue)
  }
  return { size, clues: fallback, solution, unique: true }
}
