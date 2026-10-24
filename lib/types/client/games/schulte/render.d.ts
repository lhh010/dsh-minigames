export declare const HUD_H = 32;
/** Fixed square board area; the per-level cell size derives from it. */
export declare const BOARD_W = 336;
export declare const GAP = 12;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** One in-flight wrong-click flash; ageMs counts from the click. */
export interface WrongFlash {
    index: number;
    ageMs: number;
}
/** Cell side for a level's grid side. */
export declare function cellSize(level: number): number;
/** Which cell a logical-space point lands on, or -1. */
export declare function cellAt(x: number, y: number, level: number): number;
/** Center of a cell in logical space (particle bursts). */
export declare function cellCenter(index: number, level: number): {
    x: number;
    y: number;
};
/**
 * Draw one frame.
 * @param grid - shuffled 1..n² values from makeGrid.
 * @param level - 1-based level (derives the grid size and seed).
 * @param lockedCount - numbers 1..lockedCount are already locked (next = +1).
 * @param wrong - active wrong-click red flash, or null.
 * @param elapsedMs - penalized elapsed time for the 用时 HUD.
 * @param wrongCount - total wrong clicks for the 误点 HUD.
 * @param paused - show the pause overlay.
 * @param winText - finish overlay subtitle, or null while playing.
 */
export declare function renderSchulte(ctx: CanvasRenderingContext2D, w: number, h: number, grid: number[], level: number, lockedCount: number, wrong: WrongFlash | null, elapsedMs: number, wrongCount: number, paused: boolean, winText: string | null): void;
