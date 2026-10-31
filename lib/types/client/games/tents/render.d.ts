/**
 * 露营帐篷 canvas renderer: an n×n field of trees/tents with row and column
 * tent-count clues along the edges, a cursor ring, and win/pause overlays.
 * Stateless — all state is caller-owned; uses the shared visual kit
 * (../theme.ts).
 */
import type { TentsPuzzle } from './logic.ts';
export declare const HUD_H = 32;
export declare const GAP = 6;
/** Cell edge shrinks with board size so the whole field fits the canvas. */
export declare function cellSize(size: number): number;
/** Clue strip width (row/col tent counts) on the left and top edges. */
export declare const CLUE_W = 26;
export declare function boardW(size: number): number;
export declare function logicalW(size: number): number;
export declare function logicalH(size: number): number;
export interface Cursor {
    r: number;
    c: number;
}
/** Top-left corner of cell (r, c) in logical space. */
export declare function cellOrigin(size: number, r: number, c: number): {
    x: number;
    y: number;
};
/** Which cell a logical-space point lands on, or null. */
export declare function cellAt(size: number, x: number, y: number): number;
/** Center of a cell in logical space (particle bursts). */
export declare function cellCenter(size: number, cellIdx: number): {
    x: number;
    y: number;
};
/**
 * Draw one frame.
 * @param tents - placed tent cells.
 * @param cursor - keyboard-focused cell, or -1 to hide the focus ring.
 * @param errors - cells the win check flags (row/col overflow), drawn red.
 * @param paused - show the pause overlay.
 * @param winText - level-clear overlay subtitle, or null while playing.
 */
export declare function renderTents(ctx: CanvasRenderingContext2D, puzzle: TentsPuzzle, tents: readonly number[], cursor: number, errors: readonly number[], paused: boolean, winText: string | null): void;
