/**
 * Pac-Man canvas renderer: the shared gradient background, dark wall blocks
 * with a soft rim, glowing dots and power pellets, a gold Pac-Man and stable
 * accent ghosts, a score/lives HUD, and overlays from the theme kit. Eat
 * bursts are render-side observations only (previous score module variable).
 */
import type { PacmanState } from './logic.ts';
export declare const HUD_H = 30;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** Draw one frame; `t` is a running seconds counter for flicker effects.
 * @param paused - show the pause overlay. */
export declare function renderPacman(ctx: CanvasRenderingContext2D, state: PacmanState, t: number, paused: boolean): void;
