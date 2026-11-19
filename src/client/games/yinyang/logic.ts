/**
 * 阴阳双色 (YinYang) 纯逻辑。N×N 网格：部分格预标黑 ● / 白 ○（不可改），
 * 其余空格由玩家填黑或白。约束：所有黑格四连通成一整片、所有白格四连通
 * 成一整片、任何 2×2 区域不得同色（黑白都必须出现）。全部填满且约束满足
 * 即过关。
 *
 * 生成（构造法，seed 确定）：先随机生长黑白两团互相咬合的区域——每步只
 * 在己方团块邻旁落子并在落子前检查不会与已填格拼出同色 2×2，因此成品
 * 天然无 2×2 违例且双色各自连通；随后按随机顺序逐格"挖孔"，每挖一格用
 * 解数计数器验证剩余线索仍唯一解，否则放回，直到线索数降到目标密度
 * （关卡越高密度越低 → 提示递减）。所有随机走注入 seed（mulberry32），
 * 同 seed 完全确定可测。
 */

/** 五个关卡的盘面边长（6×6 → 10×10）。 */
export const LEVEL_SIZES = [6, 7, 8, 9, 10] as const

/** 空格标记。 */
export const EMPTY = -1
/** 白 ○。 */
export const WHITE = 0
/** 黑 ●。 */
export const BLACK = 1

/** 各关卡的目标线索密度（递减 → 提示数递减）。 */
const CLUE_DENSITY = [0.62, 0.54, 0.46, 0.40, 0.34] as const

/** 一张阴阳双色盘面。 */
export interface YinYangBoard {
  /** 盘面边长（格）。 */
  size: number
  /** 每格线索：EMPTY 玩家可填、WHITE/BLACK 预标不可改。 */
  clues: Int8Array
  /** 生成解（构造法保证恰好填满后满足全部约束）。 */
  solution: Int8Array
}

/** 解数计数结果。 */
export interface SolveCount {
  /** 找到的解数（至多 cap）。 */
  count: number
  /** 是否因节点上限中止（true 时 count 只是下界）。 */
  hitCap: boolean
}

/** 一次提示：推荐格及其确定色。 */
export interface YinYangHint {
  /** 目标格下标。 */
  cell: number
  /** 推荐颜色（WHITE/BLACK）。 */
  color: number
  /** true = 单着推理（反色无解）确定；false = 兜底揭示生成解。 */
  deduced: boolean
}

/** mulberry32 伪随机数发生器：小而快，同 seed 序列确定。 */
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

/** 1 基关卡对应的盘面边长（第 5 关后循环）。 */
export function levelSize(level: number): number {
  return LEVEL_SIZES[((level - 1) % LEVEL_SIZES.length + LEVEL_SIZES.length) % LEVEL_SIZES.length]!
}

/** 盘面边长对应的目标线索密度（未知边长取 0.5）。 */
export function clueDensity(size: number): number {
  const idx = LEVEL_SIZES.indexOf(size as (typeof LEVEL_SIZES)[number])
  return idx >= 0 ? CLUE_DENSITY[idx]! : 0.5
}

/** 过关分数：100×关卡 + 每秒衰减 5 的时间奖励（下限 0）。 */
export function computeScore(level: number, seconds: number): number {
  return 100 * level + Math.max(0, 3000 - Math.floor(seconds) * 5)
}

/**
 * 已填满的同色 2×2 方块（以左上角下标记），扫描全部 2×2 窗口。
 * @param grid - 盘面（EMPTY/WHITE/BLACK）。
 * @param size - 盘面边长。
 * @returns 左上角下标数组（无违例为空）。
 */
export function monoSquares(grid: Int8Array, size: number): number[] {
  const out: number[] = []
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const t = r * size + c
      const a = grid[t]!
      if (a === EMPTY) continue
      if (grid[t + 1] === a && grid[t + size] === a && grid[t + size + 1] === a) out.push(t)
    }
  }
  return out
}

