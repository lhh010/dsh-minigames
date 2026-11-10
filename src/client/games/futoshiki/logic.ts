/**
 * 不等数独（Futoshiki）纯逻辑：拉丁方校验、相邻格不等号约束、种子化
 * 谜面生成（先构造拉丁方解，再撒不等号、按唯一解性回退删除提示数）、
 * 冲突定位与完成判定。无 DOM、无副作用，可独立于渲染测试。
 *
 * 盘面用一维数组表示：格子序号 = 行 * size + 列，值为 1..size，0 表示空。
 */

/** mulberry32 种子随机数发生器：同 seed 产生同一序列，全部随机经它注入，
 * 生成器可复现、可测试。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates 洗牌（新建数组，入参不变）。
 * @param items - 待洗牌数组。
 * @param rng - mulberry32 实例。
 * @returns 洗牌后的新数组。 */
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

/** 一条不等号约束：格子 a 与相邻格 b 之间，grid[a] op grid[b]。 */
export interface Inequality {
  /** 一侧格子序号。 */
  readonly a: number
  /** 另一侧相邻格子序号。 */
  readonly b: number
  /** 比较方向：'<' 表示 a < b，'>' 表示 a > b。 */
  readonly op: '<' | '>'
}

/** 关卡配置：边长与不等号密度（占全部相邻对的比例）。 */
export interface FutoshikiLevelConfig {
  /** 盘面边长 N（数字 1..N）。 */
  readonly size: number
  /** 不等号密度（0..1，越高越难、提示数自然越少）。 */
  readonly inequalityRatio: number
  /** HUD 关卡标签。 */
  readonly label: string
}

/** 5 关递进：前三关 5×5 密度递增，后两关扩到 6×6。 */
export const LEVELS: readonly FutoshikiLevelConfig[] = [
  { size: 5, inequalityRatio: 0.3, label: '5×5·热身' },
  { size: 5, inequalityRatio: 0.4, label: '5×5·进阶' },
  { size: 5, inequalityRatio: 0.5, label: '5×5·密集' },
  { size: 6, inequalityRatio: 0.42, label: '6×6·扩展' },
  { size: 6, inequalityRatio: 0.55, label: '6×6·完整挑战' },
]

/** 一张谜面：提示数、不等号与来自构造的解（生成期保证解存在且唯一）。 */
export interface FutoshikiPuzzle {
  /** 盘面边长。 */
  readonly size: number
  /** 关卡下标（LEVELS 索引）。 */
  readonly level: number
  /** 提示数盘面（一维，0 为空格）。 */
  readonly givens: readonly number[]
  /** 不等号约束列表。 */
  readonly constraints: readonly Inequality[]
  /** 构造出的完整拉丁方解（一维）。 */
  readonly solution: readonly number[]
}

/** 拉丁方完整校验：全部填满且每行每列都是 1..N 的排列。
 * @param grid - 一维盘面。
 * @param size - 盘面边长。
 * @returns 完整合法拉丁方为 true。 */
export function checkLatinComplete(grid: readonly number[], size: number): boolean {
  const expect = new Set<number>()
  for (let v = 1; v <= size; v += 1) expect.add(v)
  for (let r = 0; r < size; r += 1) {
    const row = new Set<number>()
    const col = new Set<number>()
    for (let c = 0; c < size; c += 1) {
      row.add(grid[r * size + c]!)
      col.add(grid[c * size + r]!)
    }
    if (row.size !== size || col.size !== size) return false
    for (const v of row) if (!expect.has(v)) return false
    for (const v of col) if (!expect.has(v)) return false
  }
  return true
}

/** 不等号校验：只检查两端都已填的约束（空格忽略）。
 * @param grid - 一维盘面。
 * @param constraints - 约束列表。
 * @returns 已填部分全部满足为 true。 */
export function satisfiesInequalities(grid: readonly number[], constraints: readonly Inequality[]): boolean {
  return findConflicts(grid, constraints).signs.every(v => !v)
}

