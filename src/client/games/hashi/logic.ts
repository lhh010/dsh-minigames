/**
 * 桥 (Hashi / Hashiwokakero) pure logic. Islands numbered 1-8 sit on a grid;
 * bridges (1 or 2 per pair, horizontal or vertical only, never crossing) must
 * give every island exactly its number of bridge ends and leave all islands
 * in one connected group.
 *
 * Generation: a seeded random spanning tree (randomized DFS, short edges
 * preferred) over random grid cells, then extended — some tree edges upgraded
 * to double bridges plus a few extra non-crossing edges, degrees capped at 8.
 * Island numbers are the final degrees, so a solution always exists. Every
 * roll is verified by a node-budgeted backtracking solver that stops at two
 * solutions; a level ships only when exactly one is proven, otherwise the
 * seed advances (see {@link puzzleFromSeed}).
 *
 * Placed-bridge encoding: a Map from {@link bridgeKey} ("min:max" island
 * indices) to 1|2. Insertion order is the placement order, so the last key is
 * the most recently added bridge (that is what Backspace/Z undoes).
 */

/** Board edge lengths of the five levels. */
export const LEVEL_SIZES = [5, 6, 7, 8, 9] as const

/** Degree cap: no island number exceeds what stays readable on a 9x9 board. */
export const MAX_DEGREE = 8

/** A numbered island; x/y are grid cells, n is the required bridge-end count. */
export interface Island {
  x: number
  y: number
  n: number
}

/** One bridge between two islands (indices into the island array). */
export interface Bridge {
  a: number
  b: number
  count: 1 | 2
}

/** A generated level: the islands to solve plus one valid solution. */
export interface HashiPuzzle {
  /** Board edge length in cells. */
  size: number
  islands: Island[]
  /** The generator's own bridges — always a valid solution. */
  bridges: Bridge[]
  /** Whether the solver proved this puzzle has exactly one solution. */
  unique: boolean
}

/** Bridge count on one pair: 0 none, 1 single, 2 double. */
export type BridgeCount = 0 | 1 | 2

/** Player bridges: bridgeKey → 1|2. */
export type Placed = ReadonlyMap<string, 1 | 2>

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

/** Key of the bridge between islands a and b (order-independent). */
export function bridgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

/** Island indices encoded in a bridge key. */
function keyPair(key: string): [number, number] {
  const dash = key.indexOf(':')
  return [Number(key.slice(0, dash)), Number(key.slice(dash + 1))]
}

/** Bridge count between two islands (0 when none is placed). */
export function bridgeBetween(placed: Placed, a: number, b: number): BridgeCount {
  return placed.get(bridgeKey(a, b)) ?? 0
}

/** Bridge ends touching each island, indexed like `islands`. */
export function degrees(islands: Island[], placed: Placed): number[] {
  const out = islands.map(() => 0)
  for (const [key, count] of placed) {
    const [a, b] = keyPair(key)
    out[a]! += count
    out[b]! += count
  }
  return out
}

/**
 * Cycle the bridge between a and b: 0 → 1 → 2 → 0. Pure — returns a new map,
 * whose insertion order doubles as the undo order. The caller must have
 * checked {@link legalLine}; cycling an illegal pair is undefined.
 * @param placed - current bridges.
 * @param a - first island index.
 * @param b - second island index.
 * @returns the updated bridges.
 */
export function cycleBridge(placed: Placed, a: number, b: number): Placed {
  const key = bridgeKey(a, b)
  const next = ((placed.get(key) ?? 0) + 1) % 3
  const out = new Map(placed)
  if (next === 0) out.delete(key)
  else out.set(key, next as 1 | 2)
  return out
}

/** Drop the most recently placed bridge (Backspace / Z). */
export function removeLastBridge(placed: Placed): Placed {
  const keys = [...placed.keys()]
  const last = keys.pop()
  if (last === undefined) return placed
  const out = new Map(placed)
  out.delete(last)
  return out
}

