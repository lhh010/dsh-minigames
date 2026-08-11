/**
 * Flappy canvas renderer: sky gradient, scrolling pipes, a yellow bird with a
 * flapping wing, a score HUD, and a game-over overlay.
 */
import type { FlappyState } from './logic.ts';
export declare const HUD_H = 30;
export declare const LOGICAL_W = 300;
export declare const LOGICAL_H: number;
/** Draw one frame. */
export declare function renderFlappy(ctx: CanvasRenderingContext2D, state: FlappyState, wingT: number): void;
