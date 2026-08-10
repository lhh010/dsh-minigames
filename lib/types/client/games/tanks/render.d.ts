/**
 * Tank battle canvas renderer: tiles (brick/steel), tanks with directional
 * turrets, and bullets. Palette tuned for the DSH dark shell.
 */
import { type WorldState } from './logic.ts';
export declare const TANK_W: number;
export declare const TANK_H: number;
/** Draw one frame of the battle. */
export declare function renderTanks(ctx: CanvasRenderingContext2D, state: WorldState): void;
