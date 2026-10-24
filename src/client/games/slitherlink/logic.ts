/**
 * Slitherlink 数回 pure logic. A puzzle is a w×h CELL grid; edges live on the
 * lattice dots around them. Edge encoding (flat array, row-major):
 *   - horizontal edges: (w+1) columns × h rows   → indices [0, (w+1)*h)
 *   - vertical edges:   w columns × (h+1) rows   → indices [(w+1)*h, ...)
 * EdgeState: 0 unknown / 1 line / 2 cross. Clue cells hold 0-3 or -1 (blank).
 */

export type EdgeState = 0 | 1 | 2
export type Clue = -1 | 0 | 1 | 2 | 3

export interface SlitherlinkPuzzle {
  w: number
  h: number
  clues: Clue[]
  /** 1 on cycle edges, 0 elsewhere. */
  solution: EdgeState[]
  unique: boolean
}

export function hEdgeIndex(w: number, h: number, col: number, row: number): number {
  // Horizontal edges: w per dot-row across (h+1) dot-rows — INCLUDING the
  // bottom row. col ∈ [0, w), row ∈ [0, h].
  void h
  return row * w + col
}

export function vEdgeIndex(w: number, h: number, col: number, row: number): number {
  // Vertical edges: (w+1) per dot-row across h dot-rows, AFTER the horizontal
  // block. col ∈ [0, w], row ∈ [0, h).
  return hEdgeCount(w, h) + row * (w + 1) + col
}

/** Horizontal edge count: w edges on each of the (h+1) dot-rows. */
export function hEdgeCount(w: number, h: number): number {
  return w * (h + 1)
}

export function edgeCount(w: number, h: number): number {
  return hEdgeCount(w, h) + (w + 1) * h
}

/** The four edge indices around cell (c, r): [N, E, S, W]. */
export function cellEdges(w: number, h: number, c: number, r: number): [number, number, number, number] {
  return [
    hEdgeIndex(w, h, c, r),
    vEdgeIndex(w, h, c + 1, r),
    hEdgeIndex(w, h, c, r + 1),
    vEdgeIndex(w, h, c, r),
  ]
}

/** mulberry32 seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Every clue cell exactly satisfied. */
export function checkClues(edges: EdgeState[], clues: Clue[], w: number, h: number): boolean {
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      const clue = clues[r * w + c]!
      if (clue < 0) continue
      const es = cellEdges(w, h, c, r)
      const n = es.filter(i => edges[i] === 1).length
      if (n !== clue) return false
    }
  }
  return true
}

/**
 * Cycle check: every dot touched by drawn edges has degree exactly 2, and all
 * drawn edges form one connected component.
 */
export function cycleCheck(edges: EdgeState[], w: number, h: number): { singleCycle: boolean; degreeOk: boolean } {
  const dots = (w + 1) * (h + 1)
  const degree = new Array<number>(dots).fill(0)
  const drawn: number[] = []
  for (let i = 0; i < edges.length; i += 1) {
    if (edges[i] !== 1) continue
    drawn.push(i)
    const [a, b] = edgeDots(w, h, i)
    degree[a]! += 1
    degree[b]! += 1
  }
  const degreeOk = drawn.length > 0 && degree.every(d => d === 0 || d === 2)
  // Connectivity over drawn edges.
  const adj: number[][] = Array.from({ length: dots }, () => [])
  for (const i of drawn) {
    const [a, b] = edgeDots(w, h, i)
    adj[a]!.push(b)
    adj[b]!.push(a)
  }
  let singleCycle = false
  if (degreeOk && drawn.length > 0) {
    const start = edgeDots(w, h, drawn[0]!)[0]!
    const seen = new Set<number>([start])
    const stack = [start]
    while (stack.length > 0) {
      const cur = stack.pop()!
      for (const n of adj[cur]!) {
        if (!seen.has(n)) { seen.add(n); stack.push(n) }
      }
    }
    singleCycle = seen.size === degree.filter(d => d > 0).length
  }
  return { singleCycle, degreeOk }
}

/** The two dot indices an edge connects. */
function edgeDots(w: number, h: number, i: number): [number, number] {
  const hCount = hEdgeCount(w, h)
  if (i < hCount) {
    // Horizontal edge: w per dot-row, dots (col,row)→(col+1,row).
    const row = Math.floor(i / w)
    const col = i % w
    const a = row * (w + 1) + col
    return [a, a + 1]
  }
  // Vertical edge: (w+1) per dot-row, dots (col,row)→(col,row+1).
  const j = i - hCount
  const row = Math.floor(j / (w + 1))
  const col = j % (w + 1)
  const a = row * (w + 1) + col
  return [a, a + (w + 1)]
}

export function isSolved(edges: EdgeState[], clues: Clue[], w: number, h: number): boolean {
  if (!checkClues(edges, clues, w, h)) return false
  const { singleCycle, degreeOk } = cycleCheck(edges, w, h)
  return degreeOk && singleCycle
}

