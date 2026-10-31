/**
 * 四角填方 (Shikaku) pure logic. An n×n grid must be partitioned into
 * rectangles so that every rectangle contains exactly one numbered clue and
 * its area equals that number.
 *
 * Generation: a random recursive split partitions the board into rectangles
 * (area capped), each rectangle plants its clue at a random cell — a solution
 * exists by construction. Each roll is verified by a node-budgeted solver
 * that counts partitions up to two (rectangles anchored at the
 * topmost-leftmost uncovered clue); a level ships only when exactly one
 * solution is proven, otherwise the seed advances — after the attempt cap
 * the first roll ships with a 多解 badge (the flow pattern).
 */

/** Board edge lengths of the five levels. */
export const LEVEL_SIZES = [6, 7, 8, 9, 10] as const

/** A rectangle as inclusive corners [r1, c1, r2, c2]. */
export type Rect = readonly [number, number, number, number]

/** A generated level: clue cells plus one valid partition. */
export interface ShikakuPuzzle {
  /** Board edge length in cells. */
  size: number
  /** Clues: cell index → required rectangle area. */
  clues: readonly { cell: number; area: number }[]
  /** The generating partition (one rect per clue, same order). */
  solution: readonly Rect[]
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

/** Board edge length of a 1-based level (levels wrap after 10×10). */
export function levelSize(level: number): number {
  return LEVEL_SIZES[(level - 1) % LEVEL_SIZES.length]!
}

/** Win score: base 100×level plus a time bonus that decays 5/second. */
export function computeScore(level: number, seconds: number): number {
  return 100 * level + Math.max(0, 3000 - Math.floor(seconds) * 5)
}

/** Area of a rectangle. */
export function rectArea(rect: Rect): number {
  return (rect[2] - rect[0] + 1) * (rect[3] - rect[1] + 1)
}

/** True when a rectangle covers cell (r, c). */
export function rectCovers(rect: Rect, r: number, c: number): boolean {
  return r >= rect[0] && r <= rect[2] && c >= rect[1] && c <= rect[3]
}

/**
 * Interactive placement check: a rect is committable when it lies inside the
 * board, covers exactly one clue, and that clue's area equals the rect area.
 */
export function rectAllowed(size: number, clues: readonly { cell: number; area: number }[], rect: Rect): boolean {
  if (rect[0] < 0 || rect[1] < 0 || rect[2] >= size || rect[3] >= size) return false
  if (rect[2] < rect[0] || rect[3] < rect[1]) return false
  const hits = clues.filter(cl => rectCovers(rect, Math.floor(cl.cell / size), cl.cell % size))
  return hits.length === 1 && hits[0]!.area === rectArea(rect)
}

/** Win: the placed rects cover every cell exactly once. */
export function isWon(size: number, rects: readonly Rect[]): boolean {
  const covered = new Array<number>(size * size).fill(0)
  for (const rect of rects) {
    for (let r = rect[0]; r <= rect[2]; r += 1) {
      for (let c = rect[1]; c <= rect[3]; c += 1) {
        const cell = r * size + c
        covered[cell]! += 1
        if (covered[cell]! > 1) return false
      }
    }
  }
  return covered.every(v => v === 1)
}

/** Solver outcome: partitions found (capped at 2), budget status, nodes. */
export interface SolveResult {
  solutions: number
  /** True when the node budget ran out before the search space closed. */
  exhausted: boolean
  nodes: number
}

const STOP = -1

/**
 * Count valid partitions up to two via DFS. The topmost-leftmost uncovered
 * CLUE cell anchors the next rectangle (a clue cell need not be its
 * rectangle's corner); every inside-board rectangle of the clue's area that
 * contains it, covers only free cells and no other clue is tried. Returns
 * solution count with budget status.
 */
export function solveCount(puzzle: ShikakuPuzzle, maxNodes = 60_000): SolveResult {
  const { size, clues } = puzzle
  const total = size * size
  const clueAt = new Map<number, number>() // cell → area
  for (const cl of clues) clueAt.set(cl.cell, cl.area)
  const covered = new Uint8Array(total)
  let nodes = 0
  let solutions = 0
  let exhausted = false

  /** First uncovered clue cell in row-major order, or -1 when all are placed. */
  const firstOpenClue = (): number => {
    for (const cl of clues) if (covered[cl.cell] === 0) return cl.cell
    return -1
  }

  const dfs = (): number => {
    const anchor = firstOpenClue()
    if (anchor === -1) {
      // Full cover check: every cell placed exactly once.
      for (let i = 0; i < total; i += 1) if (covered[i] !== 1) return 0
      solutions += 1
      return solutions >= 2 ? STOP : 0
    }
    const area = clueAt.get(anchor)!
    nodes += 1
    if (nodes > maxNodes) {
      exhausted = true
      return STOP
    }
    const ar = Math.floor(anchor / size)
    const ac = anchor % size
    // Enumerate rectangle shapes (h × w) with h*w === area containing (ar, ac).
    for (let h = 1; h <= area; h += 1) {
      if (area % h !== 0) continue
      const w = area / h
      if (h > size || w > size) continue
      for (let r0 = Math.max(0, ar - h + 1); r0 <= Math.min(ar, size - h); r0 += 1) {
        for (let c0 = Math.max(0, ac - w + 1); c0 <= Math.min(ac, size - w); c0 += 1) {
          let foreign = false
          for (let r = r0; r < r0 + h && !foreign; r += 1) {
            for (let c = c0; c < c0 + w; c += 1) {
              const cell = r * size + c
              if (covered[cell] === 1) { foreign = true; break }
              const cl = clueAt.get(cell)
              if (cl !== undefined && cell !== anchor) { foreign = true; break }
            }
          }
          if (foreign) continue
          for (let r = r0; r < r0 + h; r += 1) {
            for (let c = c0; c < c0 + w; c += 1) covered[r * size + c]! = 1
          }
          const done = dfs()
          for (let r = r0; r < r0 + h; r += 1) {
            for (let c = c0; c < c0 + w; c += 1) covered[r * size + c]! = 0
          }
          if (done !== 0) return done
        }
      }
    }
    return 0
  }

  const done = dfs()
  void done
  return { solutions, exhausted, nodes }
}

/** Generation attempts per puzzle: uniqueness re-rolls, smaller boards more. */
export function attemptCap(size: number): number {
  return size <= 8 ? 25 : 12
}

/**
 * Generate a puzzle deterministically from seed.
 *
 * Re-rolls derived seeds until the solver proves exactly one partition;
 * after the attempt cap the first roll ships with unique: false (always
 * solvable — the clues come from a concrete partition).
 */
export function puzzleFromSeed(seed: number, size: number): ShikakuPuzzle {
  let fallback: ShikakuPuzzle | null = null
  const attempts = attemptCap(size)
  for (let s = 0; s < attempts; s += 1) {
    const roll = tryGenerate((seed + s * 0x9e3779b9) >>> 0, size)
    if (fallback === null) fallback = roll
    const { solutions, exhausted } = solveCount(roll)
    if (!exhausted && solutions === 1) return { ...roll, unique: true }
  }
  return fallback!
}

/**
 * One generation attempt: recursively split the board into rectangles with
 * area ≤ MAX_AREA, then plant each rectangle's clue at a random inner cell.
 */
function tryGenerate(seed: number, size: number): ShikakuPuzzle {
  const rng = mulberry32(seed)
  /** Largest allowed rectangle area (bigger rects read as boring blocks). */
  const MAX_AREA = size <= 7 ? 8 : 10
  const rects: Rect[] = []
  /** Split region [r1,c1,r2,c2] either in two or keep it (if small enough). */
  const split = (r1: number, c1: number, r2: number, c2: number, depth: number): void => {
    const h = r2 - r1 + 1
    const w = c2 - c1 + 1
    const area = h * w
    const canH = h >= 2
    const canV = w >= 2
    if (area <= MAX_AREA && (!canH || !canV || (depth > 0 && rng() < 0.25))) {
      rects.push([r1, c1, r2, c2])
      return
    }
    if (depth > 64 || (!canH && !canV)) {
      rects.push([r1, c1, r2, c2])
      return
    }
    if (canH && (!canV || rng() < 0.5)) {
      const cut = r1 + 1 + Math.floor(rng() * (h - 1))
      split(r1, c1, cut - 1, c2, depth + 1)
      split(cut, c1, r2, c2, depth + 1)
    } else {
      const cut = c1 + 1 + Math.floor(rng() * (w - 1))
      split(r1, c1, r2, cut - 1, depth + 1)
      split(r1, cut, r2, c2, depth + 1)
    }
  }
  split(0, 0, size - 1, size - 1, 0)
  const clues: { cell: number; area: number }[] = []
  for (const rect of rects) {
    const area = rectArea(rect)
    const r = rect[0] + Math.floor(rng() * (rect[2] - rect[0] + 1))
    const c = rect[1] + Math.floor(rng() * (rect[3] - rect[1] + 1))
    clues.push({ cell: r * size + c, area })
  }
  return { size, clues, solution: rects, unique: false }
}
