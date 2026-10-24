/**
 * 舒尔特方格 Schulte Grid pure logic: an n×n grid holding the numbers
 * 1..n² shuffled; cells must be clicked in ascending order. Deterministic
 * functions only — no DOM, no timers.
 */

/** Wall-clock time added to a run per wrong click; applied inside {@link scoreFor}. */
export const WRONG_PENALTY_MS = 500
/** Score headroom: a run at this total time (or slower) scores the clamp of 1. */
export const SCORE_BASE_MS = 60000
/** Grid ramp cap: level grids grow 3×3 → 7×7 and stay there. */
export const MAX_GRID = 7

/** Deterministic mulberry32 PRNG (see lightsout/logic.ts precedent). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Grid side for a level: 3 at level 1, +1 per level, capped at 7. */
export function gridSizeFor(level: number): number {
  return Math.min(2 + Math.max(1, level), MAX_GRID)
}

/**
 * The shuffled 1..n² cell values, deterministically from the seed
 * (Fisher–Yates over mulberry32). Same seed → same grid.
 */
export function makeGrid(seed: number, n: number): number[] {
  const rng = mulberry32(seed)
  const cells = Array.from({ length: n * n }, (_, i) => i + 1)
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = cells[i]!
    cells[i] = cells[j]!
    cells[j] = tmp
  }
  return cells
}

/**
 * Whether clicking cell `cellIndex` is the next correct step.
 * @param grid - the shuffled values from {@link makeGrid}.
 * @param expected - the number that must be found next (1-based).
 * @param cellIndex - flat index of the clicked cell.
 */
export function isCorrectClick(grid: number[], expected: number, cellIndex: number): boolean {
  return grid[cellIndex] === expected
}

/**
 * Score for a finished run. The choice documented here: the +500ms penalty
 * per wrong click is applied INSIDE this function, so callers pass raw
 * wall-clock elapsed time. Faster → higher, monotonically non-increasing,
 * clamped at 1 once the penalized total reaches the 60s cap.
 */
export function scoreFor(elapsedMs: number, wrongCount: number): number {
  const total = elapsedMs + wrongCount * WRONG_PENALTY_MS
  return Math.max(1, SCORE_BASE_MS - Math.floor(total))
}
