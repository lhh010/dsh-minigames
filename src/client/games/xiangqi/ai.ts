/**
 * 中国象棋 AI：negamax + α-β 剪枝、MVV-LVA 吃子排序、吃子静态搜索
 * （quiescence）、子力价值 + 位置分表评估、迭代加深与节点限额。
 * 搜索以"根着法切片"方式分帧执行：createSearch 返回的步进器每次
 * step() 只评估一个根着法（耗时数毫秒），UI 层每帧调用一次即可保证
 * 画面绝不卡死；chooseMove 为同步封装（测试/复用）。
 * 相同 position/depth/budget/seed 下结果完全确定（mulberry32 决胜）。
 */
import {
  applyMove, colorOf, colOf, idx, legalMoves, rowOf,
  type Move, type Piece, type Position,
} from './logic.ts'

/** 每步搜索的节点硬上限（各难度共用）。 */
export const NODE_BUDGET = 80_000
/** 将杀分值基线（减 ply 使更快将杀优先）。 */
export const MATE = 100_000
/** 难度 1-3 档对应的搜索深度。 */
export const LEVEL_DEPTH = [2, 3, 4] as const

/** 子力价值（红黑同价，将不计分——合法对局吃不到将）。 */
const VAL: Record<Piece, number> = {
  R: 1000, H: 450, C: 500, E: 200, A: 200, P: 100, K: 0,
  r: 1000, h: 450, c: 500, e: 200, a: 200, p: 100, k: 0,
}

// 位置分表（红方视角，row 0 为黑方底线/敌方纵深，与 logic.ts 一致）。
// 数值取自常见象棋引擎经验表：兵越深入越值钱、马占中心、炮贴后排安全、
// 车占要道、将守底线。
const PST_PAWN = [
   9,  9,  9, 11, 13, 11,  9,  9,  9,
  19, 24, 34, 42, 44, 42, 34, 24, 19,
  19, 24, 32, 37, 37, 37, 32, 24, 19,
  19, 23, 27, 29, 30, 29, 27, 23, 19,
  14, 18, 20, 27, 29, 27, 20, 18, 14,
   7,  0, 13,  0, 16,  0, 13,  0,  7,
   7,  0,  7,  0, 15,  0,  7,  0,  7,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
]
const PST_HORSE = [
   4,  8, 16, 12,  4, 12, 16,  8,  4,
   4, 10, 28, 16,  8, 16, 28, 10,  4,
  12, 14, 16, 20, 18, 20, 16, 14, 12,
   8, 24, 18, 24, 20, 24, 18, 24,  8,
   6, 16, 14, 18, 16, 18, 14, 16,  6,
   4, 12, 16, 14, 12, 14, 16, 12,  4,
   2,  6,  8,  6, 10,  6,  8,  6,  2,
   4,  2,  8,  8,  4,  8,  8,  2,  4,
   0,  2,  4,  4, -2,  4,  4,  2,  0,
   0, -4,  0,  0,  0,  0,  0, -4,  0,
]
const PST_CANNON = [
   6,  4,  0, -10, -12, -10,  0,  4,  6,
   2,  2,  0,  -4, -14,  -4,  0,  2,  2,
   2,  2,  0, -10,  -8, -10,  0,  2,  2,
   0,  0, -2,   4,  10,   4, -2,  0,  0,
   0,  0,  0,   2,   8,   2,  0,  0,  0,
  -2,  0,  4,   2,   6,   2,  4,  0, -2,
   0,  0,  0,   2,   4,   2,  0,  0,  0,
   4,  0,  8,   6,  10,   6,  8,  0,  4,
   0,  2,  4,   6,   6,   6,  4,  2,  0,
   0,  0,  2,   6,   6,   6,  2,  0,  0,
]
const PST_CHARIOT = [
  14, 14, 12, 18, 16, 18, 12, 14, 14,
  16, 20, 18, 24, 26, 24, 18, 20, 16,
  12, 12, 12, 18, 18, 18, 12, 12, 12,
  12, 18, 16, 22, 22, 22, 16, 18, 12,
  12, 14, 12, 18, 18, 18, 12, 14, 12,
  12, 16, 14, 20, 20, 20, 14, 16, 12,
   6, 10,  8, 14, 14, 14,  8, 10,  6,
   4,  8,  6, 14, 12, 14,  6,  8,  4,
   8,  4,  8, 16,  8, 16,  8,  4,  8,
  -2, 10,  6, 14, 12, 14,  6, 10, -2,
]
const PST_KING = [
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, -4, -6, -4, 0, 0, 0,
  0, 0, 0, -6, -10, -6, 0, 0, 0,
  0, 0, 0, -10, -14, -10, 0, 0, 0,
]
/** 士/象活动范围固定，位置分为零表。 */
const PST_ZERO: number[] = new Array<number>(90).fill(0)

