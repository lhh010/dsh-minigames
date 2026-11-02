/**
 * 斗兽棋 AI：negamax + α-β 剪枝、MVV-LVA 吃子排序、子力价值 +
 * 推进（与敌兽穴的曼哈顿距离）+ 兽穴威胁位置分评估、迭代加深与
 * 节点限额。搜索以"根着法切片"方式分帧执行：createSearch 返回的
 * 步进器每次 step() 只评估一个根着法（耗时数毫秒），UI 层每帧调用
 * 一次即可保证画面不卡顿；chooseMove 为同步封装（测试/复用）。
 * 相同 position/depth/budget/seed 下结果完全确定（mulberry32 决胜）。
 */
import { applyMove, colorOf, colOf, denOf, idx, legalMoves, rowOf, RANK, denWinner,
  type Move, type Piece, type Position } from './logic.ts'

/** 每步搜索的节点硬上限（各难度共用）。 */
export const NODE_BUDGET = 60_000
/** 胜利分值基线（减 ply 使更快取胜优先）。 */
export const MATE = 100_000
/** 难度 1-3 档对应的搜索深度（最后一档 3 层）。 */
export const LEVEL_DEPTH = [1, 2, 3] as const

/** 子力价值（鼠因能欺象而偏高；红黑同价）。 */
const VAL: Record<Piece, number> = {
  M: 500, C: 200, D: 250, W: 300, P: 600, T: 750, L: 850, E: 850,
  m: 500, c: 200, d: 250, w: 300, p: 600, t: 750, l: 850, e: 850,
}

/**
 * 静态评估（红方为正），返回值已换算为行棋方视角。
 * 组成：子力价值 + 推进分（越接近敌兽穴越高，贴穴额外加分）。
 * @param pos - 待评估局面。
 * @returns 行棋方视角的分值。
 */
export function evaluate(pos: Position): number {
  let s = 0
  const redDen = denOf('r')
  const blackDen = denOf('b')
  for (let i = 0; i < 63; i += 1) {
    const p = pos.board[i] as Piece | ''
    if (p === '') continue
    const red = colorOf(p) === 'r'
    const den = red ? blackDen : redDen
    const dist = Math.abs(rowOf(i) - rowOf(den)) + Math.abs(colOf(i) - colOf(den))
    let v = VAL[p] + (12 - dist) * 4
    if (dist === 1) v += 25
    s += red ? v : -v
  }
  return pos.turn === 'r' ? s : -s
}

/** MVV-LVA：先吃大子，攻击方子力价值小者优先。 */
function moveScore(pos: Position, m: Move): number {
  const target = pos.board[idx(m[2], m[3])] as Piece | ''
  if (target === '') return 0
  const attacker = pos.board[idx(m[0], m[1])] as Piece
  return 1_000_000 + VAL[target] * 16 - RANK[attacker]
}

/** 合法着法按吃子价值降序排序。 */
function orderedLegal(pos: Position): Move[] {
  return legalMoves(pos).sort((a, b) => moveScore(pos, b) - moveScore(pos, a))
}

interface Nodes {
  n: number
}

/**
 * negamax + α-β：分值取行棋方视角。节点入口先判兽穴占领（上一步
 * 入穴即胜负已分）；无合法着法判负返回 -MATE + ply；深度为 0 返回
 * 静态评估。节点超限立即中止并返回静态评估（上层按迭代丢弃该层结果）。
 */
function negamax(
  pos: Position, depth: number, alpha: number, beta: number, ply: number,
  nodes: Nodes, budget: number,
): number {
  nodes.n += 1
  const w = denWinner(pos.board)
  if (w !== null) return w === pos.turn ? MATE - ply : -(MATE - ply)
  if (nodes.n > budget) return evaluate(pos)
  const moves = orderedLegal(pos)
  if (moves.length === 0) return -MATE + ply
  if (depth === 0) return evaluate(pos)
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
