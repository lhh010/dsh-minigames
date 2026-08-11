/**
 * Pseudo-3D racing canvas renderer. A single perspective projection maps world
 * coordinates (lateral x ∈ [-1,1], depth z ≥ 0) to screen pixels; the road
 * trapezoid, lane markings, roadside objects, obstacles, and the player car
 * all use the same projection so everything aligns. The road is a full
 * trapezoid whose top edge meets the horizon; scrolling rumble stripes are
 * clipped inside it. Palette shifts with score (day → sunset → night).
 */
import type { RacingState } from './logic.ts';
import { VIEW_W, VIEW_H } from './logic.ts';
export { VIEW_W };
export { VIEW_H };
/** Draw one frame. */
export declare function renderRacing(ctx: CanvasRenderingContext2D, state: RacingState): void;
