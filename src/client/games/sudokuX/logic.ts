/**
 * 对角数独（Sudoku X）纯逻辑：标准 9×9 数独（行/列/宫 1-9 不重复）外加
 * 两条主对角线（r===c 与 r+c===8）也必须 1-9 不重复。生成器先用带对角
 * 约束的随机回溯填出完整解，再按难度逐孔挖洞——每挖一孔都用求解器确认
 * 谜题仍然唯一解，否则回退。所有随机来自注入的 mulberry32 种子，同一种
 * 子生成完全相同的谜题（可重放、可测试）。
 */

/** 盘面边长（9×9）。 */
export const SIZE = 9

/** 每关保留的提示数：5 关递进（第 1 关 40 个提示 → 第 5 关 28 个）。 */
export const LEVEL_GIVENS = [40, 37, 34, 31, 28] as const
/** 总关数。 */
export const LEVEL_COUNT = LEVEL_GIVENS.length
/** 最大容错次数：填错 3 次即失败。 */
export const MAX_ERRORS = 3

/**
 * mulberry32 确定性伪随机数生成器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0, 1) 随机数的函数；同一种子序列完全一致。
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 冲突的四种来源：行 / 列 / 宫 / 对角线。 */
export type ConflictKind = 'row' | 'col' | 'box' | 'diag'

/** 一局对角数独的全部可测状态。 */
export interface SudokuXState {
  /** 本局种子（重放用）。 */
  seed: number
  /** 关卡编号（0 起）。 */
  level: number
  /** 提示格（null = 玩家可编辑）。 */
  puzzle: (number | null)[][]
  /** 当前盘面（提示 + 玩家输入）。 */
  grid: (number | null)[][]
  /** 生成时的完整解（判错与提示用）。 */
  solution: number[][]
  /** 铅笔笔记：notes[r][c][n-1] = 格 (r,c) 上是否标了候选数 n。 */
  notes: boolean[][][]
  /** 已用秒数（过关后冻结）。 */
  elapsed: number
  /** 已填错次数。 */
  errors: number
  /** 已用提示次数。 */
  hintsUsed: number
  /** 是否过关。 */
  won: boolean
  /** 是否因容错耗尽而失败。 */
  failed: boolean
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = arr[i]!
    arr[i] = arr[j]!
    arr[j] = tmp
  }
  return arr
}

function emptyGrid(): (number | null)[][] {
  return Array.from({ length: SIZE }, () => Array<number | null>(SIZE).fill(null))
}

/**
 * 对角数独约束检查：n 放入 (r, c) 是否与现有行/列/宫/两条主对角线冲突。
 * @param grid - 盘面。
 * @param r - 行号（0 起）。
 * @param c - 列号（0 起）。
 * @param n - 待放的数字 1-9。
 */
export function validX(grid: (number | null)[][], r: number, c: number, n: number): boolean {
  for (let i = 0; i < SIZE; i += 1) {
    if (grid[r]![i] === n || grid[i]![c] === n) return false
  }
  const br = Math.floor(r / 3) * 3
  const bc = Math.floor(c / 3) * 3
  for (let dr = 0; dr < 3; dr += 1) {
    for (let dc = 0; dc < 3; dc += 1) {
      if (grid[br + dr]![bc + dc] === n) return false
    }
  }
  if (r === c) {
    for (let i = 0; i < SIZE; i += 1) {
      if (grid[i]![i] === n) return false
    }
  }
  if (r + c === SIZE - 1) {
    for (let i = 0; i < SIZE; i += 1) {
      if (grid[i]![SIZE - 1 - i] === n) return false
    }
  }
  return true
}

/** 带对角线约束的随机回溯填数，产出一个完整解。 */
function fillX(grid: (number | null)[][], rng: () => number): boolean {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (grid[r]![c] === null) {
        for (const n of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)) {
          if (validX(grid, r, c, n)) {
            grid[r]![c] = n
            if (fillX(grid, rng)) return true
            grid[r]![c] = null
          }
        }
        return false
      }
    }
  }
  return true
}

/**
 * 生成一个满足对角数独全部约束的完整解。
 * @param rng - 注入的随机源（如 mulberry32(seed)）。
 * @returns 9×9 完整数字盘。
 */
export function generateSolutionX(rng: () => number): (number | null)[][] {
  const grid = emptyGrid()
  if (!fillX(grid, rng)) throw new Error('dsh-minigames: sudokuX 生成器失败')
  return grid
}

/**
 * 数解器：统计盘面在对角数独规则下的解的数量，数到 limit 即停。
 * @param grid - 待数解的盘面（含空格 null）。
 * @param limit - 停止阈值（唯一性验证传 2：返回 1 = 唯一解，≥2 = 多解）。
 * @returns 找到的解的数量（上限 limit）。
 */
