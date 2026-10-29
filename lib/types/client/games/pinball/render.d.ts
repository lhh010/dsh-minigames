/**
 * 弹球台 renderer: pure canvas drawing of the pinball state — walls, launch
 * lane, glowing bumpers, slingshot triangles, drop targets, capsule flippers,
 * the ball, plunger charge bar, HUD, and pause/game-over overlays. No state
 * beyond what logic.ts owns; every function here is a pure paint.
 */
import { type PinballState } from './logic.ts';
export declare const LOGICAL_W = 420;
export declare const LOGICAL_H = 680;
export interface RenderOptions {
    state: PinballState;
    paused: boolean;
    best: number;
}
/** The whole frame: background, table, actors, HUD, message, overlays. */
export declare function renderPinball(ctx: CanvasRenderingContext2D, o: RenderOptions): void;
