/**
 * Lights Out 点灯 pure logic: clicking a cell toggles it and its orthogonal
 * neighbors; the board starts solved and is scrambled by applying N random
 * toggles, so every board is solvable by repeating them. Deterministic
 * functions only — no DOM, no timers.
 */

export const SIZE = 5
/** Scramble toggles at level 1. */
export const BASE_TOGGLES = 4
/** Scramble toggles cap. */
export const MAX_TOGGLES = 12

export type Cell = boolean
export type Board = Cell[][]
/** [row, col] of one toggled cell. */
export type Move = [number, number]

/** Deterministic mulberry32 PRNG (see tests/pipes-logic.spec.ts precedent). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A solved (all-off) board. */
export function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false))
}

function cloneBoard(board: Board): Board {
  return board.map((row) => [...row])
}

/** In-bounds orthogonal neighbors of a cell, excluding the cell itself. */
export function neighbors(r: number, c: number): Move[] {
  const out: Move[] = []
  if (r > 0) out.push([r - 1, c])
  if (r < SIZE - 1) out.push([r + 1, c])
  if (c > 0) out.push([r, c - 1])
  if (c < SIZE - 1) out.push([r, c + 1])
  return out
}

/**
 * Toggle a cell and its orthogonal neighbors.
 * @returns a new board; the input is unchanged.
 */
export function toggleAt(board: Board, r: number, c: number): Board {
  const next = cloneBoard(board)
  next[r]![c] = !next[r]![c]
  for (const [nr, nc] of neighbors(r, c)) next[nr]![nc] = !next[nr]![nc]
  return next
}

/** True when every light is off. */
export function isSolved(board: Board): boolean {
  return board.every((row) => row.every((cell) => !cell))
}

/** Scramble toggle count for a level: 4 at level 1, +1 per level, capped at 12. */
export function scrambleCount(level: number): number {
  return Math.min(BASE_TOGGLES + Math.max(1, level) - 1, MAX_TOGGLES)
}

/** The N toggle cells a scramble applies, deterministically from the seed. */
export function scrambleMoves(seed: number, n: number): Move[] {
  const rng = mulberry32(seed)
  const moves: Move[] = []
  for (let i = 0; i < n; i += 1) {
    moves.push([Math.floor(rng() * SIZE), Math.floor(rng() * SIZE)])
  }
  return moves
}

/**
 * Build a level board: solved board scrambled by n seed-determined toggles.
 * Applying the same toggles again solves it.
 */
export function scramble(seed: number, n: number): Board {
  let board = emptyBoard()
  for (const [r, c] of scrambleMoves(seed, n)) board = toggleAt(board, r, c)
  return board
}
