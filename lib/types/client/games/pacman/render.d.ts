/**
 * Pac-Man canvas renderer: a dark maze of glowing blue walls, dots and
 * flashing power pellets, a yellow Pac-Man with a mouth that faces its
 * direction, coloured ghosts (blue and flashing while frightened), and a
 * score/lives HUD.
 */
import type { PacmanState } from './logic.ts';
export declare const HUD_H = 30;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** Draw one frame; `t` is a running seconds counter for flicker effects. */
export declare function renderPacman(ctx: CanvasRenderingContext2D, state: PacmanState, t: number): void;