/**
 * Whether islands a and b may carry a bridge: same row or column, distinct
 * cells, and no other island strictly between them.
 * @param islands - the level's islands.
 * @param a - first island index.
 * @param b - second island index.
 */
export function legalLine(islands: Island[], a: number, b: number): boolean {
  const from = islands[a]
  const to = islands[b]
  if (from === undefined || to === undefined) return false
  if (from.x === to.x && from.y === to.y) return false
  if (from.x !== to.x && from.y !== to.y) return false
  for (let i = 0; i < islands.length; i += 1) {
    if (i === a || i === b) continue
    const c = islands[i]!
    if (from.x === to.x) {
      if (c.x === from.x && c.y > Math.min(from.y, to.y) && c.y < Math.max(from.y, to.y)) return false
    } else if (c.y === from.y && c.x > Math.min(from.x, to.x) && c.x < Math.max(from.x, to.x)) return false
  }
  return true
}

/** Whether the segment a-b crosses the segment c-d (endpoints never count). */
function segmentsCross(islands: Island[], a: number, b: number, c: number, d: number): boolean {
  const p = islands[a]!
  const q = islands[b]!
  const r = islands[c]!
  const s = islands[d]!
  // One horizontal, one vertical; strict inequalities keep shared ends legal.
  const h = p.y === q.y ? [p, q] : r.y === s.y ? [r, s] : null
  const v = p.x === q.x ? [p, q] : r.x === s.x ? [r, s] : null
  if (h === null || v === null || h[0] === v[0] || h[0] === v[1]) return false
  const hy = h[0]!.y
  const vx = v[0]!.x
  const [hx0, hx1] = [Math.min(h[0]!.x, h[1]!.x), Math.max(h[0]!.x, h[1]!.x)]
  const [vy0, vy1] = [Math.min(v[0]!.y, v[1]!.y), Math.max(v[0]!.y, v[1]!.y)]
  return hx0 < vx && vx < hx1 && vy0 < hy && hy < vy1
}

/** Whether two placed bridges cross (impossible for legal play, verified anyway). */
function bridgesCross(islands: Island[], e1: Bridge, e2: Bridge): boolean {
  return segmentsCross(islands, e1.a, e1.b, e2.a, e2.b)
}

/** Placed bridges as Bridge records, in placement order. */
export function placedBridges(islands: Island[], placed: Placed): Bridge[] {
  const out: Bridge[] = []
  for (const [key, count] of placed) {
    const [a, b] = keyPair(key)
    if (legalLine(islands, a, b)) out.push({ a, b, count })
  }
  return out
}

/** Whether all islands are reachable from island 0 over the placed bridges. */
export function connectedCheck(islands: Island[], placed: Placed): boolean {
  const n = islands.length
  if (n <= 1) return true
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (const { a, b } of placedBridges(islands, placed)) {
    adj[a]!.push(b)
    adj[b]!.push(a)
  }
  const seen = new Uint8Array(n)
  seen[0] = 1
  const stack = [0]
  let visited = 1
  while (stack.length > 0) {
    const i = stack.pop()!
    for (const j of adj[i]!) {
      if (seen[j] === 0) {
        seen[j] = 1
        visited += 1
        stack.push(j)
      }
    }
  }
  return visited === n
}

/**
 * Win check: every island has exactly its number of bridge ends, the bridges
 * form one connected group, and no two bridges cross.
 * @param islands - the level's islands.
 * @param placed - the player's bridges.
 */
export function isSolved(islands: Island[], placed: Placed): boolean {
  const deg = degrees(islands, placed)
  for (let i = 0; i < islands.length; i += 1) {
    if (deg[i] !== islands[i]!.n) return false
  }
  if (!connectedCheck(islands, placed)) return false
  const list = placedBridges(islands, placed)
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (bridgesCross(islands, list[i]!, list[j]!)) return false
    }
  }
  return true
}

