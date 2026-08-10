/**
 * Huarong (15-puzzle) canvas renderer: 4x4 numbered tiles that slide into the
 * empty cell, a HUD (moves + time), and a solved overlay. Palette tuned for
 * the DSH dark shell.
 */
import type { HuarongState, Slide } from './logic.ts';
export declare const CELL = 72;
export declare const HUD_H = 40;
export declare const BOARD_W: number;
export declare const BOARD_H: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** What the game wants rendered this frame. */
export interface HuarongView {
    /** Active slide animation (moving tiles interpolate from -> to). */
    slides: {
        entries: Slide[];
        t: number;
    } | null;
    solved: boolean;
}
/** Draw one frame. `board` is the (already-updated) logical board. */
export declare function renderHuarong(ctx: CanvasRenderingContext2D, state: HuarongState, view: HuarongView): void;