/**
 * 参与任一同色 2×2 违例的格集合（渲染红框警示用）。
 * @param grid - 盘面。
 * @param size - 盘面边长。
 * @returns 违例格下标集合。
 */
export function conflictCells(grid: Int8Array, size: number): Set<number> {
  const bad = new Set<number>()
  for (const t of monoSquares(grid, size)) {
    bad.add(t)
    bad.add(t + 1)
    bad.add(t + size)
    bad.add(t + size + 1)
  }
  return bad
}

/**
 * 某颜色的已填格是否四连通（BFS）。该色无已填格视为连通（无从断裂）。
 * @param grid - 盘面。
 * @param size - 盘面边长。
 * @param color - WHITE 或 BLACK。
 * @returns 该色已填格成一整片时 true。
 */
export function colorConnected(grid: Int8Array, size: number, color: number): boolean {
  const total = size * size
  let start = -1
  let count = 0
  for (let i = 0; i < total; i += 1) {
    if (grid[i] === color) {
      count += 1
      if (start < 0) start = i
    }
  }
  if (start < 0) return true
  const seen = new Uint8Array(total)
  const queue = [start]
  seen[start] = 1
  let reached = 0
  while (queue.length > 0) {
    const cell = queue.pop()!
    reached += 1
    const r = Math.floor(cell / size)
    const c = cell % size
    if (r > 0 && grid[cell - size] === color && seen[cell - size] === 0) { seen[cell - size] = 1; queue.push(cell - size) }
    if (r < size - 1 && grid[cell + size] === color && seen[cell + size] === 0) { seen[cell + size] = 1; queue.push(cell + size) }
    if (c > 0 && grid[cell - 1] === color && seen[cell - 1] === 0) { seen[cell - 1] = 1; queue.push(cell - 1) }
    if (c < size - 1 && grid[cell + 1] === color && seen[cell + 1] === 0) { seen[cell + 1] = 1; queue.push(cell + 1) }
  }
  return reached === count
}

/**
 * 双色已填区域是否各自连通（盘面边界发光指示用；只看已填格）。
 * @param grid - 盘面。
 * @param size - 盘面边长。
 */
export function filledConnected(grid: Int8Array, size: number): boolean {
  return colorConnected(grid, size, BLACK) && colorConnected(grid, size, WHITE)
}

/**
 * 胜利判定：无空格、无同色 2×2、黑白各自四连通。
 * @param grid - 盘面。
 * @param size - 盘面边长。
 */
export function isSolvedGrid(grid: Int8Array, size: number): boolean {
  const total = size * size
  for (let i = 0; i < total; i += 1) if (grid[i] === EMPTY) return false
  if (monoSquares(grid, size).length > 0) return false
  return colorConnected(grid, size, BLACK) && colorConnected(grid, size, WHITE)
}

/**
 * 数解：在 givens（EMPTY 为自由格）上回溯搜索，返回至多 cap 个解。
 * 剪枝：落子即查其参与的 2×2 是否同色；叶子再做双色连通检查。
 * @param givens - 线索盘（EMPTY 待填）。
 * @param size - 盘面边长。
 * @param cap - 解数上限（找到即停）。
 * @param nodeCap - 搜索节点上限（超出中止，hitCap=true）。
 */
