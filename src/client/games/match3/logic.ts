/**
 * Match-3 (消消乐) pure logic — click-to-remove mode: each gem kind is a
 * distinct color; clicking a cell removes its 4-connected same-color group.
 * Bigger groups score super-linearly (quadratic), remaining gems fall to the
 * bottom (no refill within a level), and reaching the level target wins —
 * winning raises the target for the next level. Deterministic functions over
 * a plain state object; the game instance in index.ts drives the clear/fall
 * animation and the unit tests drive the logic directly.
 */

export interface Position { r: number; c: number }

export interface Match3State {
  rows: number
  cols: number
  /** Number of gem kinds (1..kinds), each its own color. */
  kinds: number
  /** rows x cols; 0 = empty, 1..kinds = a gem kind. */
  grid: number[][]
  /** Current level score (resets each level). */
  score: number
  /** Total score this level must reach to win. */
  target: number
  level: number
  result: 'none' | 'win' | 'lose'
  rng: () => number
}

export const DEFAULT_ROWS = 8
export const DEFAULT_COLS = 8
export const DEFAULT_KINDS = 5

/** Score for removing a 4-connected group of `size` — super-linear (quadratic),
 * so one big pop vastly outweighs many small ones. */
export function scoreForGroup(size: number): number {
  return 10 * size * size
}

/** The target score a level requires; doubles each level. A greedy solver
 * clears ~1700 points on a typical board, so level 1-2 are reachable and the
 * later levels become the natural end of the run. */
export function levelTarget(level: number): number {
  return 800 * 2 ** (level - 1)
}

function randomKind(state: Match3State): number {
  return 1 + Math.floor(state.rng() * state.kinds)
}

/** Fill the board with random gems (groups are fine — they are what you click). */
export function shuffle(state: Match3State): void {
  const { rows, cols } = state
  state.grid = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => randomKind(state)))
}

/** A fresh, playable level-1 board. */
export function createMatch3State(
  rng: () => number = Math.random,
  rows = DEFAULT_ROWS,
  cols = DEFAULT_COLS,
  kinds = DEFAULT_KINDS,
): Match3State {
  const state: Match3State = {
    rows, cols, kinds, grid: [],
    score: 0, target: levelTarget(1), level: 1, result: 'none', rng,
  }
  shuffle(state)
  return state
}

/** The 4-connected same-color group containing `pos` (empty when the cell is empty). */
export function groupAt(grid: number[][], pos: Position): Position[] {
  const rows = grid.length
  const cols = grid[0]!.length
  const kind = grid[pos.r]![pos.c]!
  if (kind === 0) return []
  const seen = new Set<string>([`${pos.r},${pos.c}`])
  const queue: Position[] = [{ r: pos.r, c: pos.c }]
  const out: Position[] = []
  while (queue.length > 0) {
    const p = queue.shift()!
    out.push(p)
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const nr = p.r + dr
      const nc = p.c + dc
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
      const key = `${nr},${nc}`
      if (seen.has(key)) continue
      if (grid[nr]![nc] === kind) {
        seen.add(key)
        queue.push({ r: nr, c: nc })
      }
    }
  }
  return out
}

/** Size of the largest 4-connected group on the board (0 when empty). */
export function largestGroupSize(grid: number[][]): number {
  const rows = grid.length
  const cols = grid[0]!.length
  const visited = new Set<string>()
  let max = 0
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const key = `${r},${c}`
      if (visited.has(key) || grid[r]![c] === 0) continue
      const group = groupAt(grid, { r, c })
      for (const p of group) visited.add(`${p.r},${p.c}`)
      if (group.length > max) max = group.length
    }
  }
  return max
}

/** Whether any group of size >= 2 remains (the board still has moves). */
export function hasRemovableGroup(grid: number[][]): boolean {
  return largestGroupSize(grid) >= 2
}

/** Plan a removal for animation: the cells to flash and the cells that fall. */
export interface RemovalPlan {
  removed: Position[]
  /** Kept cells moving straight down (from = old position, to = new). */
  falls: { from: Position; to: Position }[]
}

/** Compute the fall mapping a removal will cause (matches {@link applyRemoval}). */
export function planRemoval(grid: number[][], positions: Position[]): RemovalPlan {
  const rows = grid.length
  const removedSet = new Set(positions.map(p => `${p.r},${p.c}`))
  const removedByCol = new Map<number, number[]>()
  for (const p of positions) {
    const list = removedByCol.get(p.c) ?? []
    list.push(p.r)
    removedByCol.set(p.c, list)
  }
  const falls: { from: Position; to: Position }[] = []
  for (let c = 0; c < grid[0]!.length; c += 1) {
    const removedRows = (removedByCol.get(c) ?? []).sort((a, b) => a - b)
    for (let r = 0; r < rows; r += 1) {
      if (removedSet.has(`${r},${c}`)) continue
      const drop = removedRows.filter(rr => rr > r).length
      if (drop > 0) falls.push({ from: { r, c }, to: { r: r + drop, c } })
    }
  }
  return { removed: positions, falls }
}

/** Commit a removal: zero the cells and drop everything above them. */
export function applyRemoval(grid: number[][], positions: Position[]): void {
  for (const p of positions) grid[p.r]![p.c] = 0
  const rows = grid.length
  const cols = grid[0]!.length
  for (let c = 0; c < cols; c += 1) {
    let write = rows - 1
    for (let r = rows - 1; r >= 0; r -= 1) {
      if (grid[r]![c] !== 0) {
        grid[write]![c] = grid[r]![c]!
        if (write !== r) grid[r]![c] = 0
        write -= 1
      }
    }
  }
}

/** Remove the group at `pos`, score it, and let the rest fall. Returns the group. */
export function removeGroup(state: Match3State, pos: Position): Position[] {
  const group = groupAt(state.grid, pos)
  if (group.length === 0) return []
  state.score += scoreForGroup(group.length)
  applyRemoval(state.grid, group)
  return group
}

/** Re-evaluate win/lose after a removal (no-op once a result is set). */
export function updateResult(state: Match3State): void {
  if (state.result !== 'none') return
  if (state.score >= state.target) {
    state.result = 'win'
  } else if (!hasRemovableGroup(state.grid)) {
    state.result = 'lose'
  }
}

/** Start the next level: fresh board, reset score, doubled target. */
export function advanceLevel(state: Match3State): void {
  state.level += 1
  state.target = levelTarget(state.level)
  state.score = 0
  state.result = 'none'
  shuffle(state)
}

/** Restart the whole run from level 1. */
export function restart(state: Match3State): void {
  state.level = 1
  state.target = levelTarget(1)
  state.score = 0
  state.result = 'none'
  shuffle(state)
}
