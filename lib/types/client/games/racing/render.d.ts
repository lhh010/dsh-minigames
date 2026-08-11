/**
 * Pseudo-3D racing canvas renderer: a perspective road stretching to a
 * horizon, obstacles that scale up as they approach, a car sprite at the
 * bottom, roadside scenery, and a speed/score HUD. Palette shifts with score
 * (day → sunset → night → day ...) for variety.
 */
import type { RacingState } from './logic.ts';
export declare const VIEW_W = 480;
export declare const VIEW_H = 320;
/** Draw one frame. */
export declare function renderRacing(ctx: CanvasRenderingContext2D, state: RacingState): void;
