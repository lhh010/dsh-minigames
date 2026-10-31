/**
 * 过河青蛙 canvas renderer: road lanes as alternating strips, glowing cars
 * with direction headlights, the frog as a rounded body with eyes, safe rows
 * (goal/start), and game-over/pause overlays. Cars are drawn from the pure
 * lane specs at the current sim time — the renderer owns no state.
 */
import type { FroggerLevel } from './logic.ts';
export declare const HUD_H = 32;
export declare const CELL = 42;
export declare const FIELD_W: number;
export declare const FIELD_H: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** Row y origin (each row is one lane; row 0 = goal, row LANES+1 = start). */
export declare function rowY(row: number): number;
/** Center of a board cell (row 0..LANES+1, col 0..COLS-1). */
export declare function cellCenter(row: number, col: number): {
    x: number;
    y: number;
};
/** Draw one frame.
 * @param t - simulation seconds (car positions).
 * @param frog - frog position {row, col} (row 0 = goal, LANES+1 = start).
 * @param dead - death flash: frog drawn red instead of green.
 * @param lives - remaining lives for the HUD.
 * @param score - total score for the HUD.
 * @param levelNo - 1-based display level.
 * @param paused - show the pause overlay.
 * @param gameOver - game-over overlay instead of pause.
 */
export declare function renderFrogger(ctx: CanvasRenderingContext2D, level: FroggerLevel, t: number, frog: {
    row: number;
    col: number;
}, dead: boolean, lives: number, score: number, levelNo: number, paused: boolean, gameOver: boolean): void;
