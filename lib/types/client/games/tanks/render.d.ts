/**
 * Tank battle canvas renderer: brick/steel tiles, tanks with directional
 * turrets and animated treads, glowing bullets, and explosion effects.
 * Palette tuned for the DSH dark shell.
 */
import { type WorldState } from './logic.ts';
export declare const TANK_W: number;
export declare const TANK_H: number;
/** Draw one frame of the battle. */
export declare function renderTanks(ctx: CanvasRenderingContext2D, state: WorldState): void;
