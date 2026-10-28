/**
 * Mini Pool renderer: the felt table with rails and pockets, numbered balls,
 * the cue-stick aim guide and power bar, HUD, and the shared overlays. All
 * drawing happens in the fixed logical space (LOGICAL_W x LOGICAL_H); the
 * playfield maps 1:1 onto the table rect inside a rail margin.
 */
import { type PoolState } from './logic.ts';
export declare const LOGICAL_W = 680;
export declare const LOGICAL_H = 400;
export interface PoolView {
    state: PoolState;
    paused: boolean;
    /** Drag-in-progress aim (angle + power) overriding state fields when set. */
    aim: {
        angle: number;
        power: number;
    } | null;
    best: number;
}
/** Convert world (table) coordinates to logical canvas coordinates. */
export declare function worldToLogical(x: number, y: number): {
    x: number;
    y: number;
};
/** Convert logical canvas coordinates back to world coordinates. */
export declare function logicalToWorld(x: number, y: number): {
    x: number;
    y: number;
};
/** Render one frame of the pool game (pure drawing; no state mutation). */
export declare function renderPool(ctx: CanvasRenderingContext2D, view: PoolView): void;