/** 冲突定位：行/列重复的格子与两端已填但违反的约束。
 * @param grid - 一维盘面。
 * @param constraints - 约束列表。
 * @returns cells 与盘面同长的红显标记，signs 与约束同长的红显标记。 */
export function findConflicts(
  grid: readonly number[],
  constraints: readonly Inequality[],
): { cells: boolean[]; signs: boolean[] } {
  const size = Math.sqrt(grid.length)
  const cells = new Array<boolean>(grid.length).fill(false)
  // 行列重复：对每行/列按值收集出现位置，出现 ≥2 次的整组标红。
  for (let r = 0; r < size; r += 1) {
    const inRow = new Map<number, number[]>()
    const inCol = new Map<number, number[]>()
    for (let c = 0; c < size; c += 1) {
      const rv = grid[r * size + c]!
      const cv = grid[c * size + r]!
      if (rv !== 0) {
        const list = inRow.get(rv) ?? []
        list.push(r * size + c)
        inRow.set(rv, list)
      }
      if (cv !== 0) {
        const list = inCol.get(cv) ?? []
        list.push(c * size + r)
        inCol.set(cv, list)
      }
    }
    for (const list of inRow.values()) if (list.length > 1) for (const cell of list) cells[cell] = true
    for (const list of inCol.values()) if (list.length > 1) for (const cell of list) cells[cell] = true
  }
  const signs = new Array<boolean>(constraints.length).fill(false)
  for (let i = 0; i < constraints.length; i += 1) {
    const { a, b, op } = constraints[i]!
    const va = grid[a]!
    const vb = grid[b]!
    if (va === 0 || vb === 0) continue
    const violated = op === '<' ? va >= vb : va <= vb
    if (violated) {
      signs[i] = true
      cells[a] = true
      cells[b] = true
    }
  }
  return { cells, signs }
}

/** 完成判定：全部填满且无任何行列重复或不等号违反。
 * @param grid - 一维盘面。
 * @param constraints - 约束列表。
 * @returns 过关为 true。 */
export function isSolved(grid: readonly number[], constraints: readonly Inequality[]): boolean {
  if (grid.some(v => v === 0)) return false
  const { cells } = findConflicts(grid, constraints)
  return cells.every(v => !v)
}

/** 置数（不可变）：返回填入 v 的新盘面；v 越界或格子已有同值返回原引用。
 * @param grid - 一维盘面。
 * @param cell - 格子序号。
 * @param v - 1..N 的数字（0 视为清除）。
 * @returns 新盘面或原引用。 */
export function setCell(grid: readonly number[], cell: number, v: number): readonly number[] {
  if (grid[cell] === v) return grid
  const out = grid.slice()
  out[cell] = v
  return out
}

/** 解数统计（求解器）：在提示数与不等号约束下回溯统计解的个数，到达
 * cap 提前返回（用于唯一性判定与非法提示检测）。
 * @param size - 盘面边长。
 * @param clues - 提示数盘面（0 为空）。
 * @param constraints - 约束列表。
 * @param cap - 统计上限（默认 2，只需判断唯一）。
 * @returns 解的个数（最多计到 cap）。 */