export function countSolutionsX(grid: (number | null)[][], limit = 2): number {
  const g = grid.map(row => [...row])
  let count = 0
  const search = (): boolean => {
    let bestR = -1
    let bestC = -1
    let bestCands: number[] | null = null
    pick: for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (g[r]![c] !== null) continue
        const cands: number[] = []
        for (let n = 1; n <= 9; n += 1) {
          if (validX(g, r, c, n)) cands.push(n)
        }
        if (cands.length === 0) return false
        if (bestCands === null || cands.length < bestCands.length) {
          bestR = r
          bestC = c
          bestCands = cands
          if (cands.length === 1) break pick
        }
      }
    }
    if (bestCands === null) {
      count += 1
      return count >= limit
    }
    for (const n of bestCands) {
      g[bestR]![bestC] = n
      if (search()) return true
      g[bestR]![bestC] = null
    }
    return false
  }
  search()
  return count
}

/**
 * 从完整解挖洞成谜题：随机顺序逐孔移除，每移除一孔用求解器确认仍唯一
 * 解，否则回退；直到提示数降到 givens 或无孔可挖。
 * @param solution - 完整解。
 * @param givens - 目标提示数。
 * @param rng - 注入的随机源。
 * @returns 挖好的谜题（保持唯一解）。
 */
export function makePuzzleX(
  solution: (number | null)[][],
  givens: number,
  rng: () => number,
): (number | null)[][] {
  const puzzle = solution.map(row => [...row])
  const order = shuffle(
    Array.from({ length: SIZE * SIZE }, (_, i) => [Math.floor(i / SIZE), i % SIZE] as [number, number]),
    rng,
  )
  let remaining = SIZE * SIZE
  for (const [r, c] of order) {
    if (remaining <= givens) break
    const saved = puzzle[r]![c] as number | null
    puzzle[r]![c] = null
    if (countSolutionsX(puzzle, 2) !== 1) {
      puzzle[r]![c] = saved
    } else {
      remaining -= 1
    }
  }
  return puzzle
}

/**
 * 创建一局新的对角数独。
 * @param seed - 随机种子；同一种子生成完全相同的谜题。
 * @param level - 关卡编号（0 起，默认 0）。
 * @returns 初始状态（计时为 0，未过关未失败）。
 */
export function createSudokuXState(seed: number, level = 0): SudokuXState {
  const rng = mulberry32(seed)
  const solution = generateSolutionX(rng)
  const puzzle = makePuzzleX(solution, LEVEL_GIVENS[level] ?? LEVEL_GIVENS[LEVEL_COUNT - 1]!, rng)
  return {
    seed,
    level,
    puzzle,
    grid: puzzle.map(row => [...row]),
    solution: solution.map(row => row.map(v => v as number)),
    notes: Array.from({ length: SIZE }, () =>
      Array.from({ length: SIZE }, () => Array<boolean>(9).fill(false)),
    ),
    elapsed: 0,
    errors: 0,
    hintsUsed: 0,
    won: false,
    failed: false,
  }
}

/**
 * 推进计时（过关后冻结）。
 * @param state - 当前状态。
 * @param dt - 帧间隔秒数。
 */
export function tick(state: SudokuXState, dt: number): void {
  if (!state.won && !state.failed) state.elapsed += dt
}

/**
 * 检查 (r, c) 上的数字与哪些约束冲突（行/列/宫/对角线四类）。
 * @param state - 当前状态。
 * @param r - 行号。
 * @param c - 列号。
 * @returns 冲突类型数组（空格或无冲突时为空数组）。
 */
export function conflictsAt(state: SudokuXState, r: number, c: number): ConflictKind[] {
  const g = state.grid
  const n = g[r]![c]
  if (n === null) return []
  const kinds: ConflictKind[] = []
  for (let i = 0; i < SIZE; i += 1) {
    if (i !== c && g[r]![i] === n) { kinds.push('row'); break }
  }
  for (let i = 0; i < SIZE; i += 1) {
    if (i !== r && g[i]![c] === n) { kinds.push('col'); break }
  }
  const br = Math.floor(r / 3) * 3
  const bc = Math.floor(c / 3) * 3
  for (let dr = 0; dr < 3; dr += 1) {
    for (let dc = 0; dc < 3; dc += 1) {
      const rr = br + dr
      const cc = bc + dc
      if ((rr !== r || cc !== c) && g[rr]![cc] === n) { kinds.push('box'); break }
    }
    if (kinds.includes('box')) break
  }
  if (r === c) {
    for (let i = 0; i < SIZE; i += 1) {
      if (i !== r && g[i]![i] === n) { kinds.push('diag'); break }
    }
  }
  if (r + c === SIZE - 1) {
    for (let i = 0; i < SIZE; i += 1) {
      if (i !== r && g[i]![SIZE - 1 - i] === n) { kinds.push('diag'); break }
    }
  }
  return kinds
}

