/**
 * Chess AI: negamax with alpha-beta pruning, MVV-LVA move ordering,
 * quiescence search over captures/promotions, iterative deepening with a
 * node budget, and material + piece-square-table evaluation. Fully
 * deterministic for identical position/depth/budget/seed — a seeded
 * mulberry32 stream breaks ties among equal-scored root moves only.
 */
import {
  applyMove, colorOf, fileOf, inCheck, insufficientMaterial, legalMoves,
  rankOf, type Move, type Piece, type Position,
} from './logic.ts'

/** Hard cap on visited nodes per chooseMove call (all levels share it). */
export const NODE_BUDGET = 50_000
export const MATE = 100_000

/** Per-level search depths (ply): L1 d2, L2 d3, L3 d4, L4 d5. */
export const LEVEL_DEPTH = [2, 3, 4, 5] as const

const VAL: Record<Piece, number> = {
  P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0,
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 0,
}

// Piece-square tables from White's perspective, listed rank 8 (a8..h8) down
// to rank 1, matching the standard published layout.
const PST_PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
]
const PST_KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
]
const PST_BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
]
const PST_ROOK = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
]
const PST_QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
]
const PST_KING = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
]

const PST: Record<string, number[]> = {
  P: PST_PAWN, N: PST_KNIGHT, B: PST_BISHOP, R: PST_ROOK, Q: PST_QUEEN, K: PST_KING,
}

/** 64-array index for a 0x88 square in a White-perspective table (rank 8 first). */
function pstIndex(s: number, white: boolean): number {
  const r = rankOf(s)
  return (white ? 7 - r : r) * 8 + fileOf(s)
}

/**
 * Static evaluation (centipawns) from the SIDE-TO-MOVE's perspective:
 * material + piece-square tables, White-positive then sign-flipped for Black.
 */
export function evaluate(pos: Position): number {
  let s = 0
  for (let i = 0; i < 128; i += 1) {
    if ((i & 0x88) !== 0) continue
    const p = pos.board[i] as Piece | ''
    if (p === '') continue
    const white = colorOf(p) === 'w'
    s += (white ? 1 : -1) * (VAL[p] + PST[p.toUpperCase()]![pstIndex(i, white)]!)
  }
  return pos.turn === 'w' ? s : -s
}

/** MVV-LVA: capture the most valuable piece with the least valuable attacker first. */
function moveScore(m: Move): number {
  let s = 0
  if (m.capture !== '') s += 1_000_000 + VAL[m.capture] * 16 - VAL[m.piece]
  if (m.promo !== '') s += 1_000_000 + VAL[m.promo === 'q' ? 'Q' : m.promo === 'r' ? 'R' : m.promo === 'b' ? 'B' : 'N']
  return s
}

function orderedLegal(pos: Position): Move[] {
  return legalMoves(pos).sort((a, b) => moveScore(b) - moveScore(a))
}

/**
 * Quiescence search: stand-pat eval, then captures/promotions only, so the
 * eval never sees a mid-capture position. `caps` reuses the caller's
 * already-generated capture list when available.
 */
function quiesce(
  pos: Position, alpha: number, beta: number, qdepth: number, nodes: { n: number }, budget: number,
  caps?: Move[],
): number {
  nodes.n += 1
  const stand = evaluate(pos)
  if (qdepth === 0 || nodes.n > budget) return stand
  if (stand >= beta) return stand
  if (stand > alpha) alpha = stand
  let best = stand
  const list = caps ?? legalMoves(pos)
    .filter(m => m.capture !== '' || m.promo !== '')
    .sort((a, b) => moveScore(b) - moveScore(a))
  for (const m of list) {
    if (nodes.n > budget) break
    const v = -quiesce(applyMove(pos, m), -beta, -alpha, qdepth - 1, nodes, budget)
    if (v > best) best = v
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

/**
 * Negamax with alpha-beta; scores are from the side-to-move's perspective
 * (callers negate when unwinding). Mate scores are MATE minus ply so faster
 * mates win ties. Aborts (returns the static eval) once the node budget is hit.
 */
function negamax(pos: Position, depth: number, alpha: number, beta: number, ply: number, nodes: { n: number }, budget: number): number {
  nodes.n += 1
  if (nodes.n > budget) return evaluate(pos)
  const moves = orderedLegal(pos)
  if (moves.length === 0) return inCheck(pos) ? -MATE + ply : 0
  if (insufficientMaterial(pos)) return 0
  if (depth === 0) {
    const caps = moves.filter(m => m.capture !== '' || m.promo !== '')
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

/** Seeded PRNG (mulberry32): deterministic tie-breaking among equal-scored root moves. */
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
  move: Move | null
  /** Nodes actually visited (≤ budget + small overshoot). */
  nodes: number
  /** Deepest iteration whose scores were fully computed. */
  depth: number
}

/**
 * Pick a move by iterative deepening to `maxDepth` under `budget` nodes.
 * Root moves each search a FULL window: a narrowed window would return
 * fail-soft bounds incomparable across siblings. Ties among equal-scored
 * root moves break via the seeded rng (deterministic per seed).
 */
export function chooseMove(pos: Position, maxDepth: number, budget = NODE_BUDGET, seed = 0x9e3779b9): SearchResult {
  const moves = orderedLegal(pos)
  if (moves.length === 0) return { move: null, nodes: 0, depth: 0 }
  const nodes = { n: 0 }
  const rng = mulberry32(seed)
  let best: Move[] = [moves[0]!]
  let bestScore = -Infinity
  let completed = 0
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const scored: { move: Move; score: number }[] = []
    let aborted = false
    for (const m of moves) {
      const child = applyMove(pos, m)
      // Check for an immediate own-king blunder is unnecessary: m is legal.
      const v = -negamax(child, depth - 1, -Infinity, Infinity, 1, nodes, budget)
      scored.push({ move: m, score: v })
      if (nodes.n > budget) { aborted = true; break }
    }
    if (scored.length > 0 && (!aborted || depth === 1)) {
      let top = -Infinity
      for (const s of scored) if (s.score > top) top = s.score
      best = scored.filter(s => s.score === top).map(s => s.move)
      bestScore = top
      completed = depth
    }
    if (aborted || Math.abs(bestScore) > MATE - 1000) break // found mate; stop
  }
  const pick = best.length === 1 ? best[0]! : best[Math.floor(rng() * best.length)]!
  return { move: pick, nodes: nodes.n, depth: completed }
}
