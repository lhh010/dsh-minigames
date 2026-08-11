/**
 * FPS aim-tracking canvas renderer: a first-person range — sky above a ground
 * plane with a perspective grid, the horizon tilting with pitch, a target
 * that moves in 3D (lateral + height), a fixed centre crosshair (gold while
 * locked), a right-lower gun viewmodel with muzzle flash, a HUD, and overlays
 * for ready/paused/round-end states.
 */
import type { FpsTrackState } from './logic.ts';
/** UI phase drawn by the renderer (mirrors the instance). */
export type UiPhase = 'ready' | 'playing' | 'paused' | 'over';
/** Draw one frame; `t` is a running seconds counter for the target pulse. */
export declare function renderAimTrack(ctx: CanvasRenderingContext2D, state: FpsTrackState, t: number, phase: UiPhase): void;
