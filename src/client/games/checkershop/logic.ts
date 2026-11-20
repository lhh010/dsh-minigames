/**
 * 跳棋竞速 CheckersHop 纯逻辑：两人制中国跳棋（星盘的两极营区 + 中央
 * 六角区，共 81 格）。每方 10 枚棋子从己方营区出发，全部抵达对岸营区
 * 者胜该局，3 局 2 胜。走子只有两种：一步走到相邻空位（六向），或跳
 * 过相邻棋子（不分敌我）落到其正后方空位；跳后可继续连跳、也可在任
 * 一落点随时停止；全程不吃子（纯竞速）。防赖规则（简化判定）：棋子
 * 进入目标营区后锁定，只能在营区内移动腾位、不能移出。所有随机性经
 * mulberry32 种子注入；AI 为一层贪心（全子距目标和 + 链跳收益 + 种子
 * 噪声），同种子可确定性重放。
 *
 * 坐标系：轴向坐标 (q, r)，r 向下增大。中央六角区 = max(|q|,|r|,|q+r|)
 * <= 4（61 格）；上方营区（AI 起点）= r <= -5 的 10 格三角；下方营区
 * （你起点）= r >= 5 的 10 格三角。你的目标营区在上方，AI 的在下方。
 */

/** 胜一整场所需的局数（3 局 2 胜）。 */
export const ROUNDS_TO_WIN = 2
/** 每方棋子数（营区三角恰好 10 格）。 */
export const PIECES_PER_SIDE = 10
/** 中央六角区的半径（边长 5 的六角）。 */
const HEX_RADIUS = 4

/** 轴向六方向：东、西、南、北、东南、西北。 */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
]

/** 一格的轴向坐标。 */
export interface Cell { q: number, r: number }

/** 是否属于中央六角区。 */
function inHex(q: number, r: number): boolean {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= HEX_RADIUS
}

/** 是否属于上方营区（r <= -5，q 从 1 行 4 格收到 4 行 1 格的三角）。 */
export function inTopCamp(q: number, r: number): boolean {
  return r <= -5 && q >= -r - 4 && q <= 4
}

/** 是否属于下方营区（r >= 5，q 从 -4 行 4 格收到 -1 行 1 格的三角）。 */
export function inBottomCamp(q: number, r: number): boolean {
  return r >= 5 && q >= -4 && q <= -(r - 4)
}

/** 全部 81 格（r 从 -8 到 8、q 升序的稳定顺序）。 */
export const CELLS: Cell[] = (() => {
  const out: Cell[] = []
  for (let r = -8; r <= 8; r += 1) {
    for (let q = -8; q <= 8; q += 1) {
      if (inHex(q, r) || inTopCamp(q, r) || inBottomCamp(q, r)) out.push({ q, r })
    }
  }
  return out
})()

/** (q, r) -> 格编号（0..80），不在盘上返回 -1。 */
export function cellId(q: number, r: number): number {
  for (let i = 0; i < CELLS.length; i += 1) {
    const c = CELLS[i]!
    if (c.q === q && c.r === r) return i
  }
  return -1
}

/** 邻接表：每格的六向在盘邻居（编号升序）。 */
export const ADJ: number[][] = (() => {
  const out: number[][] = []
  for (let i = 0; i < CELLS.length; i += 1) {
    const { q, r } = CELLS[i]!
    const ns: number[] = []
    for (const [dq, dr] of DIRS) {
      const id = cellId(q + dq, r + dr)
      if (id >= 0) ns.push(id)
    }
    out.push(ns)
  }
  return out
})()

/** 上/下方营区的格编号集合（升序）。 */
export const CAMP_TOP_IDS: number[] = CELLS.map((_, i) => i).filter(i => {
  const c = CELLS[i]!
  return inTopCamp(c.q, c.r)
})
export const CAMP_BOTTOM_IDS: number[] = CELLS.map((_, i) => i).filter(i => {
  const c = CELLS[i]!
  return inBottomCamp(c.q, c.r)
})