/**
 * 是否存在任何冲突格（过关判定的否定条件之一）。
 * @param state - 当前状态。
 */
export function hasConflict(state: SudokuXState): boolean {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (conflictsAt(state, r, c).length > 0) return true
    }
  }
  return false
}

/** (r, c) 的全部同行/列/宫/对角线邻居坐标（不含自身）。 */
function peers(r: number, c: number): [number, number][] {
  const out: [number, number][] = []
  const seen = new Set<number>()
  const push = (rr: number, cc: number): void => {
    const key = rr * SIZE + cc
    if ((rr !== r || cc !== c) && !seen.has(key)) {
      seen.add(key)
      out.push([rr, cc])
    }
  }
  for (let i = 0; i < SIZE; i += 1) { push(r, i); push(i, c) }
  const br = Math.floor(r / 3) * 3
  const bc = Math.floor(c / 3) * 3
  for (let dr = 0; dr < 3; dr += 1) {
    for (let dc = 0; dc < 3; dc += 1) { push(br + dr, bc + dc) }
  }
  if (r === c) for (let i = 0; i < SIZE; i += 1) push(i, i)
  if (r + c === SIZE - 1) for (let i = 0; i < SIZE; i += 1) push(i, SIZE - 1 - i)
  return out
}

/**
 * 在 (r, c) 放入数字（0 = 清空）。提示格与已结束的局面不可改；填对即
 * 落子并同步清理笔记，填错则错误计数 +1、错满 MAX_ERRORS 判负。
 * @param state - 当前状态。
 * @param r - 行号。
 * @param c - 列号。
 * @param n - 数字 1-9（0 清空）。
 * @returns 是否实际修改了盘面。
 */
export function place(state: SudokuXState, r: number, c: number, n: number): boolean {
  if (state.won || state.failed) return false
  if (state.puzzle[r]![c] !== null) return false
  if (n === 0) {
    if (state.grid[r]![c] === null) return false
    state.grid[r]![c] = null
    return true
  }
  if (n < 1 || n > 9) return false
  if (state.grid[r]![c] === n) return false
  if (n === state.solution[r]![c]) {
    state.grid[r]![c] = n
    state.notes[r]![c]!.fill(false)
    for (const [rr, cc] of peers(r, c)) {
      state.notes[rr]![cc]![n - 1] = false
    }
    if (isComplete(state)) state.won = true
    return true
  }
  state.grid[r]![c] = n
  state.errors += 1
  if (state.errors >= MAX_ERRORS) state.failed = true
  return true
}

/**
 * 切换 (r, c) 上的候选数笔记 n（仅空格可标）。
 * @param state - 当前状态。
 * @param r - 行号。
 * @param c - 列号。
 * @param n - 数字 1-9。
 * @returns 是否实际切换（已填格返回 false）。
 */
export function toggleNote(state: SudokuXState, r: number, c: number, n: number): boolean {
  if (state.won || state.failed) return false
  if (state.grid[r]![c] !== null) return false
  if (n < 1 || n > 9) return false
  state.notes[r]![c]![n - 1] = !state.notes[r]![c]!.at(n - 1)!
  return true
}

/** 盘面是否填满且无任何冲突（过关条件）。 */
function isComplete(state: SudokuXState): boolean {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (state.grid[r]![c] === null) return false
    }
  }
  return !hasConflict(state)
}

/**
 * H 提示：找到候选数最少的空格——若恰有唯一候选则填它（严格确定），
 * 否则按完整解填出该格的正确值。
 * @param state - 当前状态。
 * @returns 被填的 { r, c, n }，无空格时返回 null。
 */
export function applyHint(state: SudokuXState): { r: number; c: number; n: number } | null {
  if (state.won || state.failed) return null
  let bestR = -1
  let bestC = -1
  let bestCands: number[] | null = null
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (state.grid[r]![c] !== null) continue
      const cands: number[] = []
      for (let n = 1; n <= 9; n += 1) {
        if (validX(state.grid, r, c, n)) cands.push(n)
      }
      if (bestCands === null || cands.length < bestCands.length) {
        bestR = r
        bestC = c
        bestCands = cands
      }
    }
  }
  if (bestCands === null) return null
  // 谜题保证唯一解：最少候选格里若有唯一候选，它必然就是解值。
  const n = state.solution[bestR]![bestC]!
  const filled = place(state, bestR, bestC, n)
  if (!filled) return null
  state.hintsUsed += 1
  return { r: bestR, c: bestC, n }
}

/**
 * 过关得分：关卡越高、越快、错误与提示越少，分越高（恒为正）。
 * @param state - 已过关的状态。
 * @returns 上报给面板的分数。
 */
export function winScore(state: SudokuXState): number {
  const base = 400 + state.level * 250
  const speed = Math.max(0, 600 - Math.floor(state.elapsed) * 2)
  return Math.max(50, base + speed - state.errors * 50 - state.hintsUsed * 30)
}
