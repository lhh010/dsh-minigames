/**
 * Color Lines (五连珠) canvas renderer: HUD (score / free cells), a 9x9
 * board panel with glowing accent balls (stable per color id), a pulsing
 * selected ball, a dashed keyboard cursor, and the shared game-over
 * overlay. Line clears fire a particle burst.
 */
import type { ColorLinesState, Position } from './logic.ts';
export declare const CELL = 44;
export declare const HUD_H = 40;
export declare const GAP = 6;
export declare const BOARD_W: number;
export declare const BOARD_H: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** What the game wants rendered this frame. */
export interface ColorLinesView {
    selected: Position | null;
    cursor: Position;
    /** Cells flashing as they clear (0..1 animation progress). */
    clearing: {
        cells: Position[];
        t: number;
    } | null;
}
/** Draw one frame. */
export declare function renderColorLines(ctx: CanvasRenderingContext2D, state: ColorLinesState, view: ColorLinesView): void;
