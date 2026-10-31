/**
 * 四角填方 canvas renderer: an n×n field with area-number clues, committed
 * rectangles as translucent accent blocks, the in-progress drag rectangle,
 * and win/pause overlays. Stateless — state is caller-owned; uses the shared
 * visual kit (../theme.ts).
 */
import type { Rect, ShikakuPuzzle } from './logic.ts';
export declare const HUD_H = 32;
export declare const GAP = 6;
/** Cell edge shrinks with board size so the whole field fits the canvas. */
export declare function cellSize(size: number): number;
export declare function boardW(size: number): number;
export declare function logicalW(size: number): number;
export declare function logicalH(size: number): number;
/** Top-left corner of cell (r, c) in logical space. */
export declare function cellOrigin(size: number, r: number, c: number): {
    x: number;
    y: number;
};
/** Which cell a logical-space point lands on, or null. */
export declare function cellAt(size: number, x: number, y: number): {
    r: number;
    c: number;
} | null;
/** Pixel rect (x, y, w, h) of a cell-range rect, gaps included. */
export declare function rectPixels(size: number, rect: Rect): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * Draw one frame.
 * @param rects - committed rectangles.
 * @param drag - in-progress rect (anchor cell → current cell), or null.
 * @param dragOk - whether the drag rect satisfies its clue (green vs red).
 * @param paused - show the pause overlay.
 * @param winText - level-clear overlay subtitle, or null while playing.
 */
export declare function renderShikaku(ctx: CanvasRenderingContext2D, puzzle: ShikakuPuzzle, rects: readonly Rect[], drag: Rect | null, dragOk: boolean, paused: boolean, winText: string | null): void;
