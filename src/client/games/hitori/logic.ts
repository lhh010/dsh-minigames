/**
 * 记独 (Hitori) pure logic. An n×n grid of numbers 1..n carries deliberate
 * duplicates; the player shades cells so that no number repeats in any row
 * or column among the WHITE cells, no two shaded cells touch orthogonally,
 * and the white cells stay connected.
 *
 * Generation: solution-first — start from a shuffled Latin square, pick a
 * no-touch black set (whites kept connected), then overwrite each black
 * cell with a neighboring white value so shading exactly that set solves
 * the board by construction. A budgeted DFS counts shadings up to two;
 * a level ships only when exactly one solution is proven, else the seed
 * advances — after the attempt cap the first roll ships with a 多解 badge
 * (the flow pattern).
 */

/** Board edge lengths of the five levels. */
export const LEVEL_SIZES = [5, 6, 7, 8, 8] as const

/** A generated level. */
export interface HitoriPuzzle {
  /** Board edge length in cells. */
  size: number
  /** grid[r][c] values 1..size with duplicates. */
  grid: readonly (readonly number[])[]
  /** The generating shading: true = black (shaded). */
  solution: readonly boolean[]
  /** Whether the solver proved exactly one solution. */
  unique: boolean
}

/** mulberry32 PRNG: small, fast, deterministic per seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x9e3779f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Board edge length of a 1-based level (levels wrap after the 5th). */
export function levelSize(level: number): number {
  return LEVEL_SIZES[(level - 1) % LEVEL_SIZES.length]!
}