const PST: Record<string, number[]> = {
  P: PST_PAWN, H: PST_HORSE, C: PST_CANNON, R: PST_CHARIOT, K: PST_KING,
  A: PST_ZERO, E: PST_ZERO,
}

/** 黑方查表时行/列镜像到红方视角。 */
function pstIndex(row: number, col: number, red: boolean): number {
  return (red ? row : 9 - row) * 9 + (red ? col : 8 - col)
}

/**
 * 静态评估（红方为正的子力 + 位置分），返回值已换算为行棋方视角。
 * @param pos - 待评估局面。
 * @returns 行棋方视角的分值。
 */
export function evaluate(pos: Position): number {
  let s = 0
  for (let i = 0; i < 90; i += 1) {
    const p = pos.board[i] as Piece | ''
    if (p === '') continue
    const red = colorOf(p) === 'r'
    s += (red ? 1 : -1) * (VAL[p] + PST[p.toUpperCase()]![pstIndex(rowOf(i), colOf(i), red)]!)
  }
  return pos.turn === 'r' ? s : -s
}

/** MVV-LVA：先吃大子，攻击方子力价值小者优先。 */
function moveScore(pos: Position, m: Move): number {
  const target = pos.board[idx(m[2], m[3])] as Piece | ''
  if (target === '') return 0
  const attacker = pos.board[idx(m[0], m[1])] as Piece
  return 1_000_000 + VAL[target] * 16 - VAL[attacker]
}

/** 合法着法按吃子价值降序排序。 */
function orderedLegal(pos: Position): Move[] {
  return legalMoves(pos).sort((a, b) => moveScore(pos, b) - moveScore(pos, a))
}

interface Nodes {
  n: number
}

/**
 * 吃子静态搜索：站桩评估后只展开吃子，避免评估落在半截交换上。
 * @param pos - 当前局面。
 * @param alpha - 下界。
 * @param beta - 上界。
 * @param qdepth - 剩余吃子搜索层数。
 * @param nodes - 共享节点计数器。
 * @param budget - 节点限额。
 * @param caps - 调用方已生成好的吃子列表（可选）。
 * @returns 行棋方视角分值。
 */
function quiesce(
  pos: Position, alpha: number, beta: number, qdepth: number, nodes: Nodes, budget: number,
  caps?: Move[],
): number {
  nodes.n += 1
  const stand = evaluate(pos)
  if (qdepth === 0 || nodes.n > budget) return stand
  if (stand >= beta) return stand
  let a = Math.max(alpha, stand)
  let best = stand
  const list = caps ?? legalMoves(pos)
    .filter(m => pos.board[idx(m[2], m[3])] !== '')
    .sort((x, y) => moveScore(pos, y) - moveScore(pos, x))
  for (const m of list) {
    if (nodes.n > budget) break
    const v = -quiesce(applyMove(pos, m), -beta, -a, qdepth - 1, nodes, budget)
    if (v > best) best = v
    if (best > a) a = best
    if (a >= beta) break
  }
  return best
}

/**
 * negamax + α-β：分值取行棋方视角；无合法着法（将死或困毙）均判负，
 * 返回 -MATE + ply。深度为 0 时进入吃子静态搜索。节点超限立即中止
 * 并返回静态评估（上层按迭代丢弃该层结果）。
 */
