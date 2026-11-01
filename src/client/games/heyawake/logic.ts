/**
 * 别府涂黑 (Heyawake) pure logic. The grid is partitioned into rectangular
 * rooms; some rooms carry a number — exactly that many shaded cells inside.
 * Shaded cells may never touch orthogonally, and the unshaded (white) cells
 * must form one connected region.
 *
 * Generation: a random room partition (recursive splits), then a randomized
 * no-touch shading per room meeting its number (rooms without numbers get a
 * random 0..2 count); white connectivity verified, re-rolled when broken.
 * Solvable by construction; a budgeted DFS counts shadings up to two — a
 * level ships only when exactly one solution is proven, else the seed
 * advances (the flow pattern).
 */

/** Board edge lengths of the five levels. */
export const LEVEL_SIZES = [6, 7, 8, 9, 10] as const

/** A room as inclusive corners [r1, c1, r2, c2] with its shaded count. */
export interface Room {
  rect: readonly [number, number, number, number]
  /** Required shaded-cell count; undefined = unconstrained room. */
  count: number | undefined
}

/** A generated level. */
export interface HeyaPuzzle {
  /** Board edge length in cells. */
  size: number
  /** The room partition covering the whole grid. */
  rooms: readonly Room[]
  /** The generating shading: true = black. */
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

/** True when the cell lies inside the room rect. */
export function roomCovers(rect: readonly [number, number, number, number], r: number, c: number): boolean {
  return r >= rect[0] && r <= rect[2] && c >= rect[1] && c <= rect[3]
}

/**
 * Full rule check: shaded cells never orthogonally adjacent, every numbered
 * room holds exactly its count, whites form one connected region.
 */
export function isWon(puzzle: HeyaPuzzle, blacks: ReadonlySet<number>): boolean {
  const size = puzzle.size
  const total = size * size
  for (let cell = 0; cell < total; cell += 1) {
    if (!blacks.has(cell)) continue
    for (const n of neighbors(size, cell)) {
      if (blacks.has(n)) return false
    }
  }
  for (const room of puzzle.rooms) {
    if (room.count === undefined) continue
    let inside = 0
    for (let r = room.rect[0]; r <= room.rect[2]; r += 1) {
      for (let c = room.rect[1]; c <= room.rect[3]; c += 1) {
        if (blacks.has(r * size + c)) inside += 1
      }
    }
    if (inside !== room.count) return false
  }
  const whites: number[] = []
  for (let cell = 0; cell < total; cell += 1) if (!blacks.has(cell)) whites.push(cell)
  if (whites.length === 0) return false
  const seen = new Set<number>([whites[0]!])
  const stack = [whites[0]!]
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
 * order with pruning: no touching blacks, numbered rooms' remaining cells
 * can still reach their count, and whites stay connectable (through whites
 * + undecided). Returns count with budget status.
 */
export function solveCount(puzzle: HeyaPuzzle, maxNodes = 120_000): SolveResult {
  const size = puzzle.size
  const total = size * size
  const roomOf = new Int32Array(total).fill(-1)
  puzzle.rooms.forEach((room, i) => {
    for (let r = room.rect[0]; r <= room.rect[2]; r += 1) {
      for (let c = room.rect[1]; c <= room.rect[3]; c += 1) roomOf[r * size + c] = i
    }
  })
  const color = new Int8Array(total) // 0 undecided, 1 white, -1 black
  let nodes = 0
  let solutions = 0
  let exhausted = false

  const complete = (): boolean => {
    const blacks = new Set<number>()
    for (let i = 0; i < total; i += 1) if (color[i] === -1) blacks.add(i)
    return isWon({ size, rooms: puzzle.rooms, solution: [], unique: false }, blacks)
  }

  const pruneOk = (): boolean => {
    // Numbered rooms: placed blacks <= count and blacks+undecided >= count.
    const placed = new Int32Array(puzzle.rooms.length)
    const open = new Int32Array(puzzle.rooms.length)
    for (let i = 0; i < total; i += 1) {
      const room = roomOf[i]!
      if (color[i] === -1) placed[room]! += 1
      else if (color[i] === 0) open[room]! += 1
    }
    for (let i = 0; i < puzzle.rooms.length; i += 1) {
      const want = puzzle.rooms[i]!.count
      if (want === undefined) continue
      if (placed[i]! > want || placed[i]! + open[i]! < want) return false
    }
    // Whites connectable through whites + undecided.
    const anchor = color.findIndex(v => v >= 0)
    if (anchor >= 0) {
      const seen = new Set<number>([anchor])
      const stack = [anchor]
      while (stack.length > 0) {
        const cur = stack.pop()!
        for (const n of neighbors(size, cur)) {
          if ((color[n] ?? -1) >= 0 && !seen.has(n)) {
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
      if (choice === -1) {
        let touch = false
        for (const n of neighbors(size, idx)) {
          if (color[n] === -1) { touch = true; break }
        }
        if (touch) continue
      }
      color[idx] = choice
      if (pruneOk()) {
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

/** Generation attempts per puzzle (density carries the difficulty;
 * uniqueness probing is skipped beyond a small budget for speed). */
export function attemptCap(size: number): number {
  return size <= 7 ? 8 : 3
}

/**
 * Generate a puzzle deterministically from seed. Re-rolls until the solver
 * proves exactly one shading; after the attempt cap the first solvable roll
 * ships with unique: false. Returns null when no roll was solvable.
 */
export function puzzleFromSeed(seed: number, size: number): HeyaPuzzle | null {
  let fallback: HeyaPuzzle | null = null
  const attempts = attemptCap(size)
  for (let s = 0; s < attempts; s += 1) {
    const roll = tryGenerate((seed + s * 0x9e3779b9) >>> 0, size)
    if (roll === null) continue
    if (fallback === null) fallback = roll
    const { solutions, exhausted } = solveCount(roll, 30_000)
    if (!exhausted && solutions === 1) return { ...roll, unique: true }
  }
  return fallback
}

/**
 * One attempt: recursive room splits, then per-room randomized no-touch
 * shading (constrained rooms exactly their count, unconstrained 0..2
 * blacks), rejecting any roll whose whites disconnect.
 */
function tryGenerate(seed: number, size: number): HeyaPuzzle | null {
  const rng = mulberry32(seed)
  const rects: [number, number, number, number][] = []
  const split = (r1: number, c1: number, r2: number, c2: number, depth: number): void => {
    const h = r2 - r1 + 1
    const w = c2 - c1 + 1
    const canH = h >= 2
    const canV = w >= 2
    // Stop on unsplittable cells or randomly once rooms are modest
    // (area ≤ 2×size, strips included) — keeps rooms chunky and readable.
    if ((!canH && !canV) || (h * w <= 2 * size && depth > 0 && rng() < 0.55)) {
      rects.push([r1, c1, r2, c2])
      return
    }
    // Mid-biased cuts keep rooms square-ish instead of shaving 1-cell slivers.
    const midCut = (len: number, lo: number): number => {
      const half = Math.floor(len / 2)
      const jitter = Math.floor((rng() - 0.5) * Math.min(2, len - 2))
      return lo + Math.max(1, Math.min(len - 1, half + jitter))
    }
    if (canH && (!canV || rng() < 0.5)) {
      const cut = midCut(h, r1)
      split(r1, c1, cut - 1, c2, depth + 1)
      split(cut, c1, r2, c2, depth + 1)
    } else {
      const cut = midCut(w, c1)
      split(r1, c1, r2, cut - 1, depth + 1)
      split(r1, cut, r2, c2, depth + 1)
    }
  }
  split(0, 0, size - 1, size - 1, 0)
  if (rects.length < size) return null // too few rooms: boring layout, re-roll
  const total = size * size
  /** All non-black cells still one connected region? */
  const whitesConnected = (): boolean => {
    const open: number[] = []
    for (let c = 0; c < total; c += 1) if (!black.has(c)) open.push(c)
    if (open.length === 0) return false
    const seen = new Set<number>([open[0]!])
    const stack = [open[0]!]
    while (stack.length > 0) {
      const cur = stack.pop()!
      for (const n of neighbors(size, cur)) {
        if (!black.has(n) && !seen.has(n)) {
          seen.add(n)
          stack.push(n)
        }
      }
    }
    return seen.size === open.length
  }
  const black = new Set<number>()
  const roomCells = rects.map(rect => {
    const cells: number[] = []
    for (let r = rect[0]; r <= rect[2]; r += 1) {
      for (let c = rect[1]; c <= rect[3]; c += 1) cells.push(r * size + c)
    }
    return cells
  })
  // Choose counts: ~60% of rooms constrained (1 or 2), rest unconstrained.
  const counts: (number | undefined)[] = roomCells.map(cells => {
    // Difficulty ramps with board size (level proxy): bigger boards keep
    // more rooms numbered and reach deeper black counts (up to half the
    // room's cells — the no-touch ceiling).
    const numberRatio = Math.min(0.85, 0.55 + (size - 6) * 0.08)
    if (rng() > numberRatio) return undefined
    const ceiling = Math.ceil(cells.length / 2)
    if (ceiling < 1) return 0
    // Upper-half bias keeps rooms demanding (more forced reasoning).
    return Math.max(1, Math.floor((ceiling + 1) / 2 + rng() * ((ceiling + 1) / 2)))
  })
  // Shade each room to its count without touching blacks (including across
  // room borders); numbered rooms place FIRST so constraints are never
  // starved by unconstrained extras, randomized greedy otherwise.
  const order = Array.from({ length: rects.length }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  order.sort((a, b) => (counts[b] === undefined ? 0 : 1) - (counts[a] === undefined ? 0 : 1))
  for (const i of order) {
    const want = counts[i]!
    if (want === undefined) {
      // Unconstrained room: at most one black (higher density strands whites).
      const extra = rng() < 0.5 ? 1 : 0
      const cells = [...roomCells[i]!]
      for (let k = cells.length - 1; k > 0; k -= 1) {
        const j = Math.floor(rng() * (k + 1))
        ;[cells[k], cells[j]] = [cells[j]!, cells[k]!]
      }
      let placed = 0
      for (const cell of cells) {
        if (placed >= extra) break
        if (neighbors(size, cell).some(n => black.has(n))) continue
        black.add(cell)
        if (!whitesConnected()) { black.delete(cell); continue }
        placed += 1
      }
    } else {
      const cells = [...roomCells[i]!]
      for (let k = cells.length - 1; k > 0; k -= 1) {
        const j = Math.floor(rng() * (k + 1))
        ;[cells[k], cells[j]] = [cells[j]!, cells[k]!]
      }
      let placed = 0
      for (const cell of cells) {
        if (placed >= want) break
        if (neighbors(size, cell).some(n => black.has(n))) continue
        black.add(cell)
        if (!whitesConnected()) { black.delete(cell); continue }
        placed += 1
      }
      // Touching blacks or stranded whites may block the wanted count —
      // the number is ours to choose, so record what actually fit
      // (0 → unconstrained room).
      counts[i] = placed > 0 ? placed : undefined
    }
  }
  // Whites must connect.
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
  const rooms: Room[] = rects.map((rect, i) => ({ rect, count: counts[i] }))
  const solution: boolean[] = []
  for (let i = 0; i < total; i += 1) solution.push(black.has(i))
  return { size, rooms, solution, unique: false }
}
