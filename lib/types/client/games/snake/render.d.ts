/**
 * Snake canvas renderer: the shared gradient background with a faint grid,
 * rounded glowing snake segments (head brightest), glowing food, a score HUD,
 * and a game-over overlay. Eat bursts are render-side observations only.
 */
import type { SnakeState } from './logic.ts';
export declare const CELL = 26;
export declare const HUD_H = 30;
export declare const BOARD_W: number;
export declare const BOARD_H: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/**
 * Draw one frame.
 * @param paused - show the pause overlay.
 */
export declare function renderSnake(ctx: CanvasRenderingContext2D, state: SnakeState, paused: boolean): void;
