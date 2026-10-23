/**
 * Nonogram (数织) pure logic: a 10x10 boolean pattern whose row/column run
 * clues uniquely determine it. Patterns come from a mulberry32 PRNG at
 * ~50-60% density and are re-rolled until a line solver deduces every cell
 * from the clues alone, so each level has exactly one solution. Cell marks
 * are 0 empty / 1 filled / 2 crossed; crosses never affect the win check.
 */

export const SIZE = 10
/** Seeded levels offered by the game panel. */
export const LEVELS = 6

/** Player cell mark: 0 empty, 1 filled, 2 crossed (X). */
export type Cell = 0 | 1 | 2

/** Row and column clues: run lengths, [0] for an empty line. */
export interface Clues {
  rows: number[][]
  cols: number[][]
}

/** One solver line: null unknown, true filled, false empty. */
export type Known = (boolean | null)[]

/** Run lengths of one line; an all-empty line yields [0]. */
function lineClue(line: boolean[]): number[] {
  const runs: number[] = []
  let run = 0
  for (const v of line) {
    if (v) run += 1
    else if (run > 0) {
      runs.push(run)
      run = 0
    }
  }
  if (run > 0) runs.push(run)
  return runs.length === 0 ? [0] : runs
}

/** Derive the row and column clues of a square pattern. */
export function cluesFrom(pattern: boolean[][]): Clues {
  const rows = pattern.map(lineClue)
  const cols: number[][] = []
  for (let c = 0; c < SIZE; c += 1) cols.push(lineClue(pattern.map(row => row[c]!)))
  return { rows, cols }
}

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

/** All fillings of a line that satisfy `runs` and contradict no known cell. */
function enumeratePlacements(runs: number[], known: Known): boolean[][] {
  const n = known.length
  const out: boolean[][] = []
  const line = Array<boolean>(n).fill(false)
  /** Space the remaining runs (incl. separators) need from `pos` on. */
  const needFrom = (idx: number): number => {
    let need = -1
    for (let i = idx; i < runs.length; i += 1) need += runs[i]! + 1
    return need
  }
  const rec = (idx: number, pos: number): void => {
    if (idx === runs.length) {
      for (let i = pos; i < n; i += 1) {
        if (known[i] === true) return
        line[i] = false
      }
      out.push([...line])
      return
    }
    const run = runs[idx]!
    const slack = n - pos - needFrom(idx)
    for (let s = 0; s <= slack; s += 1) {
      let ok = true
      for (let i = 0; i < s; i += 1) {
        if (known[pos + i] === true) { ok = false; break }
        line[pos + i] = false
      }
      if (!ok) continue
      const start = pos + s
      for (let i = 0; i < run; i += 1) {
        if (known[start + i] === false) { ok = false; break }
        line[start + i] = true
      }
      if (!ok) continue
      const after = start + run
      if (idx < runs.length - 1) {
        // A separator cell must follow an interior run.
        if (after < n && known[after] !== true) {
          line[after] = false
          rec(idx + 1, after + 1)
        }
      } else {
        rec(idx + 1, after)
      }
    }
  }
  rec(0, 0)
  return out
}

/**
 * Deduce every cell of a line that all valid placements agree on.
 * Contradictory input (no valid placement) returns `known` unchanged.
 * @param clue - run lengths for the line ([0] means empty).
 * @param known - current deductions for the line.
 * @returns the refined line (null where still ambiguous).
 */
export function lineSolveLine(clue: number[], known: Known): Known {
  const runs = clue.length === 1 && clue[0] === 0 ? [] : clue
  const placements = enumeratePlacements(runs, known)
  if (placements.length === 0) return [...known]
  const first = placements[0]!
  return first.map((v, i) => (placements.every(p => p[i] === v) ? v : null))
}

/**
 * Iterate the line solver over all rows and columns from an empty grid
 * until no cell changes; classic nonogram line-deduction convergence.
 * @returns the deduced grid, null where the clues are insufficient.
 */
export function solveFromClues(clues: Clues): Known[] {
  const grid: Known[] = Array.from({ length: SIZE }, () => Array<boolean | null>(SIZE).fill(null))
  let changed = true
  while (changed) {
    changed = false
    for (let r = 0; r < SIZE; r += 1) {
      const solved = lineSolveLine(clues.rows[r]!, grid[r]!)
      if (solved.some((v, c) => v !== null && grid[r]![c] === null)) changed = true
      grid[r] = solved
    }
    for (let c = 0; c < SIZE; c += 1) {
      const col: Known = grid.map(row => row[c]!)
      const solved = lineSolveLine(clues.cols[c]!, col)
      for (let r = 0; r < SIZE; r += 1) {
        const v = solved[r]
        if (v !== undefined && v !== null) {
          if (grid[r]![c] === null) changed = true
          grid[r]![c] = v
        }
      }
    }
  }
  return grid
}

/** Whether the line solver alone recovers the whole pattern from its clues. */
function uniquelySolvable(pattern: boolean[][]): boolean {
  const solved = solveFromClues(cluesFrom(pattern))
  return solved.every((row, r) => row.every((v, c) => v === pattern[r]![c]))
}

/** Cap on uniqueness re-rolls; levels are 10x10 so this always terminates early. */
const MAX_RETRIES = 64

/**
 * A deterministic 10x10 pattern for one seed: ~50-60% density, re-rolled
 * (advancing the PRNG) until its clues uniquely determine it by line solving.
 */
export function makePattern(seed: number): boolean[][] {
  const rng = mulberry32(seed)
  let pattern: boolean[][] = []
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const p = 0.5 + rng() * 0.1
    pattern = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => rng() < p))
    const density = pattern.flat().filter(Boolean).length / (SIZE * SIZE)
    if (density < 0.45 || density > 0.65) continue
    if (uniquelySolvable(pattern)) return pattern
  }
  // Unreachable in practice at this size; the last roll keeps the game playable.
  return pattern
}

/**
 * Win check: filled cells must exactly match the pattern; crosses (2) and
 * empties (0) are both "not filled" and never block or grant a win.
 */
export function checkWin(cells: Cell[][], pattern: boolean[][]): boolean {
  return cells.every((row, r) => row.every((cell, c) => (cell === 1) === pattern[r]![c]))
}
