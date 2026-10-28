/**
 * Zuma renderer: the S-curve track ribbon, the sink hole, the chain balls
 * (tail-first so the head paints on top), the flying shot with an aim
 * guide, the shooter with the next-ball preview, HUD, and overlays. All
 * drawing happens in the fixed logical space (LOGICAL_W x LOGICAL_H).
 */
import { LOGICAL_H, LOGICAL_W, type ZumaState } from './logic.ts';
import { glow, noGlow } from '../theme.ts';
export interface ZumaView {
    state: ZumaState;
    paused: boolean;
}
/** Draw one frame. */
export declare function renderZuma(ctx: CanvasRenderingContext2D, view: ZumaView): void;
export { LOGICAL_W, LOGICAL_H, glow, noGlow };
