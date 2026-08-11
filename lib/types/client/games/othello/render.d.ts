/**
 * Othello canvas renderer: a green 8x8 board, black/white discs, legal-move
 * hints for the player, a disc-count HUD, and a game-over overlay.
 */
import type { OthelloState } from './logic.ts';
export declare const CELL = 44;
export declare const HUD_H = 30;
export declare const BOARD_W: number;
export declare const BOARD_H: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** Draw one frame. */
export declare function renderOthello(ctx: CanvasRenderingContext2D, state: OthelloState): void;
