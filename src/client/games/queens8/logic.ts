/**
 * 八皇后纯逻辑：N×N 棋盘（档位 4/6/8）上放置 N 个皇后，任意两皇后
 * 不得同行、同列、同对角线。仅含确定性纯函数——无 DOM、无定时器；随机
 * 性（参考解的列序洗牌）全部经由注入的 rng（mulberry32）驱动，同种子
 * 同序列。
 */

/** 递进档位：4×4 → 6×6 → 8×8。 */
export const LEVELS = [4, 6, 8] as const

/** 一个皇后所在的格子（0 起的行列下标）。 */
export interface Pos {
  row: number
  col: number
}

/** 一局局面：已放置的皇后按放置顺序排列。 */
export interface QueensState {
  /** 棋盘边长（档位）。 */
  size: number
  /** 已放置的皇后。 */
  queens: Pos[]
  /** 放置次数（移除不计数，越少越优）。 */
  moves: number
  /** 是否已过关（放满 N 个且零冲突）。 */
  won: boolean
}

/**
 * mulberry32 确定性伪随机数生成器：返回 [0,1) 的函数，同种子同序列。
 * @param seed - 非负整数种子。
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

/**
 * 两格是否互相攻击：同行、同列或同对角线（|Δrow| === |Δcol|）。
 * @param a - 第一格。
 * @param b - 第二格。
 */
export function attacks(a: Pos, b: Pos): boolean {
  return a.row === b.row || a.col === b.col || Math.abs(a.row - b.row) === Math.abs(a.col - b.col)
}

/**
 * 判定 (row, col) 相对已放置皇后是否安全（不与任何皇后同行/列/两对角线）。
 * @param queens - 已放置的皇后。
 * @param row - 目标行（0 起）。
 * @param col - 目标列（0 起）。
 */
export function queenSafe(queens: Pos[], row: number, col: number): boolean {
  const cell: Pos = { row, col }
  for (const q of queens) {
    if (attacks(q, cell)) return false
  }
  return true
}

/**
 * 互相攻击的皇后对数（无序对计数）：零即无冲突。
 * @param queens - 已放置的皇后。
 */
export function conflictCount(queens: Pos[]): number {
  let count = 0
  for (let i = 0; i < queens.length; i += 1) {
    for (let j = i + 1; j < queens.length; j += 1) {
      if (attacks(queens[i]!, queens[j]!)) count += 1
    }
  }
  return count
}

/**
 * 每个皇后是否处于冲突中（与至少一个其他皇后互相攻击）——渲染红色标记用。
 * @param queens - 已放置的皇后。
 * @returns 与 queens 等长的布尔数组。
 */
export function conflictingQueens(queens: Pos[]): boolean[] {
  const flags = queens.map(() => false)
  for (let i = 0; i < queens.length; i += 1) {
    for (let j = i + 1; j < queens.length; j += 1) {
      if (attacks(queens[i]!, queens[j]!)) {
        flags[i] = true
        flags[j] = true
      }
    }
  }
  return flags
}

/**
 * 完成判定：恰好放满 N 个皇后且零冲突。
 * @param state - 当前局面。
 */
export function isSolved(state: QueensState): boolean {
  return state.queens.length === state.size && conflictCount(state.queens) === 0
}

/**
 * 点击格子转移：空格放置皇后（moves + 1），已有皇后的格子移除（不计步）。
 * 放满 N 个零冲突即置 won。纯函数，不修改入参。
 * @param state - 当前局面。
 * @param row - 目标行（0 起）。
 * @param col - 目标列（0 起）。
 * @returns 新局面；越界或已过关返回 null。
 */
export function toggle(state: QueensState, row: number, col: number): QueensState | null {
  if (state.won) return null
  if (row < 0 || row >= state.size || col < 0 || col >= state.size) return null
  const index = state.queens.findIndex(q => q.row === row && q.col === col)
  if (index >= 0) {
    const queens = state.queens.slice()
    queens.splice(index, 1)
    return { size: state.size, queens, moves: state.moves, won: false }
  }
  const queens = state.queens.concat([{ row, col }])
  const next: QueensState = { size: state.size, queens, moves: state.moves + 1, won: false }
  next.won = isSolved(next)
  return next
}

/**
 * 计时挑战计分：底分 N²×10 + 剩余时间奖励（每秒 4 分，上限 N×30 秒）-
 * 多余放置惩罚（每次 5 分），下限 N×10。
 * @param size - 棋盘边长。
 * @param seconds - 过关用时（秒）。
 * @param moves - 放置次数。
 */
export function winScore(size: number, seconds: number, moves: number): number {
  const base = size * size * 10
  const maxSeconds = size * 30
  const timeBonus = Math.max(0, Math.round((maxSeconds - seconds) * 4))
  const waste = Math.max(0, moves - size) * 5
  return Math.max(size * 10, base + timeBonus - waste)
}

/**
 * 回溯求解一个参考解：逐行放置，每行列候选用注入 rng 洗牌——同种子得到
 * 同一解（确定性可测），不同种子给出多样的解。
 * @param size - 棋盘边长（≥4 必有解）。
 * @param rng - 注入的确定性随机源。
 * @returns 每行一个皇后的解；无解返回 null。
 */
export function randomSolution(size: number, rng: () => number): Pos[] | null {
  const cols: number[] = []
  for (let c = 0; c < size; c += 1) cols.push(c)
  const placed: Pos[] = []
  const solve = (row: number): boolean => {
    if (row === size) return true
    // 本行候选列洗牌（Fisher-Yates，rng 驱动）。
    const order = cols.slice()
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      const tmp = order[i]!
      order[i] = order[j]!
      order[j] = tmp
    }
    for (const col of order) {
      if (!queenSafe(placed, row, col)) continue
      placed.push({ row, col })
      if (solve(row + 1)) return true
      placed.pop()
    }
    return false
  }
  return solve(0) ? placed : null
}

/**
 * 开新局：清空棋盘、步数归零。
 * @param size - 棋盘边长。
 */
export function createBoard(size: number): QueensState {
  return { size, queens: [], moves: 0, won: false }
}
