/**
 * Color Lines (五连珠) pure logic: a 9x9 board of colored balls. A move
 * slides one ball to an empty cell reachable over a clear orthogonal path
 * (BFS); 5+ in a row (orthogonal or diagonal) of one color clears and
 * scores 10 × n × (n−4). A clearing move spawns no new balls; otherwise 3
 * spawn on random empty cells. A full board ends the game. Deterministic
 * functions over a plain state object with an injected rng.
 */
export declare const SIZE = 9;
export declare const COLOR_COUNT = 7;
export declare const SPAWN_PER_TURN = 3;
export declare const CLEAR_LEN = 5;
export interface Position {
    r: number;
    c: number;
}
export interface ColorLinesState {
    /** SIZE x SIZE; 0 = empty, 1..COLOR_COUNT = ball color id. */
    grid: number[][];
    score: number;
    over: boolean;
    rng: () => number;
}
/** Score for one cleared line of `n` balls (5→50, 6→120, 7→210, ...). */
export declare function scoreForLine(n: number): number;
/** All empty cells in row-major order. */
export declare function emptyCells(grid: number[][]): Position[];
/** Spawn `count` random balls on empty cells (fewer only when the board runs out). */
export declare function spawnBalls(state: ColorLinesState, count?: number): number;
/** A fresh board with the opening spawn. */
export declare function createColorLinesState(rng?: () => number): ColorLinesState;
/**
 * Whether a ball at `from` can slide to the empty cell `to` over a clear
 * orthogonal path (any length; the path itself walks only empty cells).
 */
export declare function hasPath(grid: number[][], from: Position, to: Position): boolean;
/**
 * Every cell on a 5+ run of one color (whole-board scan in the 4 line
 * directions). Overlapping runs merge their cells; score sums per run.
 */
export declare function findClearing(grid: number[][]): {
    cells: Position[];
    gained: number;
};
/** Outcome of one attempted move. */
export interface MoveResult {
    moved: boolean;
    /** Cleared cells (empty when the move cleared nothing). */
    cleared: Position[];
    gained: number;
}
/**
 * Slide the ball `from` to the empty cell `to`. Legal moves then clear any
 * 5+ lines (no spawn that turn) or spawn 3 new balls; a full board with no
 * clear ends the game.
 */
export declare function moveBall(state: ColorLinesState, from: Position, to: Position): MoveResult;
