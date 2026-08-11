/**
 * 2048 pure logic: a 4x4 board of power-of-two tiles that slide and merge in
 * the four directions. A move is valid when any tile slides or merges; a new
 * 2/4 tile spawns after a valid move; the game is won at 2048 and lost when
 * no moves remain. Deterministic functions over a plain state object.
 */

export const SIZE = 4

export interface Tile { r: number; c: number; value: number }

export interface Game2048State {
  grid: (number | null)[][]
  score: number
  won: boolean
  over: boolean
  rng: () => number
}

export const WIN_VALUE = 2048

function emptyGrid(): (number | null)[][] {
  return Array.from({ length: SIZE }, () => Array<number | null>(SIZE).fill(null))
}

/** All empty cells. */
function emptyCells(grid: (number | null)[][]): Tile[] {
  const out: Tile[] = []
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (grid[r]![c] === null) out.push({ r, c, value: 0 })
    }
  }
  return out
}

/** Spawn a 2 (90%) or 4 (10%) on a random empty cell. */
export function spawnTile(state: Game2048State): void {
  const empty = emptyCells(state.grid)
  if (empty.length === 0) return
  const spot = empty[Math.floor(state.rng() * empty.length)]!
  state.grid[spot.r]![spot.c] = state.rng() < 0.9 ? 2 : 4
}

/** A fresh board with two starting tiles. */
export function create2048State(rng: () => number = Math.random): Game2048State {
  const state: Game2048State = { grid: emptyGrid(), score: 0, won: false, over: false, rng }
  spawnTile(state)
  spawnTile(state)
  return state
}

/**
 * Slide one row/column toward the start (compacting and merging equal
 * neighbours). Returns { moved, gained }.
 */
function slideLine(line: (number | null)[]): { moved: boolean; gained: number } {
  const kept = line.filter((v): v is number => v !== null)
  const merged: number[] = []
  let gained = 0
  for (let i = 0; i < kept.length; i += 1) {
    if (i + 1 < kept.length && kept[i] === kept[i + 1]) {
      const v = kept[i]! * 2
      merged.push(v)
      gained += v
      i += 1
    } else {
      merged.push(kept[i]!)
    }
  }
  while (merged.length < SIZE) merged.push(0)
  const moved = line.some((v, i) => (v ?? 0) !== (merged[i] ?? 0))
  for (let i = 0; i < SIZE; i += 1) line[i] = (merged[i] ?? 0) === 0 ? null : (merged[i] ?? 0)
  return { moved, gained }
}

/** Extract a row or column as a line (dir: 0 up, 1 right, 2 down, 3 left). */
function extract(grid: (number | null)[][], axis: 'row' | 'col', index: number, reverse: boolean): (number | null)[] {
  const line: (number | null)[] = []
  for (let i = 0; i < SIZE; i += 1) {
    const v = axis === 'row' ? grid[index]![i]! : grid[i]![index]!
    line.push(v)
  }
  return reverse ? line.reverse() : line
}

/** Write a line back into the grid. */
function write(grid: (number | null)[][], axis: 'row' | 'col', index: number, reverse: boolean, line: (number | null)[]): void {
  const data = reverse ? [...line].reverse() : line
  for (let i = 0; i < SIZE; i += 1) {
    if (axis === 'row') grid[index]![i] = data[i]!
    else grid[i]![index] = data[i]!
  }
}

/** Whether a direction would produce any movement. */
function couldMove(grid: (number | null)[][]): boolean {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (grid[r]![c] === null) return true
      const v = grid[r]![c]!
      if (r + 1 < SIZE && grid[r + 1]![c] === v) return true
      if (c + 1 < SIZE && grid[r]![c + 1] === v) return true
    }
  }
  return false
}

/**
 * Apply a move in one direction (0 up, 1 right, 2 down, 3 left). Valid moves
 * spawn a tile and update score/win/over.
 */
export function move2048(state: Game2048State, dir: 0 | 1 | 2 | 3): boolean {
  if (state.over) return false
  const axis: 'row' | 'col' = dir === 0 || dir === 2 ? 'col' : 'row'
  const reverse = dir === 1 || dir === 2
  let moved = false
  let gained = 0
  for (let i = 0; i < SIZE; i += 1) {
    const line = extract(state.grid, axis, i, reverse)
    const res = slideLine(line)
    if (res.moved) {
      moved = true
      gained += res.gained
      write(state.grid, axis, i, reverse, line)
    }
  }
  if (!moved) return false
  state.score += gained
  if (state.grid.flat().some(v => v !== null && v >= WIN_VALUE)) state.won = true
  spawnTile(state)
  if (!couldMove(state.grid)) state.over = true
  return true
}
