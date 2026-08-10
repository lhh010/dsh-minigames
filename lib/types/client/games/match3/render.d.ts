/**
 * Match-3 (消消乐) canvas renderer: a HUD strip (level, score/target progress),
 * the gem board, the click-removal animation (flash + falling gems), and the
 * win/lose overlays. Palette tuned for the DSH dark shell.
 */
import type { Match3State, Position } from './logic.ts';
export declare const CELL = 44;
/** Board dimensions in cells (square). */
export declare const BOARD_CELLS = 8;
export declare const HUD_H = 40;
export declare const BOARD_W: number;
export declare const BOARD_H: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** What the game wants rendered this frame. */
export interface Match3View {
    /** Keyboard cursor cell. */
    cursor: Position | null;
    /** Clear animation: removed cells flashing, kept cells falling. */
    clear: {
        removed: Position[];
        falls: {
            from: Position;
            to: Position;
        }[];
        /** 0..1 */
        t: number;
        /** Score popup text, e.g. "+160". */
        scoreText: string;
    } | null;
    result: Match3State['result'];
}
/** The grid the renderer draws (the pre-removal grid during the clear phase). */
export type DisplayGrid = number[][];
/** Draw one frame. `grid` is the display grid (pre-removal during the clear phase). */
export declare function renderMatch3(ctx: CanvasRenderingContext2D, state: Match3State, grid: DisplayGrid, view: Match3View): void;