/** Win score: base 100×level plus a time bonus that decays 5/second. */
export function computeScore(level: number, seconds: number): number {
  return 100 * level + Math.max(0, 3000 - Math.floor(seconds) * 5)
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

/**
 * Full rule check for a complete shading: no orthogonally adjacent blacks,
 * every row/column has distinct white values, and the whites are one
 * connected region.
 */
export function isWon(puzzle: HitoriPuzzle, blacks: ReadonlySet<number>): boolean {
  const size = puzzle.size
  const total = size * size
  for (let cell = 0; cell < total; cell += 1) {
    if (!blacks.has(cell)) continue
    for (const n of neighbors(size, cell)) {
      if (blacks.has(n)) return false
    }
  }
  for (let r = 0; r < size; r += 1) {
    const seen = new Set<number>()
    for (let c = 0; c < size; c += 1) {
      if (blacks.has(r * size + c)) continue
      const v = puzzle.grid[r]![c]!
      if (seen.has(v)) return false
      seen.add(v)
    }
  }
  for (let c = 0; c < size; c += 1) {
    const seen = new Set<number>()
    for (let r = 0; r < size; r += 1) {
      if (blacks.has(r * size + c)) continue
      const v = puzzle.grid[r]![c]!
      if (seen.has(v)) return false
      seen.add(v)
    }
  }
  // White connectivity.
  const whites: number[] = []
  for (let cell = 0; cell < total; cell += 1) if (!blacks.has(cell)) whites.push(cell)
  if (whites.length === 0) return false
  const start = whites[0]!
  const seen = new Set<number>([start])
  const stack = [start]
  while (stack.length > 0) {
    const cur = stack.pop()!
    for (const n of neighbors(size, cur)) {
      if (!blacks.has(n) && !seen.has(n)) {
        seen.add(n)
        stack.push(n)
      }
    }
  }
  return seen.size === whites.length
}

/** Solver outcome: shadings found (capped at 2), budget status, nodes. */
export interface SolveResult {
  solutions: number
  /** True when the node budget ran out before the search space closed. */
  exhausted: boolean
  nodes: number
}

const STOP = -1

/**
 * Count rule-satisfying shadings up to two via DFS over cells in row-major
 * order. Branch white first (most cells stay white); prune on black
 * adjacency, white duplicates within a completed row (and partial columns),
 * and white-connectivity viability (whites + undecided connected through
 * whites-or-undecided). Returns count with budget status.
 */
export function solveCount(puzzle: HitoriPuzzle, maxNodes = 200_000): SolveResult {
  const { size, grid } = puzzle
  const total = size * size
  // color: 0 undecided, 1 white, -1 black
  const color = new Int8Array(total)
  let nodes = 0
  let solutions = 0
  let exhausted = false

  const complete = (): boolean => {
    const blacks = new Set<number>()
    for (let i = 0; i < total; i += 1) if (color[i] === -1) blacks.add(i)
    return isWon({ size, grid, solution: [], unique: false }, blacks)
  }

  const pruneOk = (cell: number): boolean => {
    if (color[cell] === -1) {
      for (const n of neighbors(size, cell)) {
        if (color[n] === -1) return false
      }
    } else {
      // White: no equal white value in the same row/col so far.
      const v = grid[Math.floor(cell / size)]![cell % size]!
      const r = Math.floor(cell / size)
      const c = cell % size
      for (let c2 = 0; c2 < size; c2 += 1) {
        const other = r * size + c2
        if (other !== cell && color[other] === 1 && grid[r]![c2] === v) return false
      }
      for (let r2 = 0; r2 < size; r2 += 1) {
        const other = r2 * size + c
        if (other !== cell && color[other] === 1 && grid[r2]![c] === v) return false
      }
    }
    // Connectivity viability: whites + undecided one region through both.
    const anyCell = color.findIndex(v => v !== -1)
    if (anyCell >= 0) {
      const passable = (c: number): boolean => (color[c] ?? -1) >= 0
      const seen = new Set<number>([anyCell])
      const stack = [anyCell]
      while (stack.length > 0) {
        const cur = stack.pop()!
        for (const n of neighbors(size, cur)) {
          if (passable(n) && !seen.has(n)) {
            seen.add(n)
            stack.push(n)
          }
        }
      }
      for (let i = 0; i < total; i += 1) {
        if ((color[i] ?? -1) >= 0 && !seen.has(i)) return false
      }
    }
    return true
  }

  const dfs = (idx: number): number => {
    if (idx === total) {
      if (complete()) {
        solutions += 1
        return solutions >= 2 ? STOP : 0
      }
      return 0
    }
    nodes += 1
    if (nodes > maxNodes) {
      exhausted = true
      return STOP
    }
    for (const choice of [1, -1] as const) {
      color[idx] = choice
      if (pruneOk(idx)) {
        const done = dfs(idx + 1)
        if (done !== 0) {
          color[idx] = 0
          return done
        }
      }
      color[idx] = 0
    }
    return 0
  }

  const done = dfs(0)
  void done
  return { solutions, exhausted, nodes }
}

/** Generation attempts per puzzle. */
export function attemptCap(size: number): number {
  return size <= 6 ? 15 : 6
}

/**
 * Generate a puzzle deterministically from seed. Re-rolls until the solver
 * proves exactly one shading; after the attempt cap the first solvable
 * roll ships with unique: false. Returns null when no roll was solvable.
 */
export function puzzleFromSeed(seed: number, size: number): HitoriPuzzle | null {
  let fallback: HitoriPuzzle | null = null
  const attempts = attemptCap(size)
  for (let s = 0; s < attempts; s += 1) {
    const roll = tryGenerate((seed + s * 0x9e3779b9) >>> 0, size)
    if (roll === null) continue
    if (fallback === null) fallback = roll
    const { solutions, exhausted } = solveCount(roll, size <= 6 ? 200_000 : 80_000)
    if (!exhausted && solutions === 1) return { ...roll, unique: true }
  }
  return fallback
}

/**
 * One attempt: shuffle the cyclic Latin square (row/column/symbol
 * permutations), pick a no-touch black set with connected whites, then
 * duplicate a neighboring white value into every black cell so that
 * shading exactly the black set solves the board by construction.
 */
function tryGenerate(seed: number, size: number): HitoriPuzzle | null {
  const rng = mulberry32(seed)
  const shuffled = (arr: number[]): number[] => {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
    }
    return arr
  }
  const rowPerm = shuffled(Array.from({ length: size }, (_, i) => i))
  const colPerm = shuffled(Array.from({ length: size }, (_, i) => i))
  const symPerm = shuffled(Array.from({ length: size }, (_, i) => i + 1))
  const base: number[][] = []
  for (let r = 0; r < size; r += 1) {
    base.push(Array.from({ length: size }, (_, c) => symPerm[(rowPerm[r]! + colPerm[c]!) % size]!))
  }
  // Black set: random cells, ~25% density, no orthogonal contact.
  const black = new Set<number>()
  const total = size * size
  for (let cell = 0; cell < total; cell += 1) {
    if (rng() >= 0.25) continue
    if (neighbors(size, cell).some(n => black.has(n))) continue
    black.add(cell)
  }
  // Whites must stay one connected region.
  const whites: number[] = []
  for (let cell = 0; cell < total; cell += 1) if (!black.has(cell)) whites.push(cell)
  if (whites.length === 0) return null
  const seen = new Set<number>([whites[0]!])
  const stack = [whites[0]!]
  while (stack.length > 0) {
    const cur = stack.pop()!
    for (const n of neighbors(size, cur)) {
      if (!black.has(n) && !seen.has(n)) {
        seen.add(n)
        stack.push(n)
      }
    }
  }
  if (seen.size !== whites.length) return null
  // Duplicate into each black cell the value of an adjacent white cell.
  const grid = base.map(row => [...row])
  for (const cell of black) {
    const opts = neighbors(size, cell).filter(n => !black.has(n))
    if (opts.length === 0) return null
    const src = opts[Math.floor(rng() * opts.length)]!
    grid[Math.floor(cell / size)]![cell % size] = base[Math.floor(src / size)]![src % size]!
  }
  const solution: boolean[] = []
  for (let i = 0; i < total; i += 1) solution.push(black.has(i))
  return { size, grid, solution, unique: false }
}
