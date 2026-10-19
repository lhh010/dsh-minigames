/**
 * Simon canvas renderer: a 2x2 grid of glowing pads with key letters, a
 * round/score HUD, and overlays for pause and game over. Uses the shared
 * visual kit (../theme.ts); which pad is lit is decided by the caller
 * (index.ts) and passed in, so the renderer stays stateless.
 */
import type { SimonState } from './logic.ts';
export declare const HUD_H = 32;
export declare const PAD = 96;
export declare const GAP = 16;
export declare const BOARD_W: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** Which pad (0..3) a logical-space point lands on, or null. */
export declare function padAt(x: number, y: number): number | null;
/**
 * Draw one frame.
 * @param lit - pad index to render glowing, or null for none (caller-owned
 *   flash/press timing).
 */
export declare function renderSimon(ctx: CanvasRenderingContext2D, state: SimonState, lit: number | null, paused: boolean): void;
