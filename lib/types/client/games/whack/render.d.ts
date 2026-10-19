/**
 * Whack-a-mole canvas renderer on the shared theme kit: gradient backdrop,
 * a rounded grass panel with themed holes, glowing moles, a hudPair HUD,
 * hit particle bursts (observed from score + mole-set diffs), and a themed
 * round-over overlay.
 */
import type { WhackState } from './logic.ts';
export declare const CELL = 64;
export declare const COLS = 5;
export declare const ROWS = 5;
export declare const HUD_H = 30;
export declare const BOARD_W: number;
export declare const BOARD_H: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** Draw one frame. */
export declare function renderWhack(ctx: CanvasRenderingContext2D, state: WhackState): void;