/**
 * Count the solutions of a puzzle's island/number set (the generator's own
 * `bridges` field is ignored — a player only ever sees the numbers).
 *
 * Backtracking over the legal pairs with constraint propagation: branch on the
 * island with the fewest open bridge options, enumerate the ways to spend its
 * remaining count, prune on over-bridged islands, unreachable remainders,
 * crossings, and an odd total remainder.
 * @param puzzle - the level to solve.
 * @param budget - search-node cap.
 * @returns 0, 1, or 2 (capped: 2 means "at least two"), or -1 when the budget
 * ran out before the search completed.
 */
export function countSolutions(puzzle: HashiPuzzle, budget = 50000): number {
  const { islands } = puzzle
  const n = islands.length
  const edges: [number, number][] = []
  for (let a = 0; a < n; a += 1) {
    for (let b = a + 1; b < n; b += 1) {
      if (legalLine(islands, a, b)) edges.push([a, b])
    }
  }
  const m = edges.length
  const adj: number[][] = Array.from({ length: n }, () => [])
  const cross: boolean[][] = Array.from({ length: m }, () => Array<boolean>(m).fill(false))
  for (let e = 0; e < m; e += 1) {
    const [a, b] = edges[e]!
    adj[a]!.push(e)
    adj[b]!.push(e)
    for (let f = e + 1; f < m; f += 1) {
      if (segmentsCross(islands, a, b, edges[f]![0], edges[f]![1])) {
        cross[e]![f] = true
        cross[f]![e] = true
      }
    }
  }
  const counts = new Int8Array(m)
  const deg = new Int8Array(n)
  let left = budget
  let found = 0
  let exhausted = false

  /** Connectivity over the currently positive edges (shared with the leaf test). */
  const allConnected = (): boolean => {
    const seen = new Uint8Array(n)
    seen[0] = 1
    const stack = [0]
    let visited = 1
    while (stack.length > 0) {
      const i = stack.pop()!
      for (const e of adj[i]!) {
        if (counts[e] === 0) continue
        const [a, b] = edges[e]!
        const j = a === i ? b! : a!
        if (seen[j] === 0) {
          seen[j] = 1
          visited += 1
          stack.push(j)
        }
      }
    }
    return visited === n
  }

  const search = (): void => {
    if (found >= 2) return
    if (left <= 0) {
      exhausted = true
      return
    }
    left -= 1
    // Branch on the island with the fewest open options (most constrained first).
    let best = -1
    let bestOpen = Infinity
    for (let i = 0; i < n; i += 1) {
      const rem = islands[i]!.n - deg[i]!
      if (rem < 0) return // over-bridged
      if (rem === 0) continue
      let open = 0
      for (const e of adj[i]!) if (counts[e] === 0) open += 1
      if (open === 0 || rem > open * 2) return
      if (open < bestOpen) {
        bestOpen = open
        best = i
        if (open === 1) break
      }
    }
    if (best === -1) {
      if (allConnected()) found += 1
      return
    }
    const rem = islands[best]!.n - deg[best]!
    const open = adj[best]!.filter(e => counts[e] === 0)
    const assign = (idx: number, sum: number): void => {
      if (found >= 2 || exhausted) return
      if (idx === open.length) {
        if (sum === rem) search()
        return
      }
      if (sum + 2 * (open.length - idx) < rem) return
      const e = open[idx]!
      const [a, b] = edges[e]!
      const other = a === best ? b! : a!
      for (const v of [0, 1, 2] as const) {
        if (v > 0) {
          if (deg[other]! + v > islands[other]!.n) continue
          let blocked = false
          for (let f = 0; f < m; f += 1) {
            if (counts[f]! > 0 && cross[e]![f]!) {
              blocked = true
              break
            }
          }
          if (blocked) continue
        }
        counts[e] = v
        deg[best]! += v
        deg[other]! += v
        assign(idx + 1, sum + v)
        counts[e] = 0
        deg[best]! -= v
        deg[other]! -= v
      }
    }
    assign(0, 0)
  }
  search()
  return exhausted ? -1 : found
}

