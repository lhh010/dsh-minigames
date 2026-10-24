/**
 * Peg Solitaire canvas renderer: the 7×7 cross board with glowing pegs,
 * cursor ring, selected source highlight and landing hints, a 关卡/剩余
 * HUD, plus stuck and win overlays. Uses the shared visual kit (../theme.ts);
 * all state (board, cursor, selection) is decided by the caller and passed
 * in, so the renderer stays stateless.
 */
import { type PegBoard } from './logic.ts';
export declare const HUD_H = 32;
export declare const CELL = 34;
export declare const MARGIN = 10;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** Center of hole `index` in logical space. */
export declare function holeCenter(index: number): {
    x: number;
    y: number;
};
/** Which hole index a logical-space point lands on (or null outside holes). */
export declare function holeAt(x: number, y: number): number | null;
export interface PegRenderState {
    board: PegBoard;
    cursor: number | null;
    selected: number | null;
    /** Legal landing holes for the current selection (drawn as hint dots). */
    hints: number[];
    /** 1-based level number for the HUD. */
    levelDisplay: number;
    levelName: string;
    /** Pegs cleared so far this round (start − remaining); drives the stuck overlay. */
    cleared: number;
    toast: string | null;
    win: boolean;
    stuck: boolean;
}
/** Draw one frame of the board; overlays cover the scene on win/stuck/pause. */
export declare function renderPeg(ctx: CanvasRenderingContext2D, state: PegRenderState, paused: boolean): void;