export function countSolutions(givens: Int8Array, size: number, cap = 2, nodeCap = 60000): SolveCount {
  const grid = Int8Array.from(givens)
  const total = size * size
  let count = 0
  let nodes = 0
  let hitCap = false
  /** cell 落子后：其参与的四个 2×2（四格已填）是否出现同色。 */
  const safe = (cell: number): boolean => {
    const r = Math.floor(cell / size)
    const c = cell % size
    for (const rr of [r - 1, r]) {
      for (const cc of [c - 1, c]) {
        if (rr < 0 || cc < 0 || rr + 1 >= size || cc + 1 >= size) continue
        const t = rr * size + cc
        const a = grid[t]!
        if (a === EMPTY) continue
        if (grid[t + 1] === a && grid[t + size] === a && grid[t + size + 1] === a) return false
      }
    }
    return true
  }
  /** 某色已填格经（同色格或空格）是否仍可能连成一片（空格视作通道；
   * 连不通则永无解，剪枝用）。 */
  const joinable = (color: number): boolean => {
    let start = -1
    let count = 0
    for (let i = 0; i < total; i += 1) {
      if (grid[i] === color) {
        count += 1
        if (start < 0) start = i
      }
    }
    if (start < 0) return true
    const seen = new Uint8Array(total)
    const stack = [start]
    seen[start] = 1
    let same = 1
    while (stack.length > 0) {
      const cell = stack.pop()!
      const r = Math.floor(cell / size)
      const c = cell % size
      for (const n of [r > 0 ? cell - size : -1, r < size - 1 ? cell + size : -1, c > 0 ? cell - 1 : -1, c < size - 1 ? cell + 1 : -1]) {
        if (n < 0 || seen[n] === 1) continue
        if (grid[n] === color || grid[n] === EMPTY) {
          seen[n] = 1
          if (grid[n] === color) same += 1
          stack.push(n)
        }
      }
    }
    return same === count
  }
  /** 深度优先；返回 false 表示命中节点上限需整枝中止。 */
  const dfs = (): boolean => {
    if (count >= cap) return true
    nodes += 1
    if (nodes > nodeCap) { hitCap = true; return false }
    let cell = -1
    for (let i = 0; i < total; i += 1) {
      if (grid[i] === EMPTY) { cell = i; break }
    }
    if (cell < 0) {
      if (colorConnected(grid, size, BLACK) && colorConnected(grid, size, WHITE)) count += 1
      return true
    }
    for (const v of [BLACK, WHITE]) {
      grid[cell] = v
      if (safe(cell) && joinable(BLACK) && joinable(WHITE) && !dfs()) {
        grid[cell] = EMPTY
        return false
      }
      grid[cell] = EMPTY
    }
    return true
  }
  dfs()
  return { count, hitCap }
}

/**
 * 提示：扫描空格，寻找"单着推理"格——某色落子后无解即确定另一色；
 * 找不到推理格时兜底揭示生成解的第一个空格颜色。
 * @param board - 盘面（取生成解兜底）。
 * @param grid - 当前玩家盘（含线索与已填格）。
 * @returns 提示；盘已填满返回 null。
 */
export function hintFromBoard(board: YinYangBoard, grid: Int8Array): YinYangHint | null {
  const total = board.size * board.size
  for (let cell = 0; cell < total; cell += 1) {
    if (grid[cell] !== EMPTY) continue
    grid[cell] = BLACK
    const black = countSolutions(grid, board.size, 1)
    grid[cell] = WHITE
    const white = countSolutions(grid, board.size, 1)
    grid[cell] = EMPTY
    // 只有两次完整搜索（未触节点上限）的计数才可推理。
    if (!black.hitCap && !white.hitCap) {
      if (black.count === 0 && white.count > 0) return { cell, color: WHITE, deduced: true }
      if (white.count === 0 && black.count > 0) return { cell, color: BLACK, deduced: true }
    }
    continue
  }
  for (let cell = 0; cell < total; cell += 1) {
    if (grid[cell] !== EMPTY) continue
    return { cell, color: board.solution[cell]!, deduced: false }
  }
  return null
}