/** Islands needed on a board of `size` cells (~20% density, at least 4). */
function islandTarget(size: number): number {
  return Math.max(4, Math.min(size * size, Math.round(size * size * 0.2)))
}

/**
 * A randomized-DFS spanning tree over the islands, preferring short edges
 * (which keeps the tree local and rarely self-crossing).
 * @returns tree edges, or null when some island is unreachable by a legal line.
 */
function spanningTree(islands: Island[], rng: () => number): [number, number][] | null {
  const n = islands.length
  const start = Math.floor(rng() * n)
  const visited = new Uint8Array(n)
  visited[start] = 1
  const stack = [start]
  const edges: [number, number][] = []
  let seen = 1
  while (seen < n) {
    const cur = stack[stack.length - 1]!
    const cands: number[] = []
    for (let j = 0; j < n; j += 1) {
      if (visited[j] === 0 && legalLine(islands, cur, j)) cands.push(j)
    }
    if (cands.length === 0) {
      stack.pop()
      if (stack.length === 0) return null // the rest is unreachable
      continue
    }
    // Roulette over 1/(1+length): short bridges dominate, long ones still appear.
    const weights = cands.map(c => 1 / (1 + Math.abs(islands[cur]!.x - islands[c]!.x) + Math.abs(islands[cur]!.y - islands[c]!.y)))
    let roll = rng() * weights.reduce((s, w) => s + w, 0)
    let pick = cands[cands.length - 1]!
    for (let i = 0; i < cands.length; i += 1) {
      roll -= weights[i]!
      if (roll <= 0) {
        pick = cands[i]!
        break
      }
    }
    edges.push([cur, pick])
    visited[pick] = 1
    seen += 1
    stack.push(pick)
  }
  return edges
}

/** One random roll: islands, a crossing-free spanning tree, extensions, numbers. */
function rollOnce(seed: number, size: number): HashiPuzzle | null {
  const rng = mulberry32(seed)
  const target = islandTarget(size)
  const taken = new Set<number>()
  const islands: Island[] = []
  while (islands.length < target) {
    const cell = Math.floor(rng() * size * size)
    if (taken.has(cell)) continue
    taken.add(cell)
    islands.push({ x: cell % size, y: Math.floor(cell / size), n: 0 })
  }
  const tree = spanningTree(islands, rng)
  if (tree === null) return null
  for (let i = 0; i < tree.length; i += 1) {
    for (let j = i + 1; j < tree.length; j += 1) {
      const [a, b] = tree[i]!
      const [c, d] = tree[j]!
      if (segmentsCross(islands, a, b, c, d)) return null // tree must stay crossing-free
    }
  }
  const deg = islands.map(() => 0)
  const links = new Map<string, Bridge>()
  const link = (a: number, b: number, count: 1 | 2): void => {
    const key = bridgeKey(a, b)
    if (links.has(key)) return
    links.set(key, { a, b, count })
    deg[a]! += count
    deg[b]! += count
  }
  for (const [a, b] of tree) link(a, b, 1)
  // Upgrade a random subset of tree edges to double bridges.
  const upgrade = [...tree]
  for (let i = upgrade.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = upgrade[i]!
    upgrade[i] = upgrade[j]!
    upgrade[j] = tmp
  }
  for (const [a, b] of upgrade) {
    if (rng() < 0.35 && deg[a]! < MAX_DEGREE && deg[b]! < MAX_DEGREE) {
      links.get(bridgeKey(a, b))!.count = 2
      deg[a]! += 1
      deg[b]! += 1
    }
  }
  // Extra non-crossing edges until the extension budget runs out.
  const extras = Math.max(1, Math.round(target * 0.35))
  const pairs: [number, number][] = []
  for (let a = 0; a < islands.length; a += 1) {
    for (let b = a + 1; b < islands.length; b += 1) {
      if (legalLine(islands, a, b) && !links.has(bridgeKey(a, b))) pairs.push([a, b])
    }
  }
  for (let i = pairs.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = pairs[i]!
    pairs[i] = pairs[j]!
    pairs[j] = tmp
  }
  let added = 0
  for (const [a, b] of pairs) {
    if (added >= extras) break
    if (rng() > 0.55) continue
    if (deg[a]! >= MAX_DEGREE || deg[b]! >= MAX_DEGREE) continue
    const double = rng() < 0.25 && deg[a]! < MAX_DEGREE - 1 && deg[b]! < MAX_DEGREE - 1
    const count: 1 | 2 = double ? 2 : 1
    let crosses = false
    for (const other of links.values()) {
      if (bridgesCross(islands, { a, b, count }, other)) {
        crosses = true
        break
      }
    }
    if (crosses) continue
    link(a, b, count)
    added += 1
  }
  for (let i = 0; i < islands.length; i += 1) islands[i]!.n = deg[i]!
  return { size, islands, bridges: [...links.values()], unique: false }
}

