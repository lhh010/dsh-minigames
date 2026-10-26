/**
 * 泡泡龙 pure logic: a hex-grid (offset rows) bubble shooter. A shot flies
 * straight, bounces off the side walls, and snaps to the nearest empty cell
 * adjacent to the stack (or the ceiling row). 3+ connected same-color
 * bubbles pop; bubbles left unconnected to the ceiling then fall. Clearing
 * the field advances the level; settling at or below the lose row ends the
 * run.
 *
 * All randomness flows through an injected mulberry32 rng so runs are
 * deterministic under a seed. The renderer (render.ts) only draws state.
 */
export declare const COLS = 8;
export declare const R = 18;
export declare const D: number;
export declare const ROW_H: number;
export declare const PLAY_X = 20;
export declare const PLAY_W: number;
export declare const LOGICAL_W: number;
export declare const CEIL_Y = 54;
/** First row that counts as "below the bottom line" (a settle there loses). */
export declare const LOSE_ROW = 12;
export declare const GRID_ROWS: number;
export declare const SHOOTER_X: number;
export declare const SHOOTER_Y = 480;
export declare const LOGICAL_H = 540;
export declare const POP_MIN = 3;
export declare const POP_POINTS = 10;
export declare const FALL_POINTS = 20;
export declare const SHOT_SPEED = 520;
/** Fire nudges a near-horizontal aim up by this so shots always rise. */
export declare const AIM_EPS = 0.02;
/** Center distance at which a flying bubble counts as touching the stack. */
export declare const COLLIDE_D: number;
export declare const MAX_COLORS = 6;
export type Cell = {
    r: number;
    c: number;
};
export type GameResult = 'playing' | 'paused' | 'won' | 'over';
export interface Flying {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: number;
}
export type BubbleEvent = {
    kind: 'snap';
    cell: Cell;
    color: number;
} | {
    kind: 'bounce';
    side: -1 | 1;
} | {
    kind: 'pop';
    cells: Cell[];
    color: number;
} | {
    kind: 'fall';
    cells: Cell[];
} | {
    kind: 'clear';
} | {
    kind: 'over';
};
export interface BubbleState {
    result: GameResult;
    level: number;
    score: number;
    /** grid[row][col] = color index, or null for empty. */
    grid: (number | null)[][];
    /** Color index loaded in the shooter. */
    current: number;
    /** Color index queued after the loaded one. */
    next: number;
    /** Aim angle in radians within [0, π]; π/2 is straight up. */
    aim: number;
    flying: Flying | null;
    seed: number;
    rng: () => number;
    /** Events emitted by the last step (audio/particle triggers in the glue). */
    events: BubbleEvent[];
}
/** mulberry32 seeded PRNG. */
export declare function mulberry32(seed: number): () => number;
/** Center x of cell (r, c); odd rows are offset right by half a bubble. */
export declare function cellX(r: number, c: number): number;
/** Center y of row r (row 0 hangs from the ceiling). */
export declare function cellY(r: number): number;
export declare function cellCenter(r: number, c: number): {
    x: number;
    y: number;
};
export declare function inGrid(r: number, c: number): boolean;
/** Columns present in row r (even rows COLS, odd rows COLS - 1). */
export declare function colsIn(r: number): number;
/** The up to 6 hex neighbors of (r, c) that exist in the grid. */
export declare function neighborsOf(r: number, c: number): Cell[];
/** Rows of bubbles a level starts with: level N → 4+N rows, wrapping at 5. */
export declare function initialRows(level: number): number;
/** Distinct palette size: 5 colors early, 6 from level 4 on. */
export declare function colorsForLevel(level: number): number;
export declare function emptyGrid(): (number | null)[][];
/** Color index for the next loaded bubble: only colors still on the board. */
export declare function nextColor(state: BubbleState): number;
/** A fresh state at `level` (defaults to 1) playing immediately. */
export declare function createState(seed?: number, level?: number): BubbleState;
/** Enter the next level with a fresh board, keeping the running score. */
export declare function advanceLevel(state: BubbleState): void;
/** Restart the CURRENT level: same seed → the identical initial board, score 0. */
export declare function restartLevel(state: BubbleState): void;
/**
 * Clamp an aim angle to [0, π]. Downward angles in atan2's range fold to
 * the nearer horizontal; anything further under truncates to 0 (plain
 * clamp, e.g. a large negative adjustAim delta).
 */
export declare function clampAim(a: number): number;
/** Move the aim by `delta` radians, clamped to [0, π]; ← increases it. */
export declare function adjustAim(state: BubbleState, delta: number): void;
/** Aim the shooter at a logical-space point (mouse aiming). */
export declare function aimAt(state: BubbleState, x: number, y: number): void;
/**
 * Fire the loaded bubble along the aim. Only while playing and with no shot
 * in flight; near-horizontal aims are nudged up so the shot always rises.
 */
export declare function fire(state: BubbleState): boolean;
/**
 * The empty cell a bubble at (x, y) snaps to: the nearest empty cell that is
 * in the ceiling row or adjacent to an occupied cell. Ties resolve to the
 * smallest (r, c) so the snap is deterministic. Null when no cell qualifies.
 */
export declare function findSnapCell(grid: (number | null)[][], x: number, y: number): Cell | null;
/** All same-color cells connected to (r, c) (including it), by BFS. */
export declare function connectedSameColor(grid: (number | null)[][], r: number, c: number): Cell[];
/** Occupied cells connected to the ceiling (directly or through neighbors). */
export declare function attachedCells(grid: (number | null)[][]): Set<string>;
/**
 * Advance the simulation by dt seconds: move the flying bubble, bounce it
 * off the side walls, and settle it on ceiling/stack contact. Mutates the
 * state in place (the renderer reads it directly).
 */
export declare function step(state: BubbleState, dt: number): void;
/** Toggle between playing and paused; no-op otherwise. */
export declare function togglePause(state: BubbleState): void;