/** 每格归属：0 中央区、1 上营区、2 下营区。 */
export const CAMP_FLAG: Uint8Array = (() => {
  const f = new Uint8Array(CELLS.length)
  for (const id of CAMP_TOP_IDS) f[id] = 1
  for (const id of CAMP_BOTTOM_IDS) f[id] = 2
  return f
})()

/** 一方：你（下方出发）或 AI（上方出发）。 */
export type Side = 'you' | 'ai'

/** 给定一方的目标营区标记值：你的目标在上方，AI 的在下方。 */
function targetCampFlag(side: Side): number {
  return side === 'you' ? 1 : 2
}

/** 从一组起点格出发的 BFS 距离（无视棋子占用，只看连通性）。 */
function bfsFrom(startIds: number[]): number[] {
  const dist = new Array<number>(CELLS.length).fill(Infinity)
  let frontier = [...startIds]
  for (const id of startIds) dist[id] = 0
  while (frontier.length > 0) {
    const next: number[] = []
    for (const cur of frontier) {
      for (const nb of ADJ[cur]!) {
        if (dist[nb] !== Infinity) continue
        dist[nb] = dist[cur]! + 1
        next.push(nb)
      }
    }
    frontier = next
  }
  return dist
}

/** 到上方营区（你的目标）的 BFS 距离表。 */
export const DIST_TO_TOP: number[] = bfsFrom(CAMP_TOP_IDS)
/** 到下方营区（AI 的目标）的 BFS 距离表。 */
export const DIST_TO_BOTTOM: number[] = bfsFrom(CAMP_BOTTOM_IDS)

/** mulberry32：32 位种子 -> [0,1) 确定性伪随机函数。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type CheckersHopPhase = 'play' | 'roundEnd' | 'matchEnd'

/** 一局（及整场）的全部可变状态；AI 与重放只依赖它。 */
export interface CheckersHopState {
  /** 每格占用：0 空、1 你、2 AI。 */
  board: number[]
  /** 当前行子方。 */
  turn: Side
  /** play 进行中 / roundEnd 一局结束 / matchEnd 整场结束。 */
  phase: CheckersHopPhase
  /** 当前局号（从 1 起）。 */
  roundNo: number
  roundWinsYou: number
  roundWinsAi: number
  /** 整场胜者（matchEnd 时非空）。 */
  matchWinner: Side | null
  /** 上一局胜者（roundEnd 时非空）。 */
  roundWinner: Side | null
  /** 双方合计已行走子数（重放校验用）。 */
  moveNo: number
  /** 种子随机流（AI 噪声）。 */
  rng: () => number
}

/** 空盘（全部格清零）。 */
export function emptyBoard(): number[] {
  return new Array<number>(CELLS.length).fill(0)
}

/** 初始摆子：你 10 子在下营区，AI 10 子在上营区。 */
export function initialBoard(): number[] {
  const b = emptyBoard()
  for (const id of CAMP_BOTTOM_IDS) b[id] = 1
  for (const id of CAMP_TOP_IDS) b[id] = 2
  return b
}

/** 用种子开一场新对局（第 1 局，你先行）。 */
export function createCheckersHop(seed: number): CheckersHopState {
  return {
    board: initialBoard(),
    turn: 'you',
    phase: 'play',
    roundNo: 1,
    roundWinsYou: 0,
    roundWinsAi: 0,
    matchWinner: null,
    roundWinner: null,
    moveNo: 0,
    rng: mulberry32(seed),
  }
}

/** 一方在某格集合外的棋子数（用于入营统计）。 */
export function countInTargetCamp(board: number[], side: Side): number {
  const flag = targetCampFlag(side)
  const num = side === 'you' ? 1 : 2
  let n = 0
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === num && CAMP_FLAG[i] === flag) n += 1
  }
  return n
}

