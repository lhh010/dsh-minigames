/**
 * Mini Bowling renderer: the top-down lane (wood boards, gutters, foul line,
 * aim arrows, pin deck), pins with red necks, the marbled ball, the aim
 * arrow, power meter and spin indicator, the frame/score HUD, and the shared
 * overlays. All drawing happens in the fixed logical space; the lane's world
 * coordinates (LANE_W × LANE_H) map 1:1 through a uniform scale.
 */
import { type BowlingState } from './logic.ts';
export declare const LOGICAL_W = 340;
export declare const LOGICAL_H = 700;
export interface BowlingView {
    state: BowlingState;
    paused: boolean;
    best: number;
}
/** Draw the whole scene (call once per rendered frame). */
export declare function renderBowling(ctx: CanvasRenderingContext2D, view: BowlingView): void;
