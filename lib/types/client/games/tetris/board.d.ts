/**
 * Tetris pure logic: board, pieces, rotation with simple wall kicks, locking,
 * line clearing, scoring, and hold. Deterministic functions over a plain
 * state object — the game instance in index.ts drives this with a gravity
 * timer, and the unit tests drive it directly.
 */
export declare const COLS = 10;
export declare const ROWS = 20;
/** A tetromino shape matrix (rows of 0/1); 3x3 except I (4x4). */
export type Shape = number[][];
export interface Piece {
    /** Kind id 1..7 (also the cell/color id). */
    kind: number;
    shape: Shape;
    /** Top-left of the shape matrix in grid coordinates. */
    x: number;
    y: number;
}
export interface TetrisState {
    /** ROWS x COLS; 0 empty, 1..7 filled with that kind's color. */
    grid: number[][];
    current: Piece | null;
    next: Piece | null;
    /** Held piece (or null when the hold slot is empty). */
    hold: Piece | null;
    /** One hold per piece: reset when the current piece locks. */
    canHold: boolean;
    score: number;
    lines: number;
    level: number;
    over: boolean;
    rng: () => number;
}
/** Empty grid, fresh state, and the first two pieces spawned. */
export declare function createTetrisState(rng?: () => number): TetrisState;
/** Whether the piece overlaps the walls, the floor, or filled cells. */
export declare function collides(grid: number[][], piece: Piece): boolean;
/** Promote the next piece to current (used at start and after each lock). */
export declare function spawn(state: TetrisState): void;
/** Try to move the current piece; gravity (dy=1) that fails locks instead. */
export declare function move(state: TetrisState, dx: number, dy: number): boolean;
/** Rotate the current piece CW (dir 1) or CCW (dir -1) with simple wall kicks. */
export declare function rotate(state: TetrisState, dir: 1 | -1): boolean;
/** Drop the current piece to the floor and lock it. Returns the cells dropped. */
export declare function hardDrop(state: TetrisState): number;
/** Remove full rows (returning how many) and compact the grid above. */
export declare function clearFullRows(grid: number[][]): number;
/** Swap the current piece with the hold slot (once per piece). */
export declare function holdPiece(state: TetrisState): void;
/** Gravity interval in ms for a level (levels speed up, floor at 120ms). */
export declare function gravityInterval(level: number): number;
/** Ghost drop y: where the current piece would land. */
export declare function ghostY(state: TetrisState): number;
