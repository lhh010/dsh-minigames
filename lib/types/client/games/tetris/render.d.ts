/**
 * Tetris canvas renderer: the 10x20 board, the current piece with its ghost,
 * and the next/hold previews on the right. Palette tuned for the DSH dark
 * shell.
 */
import { type TetrisState } from './board.ts';
export declare const BOARD_W: number;
export declare const BOARD_H: number;
/** Full logical canvas width: the board plus the preview column. */
export declare const LOGICAL_W: number;
/** Draw one frame of the game. */
export declare function renderTetris(ctx: CanvasRenderingContext2D, state: TetrisState): void;
