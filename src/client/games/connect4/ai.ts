/**
 * Connect Four AI: negamax with alpha-beta pruning, window-based evaluation,
 * center-first move ordering, iterative deepening, and a node budget. Fully
 * deterministic — the same position and depth always yield the same column.
 */
import { COLS, ROWS, RED, YELLOW, WINDOWS, dropRow, legalColumns, findWinner, isFull, at, type Board } from './logic.ts'

export const NODE_BUDGET = 200_000

const WIN_SCORE = 1_000_000

/** Column preference order (center out) for move ordering and tie-breaks. */
const CENTER_ORDER: readonly number[] = [3, 2, 4, 1, 5, 0, 6]

/** Static evaluation from `color`'s perspective (positive = good for color). */
export function evaluate(board: Board, color: number): number {
  const opp = color === RED ? YELLOW : RED
  let score = 0
  for (const w of WINDOWS) {
    let mine = 0
    let theirs = 0
    for (const i of w) {
      const v = board[i]!
      if (v === color) mine += 1
      else if (v === opp) theirs += 1
    }
    if (mine > 0 && theirs > 0) continue
    if (mine === 4) score += WIN_SCORE
    else if (mine === 3) score += 5000
    else if (mine === 2) score += 200
    if (theirs === 4) score -= WIN_SCORE
    else if (theirs === 3) score -= 6000
    else if (theirs === 2) score -= 220
  }
  // Center-column occupancy.
  for (let r = 0; r < ROWS; r += 1) {
    const v = at(board, 3, r)
    if (v === color) score += 10
    else if (v === opp) score -= 10
  }
  return score
}

/** Immediate-win columns for color, if any. */
function winningColumns(board: Board, color: number): number[] {
  const out: number[] = []
  for (const c of legalColumns(board)) {
    const row = dropRow(board, c)
    board[c * ROWS + row] = color
    const win = findWinner(board) !== null
    board[c * ROWS + row] = 0
    if (win) out.push(c)
  }
  return out
}

/** Ordered candidate columns: wins, blocks, then center-out. */
function orderedMoves(board: Board, color: number): number[] {
  const opp = color === RED ? YELLOW : RED
  const wins = winningColumns(board, color)
  if (wins.length > 0) return wins
  const blocks = winningColumns(board, opp)
  const rest = CENTER_ORDER.filter(c => dropRow(board, c) >= 0 && !blocks.includes(c))
  return [...blocks, ...rest]
}

/**
 * Negamax with alpha-beta. Returns the score from the SIDE-TO-MOVE's
 * perspective (standard negamax convention); callers negate when unwinding.
 * `nodes` is a mutable counter so the budget can abort mid-search.
 */
function negamax(board: Board, color: number, depth: number, alpha: number, beta: number, nodes: { n: number }): number {
  nodes.n += 1
  const w = findWinner(board)
  if (w !== null) return w.color === color ? WIN_SCORE - (10 - depth) : -WIN_SCORE + (10 - depth)
  if (isFull(board)) return 0
  if (depth === 0 || nodes.n > NODE_BUDGET) return evaluate(board, color)
  const opp = color === RED ? YELLOW : RED
  let best = -Infinity
  let a = alpha
  for (const c of orderedMoves(board, color)) {
    const row = dropRow(board, c)
    board[c * ROWS + row] = color
    const v = -negamax(board, opp, depth - 1, -beta, -a, nodes)
    board[c * ROWS + row] = 0
    if (v > best) best = v
    if (best > a) a = best
    if (a >= beta) break
  }
  return best
}

/**
 * Choose the AI's column. Iterative deepening to maxDepth with the node
 * budget; ties break by center-first column order (deterministic).
 */
export function chooseMove(board: Board, aiColor: 1 | 2, maxDepth: number, budget = NODE_BUDGET): number {
  const legal = legalColumns(board)
  if (legal.length === 0) return -1
  const nodes = { n: 0 }
  let bestCol = CENTER_ORDER.find(c => legal.includes(c)) ?? legal[0]!
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    let localBest = -Infinity
    let localCol = bestCol
    let aborted = false
    for (const c of orderedMoves(board, aiColor)) {
      const row = dropRow(board, c)
      board[c * ROWS + row] = aiColor
      // Root moves each get a FULL window: a narrowed window would return
      // fail-soft bounds that are incomparable across siblings. The child
      // score is from the opponent's perspective, so negate it.
      const v = -negamax(board, aiColor === RED ? YELLOW : RED, depth - 1, -Infinity, Infinity, nodes)
      board[c * ROWS + row] = 0
      if (v > localBest) { localBest = v; localCol = c }
      if (nodes.n > budget) { aborted = true; break }
    }
    if (!aborted || depth === 1) bestCol = localCol
    if (nodes.n > budget) break
  }
  return bestCol
}
