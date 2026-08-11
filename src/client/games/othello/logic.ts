/**
 * Othello (黑白棋) pure logic: an 8x8 board, black (1) moves first; a move is
 * legal when it flanks one or more of the opponent's discs between the new
 * disc and an existing disc of the mover. Sides with no legal move pass;
 * after two consecutive passes the game ends and the side with more discs
 * wins. A heuristic AI favours corners and edges. Deterministic functions
 * over a plain state object.
 */

export const SIZE = 8
export type Cell = 0 | 1 | 2 // 0 empty, 1 black (player), 2 white (AI)

export interface OthelloState {
  board: Cell[][]
  /** Whose turn: 1 = black (player), 2 = white (AI). */
  turn: 1 | 2
  winner: 0 | 1 | 2
  over: boolean
  /** Consecutive passes; the game ends at 2. */
  passes: number
}

export interface Move { r: number; c: number }

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
]
const CORNERS: ReadonlyArray<readonly [number, number]> = [[0, 0], [0, 7], [7, 0], [7, 7]]

function other(player: 1 | 2): 1 | 2 {
  return player === 1 ? 2 : 1
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE
}

/** A fresh board with the classic four-disc opening; black moves first. */
export function createOthelloState(): OthelloState {
  const board: Cell[][] = Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(0))
  board[3]![3] = 1
  board[4]![4] = 1
  board[3]![4] = 2
  board[4]![3] = 2
  return { board, turn: 1, winner: 0, over: false, passes: 0 }
}

/** Discs that a move at (r, c) would flip for `player` (empty if illegal). */
export function flipsAt(board: Cell[][], r: number, c: number, player: 1 | 2): Array<[number, number]> {
  if (!inBounds(r, c) || board[r]![c] !== 0) return []
  const out: Array<[number, number]> = []
  for (const [dr, dc] of DIRS) {
    const line: Array<[number, number]> = []
    let nr = r + dr
    let nc = c + dc
    while (inBounds(nr, nc) && board[nr]![nc] === other(player)) {
      line.push([nr, nc])
      nr += dr
      nc += dc
    }
    if (line.length > 0 && inBounds(nr, nc) && board[nr]![nc] === player) {
      out.push(...line)
    }
  }
  return out
}

/** All legal moves for `player`. */
export function legalMoves(state: OthelloState, player: 1 | 2): Move[] {
  const out: Move[] = []
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (flipsAt(state.board, r, c, player).length > 0) out.push({ r, c })
    }
  }
  return out
}

/** Resolve auto-passes and detect the game end after a placement or pass. */
function resolve(state: OthelloState): void {
  while (state.passes < 2 && !state.over) {
    if (legalMoves(state, state.turn).length > 0) return
    // No move: pass to the other side.
    state.passes += 1
    state.turn = other(state.turn)
  }
  // Two consecutive passes: count discs.
  let black = 0
  let white = 0
  for (const row of state.board) {
    for (const cell of row) {
      if (cell === 1) black += 1
      else if (cell === 2) white += 1
    }
  }
  state.over = true
  state.winner = black > white ? 1 : white > black ? 2 : 0
}

/** Place a disc for the current turn; returns false when the move is illegal. */
export function place(state: OthelloState, r: number, c: number): boolean {
  if (state.over) return false
  const flips = flipsAt(state.board, r, c, state.turn)
  if (flips.length === 0) return false
  state.board[r]![c] = state.turn
  for (const [fr, fc] of flips) state.board[fr]![fc] = state.turn
  state.passes = 0
  state.turn = other(state.turn)
  resolve(state)
  return true
}

/** The current side passes (used when it has no legal move). */
export function passTurn(state: OthelloState): void {
  if (state.over) return
  state.passes += 1
  state.turn = other(state.turn)
  resolve(state)
}

/**
 * Heuristic score for one move: flips + corner bonus, corner-adjacent
 * penalty, edge bonus, slight centre (mobility) bias.
 */
function scoreMove(board: Cell[][], r: number, c: number, player: 1 | 2): number {
  const flips = flipsAt(board, r, c, player)
  let score = flips.length
  if ((r === 0 || r === 7) && (c === 0 || c === 7)) return 40 + score
  for (const [cr, cc] of CORNERS) {
    if (Math.abs(r - cr) <= 1 && Math.abs(c - cc) <= 1) {
      score -= 15
      break
    }
  }
  if (r === 0 || r === 7 || c === 0 || c === 7) score += 8
  const dist = Math.max(Math.abs(r - 3.5), Math.abs(c - 3.5))
  score += Math.max(0, 4 - dist) * 2
  return score
}

/** Choose the AI's move: the highest-scoring legal cell, or null when passing. */
export function chooseAiMove(state: OthelloState): Move | null {
  const moves = legalMoves(state, state.turn)
  if (moves.length === 0) return null
  let best: Move = moves[0]!
  let bestScore = -Infinity
  for (const move of moves) {
    const score = scoreMove(state.board, move.r, move.c, state.turn)
    if (score > bestScore) {
      bestScore = score
      best = move
    }
  }
  return best
}
