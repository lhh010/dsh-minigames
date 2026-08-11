/**
 * Breakout canvas renderer: the brick wall, the paddle, the ball, and the
 * HUD. Brick colors come from the brick's own color field (stable when other
 * bricks are destroyed), and the ball is drawn in its current color.
 */
import type { BreakoutState } from './logic.ts';
export declare const LOGICAL_W = 480;
export declare const LOGICAL_H = 320;
/** Draw one frame. */
export declare function renderBreakout(ctx: CanvasRenderingContext2D, state: BreakoutState): void;
