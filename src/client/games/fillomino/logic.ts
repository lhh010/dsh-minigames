/**
 * 装填方块 (Fillomino) pure logic. The grid is partitioned into connected
 * regions (polyominoes); one clue cell per region carries the region size.
 * The player fills every cell with a number so that each maximal connected
 * same-number group has exactly that many cells (clues are locked).
 *
 * Generation: regions grow simultaneously from seeded anchors (most
 * constrained head first, like flow) until the grid is covered; each region
 * plants its size at a random member cell. Solvable by construction; a
 * budgeted solver counts completions only on the smallest boards — levels
 * beyond that ship with a 多解 badge (the flow pattern).
 */

/** Board edge lengths of the five levels. */
export const LEVEL_SIZES = [6, 7, 8, 9, 10] as const

/** A generated level. */
export interface FilloPuzzle {
  /** Board edge length in cells. */
  size: number
  /** Clue cells: cell index → region size (locked values). */
  clues: ReadonlyMap<number, number>
  /** The generating fill: per-cell region size (the solution). */
  solution: readonly number[]
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
 * Win: every cell filled 1..maxRegion, every clue matches its cell value,
 * and every maximal connected same-value group's size equals its value.
 */
export function isWon(puzzle: FilloPuzzle, grid: readonly number[]): boolean {
  const size = puzzle.size
  const total = size * size
  const maxRegion = Math.max(...puzzle.clues.values(), 1)
  const visited = new Uint8Array(total)
  for (let cell = 0; cell < total; cell += 1) {
    const v = grid[cell] ?? 0
    if (v < 1 || v > total) return false
    const clue = puzzle.clues.get(cell)
    if (clue !== undefined && clue !== v) return false
    if (visited[cell] === 1) continue
    // Flood this same-value group and check its size.
    let count = 0
    const stack = [cell]
    visited[cell] = 1
    while (stack.length > 0) {
      const cur = stack.pop()!
      count += 1
      for (const n of neighbors(size, cur)) {
        if (visited[n] === 0 && grid[n] === v) {
          visited[n] = 1
          stack.push(n)
        }
      }
    }
    if (count !== v) return false
    if (v > maxRegion + 1) return false
  }
  return true
}

/** Solver outcome: fills found (capped at 2), budget status, nodes. */
export interface SolveResult {
  solutions: number
  /** True when the node budget ran out before the search space closed. */
  exhausted: boolean
  nodes: number
}

const STOP = -1

/**
 * Count rule-satisfying fills up to two via DFS over undecided cells.
 * Values range 1..maxRegion (bigger groups never pay); the group-size rule
 * is checked incrementally: a growing group may not exceed its value, and a
 * closed group must equal it. Only run on the smallest boards — larger
 * boards ship without a uniqueness proof.
 */
export function solveCount(puzzle: FilloPuzzle, maxNodes = 150_000): SolveResult {
  const size = puzzle.size
  const total = size * size
  const maxRegion = Math.max(...puzzle.clues.values(), 1)
  const grid = new Int32Array(total)
  for (const [cell, v] of puzzle.clues) grid[cell] = v
  let nodes = 0
  let solutions = 0
  let exhausted = false

  /** Group through cell's value: [size, closed]. */
  const groupOf = (cell: number): { size: number; closed: boolean } => {
    const v = grid[cell]!
    const seen = new Set<number>([cell])
    const stack = [cell]
    let closed = true
    while (stack.length > 0) {
      const cur = stack.pop()!
      for (const n of neighbors(size, cur)) {
        if (grid[n] === v) {
          if (!seen.has(n)) {
            seen.add(n)
            stack.push(n)
          }
        } else if (grid[n] === 0) closed = false
      }
    }
    return { size: seen.size, closed }
  }

  const consistent = (): boolean => {
    const checked = new Uint8Array(total)
    for (let cell = 0; cell < total; cell += 1) {
      if (grid[cell] === 0 || checked[cell] === 1) continue
      const v = grid[cell]!
      const seen = new Set<number>([cell])
      const stack = [cell]
      let closed = true
      while (stack.length > 0) {
        const cur = stack.pop()!
        checked[cur] = 1
        for (const n of neighbors(size, cur)) {
          if (grid[n] === v) {
            if (!seen.has(n)) { seen.add(n); stack.push(n) }
          } else if (grid[n] === 0) closed = false
        }
      }
      if (seen.size > v) return false
      if (closed && seen.size !== v) return false
      // Two touching same-value groups must be one group (fillomino rule);
      // closed sub-groups of equal value already fail the size check above.
    }
    return true
  }
  void groupOf

  const whites: number[] = []
  for (let cell = 0; cell < total; cell += 1) if (grid[cell] === 0) whites.push(cell)

  const dfs = (idx: number): number => {
    if (idx === whites.length) {
      if (consistent()) {
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
    const cell = whites[idx]!
    for (let v = 1; v <= maxRegion; v += 1) {
      grid[cell] = v
      if (consistent()) {
        const done = dfs(idx + 1)
        if (done !== 0) {
          grid[cell] = 0
          return done
        }
      }
      grid[cell] = 0
    }
    return 0
  }

  const done = dfs(0)
  void done
  return { solutions, exhausted, nodes }
}

/** Generation attempts per puzzle (a roll always ships; kept for parity). */
export function attemptCap(size: number): number {
  return 1
}

/**
 * Generate a puzzle deterministically from seed. Every roll is solvable by
 * construction (the generating fill is a valid completion); uniqueness is
 * not probed — fillomino completions are plentiful, so levels ship with
 * unique: false and the win check is purely rule-based.
 */
export function puzzleFromSeed(seed: number, size: number): FilloPuzzle {
  return tryGenerate(seed, size)
}

/**
 * One roll: spread anchors (Chebyshev ≥ 2), grow regions simultaneously —
 * most-constrained head first with random tiebreak — until the grid is
 * covered; each region's clue (its final size) lands on a random member.
 */
function tryGenerate(seed: number, size: number): FilloPuzzle {
  const rng = mulberry32(seed)
  const total = size * size
  const cells: number[] = []
  for (let i = 0; i < total; i += 1) cells.push(i)
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[cells[i], cells[j]] = [cells[j]!, cells[i]!]
  }
  const anchors: number[] = []
  for (const c of cells) {
    const far = anchors.every(s => {
      const dr = Math.abs(Math.floor(s / size) - Math.floor(c / size))
      const dc = Math.abs((s % size) - (c % size))
      return Math.max(dr, dc) >= 2
    })
    if (far) anchors.push(c)
    if (anchors.length >= Math.max(4, Math.floor(total / 5))) break
  }
  const owner = new Array<number>(total).fill(-1)
  anchors.forEach((a, i) => { owner[a] = i })
  const frontier = anchors.map(a => [a] as number[])
  let free = total - anchors.length
  while (free > 0) {
    // Pick the region with the fewest growth options (random tiebreak).
    let best = -1
    let bestOpts: number[] = []
    let bestScore = Infinity
    for (let i = 0; i < anchors.length; i += 1) {
      const opts = new Set<number>()
      for (const c of frontier[i]!) for (const n of neighbors(size, c)) if (owner[n] === -1) opts.add(n)
      if (opts.size === 0) continue
      const score = opts.size + rng() * 0.9
      if (score < bestScore) { bestScore = score; best = i; bestOpts = [...opts] }
    }
    if (best === -1) break
    const pick = bestOpts[Math.floor(rng() * bestOpts.length)]!
    owner[pick] = best
    frontier[best]!.push(pick)
    free -= 1
  }
  // Any unowned cell (all-frontier deadlock) joins a neighboring region.
  for (let cell = 0; cell < total; cell += 1) {
    if (owner[cell] !== -1) continue
    const opts = neighbors(size, cell).filter(n => owner[n] !== -1)
    owner[cell] = opts.length > 0 ? owner[opts[Math.floor(rng() * opts.length)]!]! : 0
  }
  // Fillomino rule: equal-size regions may not touch — merge adjacent
  // same-size regions to a fixpoint (merging changes sizes, so iterate).
  let merging = true
  while (merging) {
    merging = false
    // Compute region sizes, then merge any two touching regions of the
    // same size into the lower-indexed one.
    const sizes = new Map<number, number>()
    for (const o of owner) sizes.set(o, (sizes.get(o) ?? 0) + 1)
    for (let cell = 0; cell < total && !merging; cell += 1) {
      for (const n of neighbors(size, cell)) {
        if (owner[n] === owner[cell]) continue
        if (sizes.get(owner[cell]!) !== sizes.get(owner[n]!)) continue
        const from = Math.max(owner[cell]!, owner[n]!)
        const to = Math.min(owner[cell]!, owner[n]!)
        for (let i = 0; i < total; i += 1) if (owner[i] === from) owner[i] = to
        merging = true
        break
      }
    }
  }
  const clues = new Map<number, number>()
  const solution: number[] = []
  const groups = new Map<number, number[]>()
  for (let cell = 0; cell < total; cell += 1) {
    const g = groups.get(owner[cell]!) ?? []
    g.push(cell)
    groups.set(owner[cell]!, g)
  }
  for (const members of groups.values()) {
    const clueCell = members[Math.floor(rng() * members.length)]!
    clues.set(clueCell, members.length)
  }
  for (let cell = 0; cell < total; cell += 1) solution.push(groups.get(owner[cell]!)!.length)
  return { size, clues, solution, unique: false }
}