/** 一方全部棋子到其目标营区的 BFS 距离和（越小越接近胜利）。 */
export function distSum(board: number[], side: Side): number {
  const dist = side === 'you' ? DIST_TO_TOP : DIST_TO_BOTTOM
  const num = side === 'you' ? 1 : 2
  let sum = 0
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === num) sum += dist[i]!
  }
  return sum
}

/** 棋子是否已停在自己的目标营区（锁定）。 */
export function isLocked(board: number[], from: number): boolean {
  const num = board[from]
  if (num === 1) return CAMP_FLAG[from] === 1
  if (num === 2) return CAMP_FLAG[from] === 2
  return false
}

/** 一步走：相邻空位。 */
export function stepsFor(board: number[], from: number): number[] {
  const out: number[] = []
  for (const nb of ADJ[from]!) {
    if (board[nb] === 0) out.push(nb)
  }
  return out
}

/**
 * 跳可达集（含链跳完整枚举）：从 from 出发，反复跳过相邻棋子（敌我
 * 皆可）到正后方空位；每个中间落点都算合法终点（可中途停止）。链上
 * 起点格视为空（棋子已拿起）。perHop 限制每一跳的落点范围（锁定子
 * 传"必须留在营区"）。
 */
export function jumpTargets(
  board: number[], from: number,
  perHop: (id: number) => boolean = () => true,
): number[] {
  const out: number[] = []
  const seen = new Set<number>([from])
  let frontier = [from]
  const landOk = (id: number): boolean =>
    id >= 0 && (board[id] === 0 || id === from) && perHop(id)
  while (frontier.length > 0) {
    const next: number[] = []
    for (const cur of frontier) {
      const { q, r } = CELLS[cur]!
      for (const [dq, dr] of DIRS) {
        const mid = cellId(q + dq, r + dr)
        if (mid < 0 || board[mid] === 0) continue
        const land = cellId(q + 2 * dq, r + 2 * dr)
        if (!landOk(land)) continue
        if (seen.has(land)) continue
        seen.add(land)
        out.push(land)
        next.push(land)
      }
    }
    frontier = next
  }
  return out
}

/**
 * 一枚棋子本回合的全部合法落点：一步走 + 链跳（每个落点都独立可
 * 选）。锁定规则：已停在自己目标营区的棋子，落点（及链跳每一跳的
 * 落点）必须仍在该营区内。
 */
export function legalTargets(board: number[], from: number): number[] {
  const num = board[from]
  if (num !== 1 && num !== 2) return []
  const side: Side = num === 1 ? 'you' : 'ai'
  if (isLocked(board, from)) {
    const flag = targetCampFlag(side)
    const inCamp = (id: number): boolean => CAMP_FLAG[id] === flag
    return [...stepsFor(board, from).filter(inCamp), ...jumpTargets(board, from, inCamp)]
  }
  return [...stepsFor(board, from), ...jumpTargets(board, from)]
}

/** 一方是否还有任何合法走法。 */
export function hasAnyMove(board: number[], side: Side): boolean {
  const num = side === 'you' ? 1 : 2
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === num && legalTargets(board, i).length > 0) return true
  }
  return false
}

/** 走子后的内部结算：胜负判定 + 换手（含无棋可走的自动跳手）。 */
function settleAfterMove(state: CheckersHopState, mover: Side): void {
  state.moveNo += 1
  if (countInTargetCamp(state.board, mover) >= PIECES_PER_SIDE) {
    state.roundWinner = mover
    if (mover === 'you') state.roundWinsYou += 1
    else state.roundWinsAi += 1
    if (state.roundWinsYou >= ROUNDS_TO_WIN || state.roundWinsAi >= ROUNDS_TO_WIN) {
      state.matchWinner = mover
      state.phase = 'matchEnd'
    } else {
      state.phase = 'roundEnd'
    }
    return
  }
  const other: Side = mover === 'you' ? 'ai' : 'you'
  state.turn = other
  if (hasAnyMove(state.board, other)) return
  // 对方无棋可走：跳回 mover；若双方都卡死，按距离和判定该局。
  if (hasAnyMove(state.board, mover)) {
    state.turn = mover
    return
  }
  state.roundWinner = distSum(state.board, 'you') <= distSum(state.board, 'ai') ? 'you' : 'ai'
  if (state.roundWinner === 'you') state.roundWinsYou += 1
  else state.roundWinsAi += 1
  state.phase = state.roundWinsYou >= ROUNDS_TO_WIN || state.roundWinsAi >= ROUNDS_TO_WIN
    ? 'matchEnd'
    : 'roundEnd'
  if (state.phase === 'matchEnd') {
    state.matchWinner = state.roundWinsYou >= ROUNDS_TO_WIN ? 'you' : 'ai'
  }
}

