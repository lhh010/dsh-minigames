/**
 * 倒水谜题 Jugs 纯逻辑：给定若干容量各异的壶（水源与排水无限，壶间可
 * 倾倒直至一方满或一方空），用最少步数让某只壶恰好持有目标升数。
 *
 * 全部函数为纯函数（返回新状态、不改入参）；关卡为固定表，par 由 BFS
 * 求最优步数得出；唯一的随机性是注入 rng 决定壶的排列顺序（mulberry32
 * 种子确定 → 同种子同关卡，确定性可测）。超 par×2 步判负。
 */

/** 一次玩家操作：装满 / 倒空 / 壶间倾倒。 */
export type JugsOp =
  | { kind: 'fill'; jug: number }
  | { kind: 'empty'; jug: number }
  | { kind: 'pour'; from: number; to: number }

/** 一关的静态定义：各壶容量与目标升数。 */
export interface JugsLevelDef {
  capacities: number[]
  target: number
}

/**
 * 五关递进表：壶数 2→2→3→3→3、容量组合变化、par（最优步数）6→8→10→12→14
 * 严格递增；每关目标都不是任何壶的整容量（否则装满即胜，失去谜题性）。
 */
export const LEVELS: readonly JugsLevelDef[] = [
  { capacities: [5, 3], target: 4 },
  { capacities: [7, 4], target: 5 },
  { capacities: [13, 8, 5], target: 4 },
  { capacities: [15, 8, 7], target: 4 },
  { capacities: [17, 12, 5], target: 11 },
]

/** 游戏状态：不可变，applyOp 返回新对象。 */
export interface JugsState {
  /** 当前关卡（1 起）。 */
  level: number
  /** 各壶容量（升），顺序由注入 rng 决定。 */
  capacities: number[]
  /** 各壶当前水量（升），与 capacities 对齐。 */
  amounts: number[]
  /** 目标升数。 */
  target: number
  /** 已用步数。 */
  moves: number
  /** 本关最优步数（BFS 求得）。 */
  par: number
  /** 步数上限（par×2），达到仍未过关判负。 */
  maxMoves: number
  /** 进行中 / 过关 / 超步判负。 */
  status: 'playing' | 'won' | 'lost'
}

/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
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

/** 某壶水量是否恰好等于目标（过关判定）。 */
export function isSolved(amounts: readonly number[], target: number): boolean {
  return amounts.some(v => v === target)
}

/**
 * BFS 求从全空出发的最优步数：六种操作（每壶装满/倒空 + 所有有序壶对
 * 倾倒）逐层展开状态空间，首次到达任一壶=目标即返回层数。
 * @param capacities - 各壶容量。
 * @param target - 目标升数。
 * @returns 最少步数；不可达（目标不是容量最大公约数的倍数等）返回 -1。
 */
export function optimalMoves(capacities: readonly number[], target: number): number {
  if (target <= 0) return -1
  const n = capacities.length
  const start = capacities.map(() => 0)
  const key = (a: readonly number[]): string => a.join(',')
  const seen = new Set([key(start)])
  let frontier: number[][] = [start]
  let depth = 0
  while (frontier.length > 0) {
    const next: number[][] = []
    for (const st of frontier) {
      for (let i = 0; i < n; i += 1) {
        const candidates: number[][] = []
        const filled = st.slice()
        filled[i] = capacities[i]!
        candidates.push(filled)
        const emptied = st.slice()
        emptied[i] = 0
        candidates.push(emptied)
        for (let j = 0; j < n; j += 1) {
          if (i === j) continue
          const poured = st.slice()
          const transfer = Math.min(st[i]!, capacities[j]! - st[j]!)
          poured[i] = st[i]! - transfer
          poured[j] = st[j]! + transfer
          candidates.push(poured)
        }
        for (const cand of candidates) {
          const k = key(cand)
          if (seen.has(k)) continue
          seen.add(k)
          if (cand.some(v => v === target)) return depth + 1
          next.push(cand)
        }
      }
    }
    depth += 1
    frontier = next
  }
  return -1
}

/**
 * 应用一次操作并结算胜负（过关：任壶=目标；超步：moves 达 maxMoves）。
 * @param state - 当前状态（不被修改）。
 * @param op - 操作描述。
 * @returns 新状态；无效操作（已结束、越界、无变化的装/倒/倾倒、自倾）
 *   返回 null，调用方据此提示且不计步。
 */
export function applyOp(state: JugsState, op: JugsOp): JugsState | null {
  if (state.status !== 'playing') return null
  const n = state.capacities.length
  const amounts = state.amounts
  let next: number[]
  if (op.kind === 'fill') {
    const i = op.jug
    if (i < 0 || i >= n || amounts[i] === state.capacities[i]) return null
    next = amounts.slice()
    next[i] = state.capacities[i]!
  } else if (op.kind === 'empty') {
    const i = op.jug
    if (i < 0 || i >= n || amounts[i] === 0) return null
    next = amounts.slice()
    next[i] = 0
  } else {
    const from = op.from
    const to = op.to
    if (from < 0 || from >= n || to < 0 || to >= n || from === to) return null
    const transfer = Math.min(amounts[from]!, state.capacities[to]! - amounts[to]!)
    if (transfer === 0) return null
    next = amounts.slice()
    next[from] = amounts[from]! - transfer
    next[to] = amounts[to]! + transfer
  }
  const moves = state.moves + 1
  const status = isSolved(next, state.target) ? 'won' : (moves >= state.maxMoves ? 'lost' : 'playing')
  const result: JugsState = {
    level: state.level,
    capacities: state.capacities,
    amounts: next,
    target: state.target,
    moves,
    par: state.par,
    maxMoves: state.maxMoves,
    status,
  }
  return result
}

/**
 * 建立第 level 关的初始状态：全空壶，容量取自 LEVELS（越界钳制到末关），
 * 壶的排列顺序由注入 rng 洗牌（不传则按表内顺序），par/maxMoves 由 BFS
 * 当场求出（关卡表因此自带可解性验证）。
 * @param level - 关卡号（1 起）。
 * @param rng - [0,1) 随机源（mulberry32 等）；省略则不洗牌。
 * @returns playing 状态的初始局面。
 */
export function createJugsState(level: number, rng?: () => number): JugsState {
  const idx = Math.min(Math.max(level, 1), LEVELS.length) - 1
  const def = LEVELS[idx]!
  let capacities = def.capacities.slice()
  if (rng !== undefined && capacities.length > 1) {
    for (let i = capacities.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      const tmp = capacities[i]!
      capacities[i] = capacities[j]!
      capacities[j] = tmp
    }
  }
  const par = optimalMoves(def.capacities, def.target)
  const state: JugsState = {
    level: idx + 1,
    capacities,
    amounts: capacities.map(() => 0),
    target: def.target,
    moves: 0,
    par,
    maxMoves: par * 2,
    status: 'playing',
  }
  return state
}
