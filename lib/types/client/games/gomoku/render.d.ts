/**
 * Gomoku canvas renderer: the 15x15 board with grid lines and stones, a turn
 * HUD, a win overlay, and a particle burst on game end. Uses the shared
 * visual kit (../theme.ts).
 */
import type { GomokuState } from './logic.ts';
export declare const CELL = 24;
export declare const HUD_H = 32;
export declare const BOARD_W: number;
export declare const BOARD_H: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/**
 * Draw one frame.
 * @param paused - show the pause overlay.
 */
export declare function renderGomoku(ctx: CanvasRenderingContext2D, state: GomokuState, paused: boolean): void;