/** 走子并结算（from->to 必须是 legalTargets 的成员）。 */
export function applyMove(state: CheckersHopState, from: number, to: number): void {
  const legal = legalTargets(state.board, from)
  if (!legal.includes(to)) throw new Error('checkershop: illegal move ' + from + '->' + to)
  state.board[to] = state.board[from]!
  state.board[from] = 0
  settleAfterMove(state, state.turn === 'you' ? 'you' : 'ai')
}

/**
 * 玩家走子入口：轮到你且 from 是你的子且 to 合法时执行并返回 true，
 * 否则不动盘面返回 false。
 */
export function playerMove(state: CheckersHopState, from: number, to: number): boolean {
  if (state.phase !== 'play' || state.turn !== 'you') return false
  if (state.board[from] !== 1) return false
  if (!legalTargets(state.board, from).includes(to)) return false
  applyMove(state, from, to)
  return true
}

/** 局间开下一局：重摆棋子、清局胜者、双方轮换先行。 */
export function nextRound(state: CheckersHopState): void {
  if (state.phase !== 'roundEnd') throw new Error('checkershop: nextRound only after roundEnd')
  state.board = initialBoard()
  state.roundWinner = null
  state.roundNo += 1
  state.turn = state.roundNo % 2 === 0 ? 'ai' : 'you'
  state.phase = 'play'
}

/** AI 的一个候选走法。 */
export interface CheckersHopMove { from: number, to: number }

/**
 * 通用贪心选法（确定性，AI 与自弈重放共用）：枚举 side 全部 (from,
 * to)（含链跳落点），打分 = 走后全子距离和 - 0.25 * 距离收益（链跳
 * 额外奖励）+ rng 噪声；取分最小者，平分取枚举序最先的。无棋可走返
 * 回 null。只读盘面（模拟后恢复）。
 */
export function chooseGreedyMove(state: CheckersHopState, side: Side): CheckersHopMove | null {
  const num = side === 'you' ? 1 : 2
  const before = distSum(state.board, side)
  let best: CheckersHopMove | null = null
  let bestScore = Infinity
  for (let from = 0; from < state.board.length; from += 1) {
    if (state.board[from] !== num) continue
    for (const to of legalTargets(state.board, from)) {
      state.board[to] = num
      state.board[from] = 0
      const after = distSum(state.board, side)
      state.board[from] = num
      state.board[to] = 0
      const score = after - 0.25 * (before - after) + state.rng() * 1.5
      if (score < bestScore) {
        bestScore = score
        best = { from, to }
      }
    }
  }
  return best
}

/** AI 选法：贪心的 AI 视角（轮到 AI 且对局进行中才返回非空）。 */
export function aiChooseMove(state: CheckersHopState): CheckersHopMove | null {
  if (state.phase !== 'play' || state.turn !== 'ai') return null
  return chooseGreedyMove(state, 'ai')
}

/**
 * AI 行子入口：选法并落子，返回所走的一步（跳手时返回 null 且已把
 * 行子权交还玩家）。
 */
export function aiTurn(state: CheckersHopState): CheckersHopMove | null {
  if (state.phase !== 'play' || state.turn !== 'ai') return null
  const move = aiChooseMove(state)
  if (move === null) {
    state.turn = 'you'
    return null
  }
  applyMove(state, move.from, move.to)
  return move
}
