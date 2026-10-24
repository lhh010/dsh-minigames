/**
 * 2048 canvas renderer: a 4x4 board of rounded glowing tiles colored by the
 * shared accent ramp (stable per tile value), a score HUD, and shared
 * win/game-over overlays. Score gains fire a particle burst at the board.
 */
import type { Game2048State } from './logic.ts';
export declare const CELL = 64;
export declare const GAP = 8;
export declare const HUD_H = 36;
export declare const BOARD_W: number;
export declare const BOARD_H: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/**
 * Draw one frame.
 * @param paused - show the pause overlay.
 */
export declare function render2048(ctx: CanvasRenderingContext2D, state: Game2048State, paused: boolean): void;
