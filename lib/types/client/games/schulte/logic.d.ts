/**
 * 舒尔特方格 Schulte Grid pure logic: an n×n grid holding the numbers
 * 1..n² shuffled; cells must be clicked in ascending order. Deterministic
 * functions only — no DOM, no timers.
 */
/** Wall-clock time added to a run per wrong click; applied inside {@link scoreFor}. */
export declare const WRONG_PENALTY_MS = 500;
/** Score headroom: a run at this total time (or slower) scores the clamp of 1. */
export declare const SCORE_BASE_MS = 60000;
/** Grid ramp cap: level grids grow 3×3 → 7×7 and stay there. */
export declare const MAX_GRID = 7;
/** Deterministic mulberry32 PRNG (see lightsout/logic.ts precedent). */
export declare function mulberry32(seed: number): () => number;
/** Grid side for a level: 3 at level 1, +1 per level, capped at 7. */
export declare function gridSizeFor(level: number): number;
/**
 * The shuffled 1..n² cell values, deterministically from the seed
 * (Fisher–Yates over mulberry32). Same seed → same grid.
 */
export declare function makeGrid(seed: number, n: number): number[];
/**
 * Whether clicking cell `cellIndex` is the next correct step.
 * @param grid - the shuffled values from {@link makeGrid}.
 * @param expected - the number that must be found next (1-based).
 * @param cellIndex - flat index of the clicked cell.
 */
export declare function isCorrectClick(grid: number[], expected: number, cellIndex: number): boolean;
/**
 * Score for a finished run. The choice documented here: the +500ms penalty
 * per wrong click is applied INSIDE this function, so callers pass raw
 * wall-clock elapsed time. Faster → higher, monotonically non-increasing,
 * clamped at 1 once the penalized total reaches the 60s cap.
 */
export declare function scoreFor(elapsedMs: number, wrongCount: number): number;
