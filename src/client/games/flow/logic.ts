/**
 * 管道连线 (Flow Free) pure logic. An n×n grid holds K color pairs; the
 * player draws a simple path between each pair so that the K paths partition
 * the grid — every cell filled, no cell shared (the classic Flow Free rule).
 *
 * Generation: K random seed cells grow simultaneously into self-avoiding
 * walks (most-constrained head first) until the walks partition the grid;
 * each walk's two ends become that color's dots, so a solution always
 * exists. Every roll is verified by a node-budgeted DFS solver that counts
 * solutions up to two (endpoint-reachability, free-cell coverage, and
 * dead-cell pruning); a level ships only when exactly one solution is
 * proven, otherwise the seed advances — after the attempt cap the first
 * solvable roll ships with a 多解 badge (mirroring the slitherlink approach).
 */

/** Board edge lengths of the five levels. */
export const LEVEL_SIZES = [5, 6, 7, 8, 9] as const
/** Color-pair count of the five levels (index-aligned with LEVEL_SIZES). */
export const LEVEL_PAIRS = [4, 5, 6, 7, 8] as const

/** A generated level: dots to connect plus one valid solution. */
export interface FlowPuzzle {
  /** Board edge length in cells. */
  size: number
  /** Per color: the two dot cells (the solution path's first/last cells). */
  dots: [number, number][]
  /** Per color: the generating path — cells in order, ends are the dots. */
  solution: number[][]
  /** Whether the solver proved exactly one solution. */
  unique: boolean
}

/** Per-color player paths: ordered cell lists (first cell is a dot), or null. */
export type CellPaths = (readonly number[] | null)[]

/** mulberry32 PRNG: small, fast, deterministic per seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Orthogonal neighbors of a cell (grid edges only). */
export function neighbors(size: number, cell: number): number[] {
  const r = Math.floor(cell / size)
  const c = cell % size
  const out: number[] = []
  if (r > 0) out.push(cell - size)
  if (r < size - 1) out.push(cell + size)
  if (c > 0) out.push(cell - 1)
  if (c < size - 1) out.push(cell + 1)
  return out
}

/** True when two distinct cells share a grid edge. */
export function adjacent(size: number, a: number, b: number): boolean {
  if (a === b || a < 0 || b < 0 || a >= size * size || b >= size * size) return false
  const dr = Math.abs(Math.floor(a / size) - Math.floor(b / size))
  const dc = Math.abs((a % size) - (b % size))
  return dr + dc === 1
}

/** Board edge length of a 1-based level (levels wrap after 9×9). */
export function levelSize(level: number): number {
  return LEVEL_SIZES[(level - 1) % LEVEL_SIZES.length]!
}

/** Color-pair count of a 1-based level. */
export function levelPairs(level: number): number {
  return LEVEL_PAIRS[(level - 1) % LEVEL_PAIRS.length]!
}

/** Win score: base 100×level plus a time bonus that decays 10/second. */
export function computeScore(level: number, seconds: number): number {
  return 100 * level + Math.max(0, 3000 - Math.floor(seconds) * 10)
}

/**
 * First free cell that can no longer lie on any path, or -1.
 *
 * A free interior cell needs ≥2 neighbors that are free or the active head
 * (the one cell the current path can still extend from); `head` = -1 when no
 * path is mid-extension. Unfinished endpoints (`endpoints`, free dot cells)
 * need only ≥1 — they terminate their path. Sound necessary condition used
 * by the solver's dead-end pruning; a pure helper for tests.
 */
export function findDeadCell(
  size: number,
  occ: readonly number[],
  head = -1,
  endpoints: readonly number[] = [],
): number {
  const total = size * size
  const isEndpoint = new Set(endpoints)
  for (let cell = 0; cell < total; cell += 1) {
    if (occ[cell] !== -1) continue
    let count = 0
    for (const n of neighbors(size, cell)) {
      if (occ[n] === -1 || n === head) count += 1
    }
    const need = isEndpoint.has(cell) ? 1 : 2
    if (count < need) return cell
  }
  return -1
}

/**
 * Begin (or re-grab) a color's path at a dot cell.
 *
 * If the color already has a path ending at `cell`, it is returned unchanged
 * or reversed so `cell` becomes the head (extendable end); otherwise a fresh
 * one-cell path starts there — dropping any previous path for the color.
 * Non-dot cells and foreign dots are rejected (state returned unchanged).
 */
