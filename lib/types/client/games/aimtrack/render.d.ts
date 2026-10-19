/**
 * FPS aim-tracking canvas renderer on the shared theme kit: a themed sky/
 * ground range with a perspective grid, a glowing target and hit markers,
 * the fixed centre crosshair (gold while locked), a gun viewmodel with
 * muzzle flash, a hudPair HUD, hit particle bursts (observed from the hit
 * counter), and shared-style overlays for ready/paused/round-end states.
 */
import type { FpsTrackState } from './logic.ts';
/** UI phase drawn by the renderer (mirrors the instance). */
export type UiPhase = 'ready' | 'playing' | 'paused' | 'over';
/** Draw one frame; `t` is a running seconds counter for the target pulse. */
export declare function renderAimTrack(ctx: CanvasRenderingContext2D, state: FpsTrackState, t: number, phase: UiPhase): void;
