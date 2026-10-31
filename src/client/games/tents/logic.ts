/**
 * 露营帐篷 (Tents and Trees) pure logic. An n×n grid holds T trees; the
 * player places exactly one tent orthogonally adjacent to each tree so that
 * no two tents touch (even diagonally) and every row/column tent count
 * matches its clue.
 *
 * Generation: trees land on spread cells (Chebyshev distance ≥ 2 apart), a
 * randomized backtracking match assigns each tree a tent, and the row/column
 * counts come from that assignment. Each roll is verified by a node-budgeted
 * deterministic solver that counts matchings up to two; a level ships only
 * when exactly one solution is proven, otherwise the seed advances — after
 * the attempt cap the first solvable roll ships with a 多解 badge (the
 * flow/slitherlink pattern).
 */

/** Board edge lengths and tree counts of the ten levels. */
export const LEVEL_SIZES = [6, 7, 8, 9, 10, 8, 9, 10, 11, 12] as const
export const LEVEL_TREES = [8, 10, 12, 14, 16, 15, 18, 20, 22, 24] as const

/** A generated level: trees plus the row/column tent-count clues. */
export interface TentsPuzzle {
  /** Board edge length in cells. */
  size: number
  /** Cells occupied by trees (cell = r * size + c). */
  trees: readonly number[]
  /** Per row: required tent count. */
  rowCounts: readonly number[]
  /** Per column: required tent count. */
  colCounts: readonly number[]
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

/** Board edge length of a 1-based level (levels wrap after the 10th). */
export function levelSize(level: number): number {
  return LEVEL_SIZES[(level - 1) % LEVEL_SIZES.length]!
}

/** Tree count of a 1-based level. */
export function levelTrees(level: number): number {
  return LEVEL_TREES[(level - 1) % LEVEL_TREES.length]!
}

/** Win score: base 100×level plus a time bonus that decays 5/second. */
export function computeScore(level: number, seconds: number): number {
  return 100 * level + Math.max(0, 3000 - Math.floor(seconds) * 5)
}

/** Cells sharing an edge with `cell`. */
export function orthNeighbors(size: number, cell: number): number[] {
  const r = Math.floor(cell / size)
  const c = cell % size
  const out: number[] = []
  if (r > 0) out.push(cell - size)
  if (r < size - 1) out.push(cell + size)
  if (c > 0) out.push(cell - 1)
  if (c < size - 1) out.push(cell + 1)
  return out
}

/** True when two distinct cells touch orthogonally or diagonally. */
export function touches(size: number, a: number, b: number): boolean {
  const dr = Math.abs(Math.floor(a / size) - Math.floor(b / size))
  const dc = Math.abs((a % size) - (b % size))
  return a !== b && dr <= 1 && dc <= 1
}

/**
 * Legal tent placement check for interactive play: grass cell, no tree, and
 * no touching (8-neighborhood) tent already placed.
 */
export function canPlaceTent(size: number, trees: readonly number[], tents: readonly number[], cell: number): boolean {
  if (trees.includes(cell)) return false
  if (tents.includes(cell)) return false
  if (tents.some(t => touches(size, t, cell))) return false
  return true
}

/**
 * Win: tent count equals tree count, every tree has an adjacent tent, no
 * tent touches another, and every row/column count matches its clue.
 */
export function isWon(puzzle: TentsPuzzle, tents: readonly number[]): boolean {
  const { size, trees, rowCounts, colCounts } = puzzle
  if (tents.length !== trees.length) return false
  for (let i = 0; i < tents.length; i += 1) {
    for (let j = i + 1; j < tents.length; j += 1) {
      if (touches(size, tents[i]!, tents[j]!)) return false
    }
  }
  const treeSet = new Set(trees)
  for (const tree of trees) {
    if (!orthNeighbors(size, tree).some(n => tents.includes(n))) return false
  }
  for (const tent of tents) {
    if (treeSet.has(tent)) return false
    if (!orthNeighbors(size, tent).some(n => treeSet.has(n))) return false
  }
  const rowCount = new Array<number>(size).fill(0)
  const colCount = new Array<number>(size).fill(0)
  for (const t of tents) {
    rowCount[Math.floor(t / size)]! += 1
    colCount[t % size]! += 1
  }
  for (let i = 0; i < size; i += 1) {
    if (rowCount[i] !== rowCounts[i] || colCount[i] !== colCounts[i]) return false
  }
  return true
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
 * Count valid tree→tent matchings up to two via backtracking. Trees route in
 * row-major order; each tries its free orthogonal cells under the no-touch
 * and row/column-capacity rules, pruning when any unassigned tree has no
 * candidate left. Returns solution count with budget status.
 */
export function solveCount(puzzle: TentsPuzzle, maxNodes = 40_000): SolveResult {
  const { size, trees, rowCounts, colCounts } = puzzle
  const total = size * size
  const treeSet = new Uint8Array(total)
  for (const t of trees) treeSet[t] = 1
  const tents: number[] = []
  const used = new Uint8Array(total)
  // tentsBlocked[cell] = 1 when cell is a tent or touches one (8-neighborhood).
  const blocked = new Uint8Array(total)
  const rowLeft = [...rowCounts]
  const colLeft = [...colCounts]
  let nodes = 0
  let solutions = 0
  let exhausted = false

  const blockAround = (cell: number, mark: 1 | 0): void => {
    const r = Math.floor(cell / size)
    const c = cell % size
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const nr = r + dr
        const nc = c + dc
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue
        const n = nr * size + nc
        if (mark === 1) blocked[n]! += 1
        else blocked[n]! -= 1
      }
    }
  }