export function grabPath(puzzle: FlowPuzzle, paths: CellPaths, color: number, cell: number): CellPaths {
  const [a, b] = puzzle.dots[color]!
  const path = paths[color] ?? null
  if (cell !== a && cell !== b) return paths
  if (path !== null && path.length > 0) {
    if (path[path.length - 1] === cell) return paths
    if (path[0] === cell) {
      const next = paths.slice()
      next[color] = [...path].reverse()
      return next
    }
  }
  const next = paths.slice()
  next[color] = [cell]
  return next
}

/**
 * Extend (or truncate) a color's path to an adjacent cell.
 *
 * Rules: a cell already on the own path truncates it at that cell; another
 * path's cell or another color's dot is rejected; otherwise the cell joins
 * at the head or the tail (whichever is adjacent). Non-adjacent cells and
 * colors without a path leave the state unchanged.
 */
export function extendPath(puzzle: FlowPuzzle, paths: CellPaths, color: number, cell: number): CellPaths {
  const path = paths[color] ?? null
  if (path === null || path.length === 0) return paths
  const size = puzzle.size
  const hit = path.indexOf(cell)
  if (hit >= 0) {
    if (hit === path.length - 1) return paths
    const next = paths.slice()
    next[color] = path.slice(0, hit + 1)
    return next
  }
  for (let c2 = 0; c2 < puzzle.dots.length; c2 += 1) {
    if (c2 === color) continue
    if (puzzle.dots[c2]!.includes(cell)) return paths
    const other = paths[c2] ?? null
    if (other !== null && other.includes(cell)) return paths
  }
  const head = path[path.length - 1]!
  const tail = path[0]!
  const next = paths.slice()
  if (adjacent(size, head, cell)) {
    next[color] = [...path, cell]
  } else if (adjacent(size, tail, cell)) {
    next[color] = [cell, ...path]
  } else {
    return paths
  }
  return next
}

/** A color is connected when its path runs dot-to-dot (both ends are dots). */
export function pathComplete(puzzle: FlowPuzzle, color: number, path: readonly number[] | null): boolean {
  if (path === null || path.length < 2) return false
  const [a, b] = puzzle.dots[color]!
  const first = path[0]!
  const last = path[path.length - 1]!
  return (first === a && last === b) || (first === b && last === a)
}

/** Win: every pair connected dot-to-dot and every cell covered exactly once. */
export function isWon(puzzle: FlowPuzzle, paths: CellPaths): boolean {
  const seen = new Set<number>()
  for (let c = 0; c < puzzle.dots.length; c += 1) {
    const path = paths[c] ?? null
    if (path === null || !pathComplete(puzzle, c, path)) return false
    for (const cell of path) {
      if (seen.has(cell)) return false
      seen.add(cell)
    }
  }
  return seen.size === puzzle.size * puzzle.size
}

/** Count of colors whose path currently runs dot-to-dot. */
export function connectedCount(puzzle: FlowPuzzle, paths: CellPaths): number {
  let n = 0
  for (let c = 0; c < puzzle.dots.length; c += 1) {
    if (pathComplete(puzzle, c, paths[c] ?? null)) n += 1
  }
  return n
}

/** Solver outcome: solution count capped at 2, plus budget status. */
export interface SolveResult {
  solutions: number
  /** True when the node budget ran out before the search space closed. */
  exhausted: boolean
  /** Nodes visited (0 on early stop at two solutions). */
  nodes: number
}

/** Sentinel: stop the DFS (two solutions found or budget exhausted). */
const STOP = -1

/**
 * Count solutions up to two via DFS with pruning.
 *
 * Colors route in fixed order; each branch grows a simple path from the
 * color's first dot to its partner over free cells. After every placement a
 * sound prune runs: one flood from the growing head plus every future dot
 * must reach the partner and cover all free cells, and no free cell may be
 * a dead end ({@link findDeadCell}). The generated solution always sits in
 * the search space, so a full search reports solutions ≥ 1.
 */
