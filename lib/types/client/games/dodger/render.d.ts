/**
 * Dodger canvas renderer on the shared theme kit: gradient arena, glowing
 * player dot (accent(0), grace-period flicker), bullets as glowing motion
 * streaks colored by speed tier (homing bullets as accent(2) comets),
 * telegraphed lasers on h/v/diagonal axes clipped to the field, a
 * 时间/得分/擦弹 HUD, particle burst on death, and the bad-red themed
 * game-over overlay.
 */
import type { DodgerState } from './logic.ts';
export declare const DODGER_W = 480;
export declare const DODGER_H = 600;
/**
 * Draw one frame.
 * @param paused - show the pause overlay.
 */
export declare function renderDodger(ctx: CanvasRenderingContext2D, state: DodgerState, paused: boolean): void;