/**
 * Pure line-logic deduction pass over one clue line (a maximal run of edges
 * whose cells all share a boundary clue constraint): enumerate placements of
 * the clue's lines among the candidate edges consistent with the known
 * states; mark forced lines and forced crosses. Returns the updated edges;
 * returns the input unchanged when a contradiction is found.
 */
function deduceLine(edges: EdgeState[], candidates: number[], clue: number): EdgeState[] {
  const n = candidates.length
  const combos: number[][] = []
  const choose = (start: number, left: number, picked: number[]): void => {
    if (left === 0) { combos.push([...picked]); return }
    for (let i = start; i <= n - left; i += 1) {
      if (edges[candidates[i]!] === 2) continue
      picked.push(candidates[i]!)
      choose(i + 1, left - 1, picked)
      picked.pop()
    }
  }
  choose(0, clue, [])
  if (combos.length === 0) return edges // contradiction: leave as-is
  const out = edges.slice()
  for (const e of candidates) {
    const alwaysLine = combos.every(c => c.includes(e))
    const neverLine = combos.every(c => !c.includes(e))
    if (alwaysLine && out[e] === 0) out[e] = 1
    else if (neverLine && out[e] === 0) out[e] = 2
    else if (out[e] === 1 && neverLine) return edges // contradiction
  }
  return out
}

/**
 * Fixpoint line solving. Two deduction families iterate to convergence:
 *  1. per-clue placement enumeration (deduceLine);
 *  2. cross-cell edge propagation — a dot where two edges are already lines
 *     forces the other two to crosses, and a dot where two are crosses
 *     forces the other two to lines (degree-2 rule at every dot).
 * Contradictions abort and return the input unchanged.
 */
export function lineSolve(clues: Clue[], known: EdgeState[], w: number, h: number): EdgeState[] {
  let edges = known.slice()
  const contradict = (next: EdgeState[]): boolean =>
    next.some((v, i) => (edges[i] === 1 && v === 2) || (edges[i] === 2 && v === 1))
  for (let iter = 0; iter < 400; iter += 1) {
    let changed = false
    // Family 1: clue placement enumeration.
    for (let r = 0; r < h; r += 1) {
      for (let c = 0; c < w; c += 1) {
        const clue = clues[r * w + c]!
        if (clue < 0) continue
        const es = cellEdges(w, h, c, r)
        const knownLines = es.filter(i => edges[i] === 1).length
        if (knownLines > clue) return known
        if (knownLines === clue) {
          // Remaining candidates must all be crosses.
          for (const i of es) {
            if (edges[i] === 0) { edges[i] = 2; changed = true }
          }
          continue
        }
        const open = es.filter(i => edges[i] === 0).length
        if (open === clue - knownLines) {
          for (const i of es) {
            if (edges[i] === 0) { edges[i] = 1; changed = true }
          }
          continue
        }
        const next = deduceLine(edges, es.filter(i => edges[i] !== 1), clue - knownLines)
        if (contradict(next)) return known
        if (next.some((v, i) => v !== edges[i])) {
          edges = next
          changed = true
        }
      }
    }
    // Family 2: dot degree-2 propagation.
    const dots = (w + 1) * (h + 1)
    for (let d = 0; d < dots; d += 1) {
      const incident = edgesAtDot(w, h, d)
      const lines = incident.filter(i => edges[i] === 1).length
      const crosses = incident.filter(i => edges[i] === 2).length
      if (lines === 2 && incident.some(i => edges[i] === 0)) {
        for (const i of incident) if (edges[i] === 0) { edges[i] = 2; changed = true }
      } else if (crosses === 2 && incident.some(i => edges[i] === 0)) {
        for (const i of incident) if (edges[i] === 0) { edges[i] = 1; changed = true }
      }
    }
    if (!changed) break
  }
  return edges
}

/** Edge indices incident to a dot. */
function edgesAtDot(w: number, h: number, dot: number): number[] {
  const r = Math.floor(dot / (w + 1))
  const c = dot % (w + 1)
  const out: number[] = []
  if (c > 0) out.push(hEdgeIndex(w, h, c - 1, r))
  if (c < w) out.push(hEdgeIndex(w, h, c, r))
  if (r > 0) out.push(vEdgeIndex(w, h, c, r - 1))
  if (r < h) out.push(vEdgeIndex(w, h, c, r))
  return out
}

/** Generate a puzzle: random single cycle over the lattice, clues from it,
 * verified (optionally) by line solving. */
export function puzzleFromSeed(seed: number, w: number, h: number, requireUnique = true): SlitherlinkPuzzle {
  const attempts = requireUnique ? (w * h <= 36 ? 200 : 40) : 1
  let fallback: SlitherlinkPuzzle | null = null
  for (let s = 0; s < attempts; s += 1) {
    const puzzle = tryGenerate((seed + s * 0x9e3779b9) >>> 0, w, h)
    if (puzzle === null) continue
    if (fallback === null) fallback = puzzle
    const solved = lineSolve(puzzle.clues, new Array<EdgeState>(edgeCount(w, h)).fill(0), w, h)
    const derived = solved.every((v, i) => v === puzzle.solution[i]) && puzzle.solution.every(v => v === 1 || v === 0)
    if (derived) return { ...puzzle, unique: true }
    if (!requireUnique) return { ...puzzle, unique: false }
  }
  return fallback ?? tryGenerate(seed, w, h) ?? { w, h, clues: [], solution: [], unique: false }
}