export function solveCount(puzzle: FlowPuzzle, maxNodes = 60_000): SolveResult {
  const { size, dots } = puzzle
  const total = size * size
  const colors = dots.length
  const occ = new Array<number>(total).fill(-1)
  // Cell → owning color for every dot; paths may never pass through a
  // foreign dot (the game rejects those cells, so the solver must too).
  const dotColor = new Int8Array(total).fill(-1)
  for (let c = 0; c < colors; c += 1) {
    dotColor[dots[c]![0]!] = c
    dotColor[dots[c]![1]!] = c
  }
  let nodes = 0
  let solutions = 0
  let exhausted = false

  /** Flood free cells from `seeds` (seed cells themselves may be occupied). */
  const flood = (seeds: number[]): Uint8Array => {
    const visited = new Uint8Array(total)
    const stack: number[] = []
    for (const s of seeds) {
      if (occ[s] === -1 && !visited[s]) { visited[s] = 1; stack.push(s) }
      else if (occ[s] !== -1) stack.push(s) // e.g. the head: passable origin
    }
    while (stack.length > 0) {
      const cur = stack.pop()!
      for (const n of neighbors(size, cur)) {
        if (occ[n] === -1 && !visited[n]) { visited[n] = 1; stack.push(n) }
      }
    }
    return visited
  }

  /**
   * Sound necessary-condition check after the latest placement, while color
   * `color` grows from `head` (head is dots[color][0] at path start, a
   * non-dot interior cell afterwards — the partner is always dots[color][1]):
   * future dots free, partner reachable, all free cells covered from
   * {head ∪ future dots}, and no dead free cell.
   */
  const prune = (color: number, head: number): boolean => {
    const partner = dots[color]![1]!
    if (occ[partner] !== -1) return true
    const seeds = [head, partner]
    const endpoints = [partner]
    for (let c = color + 1; c < colors; c += 1) {
      const [da, db] = dots[c]!
      if (occ[da] !== -1 || occ[db] !== -1) return true
      seeds.push(da, db)
      endpoints.push(da, db)
    }
    const visited = flood(seeds)
    for (let i = 0; i < total; i += 1) {
      if (occ[i] === -1 && !visited[i]) return true
    }
    return findDeadCell(size, occ, head, endpoints) !== -1
  }

  const dfsColor = (color: number): number => {
    if (color === colors) {
      if (occ.every(v => v !== -1)) solutions += 1
      return solutions >= 2 ? STOP : 0
    }
    const [start, partner] = dots[color]!
    if (occ[start] !== -1 || occ[partner] !== -1) return 0
    const path: number[] = [start]
    occ[start] = color
    let done = 0
    if (!prune(color, start)) done = dfsExtend(color, partner, start, path)
    occ[start] = -1
    return done
  }

  const dfsExtend = (color: number, partner: number, head: number, path: number[]): number => {
    nodes += 1
    if (nodes > maxNodes) {
      exhausted = true
      return STOP
    }
    for (const n of neighbors(size, head)) {
      if (n === partner) {
        path.push(n)
        occ[n] = color
        const done = dfsColor(color + 1)
        occ[n] = -1
        path.pop()
        if (done !== 0) return done
        continue
      }
      if (occ[n] !== -1) continue
      if (dotColor[n] !== -1 && dotColor[n] !== color) continue // foreign dot
      occ[n] = color
      path.push(n)
      const done = prune(color, n) ? 0 : dfsExtend(color, partner, n, path)
      path.pop()
      occ[n] = -1
      if (done !== 0) return done
    }
    return 0
  }

  const done = dfsColor(0)
  void done
  return { solutions, exhausted, nodes }
}

/** Generation attempts per puzzle: uniqueness re-rolls, larger boards fewer. */
export function attemptCap(size: number): number {
  return size <= 6 ? 40 : size <= 8 ? 25 : 12
}

/** Solver node budget per board size: decisions on 8×8 need ~1M nodes. */
export function solveBudget(size: number): number {
  return size <= 5 ? 60_000 : size === 6 ? 150_000 : size === 7 ? 400_000 : size === 8 ? 800_000 : 700_000
}

/**
 * Generation budget per board size, in TOTAL solver nodes across all re-roll
 * attempts (a deterministic proxy for wall-clock: proofs cost seconds each on
 * big boards, so the loop is budget-boxed rather than count-boxed — same seed
 * always replays the same rolls in the same order).
 */
export function genNodeBudget(size: number): number {
  return size <= 7 ? 400_000 : 600_000
}

/**
 * Generate a puzzle deterministically from `seed`.
 *
 * Re-rolls derived seeds until the solver proves exactly one solution
 * (unique: true); the loop stops at the attempt cap OR the cumulative node
 * budget, whichever first — on big boards proofs cost ~1M nodes each, so the
 * budget bounds the hang. After that the first solvable roll ships with
 * unique: false (the 多解 badge). Fully deterministic: no wall-clock input.
 */
export function puzzleFromSeed(seed: number, size: number, pairs: number, requireUnique = true): FlowPuzzle {
  const attempts = requireUnique ? attemptCap(size) : 1
  const budget = genNodeBudget(size)
  let spent = 0
  let fallback: FlowPuzzle | null = null
  for (let s = 0; s < attempts; s += 1) {
    const roll = tryGenerate((seed + s * 0x9e3779b9) >>> 0, size, pairs)
    if (roll === null) continue
    if (fallback === null) fallback = roll
    const { solutions, exhausted, nodes } = solveCount(roll, solveBudget(size))
    spent += nodes
    if (!exhausted && solutions === 1) return { ...roll, unique: true }
    if (spent >= budget) break
  }
  if (fallback !== null) return fallback
  // Guaranteed partition: vertical stripes, each snaked top-to-bottom. Always
  // full-cover, always solvable — the walk generator deadlocks occasionally
  // on large boards (9×9 with 8 pairs) and must never ship an empty board.
  return stripePuzzle(size, pairs)
}

