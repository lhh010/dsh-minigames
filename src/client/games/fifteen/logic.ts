/**
 * 15-Puzzle 数字华容道 pure logic: an n×n board of tiles 1..n²-1 plus one
 * blank (0). A slide moves the tile adjacent to the blank into the blank; the
 * arrow direction names the TILE's movement (pressing ← slides the tile right
 * of the blank leftward). Scrambles apply seeded random legal moves from the
 * solved state, so every scramble is solvable by construction.
 */

/** mulberry32 PRNG (same construction as lightsout/logic.ts). */
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

/** Direction a TILE moves (the blank swaps the opposite way). */
export type Dir = 'up' | 'down' | 'left' | 'right'

/** A slide: a tile direction, or the flat index of a tile adjacent to the blank. */
export type SlideMove = Dir | number

/** The four arrow directions in a stable order (scramble choices). */
const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right']

/** Opposite direction (undo of a dir slide). */
export function opposite(dir: Dir): Dir {
  if (dir === 'up') return 'down'
  if (dir === 'down') return 'up'
  if (dir === 'left') return 'right'
  return 'left'
}

/** A solved board for `size`: 1..size²-1 in order, blank (0) last. */
export function createSolved(size: number): number[] {
  return Array.from({ length: size * size }, (_, i) => (i + 1) % (size * size))
}

/** Flat index of the blank (0). */
export function blankIndex(board: number[]): number {
  return board.indexOf(0)
}

/**
 * Slide by direction: move the tile that sits `dir` of the blank's neighbor
 * position into the blank (the direction names the tile's movement).
 * @returns a new board, or null when no tile lies in that direction.
 */
function slideDir(board: number[], size: number, dir: Dir): number[] | null {
  const b = blankIndex(board)
  const r = Math.floor(b / size)
  const c = b % size
  // The tile that can move `dir` stands opposite the blank.
  const tr = dir === 'up' ? r + 1 : dir === 'down' ? r - 1 : r
  const tc = dir === 'left' ? c + 1 : dir === 'right' ? c - 1 : c
  if (tr < 0 || tr >= size || tc < 0 || tc >= size) return null
  const t = tr * size + tc
  const next = [...board]
  next[b] = next[t]!
  next[t] = 0
  return next
}

/**
 * Apply one slide (direction or adjacent tile index).
 * @returns a new board, or null for an illegal move; the input is unchanged.
 */
export function slide(board: number[], move: SlideMove): number[] | null {
  const size = Math.round(Math.sqrt(board.length))
  if (typeof move === 'number') {
    if (move < 0 || move >= board.length || move === blankIndex(board)) return null
    const b = blankIndex(board)
    const r = Math.floor(move / size)
    const c = move % size
    const br = Math.floor(b / size)
    const bc = b % size
    if (Math.abs(r - br) + Math.abs(c - bc) !== 1) return null
    const next = [...board]
    next[b] = next[move]!
    next[move] = 0
    return next
  }
  return slideDir(board, size, move)
}

/** True when the tiles are in solved order (blank last). */
export function isSolved(board: number[]): boolean {
  return board.every((v, i) => v === (i + 1) % board.length)
}

/**
 * Inversions-rule solvability check for the goal order 1..n²-1, blank last.
 * Odd width: solvable iff inversions are even. Even width: solvable iff
 * inversions plus the blank's row counting from the bottom is odd.
 */
export function solvableParity(board: number[], size: number): boolean {
  const tiles = board.filter((v) => v !== 0)
  let inversions = 0
  for (let i = 0; i < tiles.length; i += 1) {
    for (let j = i + 1; j < tiles.length; j += 1) {
      if (tiles[i]! > tiles[j]!) inversions += 1
    }
  }
  if (size % 2 === 1) return inversions % 2 === 0
  const rowFromBottom = size - Math.floor(blankIndex(board) / size)
  return (inversions + rowFromBottom) % 2 === 1
}

/** Scramble move count for a board size: 40 × size/4 (30/40/50 for 3/4/5). */
export function scrambleMovesFor(size: number): number {
  return Math.round((40 * size) / 4)
}

/**
 * Scramble from `board` by n seeded random legal moves (re-rolling whenever
 * the result would be solved, so the output is never already-solved).
 * @returns the scrambled board and the number of moves actually applied (par).
 */
export function scrambleFrom(board: number[], seed: number, n: number): { board: number[]; moves: number } {
  const rng = mulberry32(seed)
  const size = Math.round(Math.sqrt(board.length))
  let current = board
  let applied = 0
  for (let i = 0; i < n; i += 1) {
    const candidates = DIRS.filter((d) => slideDir(current, size, d) !== null)
    const dir = candidates[Math.floor(rng() * candidates.length)]!
    current = slideDir(current, size, dir)!
    applied += 1
  }
  // Legal-move scrambles can undo themselves; keep going until unsolved.
  while (isSolved(current)) {
    const candidates = DIRS.filter((d) => slideDir(current, size, d) !== null)
    const dir = candidates[Math.floor(rng() * candidates.length)]!
    current = slideDir(current, size, dir)!
    applied += 1
  }
  return { board: current, moves: applied }
}
