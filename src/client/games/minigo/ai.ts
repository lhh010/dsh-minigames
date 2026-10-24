/**
 * Mini Go AI: a heuristic evaluator plus a shallow 2-ply local search.
 * Level 0 = greedy heuristic, 1 = + capture/atari handling, 2 = 2-ply search
 * with a node budget. All tie-breaks are deterministic (lowest board index).
 */
import {
  BLACK, WHITE, legalMoves, play, neighbors, groupAndLiberties,
  type GoBoard,
} from './logic.ts'

const NODE_BUDGET = 3000

/** Count of own groups currently in atari (exactly one liberty). */
function atariGroups(board: GoBoard, color: number): number {
  const seen = new Set<number>()
  let n = 0
  for (let i = 0; i < board.cells.length; i += 1) {
    if (board.cells[i] !== color || seen.has(i)) continue
    const g = groupAndLiberties(board, i)
    for (const s of g.stones) seen.add(s)
    if (g.liberties.size === 1) n += 1
  }
  return n
}

function libertySum(board: GoBoard, color: number): number {
  const seen = new Set<number>()
  let total = 0
  for (let i = 0; i < board.cells.length; i += 1) {
    if (board.cells[i] !== color || seen.has(i)) continue
    const g = groupAndLiberties(board, i)
    for (const s of g.stones) seen.add(s)
    total += g.liberties.size
  }
  return total
}

function stoneCount(board: GoBoard, color: number): number {
  let n = 0
  for (let i = 0; i < board.cells.length; i += 1) if (board.cells[i] === color) n += 1
  return n
}

/** True when the point touches a friendly stone (shapes play). */
function adjacentToColor(board: GoBoard, i: number, color: number): boolean {
  return neighbors(board, i).some(n => board.cells[n] === color)
}

/**
 * Static evaluation from aiColor's perspective (positive = good for the AI):
 * stone and liberty balance, atari pressure both ways, local shape, and a
 * mild center preference while the board is still empty.
 */
export function evaluate(board: GoBoard, aiColor: number): number {
  const opp = aiColor === BLACK ? WHITE : BLACK
  let score = 0
  score += (stoneCount(board, aiColor) - stoneCount(board, opp)) * 3
  score += (libertySum(board, aiColor) - libertySum(board, opp)) * 2
  // Atari: an opponent group about to die is a big plus; our own is a big minus.
  score += atariGroups(board, opp) * 60
  score -= atariGroups(board, aiColor) * 55
  // Local shape: reward contact with friendly stones (avoid lone distant plays),
  // except on an empty board where opening in the center is preferred.
  const empties = board.cells.filter(v => v === 0).length
  const center = (board.size - 1) / 2
  let contact = 0
  for (let i = 0; i < board.cells.length; i += 1) {
    if (board.cells[i] !== aiColor) continue
    if (adjacentToColor(board, i, aiColor)) contact += 1
  }
  score += contact * 4
  if (empties > board.cells.length * 0.7) {
    const mid = Math.round(center) * board.size + Math.round(center)
    const d = Math.abs((mid % board.size) - center) + Math.abs(Math.floor(mid / board.size) - center)
    score += Math.max(0, 12 - d * 2)
  }
  return score
}

/** Heuristic delta of playing at i (captures score big; self-atari punished). */
function moveDelta(board: GoBoard, i: number, color: number): number {
  const res = play(board, i, color)
  if (res === null) return -Infinity
  let delta = evaluate(res.board, color) - evaluate(board, color)
  delta += res.captured.length * 80
  // Prefer moves that keep our new group breathing.
  const g = groupAndLiberties(res.board, i)
  if (g.liberties.size === 1) delta -= 40
  return delta
}

/**
 * Choose the AI move: a point index, or -1 to pass.
 * @param level - 0 greedy, 1 with capture/atari handling, 2 two-ply search.
 */
export function chooseMove(board: GoBoard, aiColor: number, level: number, prev: GoBoard | null): number {
  const moves = legalMoves(board, aiColor).filter(m => {
    if (prev === null) return true
    const res = play(board, m, aiColor)
    return res !== null && !res.board.cells.every((v, k) => v === prev.cells[k]!)
  })
  if (moves.length === 0) return -1
  const opp = aiColor === BLACK ? WHITE : BLACK

  if (level <= 0) {
    // Greedy: best heuristic delta; pass when nothing improves.
    let best = -1
    let bestScore = 0
    for (const m of moves) {
      const d = moveDelta(board, m, aiColor)
      if (d > bestScore) { bestScore = d; best = m }
    }
    return best
  }

  if (level === 1) {
    // Capture/atari-aware greedy: immediate captures and atari rescues first,
    // then heuristic delta.
    let best = -1
    let bestScore = -Infinity
    for (const m of moves) {
      const res = play(board, m, aiColor)!
      let s = moveDelta(board, m, aiColor)
      if (res.captured.length > 0) s += 1000
      const g = groupAndLiberties(res.board, m)
      if (g.liberties.size >= 2) s += 30
      if (s > bestScore) { bestScore = s; best = m }
    }
    return bestScore <= 0 ? -1 : best
  }

  // Level 2: two-ply search — our move, then the opponent's best heuristic
  // reply, with a node budget and deterministic ordering.
  let nodes = 0
  const opponentBest = (b: GoBoard): number => {
    nodes += 1
    if (nodes > NODE_BUDGET) return 0
    let best = -Infinity
    const oppMoves = legalMoves(b, opp).slice(0, 12)
    for (const m of oppMoves) {
      const res = play(b, m, opp)
      if (res === null) continue
      const v = evaluate(res.board, aiColor)
      if (v > best) best = v
    }
    return best === -Infinity ? evaluate(b, aiColor) : best
  }
  let best = -1
  let bestScore = -Infinity
  for (const m of moves) {
    const res = play(board, m, aiColor)!
    const s = evaluate(res.board, aiColor) - 0.9 * opponentBest(res.board)
    if (s > bestScore) { bestScore = s; best = m }
  }
  return bestScore <= -500 ? -1 : best
}
