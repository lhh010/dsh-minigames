/**
 * Asteroids canvas renderer on the shared theme kit: gradient void, glowing
 * stroked rock polygons (accent by size), glowing ship triangle with thrust
 * flame, bullet dots, particle bursts observed from the logic-provided
 * destruction events, a hudPair HUD, and the themed game-over overlay.
 */
import { type AsteroidsState } from './logic.ts';
export declare const AST_W = 960;
export declare const AST_H = 600;
/** Draw one frame of the asteroid field. */
export declare function renderAsteroids(ctx: CanvasRenderingContext2D, state: AsteroidsState): void;
