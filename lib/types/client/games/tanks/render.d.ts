/**
 * Tank battle canvas renderer on the shared theme kit: gradient field,
 * themed brick/steel tiles, glowing rounded tanks and tracers, explosion
 * particles (observed from score/effects), a hudPair HUD, and themed
 * end-of-round overlay.
 */
import { type WorldState } from './logic.ts';
export declare const TANK_W: number;
export declare const TANK_H: number;
/** Draw one frame of the battle. */
export declare function renderTanks(ctx: CanvasRenderingContext2D, state: WorldState): void;
