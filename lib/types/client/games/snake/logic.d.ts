/**
 * Snake pure logic: a grid-based snake that grows by eating food and dies on
 * the walls or its own body. Deterministic functions over a plain state
 * object — the game instance in index.ts drives this with requestAnimationFrame
 * and keyboard input, and the unit tests drive it directly.
 */
export interface Pos {
    r: number;
    c: number;
}
export interface SnakeState {
    cols: number;
    rows: number;
    /** Snake body cells, head first. */
    snake: Pos[];
    /** Current travel direction. */
    dir: 0 | 1 | 2 | 3;
    food: Pos;
    /** Food eaten (score). */
    score: number;
    over: boolean;
    rng: () => number;
}
export declare const DEFAULT_COLS = 16;
export declare const DEFAULT_ROWS = 12;
/** A fresh snake: 3 cells in the middle, moving right, food placed elsewhere. */
export declare function createSnakeState(rng?: () => number): SnakeState;
/** A random empty cell becomes the new food. */
export declare function placeFood(state: SnakeState): void;
/** Change direction (no 180° reversal). */
export declare function turn(state: SnakeState, dir: 0 | 1 | 2 | 3): void;
/**
 * Advance one tick: move the head, handle food / self collision. The board is
 * a torus — crossing a wall wraps the snake to the opposite side.
 */
export declare function stepSnake(state: SnakeState): void;