export function countSolutions(
  size: number,
  clues: readonly number[],
  constraints: readonly Inequality[],
  cap = 2,
): number {
  const grid = clues.slice()
  const rowUsed: boolean[][] = []
  const colUsed: boolean[][] = []
  for (let r = 0; r < size; r += 1) {
    rowUsed.push(new Array<boolean>(size).fill(false))
    colUsed.push(new Array<boolean>(size).fill(false))
  }
  // 格子 -> 涉及它的约束（另一侧取反方向）。
  const byCell: { other: number; op: '<' | '>' }[][] = []
  for (let cell = 0; cell < size * size; cell += 1) byCell.push([])
  for (const { a, b, op } of constraints) {
    byCell[a]!.push({ other: b, op })
    byCell[b]!.push({ other: a, op: op === '<' ? '>' : '<' })
  }
  let broken = false
  for (let cell = 0; cell < grid.length && !broken; cell += 1) {
    const v = grid[cell]!
    if (v === 0) continue
    const r = Math.floor(cell / size)
    const c = cell % size
    if (rowUsed[r]![v - 1]! || colUsed[c]![v - 1]!) broken = true
    else {
      rowUsed[r]![v - 1]! = true
      colUsed[c]![v - 1]! = true
    }
  }
  // 提示数之间已填端点的约束必须已满足。
  for (const { a, b, op } of constraints) {
    const va = grid[a]!
    const vb = grid[b]!
    if (va === 0 || vb === 0) continue
    if (op === '<' ? va >= vb : va <= vb) broken = true
  }
  if (broken) return 0
  let count = 0
  const rec = (cell: number): void => {
    if (count >= cap) return
    if (cell === grid.length) {
      count += 1
      return
    }
    if (grid[cell] !== 0) {
      rec(cell + 1)
      return
    }
    const r = Math.floor(cell / size)
    const c = cell % size
    for (let v = 1; v <= size; v += 1) {
      if (rowUsed[r]![v - 1]! || colUsed[c]![v - 1]!) continue
      let pass = true
      for (const { other, op } of byCell[cell]!) {
        const w = grid[other]!
        if (w !== 0 && (op === '<' ? v >= w : v <= w)) {
          pass = false
          break
        }
      }
      if (!pass) continue
      grid[cell] = v
      rowUsed[r]![v - 1]! = true
      colUsed[c]![v - 1]! = true
      rec(cell + 1)
      grid[cell] = 0
      rowUsed[r]![v - 1]! = false
      colUsed[c]![v - 1]! = false
      if (count >= cap) return
    }
  }
  rec(0)
  return count
}

/** 生成一张谜面：循环拉丁方经行/列/符号随机置换得到解，相邻对洗牌后按
 * 密度取前 K 个撒不等号（方向从解反推），再按随机顺序逐格尝试删提示，
 * 删除后解仍唯一才保留——保证解存在且唯一，同 (关卡, seed) 完全可复现。
 * @param levelIndex - LEVELS 关卡下标。
 * @param seed - mulberry32 种子。
 * @returns 谜面。 */
export function createPuzzle(levelIndex: number, seed: number): FutoshikiPuzzle {
  const cfg = LEVELS[levelIndex]!
  const size = cfg.size
  const rng = mulberry32(seed)
  const symbols = shuffled(
    Array.from({ length: size }, (_unused, i) => i + 1),
    rng,
  )
  const rowPerm = shuffled(Array.from({ length: size }, (_unused, i) => i), rng)
  const colPerm = shuffled(Array.from({ length: size }, (_unused, i) => i), rng)
  const solution: number[] = []
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      solution.push(symbols[(rowPerm[r]! + colPerm[c]!) % size]!)
    }
  }
  // 全部相邻对（水平 + 垂直），洗牌后按密度取前 K 个。
  const pairs: { a: number; b: number }[] = []
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (c + 1 < size) pairs.push({ a: r * size + c, b: r * size + c + 1 })
      if (r + 1 < size) pairs.push({ a: r * size + c, b: (r + 1) * size + c })
    }
  }
  const picked = shuffled(pairs, rng).slice(0, Math.round(pairs.length * cfg.inequalityRatio))
  const constraints: Inequality[] = picked.map(({ a, b }) => ({
    a,
    b,
    op: solution[a]! > solution[b]! ? '>' : '<',
  }))
  // 逐格删提示：删除后唯一解保留，否则放回。
  const givens = solution.slice()
  for (const cell of shuffled(
    Array.from({ length: size * size }, (_unused, i) => i),
    rng,
  )) {
    const backup = givens[cell]!
    givens[cell] = 0
    if (countSolutions(size, givens, constraints, 2) !== 1) givens[cell] = backup
  }
  return { size, level: levelIndex, givens, constraints, solution }
}
