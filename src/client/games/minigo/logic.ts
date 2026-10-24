/**
 * Mini Go (9x9) pure rules: liberties, captures, suicide prohibition, simple
 * ko, pass, and area (Chinese) scoring. The board is a flat Int8Array
 * (0 empty, 1 black, 2 white) in row-major order; all functions are pure
 * (they return fresh boards) so the AI and the tests can explore freely.
 */

export const BLACK = 1
export const WHITE = 2
/** Komi for White under area scoring (9x9 uses the standard 6.5). */
export const KOMI = 6.5
/** Black wins when its area exceeds half the board plus komi compensation. */
export const WIN_THRESHOLD = 40.5

export interface GoBoard {
  readonly size: number
  readonly cells: Int8Array
}

/** Create an empty size×size board. */
export function createBoard(size = 9): GoBoard {
  return { size, cells: new Int8Array(size * size) }
}

export function idx(board: GoBoard, r: number, c: number): number {
  return r * board.size + c
}

export function rc(board: GoBoard, i: number): { r: number; c: number } {
  return { r: Math.floor(i / board.size), c: i % board.size }
}

/** Orthogonal neighbors of a point, clipped to the board. */
export function neighbors(board: GoBoard, i: number): number[] {
  const { r, c } = rc(board, i)
  const out: number[] = []
  if (r > 0) out.push(i - board.size)
  if (r < board.size - 1) out.push(i + board.size)
  if (c > 0) out.push(i - 1)
  if (c < board.size - 1) out.push(i + 1)
  return out
}

/** The connected stone group containing i plus its liberty set. */
export function groupAndLiberties(board: GoBoard, i: number): { stones: number[]; liberties: Set<number> } {
  const color = board.cells[i]!
  const stones: number[] = []
  const liberties = new Set<number>()
  if (color === 0) return { stones, liberties }
  const seen = new Set<number>([i])
  const stack = [i]
  while (stack.length > 0) {
    const cur = stack.pop()!
    stones.push(cur)
    for (const n of neighbors(board, cur)) {
      const v = board.cells[n]!
      if (v === 0) liberties.add(n)
      else if (v === color && !seen.has(n)) {
        seen.add(n)
        stack.push(n)
      }
    }
  }
  return { stones, liberties }
}

/** Whether playing color at i would repeat the previous position (simple ko). */
export function wouldRepeat(board: GoBoard, i: number, color: number, prev: GoBoard | null): boolean {
  if (prev === null) return false
  const res = play(board, i, color)
  if (res === null) return false
  const next = res.board
  return next.cells.every((v, k) => v === prev.cells[k]!)
}

/**
 * Place color at i. Returns the new board plus the captured stones, or null
 * when the move is illegal (occupied or suicide — ko is checked by the
 * caller against the previous position).
 */
export function play(board: GoBoard, i: number, color: number): { board: GoBoard; captured: number[] } | null {
  if (board.cells[i] !== 0) return null
  const cells = board.cells.slice()
  cells[i] = color
  const next: GoBoard = { size: board.size, cells }
  const captured: number[] = []
  const opp = color === BLACK ? WHITE : BLACK
  for (const n of neighbors(next, i)) {
    if (next.cells[n] !== opp) continue
    const g = groupAndLiberties(next, n)
    if (g.liberties.size === 0) {
      for (const s of g.stones) {
        if (next.cells[s] === opp) {
          next.cells[s] = 0
          captured.push(s)
        }
      }
    }
  }
  // Suicide: own group without liberties and nothing captured.
  if (captured.length === 0 && groupAndLiberties(next, i).liberties.size === 0) return null
  return { board: next, captured }
}

/** All legal moves for color (ignores ko; the caller applies it). */
export function legalMoves(board: GoBoard, color: number): number[] {
  const out: number[] = []
  for (let i = 0; i < board.cells.length; i += 1) {
    if (board.cells[i] !== 0) continue
    const opp = color === BLACK ? WHITE : BLACK
    let suicide = true
    for (const n of neighbors(board, i)) {
      const v = board.cells[n]!
      if (v === 0) { suicide = false; break }
      if (v === color) {
        const g = groupAndLiberties(board, n)
        if (g.liberties.size > 1) { suicide = false; break }
      } else {
        const g = groupAndLiberties(board, n)
        if (g.liberties.size === 1) { suicide = false; break }
      }
    }
    if (!suicide) out.push(i)
  }
  return out
}

/** Whether playing at i is fully legal (occupancy, suicide, simple ko). */
export function isLegal(board: GoBoard, i: number, color: number, prev: GoBoard | null): boolean {
  if (i < 0 || i >= board.cells.length) return false
  if (board.cells[i] !== 0) return false
  const res = play(board, i, color)
  if (res === null) return false
  if (prev !== null && res.board.cells.every((v, k) => v === prev.cells[k]!)) return false
  return true
}

/**
 * Area (Chinese) scoring: each color scores its stones plus the empty points
 * reachable from only that color. Returns the two areas and the winner.
 */
export function areaScore(board: GoBoard, komi = KOMI): { black: number; white: number; winner: 0 | 1 | 2 } {
  const { size, cells } = board
  const territory = new Int8Array(cells.length) // 1 black-only, 2 white-only
  const seen = new Set<number>()
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] !== 0 || seen.has(i)) continue
    // Flood the empty region, tracking which colors touch it.
    const region: number[] = []
    const touches = new Set<number>()
    const stack = [i]
    seen.add(i)
    while (stack.length > 0) {
      const cur = stack.pop()!
      region.push(cur)
      for (const n of neighbors(board, cur)) {
        const v = cells[n]!
        if (v === 0) {
          if (!seen.has(n)) { seen.add(n); stack.push(n) }
        } else touches.add(v)
      }
    }
    if (touches.size === 1) {
      const owner = [...touches][0]!
      for (const p of region) territory[p] = owner
    }
  }
  let black = 0
  let white = 0
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] === BLACK) black += 1
    else if (cells[i] === WHITE) white += 1
    else if (territory[i] === BLACK) black += 1
    else if (territory[i] === WHITE) white += 1
  }
  void size
  const whiteWithKomi = white + komi
  return { black, white: whiteWithKomi, winner: black > whiteWithKomi ? BLACK : WHITE }
}

/** Per-level AI configuration (ply search depth / node budget). */
export const AI_LEVELS = [
  { label: 'L1', depth: 0 },
  { label: 'L2', depth: 1 },
  { label: 'L3', depth: 2 },
] as const