  /** Candidate cells for tree i under the current partial assignment. */
  const candidates = (i: number): number[] => {
    const out: number[] = []
    for (const n of orthNeighbors(size, trees[i]!)) {
      if (treeSet[n] === 1 || used[n] === 1 || blocked[n]! > 0) continue
      if (rowLeft[Math.floor(n / size)]! <= 0) continue
      if (colLeft[n % size]! <= 0) continue
      out.push(n)
    }
    return out
  }

  const dfs = (i: number): number => {
    if (i === trees.length) {
      solutions += 1
      return solutions >= 2 ? STOP : 0
    }
    nodes += 1
    if (nodes > maxNodes) {
      exhausted = true
      return STOP
    }
    // Prune: every remaining tree needs at least one candidate.
    for (let j = i; j < trees.length; j += 1) {
      if (candidates(j).length === 0) return 0
    }
    for (const cell of candidates(i)) {
      used[cell] = 1
      tents.push(cell)
      rowLeft[Math.floor(cell / size)]! -= 1
      colLeft[cell % size]! -= 1
      blockAround(cell, 1)
      const done = dfs(i + 1)
      blockAround(cell, 0)
      colLeft[cell % size]! += 1
      rowLeft[Math.floor(cell / size)]! += 1
      tents.pop()
      used[cell] = 0
      if (done !== 0) return done
    }
    return 0
  }

  const done = dfs(0)
  void done
  return { solutions, exhausted, nodes }
}

/** Generation attempts per puzzle: uniqueness re-rolls, smaller boards more. */
export function attemptCap(size: number): number {
  return size <= 8 ? 30 : 15
}

/**
 * Generate a puzzle deterministically from `seed`.
 *
 * Re-rolls derived seeds until the solver proves exactly one matching;
 * after the attempt cap the first solvable roll ships with unique: false.
 * Returns null only when no roll produced a solvable placement at all.
 */
export function puzzleFromSeed(seed: number, size: number, trees: number): TentsPuzzle | null {
  let fallback: TentsPuzzle | null = null
  const attempts = attemptCap(size)
  for (let s = 0; s < attempts; s += 1) {
    const roll = tryGenerate((seed + s * 0x9e3779b9) >>> 0, size, trees)
    if (roll === null) continue
    if (fallback === null) fallback = roll
    const { solutions, exhausted } = solveCount(roll)
    if (!exhausted && solutions === 1) return { ...roll, unique: true }
  }
  return fallback
}

/**
 * One generation attempt: place spread trees, then match tents by
 * randomized backtracking. Null when no matching exists for this roll.
 */
function tryGenerate(seed: number, size: number, treeCount: number): TentsPuzzle | null {
  const rng = mulberry32(seed)
  const total = size * size
  const cells: number[] = []
  for (let i = 0; i < total; i += 1) cells.push(i)
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[cells[i], cells[j]] = [cells[j]!, cells[i]!]
  }
  // Spread trees: Chebyshev distance ≥ 2 apart (no touching trees — tents
  // would be forced to overlap).
  const treeList: number[] = []
  for (const c of cells) {
    const far = treeList.every(s => {
      const dr = Math.abs(Math.floor(s / size) - Math.floor(c / size))
      const dc = Math.abs((s % size) - (c % size))
      return Math.max(dr, dc) >= 2
    })
    if (far) treeList.push(c)
    if (treeList.length === treeCount) break
  }
  if (treeList.length < treeCount) return null
  treeList.sort((a, b) => a - b)
  const treeSet = new Set(treeList)
  const tents: number[] = []
  const blocked = new Set<number>()
  const placeRandom = (i: number, depth: number): boolean => {
    if (i === treeCount) return true
    if (depth > 4000) return false
    const opts = orthNeighbors(size, treeList[i]!).filter(n => {
      if (treeSet.has(n) || tents.includes(n)) return false
      if (blocked.has(n)) return false
      return true
    })
    // Random order keeps rolls varied across seeds.
    for (let k = opts.length - 1; k > 0; k -= 1) {
      const j = Math.floor(rng() * (k + 1))
      ;[opts[k], opts[j]] = [opts[j]!, opts[k]!]
    }
    for (const cell of opts) {
      tents.push(cell)
      const newlyBlocked: number[] = []
      const r = Math.floor(cell / size)
      const c = cell % size
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const nr = r + dr
          const nc = c + dc
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue
          const n = nr * size + nc
          if (!blocked.has(n)) { blocked.add(n); newlyBlocked.push(n) }
        }
      }
      if (placeRandom(i + 1, depth + 1)) return true
      for (const n of newlyBlocked) blocked.delete(n)
      tents.pop()
    }
    return false
  }
  if (!placeRandom(0, 0)) return null
  const rowCounts = new Array<number>(size).fill(0)
  const colCounts = new Array<number>(size).fill(0)
  for (const t of tents) {
    rowCounts[Math.floor(t / size)]! += 1
    colCounts[t % size]! += 1
  }
  return { size, trees: treeList, rowCounts, colCounts, unique: false }
}
