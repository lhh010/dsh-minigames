/**
 * 马踏棋盘（骑士巡游）纯逻辑：局面构造、马步合法性、Warnsdorff 出度
 * 启发与种子化巡游构造。无 DOM、无副作用，可独立于渲染测试。
 */

/** 档位棋盘边长：5x5 热身 / 6x6 进阶 / 8x8 完整挑战。 */
export const BOARD_SIZES: readonly number[] = [5, 6, 8]

/** 8 个马步偏移（行、列），按固定顺序遍历保证确定性。 */
const KNIGHT_OFFSETS: readonly (readonly [number, number])[] = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1],
]

/**
 * mulberry32 种子随机数发生器：同 seed 产生同一序列，供随机起点与
 * Warnsdorff 平局打破注入可测的确定性。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
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

/** 巡游局面：路径为已访问格序号序列（格序号 = 行 * size + 列）。 */
export interface TourState {
  /** 棋盘边长。 */
  readonly size: number
  /** 已访问格序号，按步序排列；最后一项为骑士当前所在格。 */
  readonly path: readonly number[]
  /** 与 path 同步的访问标记（O(1) 查询）。 */
  readonly visited: readonly boolean[]
  /** 本局已消耗的提示次数。 */
  readonly hintsUsed: number
}

/** 局面终态：进行中 / 访满过关 / 无路可走且未访满。 */
export type TourStatus = 'playing' | 'won' | 'stuck'

/** 格序号转行列。
 * @param size - 棋盘边长。
 * @param cell - 格序号。
 * @returns 行与列（0 起）。 */
export function rowCol(size: number, cell: number): { row: number; col: number } {
  return { row: Math.floor(cell / size), col: cell % size }
}

/** 骑士从 cell 出发的全部棋盘内马步（不排除已访问格）。
 * @param size - 棋盘边长。
 * @param cell - 起点格序号。
 * @returns 目标格序号数组（按偏移固定顺序）。 */
export function knightMoves(size: number, cell: number): number[] {
  const { row, col } = rowCol(size, cell)
  const out: number[] = []
  for (const [dr, dc] of KNIGHT_OFFSETS) {
    const r = row + dr
    const c = col + dc
    if (r >= 0 && r < size && c >= 0 && c < size) out.push(r * size + c)
  }
  return out
}

/** 构造初始局面：骑士位于 start，已访问仅此一格。
 * @param size - 棋盘边长。
 * @param start - 起点格序号。
 * @returns 初始局面。 */
export function createTour(size: number, start: number): TourState {
  const visited = new Array<boolean>(size * size).fill(false)
  visited[start] = true
  return { size, path: [start], visited, hintsUsed: 0 }
}

/** 随机起点：奇数边长（5x5）仅从多数色格（行+列为偶数）出发才存在
 * 完整巡游，故限定候选；偶数边长任意格皆有已知解。
 * @param size - 棋盘边长。
 * @param rng - mulberry32 实例。
 * @returns 起点格序号。 */
export function randomStart(size: number, rng: () => number): number {
  if (size % 2 === 0) return Math.floor(rng() * size * size)
  const cells: number[] = []
  for (let cell = 0; cell < size * size; cell += 1) {
    const { row, col } = rowCol(size, cell)
    if ((row + col) % 2 === 0) cells.push(cell)
  }
  return cells[Math.floor(rng() * cells.length)]!
}

/** 当前可达格：从当前格出发且未访问的马步目标。
 * @param state - 当前局面。
 * @returns 可达格序号数组。 */
export function reachableMoves(state: TourState): number[] {
  const current = state.path[state.path.length - 1]!
  return knightMoves(state.size, current).filter(cell => !state.visited[cell])
}

/** 判定终态：访满为 won，未访满且无可达格为 stuck，否则 playing。
 * @param state - 当前局面。
 * @returns 终态标签。 */
export function tourStatus(state: TourState): TourStatus {
  if (state.path.length === state.size * state.size) return 'won'
  if (reachableMoves(state).length === 0) return 'stuck'
  return 'playing'
}

/** 走一步：目标是当前格的合法马步且未访问时返回新局面，否则返回 null。
 * @param state - 当前局面。
 * @param to - 目标格序号。
 * @returns 新局面，非法步为 null。 */
export function moveTour(state: TourState, to: number): TourState | null {
  const current = state.path[state.path.length - 1]!
  if (state.visited[to]) return null
  if (!knightMoves(state.size, current).includes(to)) return null
  const visited = state.visited.slice()
  visited[to] = true
  return { size: state.size, path: [...state.path, to], visited, hintsUsed: state.hintsUsed }
}

/** Warnsdorff 出度：cell 的马步中未访问的目标数。
 * @param state - 当前局面。
 * @param cell - 待评估格序号（不必可达）。
 * @returns 未访问马步数。 */
export function warnsdorffDegree(state: TourState, cell: number): number {
  return knightMoves(state.size, cell).filter(next => !state.visited[next]).length
}

/** 提示格：可达格中 Warnsdorff 出度最小者；平局取格序号最小，确定可测。
 * @param state - 当前局面。
 * @returns 提示格序号，无可达格为 null。 */
export function bestHint(state: TourState): number | null {
  const reachable = reachableMoves(state)
  if (reachable.length === 0) return null
  let best = reachable[0]!
  let bestDegree = warnsdorffDegree(state, best)
  for (const cell of reachable) {
    const degree = warnsdorffDegree(state, cell)
    if (degree < bestDegree) {
      best = cell
      bestDegree = degree
    }
  }
  return best
}

/** Warnsdorff 贪心巡游构造：每步走向出度最小的未访问马步，平局由种子
 * 随机打破。贪心不保证成功，返回实际走过的路径（可能不满）。
 * @param size - 棋盘边长。
 * @param start - 起点格序号。
 * @param seed - mulberry32 种子。
 * @returns 路径格序号数组；同参数结果完全一致。 */
export function warnsdorffTour(size: number, start: number, seed: number): number[] {
  const rng = mulberry32(seed)
  const visited = new Array<boolean>(size * size).fill(false)
  visited[start] = true
  const path = [start]
  for (;;) {
    const current = path[path.length - 1]!
    const candidates = knightMoves(size, current).filter(cell => !visited[cell])
    if (candidates.length === 0) return path
    let minDegree = size * size + 1
    for (const cell of candidates) {
      const degree = knightMoves(size, cell).filter(next => !visited[next]).length
      if (degree < minDegree) minDegree = degree
    }
    const ties = candidates.filter(
      cell => knightMoves(size, cell).filter(next => !visited[next]).length === minDegree,
    )
    const pick = ties[Math.floor(rng() * ties.length)]!
    visited[pick] = true
    path.push(pick)
  }
}
