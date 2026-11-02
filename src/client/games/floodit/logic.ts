/**
 * Flood It（填色）纯逻辑：N×N 六色盘，从左上角连通片开始，每次把当前
 * 连通片整体换成一种颜色并与相邻同色格合并；整盘同色即过关。生成时用
 * BFS 贪心解校准步数上限（贪心步数 × 1.4 取整），保证贪心解必然可通关。
 * 所有函数均为纯函数，输入状态不会被修改。
 */

/** mulberry32 种子随机数（与 slitherlink 同族实现，纯函数闭包）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 调色盘颜色数（六色）。 */
export const COLOR_COUNT = 6

/** 关卡尺寸：第 1 关 8×8 起步，每关 +1，封顶 14×14（level 为 0 基）。 */
export function boardSizeForLevel(level: number): number {
  return Math.min(14, 8 + Math.max(0, Math.floor(level)))
}

/** 关卡基数（level 为 0 基，展示为第 level+1 关）。 */
export function levelBaseScore(level: number): number {
  return (Math.max(0, Math.floor(level)) + 1) * 100
}

/** 过关得分：剩余步数 × 10 + 关卡基数。 */
export function scoreFor(level: number, movesLeft: number): number {
  return movesLeft * 10 + levelBaseScore(level)
}

/** 一局游戏的可序列化状态。 */
export interface FloodItState {
  size: number
  colorCount: number
  /** 行优先颜色索引，length = size*size，board[0] 为左上角（当前连通片颜色）。 */
  board: number[]
  /** 已用步数。 */
  steps: number
  /** 本关步数上限（生成时贪心解 × 1.4 取整）。 */
  maxSteps: number
  /** 全盘同色即 true。 */
  won: boolean
}

/**
 * 由 (seed, level) 确定性地生成一关：随机六色盘 + 贪心解校准的步数上限。
 * @param seed - 全局种子。
 * @param level - 0 基关卡号。
 * @returns 初始状态（steps=0，won 由盘面是否恰好同色决定）。
 */
export function createLevel(seed: number, level: number): FloodItState {
  const size = boardSizeForLevel(level)
  const rng = mulberry32((seed ^ Math.imul(level + 1, 0x9e3779b9)) >>> 0)
  const board: number[] = []
  for (let i = 0; i < size * size; i += 1) board.push(Math.floor(rng() * COLOR_COUNT))
  const greedy = greedySolveLength(board, size)
  // 贪心解步数 × 1.4 取整：贪心玩法必然在限制内完成（贪心 0 步不会出现，
  // 但仍取 Math.max(1, ...) 兜底，避免上限为 0 的退化关卡）。
  const maxSteps = Math.max(1, Math.ceil(greedy * 1.4))
  return { size, colorCount: COLOR_COUNT, board, steps: 0, maxSteps, won: isUniform(board) }
}

/** 盘面是否全同色。 */
export function isUniform(board: number[]): boolean {
  const first = board[0]
  return board.every(c => c === first)
}

/**
 * 从 (row, col) 出发颜色相同的连通格索引集合（BFS）。
 * @returns 访问标记数组（length = size*size，连通片内为 true）。
 */
export function componentOf(board: number[], size: number, row: number, col: number): boolean[] {
  const inComp = new Array<boolean>(size * size).fill(false)
  const color = board[row * size + col]!
  const queue: number[] = [row * size + col]
  inComp[row * size + col] = true
  while (queue.length > 0) {
    const idx = queue.shift()!
    const r = Math.floor(idx / size)
    const c = idx % size
    const push = (nr: number, nc: number): void => {
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) return
      const n = nr * size + nc
      if (!inComp[n] && board[n] === color) {
        inComp[n] = true
        queue.push(n)
      }
    }
    push(r - 1, c); push(r + 1, c); push(r, c - 1); push(r, c + 1)
  }
  return inComp
}

/**
 * 换色一步（纯函数）：把左上连通片换成 color 并与相邻同色片合并。
 * 已胜利、颜色与当前片相同、或步数耗尽时返回原状态（不消耗步数）。
 * @param state - 当前状态（不会被修改）。
 * @param color - 目标颜色索引（0..colorCount-1）。
 * @returns 新状态；无效/无操作时返回原引用。
 */
export function flood(state: FloodItState, color: number): FloodItState {
  if (state.won) return state
  if (color < 0 || color >= state.colorCount) return state
  if (color === state.board[0]) return state
  if (state.steps >= state.maxSteps) return state
  const inComp = componentOf(state.board, state.size, 0, 0)
  const board = state.board.slice()
  for (let i = 0; i < board.length; i += 1) if (inComp[i]) board[i] = color
  return { ...state, board, steps: state.steps + 1, won: isUniform(board) }
}

/**
 * 贪心下一步色：对每个候选色模拟 flood，取换色后左上连通片最大者，
 * 并列取颜色索引最小者（确定性）。
 * @returns 颜色索引；已胜利时返回 -1。
 */
export function greedyNextColor(state: FloodItState): number {
  if (state.won) return -1
  let best = -1
  let bestSize = -1
  for (let color = 0; color < state.colorCount; color += 1) {
    if (color === state.board[0]) continue
    const next = flood(state, color)
    const inComp = componentOf(next.board, next.size, 0, 0)
    const size = inComp.reduce((n, v) => (v ? n + 1 : n), 0)
    if (size > bestSize) {
      bestSize = size
      best = color
    }
  }
  return best
}

/**
 * 从初始盘面用贪心策略通关所需的步数（生成关卡时校准步数上限用）。
 * @param board - 初始盘面（不会被修改）。
 * @param size - 边长。
 * @returns 贪心通关步数；对不可达的退化输入最多迭代 size*size*COLOR_COUNT 步。
 */
export function greedySolveLength(board: number[], size: number): number {
  let state: FloodItState = {
    size, colorCount: COLOR_COUNT, board: board.slice(), steps: 0,
    maxSteps: size * size * COLOR_COUNT, won: isUniform(board),
  }
  while (!state.won) {
    const color = greedyNextColor(state)
    if (color < 0) break
    state = flood(state, color)
  }
  return state.steps
}
