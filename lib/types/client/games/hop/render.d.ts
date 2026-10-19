/**
 * 跳一跳 canvas renderer: platforms receding in perspective, the player cube
 * with a ground shadow that shrinks with height, a charge bar, a game-over
 * overlay, and a particle burst on each landing score. Uses the shared
 * visual kit (../theme.ts).
 */
import type { HopState } from './logic.ts';
export declare const VIEW_W = 360;
export declare const VIEW_H = 300;
export declare const GROUND_Y = 250;
/** Draw one frame. */
export declare function renderHop(ctx: CanvasRenderingContext2D, state: HopState): void;
