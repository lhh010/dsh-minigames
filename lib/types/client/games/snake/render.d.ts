/**
 * Snake canvas renderer: the grid, the snake (head brighter, body segments),
 * the food, and a game-over overlay. Palette tuned for the DSH dark shell.
 */
import type { SnakeState } from './logic.ts';
export declare const CELL = 26;
export declare const HUD_H = 30;
export declare const BOARD_W: number;
export declare const BOARD_H: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** Draw one frame. */
export declare function renderSnake(ctx: CanvasRenderingContext2D, state: SnakeState): void;
