/**
 * Peg Solitaire (孔明棋) pure logic: classic English 7×7 cross board.
 * A board is a length-49 Uint8Array with index = row * 7 + col (0-based);
 * value 1 = peg, 0 = empty hole. Indices outside the cross-shaped hole mask
 * are always 0 and are never valid move endpoints. Deterministic functions
 * over plain arrays — no DOM, no timers; the undo stack lives in the glue.
 */

export const SIZE = 7
/** Index of the board center hole (row 3, col 3). */
export const CENTER = 24

export type PegBoard = Uint8Array

/** True where (row, col) is a hole of the English cross. */
function isCrossHole(r: number, c: number): boolean {
  return (r >= 2 && r <= 4) || (c >= 2 && c <= 4)
}

/** 49 flags: 1 at each of the 33 holes, 0 at the four corner blocks. */
export const BOARD_MASK: PegBoard = (() => {
  const mask = new Uint8Array(SIZE * SIZE)
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (isCrossHole(r, c)) mask[r * SIZE + c] = 1
    }
  }
  return mask
})()

/** Is `index` a hole of the board? */
export function isHole(index: number): boolean {
  return index >= 0 && index < SIZE * SIZE && BOARD_MASK[index] === 1
}

/** Number of pegs currently on the board. */
export function pegCount(board: PegBoard): number {
  let n = 0
  for (let i = 0; i < board.length; i += 1) n += board[i] ?? 0
  return n
}

/** One challenge: a start position plus a win goal. */
export interface PegLevel {
  /** Chinese HUD name. */
  name: string
  /** Win needs exactly 1 peg; 'center' additionally requires it at {@link CENTER}. */
  goal: 'center' | 'any'
}

export const LEVELS: readonly PegLevel[] = [
  { name: '标准局 · 中心收官', goal: 'center' },
  { name: '标准局 · 任意收官', goal: 'any' },
  { name: '十字局', goal: 'any' },
]

function boardWithPegs(pegAt: (r: number, c: number) => boolean): PegBoard {
  const board = new Uint8Array(SIZE * SIZE)
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (isCrossHole(r, c) && pegAt(r, c)) board[r * SIZE + c] = 1
    }
  }
  return board
}

/** Start board per level index (0..2); matches {@link LEVELS}. */
export const START_BOARDS: readonly PegBoard[] = [
  // L1/L2 标准局: 32 pegs, only the center hole empty.
  boardWithPegs((r, c) => r * SIZE + c !== CENTER),
  boardWithPegs((r, c) => r * SIZE + c !== CENTER),
  // L3 十字局: 12 pegs on the center row and column, center hole empty (a
  // full plus with no empty hole would have no legal first jump).
  boardWithPegs((r, c) => (r === 3 || c === 3) && r * SIZE + c !== CENTER),
]

/** The index jumped over when moving from `from` to `to`, or null if not a 2-step orthogonal line. */
export function jumpedPeg(from: number, to: number): number | null {
  const fr = Math.floor(from / SIZE), fc = from % SIZE
  const tr = Math.floor(to / SIZE), tc = to % SIZE
  const dr = tr - fr, dc = tc - fc
  if (Math.abs(dr) === 2 && dc === 0) return (fr + dr / 2) * SIZE + fc
  if (Math.abs(dc) === 2 && dr === 0) return fr * SIZE + (fc + dc / 2)
  return null
}

/**
 * Apply a jump: peg at `from` leaps over the adjacent peg into empty `to`,
 * removing the jumped peg.
 * @returns the new board, or null when the move is illegal (off-board,
 *   off-mask, no source peg, no jumped peg, or occupied landing).
 */
export function applyMove(board: PegBoard, from: number, to: number): PegBoard | null {
  if (!isHole(from) || !isHole(to) || from === to) return null
  const mid = jumpedPeg(from, to)
  if (mid === null || !isHole(mid)) return null
  if (board[from] !== 1 || board[mid] !== 1 || board[to] !== 0) return null
  const next = board.slice()
  next[from] = 0
  next[mid] = 0
  next[to] = 1
  return next
}

/** All legal [from, to] jumps on `board`. */
export function legalMoves(board: PegBoard): [number, number][] {
  const moves: [number, number][] = []
  for (let from = 0; from < board.length; from += 1) {
    if (board[from] !== 1) continue
    const r = Math.floor(from / SIZE), c = from % SIZE
    for (const [dr, dc] of [[-2, 0], [2, 0], [0, -2], [0, 2]] as const) {
      const tr = r + dr, tc = c + dc
      if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) continue
      if (applyMove(board, from, tr * SIZE + tc) !== null) moves.push([from, tr * SIZE + tc])
    }
  }
  return moves
}

/**
 * Win check for a level index into {@link LEVELS}.
 * @returns true when the board meets the level goal (1 peg; L1 also requires it at center).
 */
export function isWin(board: PegBoard, level: number): boolean {
  const goal = LEVELS[level]?.goal
  if (goal === undefined) return false
  if (pegCount(board) !== 1) return false
  return goal === 'any' || board[CENTER] === 1
}
