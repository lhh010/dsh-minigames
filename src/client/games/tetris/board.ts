/**
 * Tetris pure logic: board, pieces, rotation with simple wall kicks, locking,
 * line clearing, scoring, and hold. Deterministic functions over a plain
 * state object — the game instance in index.ts drives this with a gravity
 * timer, and the unit tests drive it directly.
 */

export const COLS = 10
export const ROWS = 20

/** A tetromino shape matrix (rows of 0/1); 3x3 except I (4x4). */
export type Shape = number[][]

export interface Piece {
  /** Kind id 1..7 (also the cell/color id). */
  kind: number
  shape: Shape
  /** Top-left of the shape matrix in grid coordinates. */
  x: number
  y: number
}

export interface TetrisState {
  /** ROWS x COLS; 0 empty, 1..7 filled with that kind's color. */
  grid: number[][]
  current: Piece | null
  next: Piece | null
  /** Held piece (or null when the hold slot is empty). */
  hold: Piece | null
  /** One hold per piece: reset when the current piece locks. */
  canHold: boolean
  score: number
  lines: number
  level: number
  over: boolean
  rng: () => number
}

const SHAPES: Record<number, Shape> = {
  1: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], // I
  2: [[1, 1], [1, 1]], // O
  // The rest are SQUARE bounding boxes (3x3) — rotation is a square-matrix
  // turn; a 2x3 matrix would silently drop its third column when rotated.
  3: [[0, 1, 0], [1, 1, 1], [0, 0, 0]], // T
  4: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], // S
  5: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], // Z
  6: [[1, 0, 0], [1, 1, 1], [0, 0, 0]], // J
  7: [[0, 0, 1], [1, 1, 1], [0, 0, 0]], // L
}

/** Line-clear score table indexed by cleared rows in one lock. */
const LINE_SCORES = [0, 100, 300, 500, 800]

/** Empty grid, fresh state, and the first two pieces spawned. */
export function createTetrisState(rng: () => number = Math.random): TetrisState {
  const grid: number[][] = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0))
  const state: TetrisState = {
    grid,
    current: null,
    next: null,
    hold: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: 1,
    over: false,
    rng,
  }
  state.next = randomPiece(rng)
  spawn(state)
  return state
}

function randomKind(rng: () => number): number {
  return 1 + Math.floor(rng() * 7)
}

function randomPiece(rng: () => number): Piece {
  const kind = randomKind(rng)
  const shape = SHAPES[kind]!
  return { kind, shape, x: 0, y: 0 }
}

/** Center the piece horizontally at the top. */
function center(piece: Piece): void {
  piece.x = Math.floor((COLS - piece.shape[0]!.length) / 2)
  piece.y = 0
}

/** Whether the piece overlaps the walls, the floor, or filled cells. */
export function collides(grid: number[][], piece: Piece): boolean {
  for (let r = 0; r < piece.shape.length; r += 1) {
    for (let c = 0; c < piece.shape[r]!.length; c += 1) {
      if (piece.shape[r]![c] === 0) continue
      const gy = piece.y + r
      const gx = piece.x + c
      if (gx < 0 || gx >= COLS || gy >= ROWS) return true
      if (gy >= 0 && grid[gy]![gx] !== 0) return true
    }
  }
  return false
}

/** Promote the next piece to current (used at start and after each lock). */
export function spawn(state: TetrisState): void {
  state.current = state.next
  center(state.current!)
  state.canHold = true
  state.next = randomPiece(state.rng)
  if (collides(state.grid, state.current!)) state.over = true
}

/** Try to move the current piece; gravity (dy=1) that fails locks instead. */
export function move(state: TetrisState, dx: number, dy: number): boolean {
  const piece = state.current
  if (piece === null || state.over) return false
  const next: Piece = { ...piece, shape: piece.shape, x: piece.x + dx, y: piece.y + dy }
  if (!collides(state.grid, next)) {
    piece.x = next.x
    piece.y = next.y
    return true
  }
  if (dy === 1) {
    lock(state)
    return false
  }
  return false
}

/** Rotate the current piece CW (dir 1) or CCW (dir -1) with simple wall kicks. */
export function rotate(state: TetrisState, dir: 1 | -1): boolean {
  const piece = state.current
  if (piece === null || state.over || piece.kind === 2) return false // O never rotates
  const shape = piece.shape
  const n = shape.length
  const rotated: Shape = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => (dir === 1 ? shape[n - 1 - c]![r]! : shape[c]![n - 1 - r]!)))
  for (const kick of [0, -1, 1, -2, 2]) {
    const candidate: Piece = { ...piece, shape: rotated, x: piece.x + kick, y: piece.y }
    if (!collides(state.grid, candidate)) {
      piece.shape = rotated
      piece.x = candidate.x
      return true
    }
  }
  return false
}

/** Drop the current piece to the floor. Returns the cells dropped. */
export function hardDrop(state: TetrisState): number {
  const piece = state.current
  if (piece === null || state.over) return 0
  let dropped = 0
  // move() locks on its own when gravity fails (dy === 1) — never lock again
  // here or the freshly spawned piece gets merged at the top instantly.
  while (move(state, 0, 1)) dropped += 1
  return dropped
}

/** Merge the current piece into the grid, clear lines, score, and spawn next. */
function lock(state: TetrisState): void {
  const piece = state.current
  if (piece === null || state.over) return
  for (let r = 0; r < piece.shape.length; r += 1) {
    for (let c = 0; c < piece.shape[r]!.length; c += 1) {
      if (piece.shape[r]![c] === 0) continue
      const gy = piece.y + r
      const gx = piece.x + c
      if (gy >= 0) state.grid[gy]![gx] = piece.kind
    }
  }
  const cleared = clearFullRows(state.grid)
  if (cleared > 0) {
    state.lines += cleared
    state.score += LINE_SCORES[cleared]! * state.level
    state.level = Math.floor(state.lines / 10) + 1
  }
  spawn(state)
}

/** Remove full rows (returning how many) and compact the grid above. */
export function clearFullRows(grid: number[][]): number {
  const kept = grid.filter(row => row.some(cell => cell === 0))
  const cleared = ROWS - kept.length
  if (cleared > 0) {
    const empty = Array.from({ length: cleared }, () => Array<number>(COLS).fill(0))
    grid.splice(0, grid.length, ...empty, ...kept)
  }
  return cleared
}

/** Swap the current piece with the hold slot (once per piece). */
export function holdPiece(state: TetrisState): void {
  if (state.current === null || state.over || !state.canHold) return
  const held = state.hold
  state.hold = state.current
  state.canHold = false
  if (held === null) {
    state.next = randomPiece(state.rng)
    spawn(state)
    // spawn() resets the hold allowance; the swap above already consumed it.
    state.canHold = false
  } else {
    state.current = held
    center(state.current)
    if (collides(state.grid, state.current)) state.over = true
  }
}

/** Gravity interval in ms for a level (levels speed up, floor at 120ms). */
export function gravityInterval(level: number): number {
  return Math.max(120, 800 - (level - 1) * 80)
}

/** Ghost drop y: where the current piece would land. */
export function ghostY(state: TetrisState): number {
  const piece = state.current
  if (piece === null) return 0
  let y = piece.y
  while (!collides(state.grid, { ...piece, y: y + 1 })) y += 1
  return y
}