/** Solver node budget per roll: enough to prove uniqueness at 9x9, cheap enough to retry. */
const ROLL_BUDGET = 20000

/** Re-rolls per level before relaxing to "solvable, uniqueness unproven". */
const MAX_ATTEMPTS = 60

/**
 * A deterministic level for one seed: random rolls at `seed`, `seed+1`, …,
 * each verified by {@link countSolutions}; the first roll proven unique wins.
 *
 * RELAXATION: if no roll is proven unique within {@link MAX_ATTEMPTS} the best
 * roll is kept with `unique: false` — it is still solvable (the generator's own
 * bridges are a solution), so the level stays playable and the badge reads
 * 「多解」 instead of lying with 「唯一解」.
 * @param seed - base seed; attempts advance it by one.
 * @param size - board edge length in cells (see {@link LEVEL_SIZES}).
 */
export function puzzleFromSeed(seed: number, size: number): HashiPuzzle {
  let fallback: HashiPuzzle | null = null
  let fallbackUnproven = false
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let puzzle: HashiPuzzle | null = null
    // Inner retries dodge the rare crossing spanning tree without burning an attempt.
    for (let retry = 0; retry < 12 && puzzle === null; retry += 1) {
      puzzle = rollOnce(seed + attempt + retry * 0x10000, size)
    }
    if (puzzle === null) continue
    const count = countSolutions(puzzle, ROLL_BUDGET)
    if (count === 1) return { ...puzzle, unique: true }
    // Every roll is solvable by construction, so "best" means "closest to
    // proven unique": a budget-exhausted roll may still be unique, a roll with
    // two known solutions certainly is not.
    const unproven = count === -1
    if (fallback === null || (unproven && !fallbackUnproven)) {
      fallback = puzzle
      fallbackUnproven = unproven
    }
  }
  // Unreachable in practice: a spaced single row of islands has forced degrees
  // 1-2-…-2-1 and exactly one solution, and keeps the level playable.
  return fallback ?? linePuzzle(size)
}

/** Spaced islands in one row: the guaranteed-unique safety net. */
function linePuzzle(size: number): HashiPuzzle {
  const islands: Island[] = []
  for (let x = 0; x + 1 < size; x += 2) islands.push({ x, y: 0, n: 0 })
  const bridges: Bridge[] = []
  for (let i = 0; i + 1 < islands.length; i += 1) bridges.push({ a: i, b: i + 1, count: 1 })
  const deg = islands.map(() => 0)
  for (const { a, b, count } of bridges) {
    deg[a]! += count
    deg[b]! += count
  }
  for (let i = 0; i < islands.length; i += 1) islands[i]!.n = deg[i]!
  return { size, islands, bridges, unique: true }
}
