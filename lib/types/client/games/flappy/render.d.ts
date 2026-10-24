/**
 * Flappy canvas renderer: themed background, scrolling pipes, a gold bird
 * with a flapping wing, a score HUD, and the shared game-over overlay. Score
 * gains fire particle bursts at the bird.
 */
import type { FlappyState } from './logic.ts';
export declare const HUD_H = 30;
export declare const LOGICAL_W = 300;
export declare const LOGICAL_H: number;
/**
 * Draw one frame.
 * @param wingT - running seconds counter driving the wing flap.
 * @param paused - show the pause overlay.
 */
export declare function renderFlappy(ctx: CanvasRenderingContext2D, state: FlappyState, wingT: number, paused: boolean): void;
