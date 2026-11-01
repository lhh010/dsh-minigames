/**
 * 多米诺分解 (Dominosa) pure logic. The grid holds the complete domino set
 * of order n — every pair (a, b) with 0 <= a <= b <= n exactly once — laid
 * out as numbers; the player partitions the grid into adjacent pairs so
 * that every domino of the set appears exactly once.
 *
 * Generation: a random perfect matching of the grid (randomized DFS),
 * values from each matched pair; a budgeted solver counts matchings whose
 * pair multiset equals the full set up to two — a level ships only when
 * exactly one solution is proven, else the seed advances; after the
 * attempt cap the first solvable roll ships with a 多解 badge (the flow
 * pattern).
 */

/** Domino-set orders of the five levels (grid = (n+1) × (n+2)). */
export const LEVEL_ORDERS = [4, 5, 6, 7, 8] as const

/** A generated level. */
export interface DominoPuzzle {
  /** Domino-set order n: values 0..n, (n+1)(n+2)/2 dominoes. */
  order: number
  /** Grid rows (values 0..n). */
  grid: readonly (readonly number[])[]
  /** The generating matching: pairs of cell indices (r * cols + c). */
  solution: readonly (readonly [number, number])[]
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

/** Domino-set order of a 1-based level (levels wrap after the 5th). */
export function levelOrder(level: number): number {
  return LEVEL_ORDERS[(level - 1) % LEVEL_ORDERS.length]!
}

/** Win score: base 100×level plus a time bonus that decays 5/second. */
export function computeScore(level: number, seconds: number): number {
  return 100 * level + Math.max(0, 3000 - Math.floor(seconds) * 5)
}

/** True when two cell indices are horizontally or vertically adjacent. */
export function adjacent(cells: number, a: number, b: number): boolean {
  if (a === b) return false
  const dr = Math.abs(Math.floor(a / cells) - Math.floor(b / cells))
  const dc = Math.abs((a % cells) - (b % cells))
  return dr + dc === 1
}

/** The complete domino multiset of order n as sorted-pair strings. */
function fullSet(order: number): string[] {
  const out: string[] = []
  for (let a = 0; a <= order; a += 1) {
    for (let b = a; b <= order; b += 1) out.push(a + '-' + b)
  }
  return out
}

/** Domino key of two grid values (sorted). */
function key(v1: number, v2: number): string {
  return v1 <= v2 ? v1 + '-' + v2 : v2 + '-' + v1
}

/** Win: every cell in exactly one adjacent pair, and the pair multiset
 * equals the complete domino set of the level order. */
export function isWon(puzzle: DominoPuzzle, pairs: readonly (readonly [number, number])[]): boolean {
  const cells = puzzle.grid.length * (puzzle.grid[0]?.length ?? 0)
  const seen = new Set<number>()
  const counts = new Map<string, number>()
  for (const [a, b] of pairs) {
    if (!adjacent(puzzle.grid[0]!.length, a, b)) return false
    if (seen.has(a) || seen.has(b) || a === b) return false
    seen.add(a)
    seen.add(b)
    const k = key(puzzle.grid[Math.floor(a / (puzzle.grid[0]!.length))]![a % puzzle.grid[0]!.length]!, puzzle.grid[Math.floor(b / (puzzle.grid[0]!.length))]![b % puzzle.grid[0]!.length]!)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  if (seen.size !== cells) return false
  for (const k of fullSet(puzzle.order)) {
    if ((counts.get(k) ?? 0) !== 1) return false
  }
  return counts.size === fullSet(puzzle.order).length
}

/** Solver outcome: matchings found (capped at 2), budget status, nodes. */
export interface SolveResult {
  solutions: number
  /** True when the node budget ran out before the search space closed. */
  exhausted: boolean
  nodes: number
}

const STOP = -1

/**
 * Count set-exhausting matchings up to two. The first unmatched cell (row
 * major) pairs with its right/down neighbor only when that domino is still
 * unused; the search ends when every domino of the set is consumed exactly
 * as the grid fills. Returns count with budget status.
 */
export function solveCount(puzzle: DominoPuzzle, maxNodes = 150_000): SolveResult {
  const rows = puzzle.grid.length
  const cols = puzzle.grid[0]!.length
  const total = rows * cols
  const used = new Set<string>()
  const matched = new Uint8Array(total)
  const need = fullSet(puzzle.order)
  let nodes = 0
  let solutions = 0
  let exhausted = false

  const dfs = (): number => {
    if (used.size === need.length) {
      if (matched.every(v => v === 1)) solutions += 1
      return solutions >= 2 ? STOP : 0
    }
    let cell = -1
    for (let i = 0; i < total; i += 1) {
      if (matched[i] === 0) { cell = i; break }
    }
    if (cell === -1) return 0 // grid full but set incomplete: dead branch
    nodes += 1
    if (nodes > maxNodes) {
      exhausted = true
      return STOP
    }
    const r = Math.floor(cell / cols)
    const c = cell % cols
    const v1 = puzzle.grid[r]![c]!
    const partners = [c + 1 < cols ? cell + 1 : -1, r + 1 < rows ? cell + cols : -1]
    for (const p of partners) {
      if (p < 0 || matched[p] === 1) continue
      const v2 = puzzle.grid[Math.floor(p / cols)]![p % cols]!
      const k = key(v1, v2)
      if (used.has(k)) continue
      used.add(k)
      matched[cell] = 1
      matched[p] = 1
      const done = dfs()
      matched[p] = 0
      matched[cell] = 0
      used.delete(k)
      if (done !== 0) return done
    }
    return 0
  }

  const done = dfs()
  void done
  return { solutions, exhausted, nodes }
}

/** Generation attempts per puzzle: uniqueness re-rolls. */
export function attemptCap(order: number): number {
  return order <= 6 ? 30 : 15
}

/**
 * Generate a puzzle deterministically from seed. Re-rolls until the solver
 * proves exactly one set-exhausting matching; after the attempt cap the
 * first roll ships with unique: false. Returns null when no roll produced
 * a full-set tiling at all.
 */
export function puzzleFromSeed(seed: number, order: number): DominoPuzzle | null {
  let fallback: DominoPuzzle | null = null
  const attempts = attemptCap(order)
  for (let s = 0; s < attempts; s += 1) {
    const roll = tryGenerate((seed + s * 0x9e3779b9) >>> 0, order)
    if (roll === null) continue
    if (fallback === null) fallback = roll
    const { solutions, exhausted } = solveCount(roll)
    if (!exhausted && solutions === 1) return { ...roll, unique: true }
  }
  return fallback
}

/**
 * One attempt: random perfect matching of the (n+1)×(n+2) grid via
 * randomized DFS, each pair labeled with a distinct domino of the set.
 * Null only when the DFS deadlocks (practically never on even grids).
 */
function tryGenerate(seed: number, order: number): DominoPuzzle | null {
  const rng = mulberry32(seed)
  const rows = order + 1
  const cols = order + 2
  const total = rows * cols
  const matched = new Uint8Array(total)
  const pairs: [number, number][] = []
  const values = new Array<number>(total).fill(0)
  const dominoes = fullSet(order)
  for (let i = dominoes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[dominoes[i], dominoes[j]] = [dominoes[j]!, dominoes[i]!]
  }
  const dfs = (idx: number, placed: number): boolean => {
    if (placed === dominoes.length) return true
    if (idx >= total) return false
    if (matched[idx] === 1) return dfs(idx + 1, placed)
    const r = Math.floor(idx / cols)
    const c = idx % cols
    const partners = [c + 1 < cols ? idx + 1 : -1, r + 1 < rows ? idx + cols : -1]
    for (let pi = partners.length - 1; pi > 0; pi -= 1) {
      const j = Math.floor(rng() * (pi + 1))
      ;[partners[pi], partners[j]] = [partners[j]!, partners[pi]!]
    }
    for (const p of partners) {
      if (p < 0 || matched[p] === 1) continue
      const [a, b] = dominoes[placed]!.split('-').map(Number) as [number, number]
      values[idx] = a
      values[p] = b
      matched[idx] = 1
      matched[p] = 1
      pairs.push([idx, p])
      if (dfs(idx + 1, placed + 1)) return true
      pairs.pop()
      matched[p] = 0
      matched[idx] = 0
      values[p] = 0
      values[idx] = 0
    }
    return false
  }
  if (!dfs(0, 0)) return null
  const grid: number[][] = []
  for (let r = 0; r < rows; r += 1) {
    grid.push(Array.from({ length: cols }, (_, c) => values[r * cols + c]!))
  }
  return { order, grid, solution: pairs, unique: false }
}