/**
 * 构造一张满足全部约束的满盘解。三步：
 * ① 梳状基座——黑格为奇数列的"齿"（第 1..size-2 行）加底行"脊"（第
 * 1..size-1 列）：每个 2×2 窗口都含一个奇数列格与一个偶数列格，齿行覆
 * 盖所有行对 → 无同色 2×2；黑经齿-脊相连，白经顶行相连，构造性双色连
 * 通。
 * ② 对称变换——随机行/列镜像与黑白换色（都是约束的对称操作，有效性
 * 不变）。
 * ③ 保形随机翻转——随机挑一格反色，仅当反色后不产生同色 2×2 且两色
 * 仍各自四连通时保留（翻转数 3×格数），把规整梳状搅成有机河道。
 * 全程注入 rng，同 seed 确定；基座有效且每步保形 → 结果恒有效。
 * @param rng - 注入的随机源。
 * @param size - 盘面边长。
 * @returns 满盘解（恒满足全部约束）。
 */
function growSolution(rng: () => number, size: number): Int8Array {
  const total = size * size
  const grid = new Int8Array(total).fill(WHITE)
  for (let c = 1; c < size; c += 2) {
    for (let r = 1; r <= size - 2; r += 1) grid[r * size + c] = BLACK
  }
  for (let c = 1; c <= size - 1; c += 1) grid[(size - 1) * size + c] = BLACK
  const mirrorRows = rng() < 0.5
  const mirrorCols = rng() < 0.5
  if (mirrorRows || mirrorCols) {
    const next = new Int8Array(total)
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const rr = mirrorRows ? size - 1 - r : r
        const cc = mirrorCols ? size - 1 - c : c
        next[rr * size + cc] = grid[r * size + c]!
      }
    }
    grid.set(next)
  }
  if (rng() < 0.5) {
    for (let i = 0; i < total; i += 1) grid[i] = grid[i] === BLACK ? WHITE : BLACK
  }
  /** cell 反色为 color 后是否拼出同色 2×2。 */
  const createsMono = (cell: number, color: number): boolean => {
    const r = Math.floor(cell / size)
    const c = cell % size
    for (const rr of [r - 1, r]) {
      for (const cc of [c - 1, c]) {
        if (rr < 0 || cc < 0 || rr + 1 >= size || cc + 1 >= size) continue
        const t = rr * size + cc
        let same = 0
        for (const s of [t, t + 1, t + size, t + size + 1]) {
          if (s === cell) continue
          if (grid[s] === color) same += 1
        }
        if (same >= 3) return true
      }
    }
    return false
  }
  const flips = total * 3
  for (let i = 0; i < flips; i += 1) {
    const cell = Math.floor(rng() * total)
    const from = grid[cell]!
    const to = from === BLACK ? WHITE : BLACK
    grid[cell] = EMPTY
    const fromOk = colorConnected(grid, size, from)
    grid[cell] = to
    const toOk = colorConnected(grid, size, to) && !createsMono(cell, to)
    if (fromOk && toOk) continue
    grid[cell] = from
  }
  return grid
}

/**
 * 由 seed 确定性生成一张盘面：生长满盘解 → 随机顺序挖孔（每孔验证唯一
 * 解），直到线索数降到目标密度。
 * @param seed - 种子（同 seed 同盘）。
 * @param size - 盘面边长。
 */
export function boardFromSeed(seed: number, size: number): YinYangBoard {
  const rng = mulberry32(seed)
  const total = size * size
  let solution: Int8Array | null = null
  for (let attempt = 0; attempt < 64 && solution === null; attempt += 1) {
    solution = growSolution(rng, size)
  }
  if (solution === null) throw new Error('yinyang: solution growth failed for seed ' + seed)
  const clues = Int8Array.from(solution)
  const order: number[] = []
  for (let i = 0; i < total; i += 1) order.push(i)
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = order[i]!
    order[i] = order[j]!
    order[j] = tmp
  }
  const target = Math.max(4, Math.round(total * clueDensity(size)))
  let kept = total
  for (const cell of order) {
    if (kept <= target) break
    const saved = clues[cell]!
    clues[cell] = EMPTY
    const res = countSolutions(clues, size, 2)
    if (res.count === 1 && !res.hitCap) kept -= 1
    else clues[cell] = saved
  }
  return { size, clues, solution }
}