/** One generation attempt; null on internal failure. */
function tryGenerate(seed: number, w: number, h: number): SlitherlinkPuzzle | null {
  const rng = mulberry32(seed)
  const total = edgeCount(w, h)
  const dots = (w + 1) * (h + 1)
  // Random simple cycle: start with a random spanning-tree-ish walk and add
  // chords until every visited dot has degree 2 — build via random DFS over
  // dots then close into a Hamiltonian-ish path. Simpler robust approach:
  // random permutation walk on the lattice graph, accept when it forms one
  // simple cycle covering a subset of dots with all degrees 2.
  for (let round = 0; round < 60; round += 1) {
    const adj: number[][] = Array.from({ length: dots }, () => [])
    const connect = (a: number, b: number): void => {
      if (adj[a]!.length < 2 && adj[b]!.length < 2 && !adj[a]!.includes(b)) {
        adj[a]!.push(b)
        adj[b]!.push(a)
      }
    }
    // Greedy random pairing: shuffle all possible lattice edges, take edges
    // that keep every dot's degree ≤ 2 and the graph acyclic (union-find).
    const parent = Array.from({ length: dots }, (_, i) => i)
    const find = (x: number): number => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]! }
      return x
    }
    const candidates: [number, number][] = []
    for (let r = 0; r < h; r += 1) {
      for (let c = 0; c < w; c += 1) {
        candidates.push([r * (w + 1) + c, r * (w + 1) + c + 1])
        candidates.push([r * (w + 1) + c, (r + 1) * (w + 1) + c])
      }
    }
    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      ;[candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!]
    }
    let edgesTaken = 0
    for (const [a, b] of candidates) {
      if (edgesTaken >= total) break
      if (adj[a]!.length >= 2 || adj[b]!.length >= 2) continue
      const ra = find(a)
      const rb = find(b)
      if (ra === rb) continue // would form a smaller cycle
      parent[ra] = rb
      connect(a, b)
      edgesTaken += 1
    }
    // A maximal acyclic 2-regular graph on a lattice is a path forest, not a
    // cycle; close one long path into a cycle by linking its two ends when
    // adjacent on the lattice. Find the longest path.
    const deg1 = adj.map((n, i) => (n.length === 1 ? i : -1)).filter(i => i >= 0)
    if (deg1.length < 2) continue
    // Walk from one endpoint.
    const start = deg1[0]!
    const path: number[] = [start]
    const prevOf = new Map<number, number>()
    let cur = start
    let prevDot = -1
    while (true) {
      const nexts = adj[cur]!.filter(n => n !== prevDot)
      if (nexts.length === 0) break
      const nx = nexts[0]!
      prevOf.set(nx, cur)
      path.push(nx)
      prevDot = cur
      cur = nx
    }
    if (path.length < 4) continue
    const end = path[path.length - 1]!
    const es = path[0]!
    const adjacent = Math.abs(es % (w + 1) - end % (w + 1)) + Math.floor(es / (w + 1)) - Math.floor(end / (w + 1)) === 1
    if (!adjacent) continue
    connect(es, end)
    // Verify single cycle over all degree-2 dots.
    const solution = new Array<EdgeState>(total).fill(0)
    for (const i of path) {
      for (const j of adj[i]!) {
        const e = dotEdgeIndex(w, h, i, j)
        if (e >= 0) solution[e] = 1
      }
    }
    const clues: Clue[] = []
    for (let r = 0; r < h; r += 1) {
      for (let c = 0; c < w; c += 1) {
        const es4 = cellEdges(w, h, c, r)
        clues.push(es4.filter(i => solution[i] === 1).length as Clue)
      }
    }
    if (!checkClues(solution, clues, w, h)) continue
    const { singleCycle, degreeOk } = cycleCheck(solution, w, h)
    if (!singleCycle || !degreeOk) continue
    return { w, h, clues, solution, unique: false }
  }
  return null
}

/** Flat edge index connecting two adjacent dots, or -1 when not adjacent. */
function dotEdgeIndex(w: number, h: number, a: number, b: number): number {
  const ar = Math.floor(a / (w + 1))
  const ac = a % (w + 1)
  const br = Math.floor(b / (w + 1))
  const bc = b % (w + 1)
  if (ar === br && Math.abs(ac - bc) === 1) return hEdgeIndex(w, h, Math.min(ac, bc), ar)
  if (ac === bc && Math.abs(ar - br) === 1) return vEdgeIndex(w, h, ac, Math.min(ar, br))
  return -1
}

/** Level sizes for the five levels. */
export const LEVEL_SIZES: readonly [number, number][] = [[5, 5], [6, 6], [7, 7], [8, 8], [9, 9]]
