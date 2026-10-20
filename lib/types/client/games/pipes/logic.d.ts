/**
 * 接水管 (Pipes) pure logic: solvable level generation (a random
 * source-to-sink path is laid first, the rest is random filler, then
 * rotations are scrambled while a known-good config is kept), tile
 * rotation, water connectivity BFS, and win/timeout state. Deterministic
 * given an injected rng; no DOM, no timers.
 */
/** Directions: 0 up, 1 right, 2 down, 3 left. */
export declare const DR: readonly [-1, 0, 1, 0];
export declare const DC: readonly [0, 1, 0, -1];
export type PipeType = 'straight' | 'elbow' | 'tee' | 'cross' | 'source' | 'sink';
export interface PipeTile {
    type: PipeType;
    /** Quarter turns applied to the base shape (0..3); cross is fixed at 0. */
    rotation: number;
}
export interface Cell {
    r: number;
    c: number;
}
/** One generated board: the playable tiles plus the guaranteed solution. */
export interface PipesLevel {
    size: number;
    tiles: PipeTile[][];
    source: Cell;
    sink: Cell;
    /** Known-good rotation per cell; applying it always connects source→sink. */
    solution: number[][];
}
export type PipesStatus = 'playing' | 'won' | 'over';
export interface PipesState {
    /** 1-based level number; drives the board size. */
    level: number;
    score: number;
    /** Countdown in seconds; frozen unless status is 'playing'. */
    timeLeft: number;
    status: PipesStatus;
    board: PipesLevel;
    rng: () => number;
}
/** Score awarded per connected level. */
export declare const WIN_SCORE = 200;
/** Countdown per level in seconds. */
export declare const LEVEL_TIME_S = 90;
export declare const MIN_SIZE = 5;
export declare const MAX_SIZE = 8;
/**
 * The opening bitmask of a tile: each base opening rotated by `rotation`
 * quarter turns clockwise.
 */
export declare function openings(tile: PipeTile): number;
/** Whether the tile opens toward direction `d`. */
export declare function hasOpening(tile: PipeTile, d: number): boolean;
/** Board size for a level: starts at 5, +1 every 3 levels, capped at 8. */
export declare function levelSize(level: number): number;
/**
 * Generate a solvable board: one source tile on the left edge and one sink
 * tile on the right edge, a random simple path of straights/elbows between
 * them (the tracked solution), random filler elsewhere, then scrambled
 * rotations that leave at least one known-good config (applying `solution`
 * always wins).
 * @param size - board dimension (size x size).
 * @param rng - injected random source for determinism.
 */
export declare function generateLevel(size: number, rng: () => number): PipesLevel;
/**
 * BFS from the source through matching pipe openings; a cell is water-filled
 * when reached. The sink being reached is the win.
 */
export declare function connectedCells(tiles: PipeTile[][], size: number, source: Cell): boolean[][];
/** Whether the sink is water-filled on the given tiles. */
export declare function levelConnected(tiles: PipeTile[][], size: number, source: Cell, sink: Cell): boolean;
/**
 * Rotate a tile one quarter turn clockwise. No-op outside 'playing', on the
 * fixed tiles (source/sink/cross), or out of bounds.
 * @returns true when a rotation was applied.
 */
export declare function rotateTile(state: PipesState, r: number, c: number): boolean;
/**
 * Check for a win after a rotation: when water reaches the sink, mark the
 * level won and award {@link WIN_SCORE}.
 * @returns true on the playing→won transition.
 */
export declare function checkWin(state: PipesState): boolean;
/**
 * Advance the countdown while playing; hitting zero ends the game.
 * @param dt - elapsed seconds (the caller freezes the clock on pause).
 */
export declare function tick(state: PipesState, dt: number): void;
/** Move to the next level: bigger board (per {@link levelSize}) and a fresh countdown. */
export declare function advanceLevel(state: PipesState): void;
/**
 * A fresh state on the given level.
 * @param level - 1-based level number.
 * @param score - score carried in from previous levels.
 * @param rng - injected random source for determinism.
 */
export declare function createPipesState(level?: number, score?: number, rng?: () => number): PipesState;
