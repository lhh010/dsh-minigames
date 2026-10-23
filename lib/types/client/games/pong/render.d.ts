/**
 * Pong canvas renderer on the shared theme kit: gradient arena with a dashed
 * center line, glowing paddles (player accent(0), AI accent(4)), a glowing
 * ball with a white core, 我方/对方/回合 HUD, serve countdown hint, particle
 * burst on every goal, and the win/lose overlay.
 */
import type { PongState } from './logic.ts';
export declare const PONG_W = 480;
export declare const PONG_H = 640;
/** Draw one frame. */
export declare function renderPong(ctx: CanvasRenderingContext2D, state: PongState): void;