/** Deterministic fallback: K vertical stripes, each one snaked path. */
function stripePuzzle(size: number, pairs: number): FlowPuzzle {
  const stripeW = Math.max(1, Math.floor(size / pairs))
  const paths: number[][] = []
  let col = 0
  for (let p = 0; p < pairs; p += 1) {
    const last = p === pairs - 1 ? size - 1 : Math.min(size - 1, col + stripeW - 1)
    const path: number[] = []
    for (let c = col; c <= last; c += 1) {
      if ((c - col) % 2 === 0) for (let r = 0; r < size; r += 1) path.push(r * size + c)
      else for (let r = size - 1; r >= 0; r -= 1) path.push(r * size + c)
    }
    if (path.length >= 2) paths.push(path)
    col = last + 1
    if (col >= size) break
  }
  // Safety: if the stripe math left cells uncovered (size not divisible),
  // extend the last stripe to the grid edge — recompute it wholesale.
  const covered = new Set(paths.flat())
  if (covered.size !== size * size) {
    const coveredCols = new Set<number>()
    for (let i = 0; i < size * size; i += 1) if (!covered.has(i)) coveredCols.add(i % size)
    // Append leftover columns to the final path as a continuation snake.
    const lastPath = paths[paths.length - 1]!
    const cols = [...coveredCols].sort((a, b) => a - b)
    for (const c of cols) {
      const prev = lastPath[lastPath.length - 1]!
      const prevRow = Math.floor(prev / size)
      if (prevRow === 0) for (let r = 0; r < size; r += 1) lastPath.push(r * size + c)
      else for (let r = size - 1; r >= 0; r -= 1) lastPath.push(r * size + c)
    }
  }
  const dots = paths.map(p => [p[0]!, p[p.length - 1]!] as [number, number])
  return { size, dots, solution: paths, unique: false }
}

/**
 * One generation attempt: grow K self-avoiding walks from spread seed cells
 * until they partition the grid, most-constrained head first. Null when a
 * round deadlocks (cells remain but no head can move) or seeds won't spread.
 */
function tryGenerate(seed: number, size: number, pairs: number): FlowPuzzle | null {
  const rng = mulberry32(seed)
  const total = size * size
  for (let round = 0; round < 60; round += 1) {
    const cells: number[] = []
    for (let i = 0; i < total; i += 1) cells.push(i)
    for (let i = cells.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      ;[cells[i], cells[j]] = [cells[j]!, cells[i]!]
    }
    // Spread seeds: min Chebyshev distance 2 so pairs start apart.
    const starts: number[] = []
    for (const c of cells) {
      const far = starts.every(s => {
        const dr = Math.abs(Math.floor(s / size) - Math.floor(c / size))
        const dc = Math.abs((s % size) - (c % size))
        return Math.max(dr, dc) >= 2
      })
      if (far) starts.push(c)
      if (starts.length === pairs) break
    }
    if (starts.length < pairs) continue
    const occupied = new Array<number>(total).fill(-1)
    const paths: number[][] = starts.map(s => [s])
    starts.forEach((s, p) => { occupied[s] = p })
    let free = total - pairs
    let deadlocked = false
    while (free > 0) {
      // Extend the most-constrained head (fewest free neighbors, random
      // jitter tiebreak) so tight pockets get filled instead of stranded.
      let best = -1
      let bestOpts: number[] = []
      let bestScore = Infinity
      for (let p = 0; p < paths.length; p += 1) {
        const head = paths[p]![paths[p]!.length - 1]!
        const opts = neighbors(size, head).filter(n => occupied[n] === -1)
        if (opts.length === 0) continue
        const score = opts.length + rng() * 0.5
        if (score < bestScore) { bestScore = score; best = p; bestOpts = opts }
      }
      if (best === -1) { deadlocked = true; break }
      const next = bestOpts[Math.floor(rng() * bestOpts.length)]!
      paths[best]!.push(next)
      occupied[next] = best
      free -= 1
    }
    if (deadlocked || free > 0) continue
    if (paths.some(p => p.length < 2)) continue
    const dots = paths.map(p => [p[0]!, p[p.length - 1]!] as [number, number])
    return { size, dots, solution: paths, unique: false }
  }
  return null
}
