/**
 * 2048 canvas renderer: a 4x4 board of tiles with power-of-two colors, a score
 * HUD, and win/game-over overlays. Palette tuned for the DSH dark shell.
 */
import type { Game2048State } from './logic.ts';
export declare const CELL = 64;
export declare const GAP = 8;
export declare const HUD_H = 36;
export declare const BOARD_W: number;
export declare const BOARD_H: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** Draw one frame. */
export declare function render2048(ctx: CanvasRenderingContext2D, state: Game2048State): void;
