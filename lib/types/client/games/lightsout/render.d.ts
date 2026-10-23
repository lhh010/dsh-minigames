/**
 * Lights Out canvas renderer: a 5x5 grid of glowing cells (accent color
 * alternating by (r+c) parity), a 关卡/步数 HUD, and overlays for pause and
 * level-clear. State (cursor, win flash) is caller-owned; the renderer stays
 * stateless and uses the shared visual kit (../theme.ts).
 */
import { type Board } from './logic.ts';
export declare const HUD_H = 32;
export declare const GAP = 12;
export declare const CELL = 56;
export declare const BOARD_W: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
export interface Cursor {
    r: number;
    c: number;
}
/** Which cell a logical-space point lands on, or null. */
export declare function cellAt(x: number, y: number): Cursor | null;
/** Center of a cell in logical space (particle bursts). */
export declare function cellCenter(r: number, c: number): {
    x: number;
    y: number;
};
/**
 * Draw one frame.
 * @param cursor - keyboard-focused cell, or null to hide the focus ring.
 * @param paused - show the pause overlay.
 * @param winText - level-clear overlay subtitle, or null while playing.
 */
export declare function renderLights(ctx: CanvasRenderingContext2D, w: number, h: number, board: Board, cursor: Cursor | null, level: number, moves: number, paused: boolean, winText: string | null): void;
