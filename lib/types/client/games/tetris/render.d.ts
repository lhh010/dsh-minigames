/**
 * Tetris canvas renderer on the shared theme kit: gradient backdrop, a
 * themed board with glowing rounded blocks and a ghost outline, accent-per-
 * kind piece colors, hudPair stats, a clear-line particle burst (observed
 * from the lines counter), and a themed game-over overlay.
 */
import { type TetrisState } from './board.ts';
export declare const BOARD_W: number;
export declare const BOARD_H: number;
/** Full logical canvas width: the board plus the preview column. */
export declare const LOGICAL_W: number;
/** Draw one frame of the game. */
export declare function renderTetris(ctx: CanvasRenderingContext2D, state: TetrisState): void;
