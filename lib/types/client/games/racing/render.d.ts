/**
 * Neon Racing renderer: pseudo-3D road (per-scanline ground), sky with the
 * striped sun, roadside scenery, fog, rear-view cars, speed streaks,
 * particles, screen shake, HUD, and the start/pause/over overlays. All
 * drawing happens in the fixed logical space (LOGICAL_W x LOGICAL_H).
 */
import { LANES, SPAWN_Z, CAM_H, type RacingState } from './logic.ts';
import { glow, noGlow } from '../theme.ts';
export declare const LOGICAL_W = 480;
export declare const LOGICAL_H = 640;
export interface RacingView {
    state: RacingState;
    paused: boolean;
    /** Best score to show in the corner (panel-managed). */
    best: number;
}
/** Screen position of the player car. */
export declare function playerScreen(state: RacingState): {
    x: number;
    y: number;
    s: number;
};
/** Draw one frame. */
export declare function renderRacing(ctx: CanvasRenderingContext2D, view: RacingView): void;
export { LANES, SPAWN_Z, CAM_H, glow, noGlow };