function negamax(
  pos: Position, depth: number, alpha: number, beta: number, ply: number,
  nodes: Nodes, budget: number,
): number {
  nodes.n += 1
  if (nodes.n > budget) return evaluate(pos)
  const moves = orderedLegal(pos)
  if (moves.length === 0) return -MATE + ply
  if (depth === 0) {
    const caps = moves.filter(m => pos.board[idx(m[2], m[3])] !== '')
    return caps.length === 0 ? evaluate(pos) : quiesce(pos, alpha, beta, 2, nodes, budget, caps)
  }
  let best = -Infinity
  let a = alpha
  for (const m of moves) {
    const v = -negamax(applyMove(pos, m), depth - 1, -beta, -a, ply + 1, nodes, budget)
    if (v > best) best = v
    if (best > a) a = best
    if (a >= beta) break
    if (nodes.n > budget) break
  }
  return best
}

/** mulberry32 种子随机（根着法等分决胜，确定性）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface SearchResult {
  /** 选定的着法；无合法着法时为 null。 */
  move: Move | null
  /** 实际访问节点数（<= budget + 少量超出）。 */
  nodes: number
  /** 完整算完的最深迭代层。 */
  depth: number
}

/**
 * 分帧搜索步进器：每次 step() 评估一个根着法（一颗子树，耗时有限），
 * 全部根着法评估完即完成一层迭代加深。根着法各用全窗口搜索，保证
 * 兄弟节点分值可直接比较；等分着法由种子随机决胜。
 */
export interface SearchStepper {
  /**
   * 执行下一段计算。
   * @returns done 为 true 时携带最终结果，之后再调用恒返回同一结果。
   */
  step(): { done: false } | { done: true; result: SearchResult }
}

/**
 * 创建分帧搜索。
 * @param pos - 待搜索局面。
 * @param maxDepth - 迭代加深的最大深度。
 * @param budget - 节点限额。
 * @param seed - 等分决胜的随机种子。
 * @returns 搜索步进器。
 */
export function createSearch(pos: Position, maxDepth: number, budget: number, seed: number): SearchStepper {
  const rootMoves = orderedLegal(pos)
  const nodes: Nodes = { n: 0 }
  const rng = mulberry32(seed)
  let finished: SearchResult | null = rootMoves.length === 0
    ? { move: null, nodes: 0, depth: 0 }
    : null
  let depth = 1
  let i = 0
  let bestMoves: Move[] = [rootMoves[0]!]
  let bestScore = -Infinity
  let completed = 0
  let scores: number[] = []
  const finish = (): SearchResult => {
    if (finished === null) {
      const pick = bestMoves.length === 1
        ? bestMoves[0]!
        : bestMoves[Math.floor(rng() * bestMoves.length)]!
      finished = { move: pick, nodes: nodes.n, depth: completed }
    }
    return finished
  }
  return {
    step(): { done: false } | { done: true; result: SearchResult } {
      if (finished !== null) return { done: true, result: finished }
      // 本步：完整评估第 i 个根着法（当前 depth 层）。
      const m = rootMoves[i]!
      const v = -negamax(applyMove(pos, m), depth - 1, -Infinity, Infinity, 1, nodes, budget)
      scores.push(v)
      i += 1
      const aborted = nodes.n > budget
      if (i >= rootMoves.length) {
        // 一层迭代完成：只在未超限（或首层）时采纳该层结果。
        if (!aborted || depth === 1) {
          let top = -Infinity
          for (const s of scores) if (s > top) top = s
          bestMoves = rootMoves.filter((_, k) => scores[k] === top)
          bestScore = top
          completed = depth
        }
        scores = []
        i = 0
        depth += 1
        if (aborted || depth > maxDepth || Math.abs(bestScore) > MATE - 1000) {
          return { done: true, result: finish() }
        }
      } else if (aborted) {
        // 层内超限：丢弃半截迭代，沿用上一层结果。
        return { done: true, result: finish() }
      }
      return { done: false }
    },
  }
}

/**
 * 同步选步（测试/复用入口；UI 请用 createSearch 分帧驱动）。
 * @param pos - 待搜索局面。
 * @param maxDepth - 最大搜索深度。
 * @param budget - 节点限额，默认 NODE_BUDGET。
 * @param seed - 决胜随机种子。
 * @returns 搜索结果。
 */
export function chooseMove(pos: Position, maxDepth: number, budget = NODE_BUDGET, seed = 0x9e3779b9): SearchResult {
  const stepper = createSearch(pos, maxDepth, budget, seed)
  for (;;) {
    const r = stepper.step()
    if (r.done) return r.result
  }
}
