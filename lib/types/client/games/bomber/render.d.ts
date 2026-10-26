/**
 * Bomberman canvas renderer on the shared theme kit: gradient field, themed
 * brick/wall tiles, glowing bombs and cross flames, chase particles, a
 * hudPair HUD, and themed end/pause overlays.
 */
import { type WorldState } from './logic.ts';
export declare const BOARD_W: number;
export declare const BOARD_H: number;
/** Draw one frame of the game; `paused` veils the scene. */
export declare function renderBomber(ctx: CanvasRenderingContext2D, state: WorldState, paused: boolean): void;
