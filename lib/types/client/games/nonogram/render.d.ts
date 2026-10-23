/**
 * Nonogram canvas renderer on the shared theme kit: gradient background,
 * row/column clue strips (satisfied lines dim), the 10x10 grid with filled
 * cells and X marks, a glowing cursor, a hudPair HUD, and a win overlay.
 */
import type { Cell, Clues } from './logic.ts';
export declare const CELL = 34;
export declare const HUD_H = 30;
/** Clue gutters: up to 5 runs per line at 10 cells. */
export declare const CLUE_W = 92;
export declare const CLUE_H = 76;
export declare const BOARD: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
export interface Cursor {
    r: number;
    c: number;
}
/** Grid cell at logical coordinates, or null outside the board. */
export declare function cellAt(x: number, y: number): Cursor | null;
/** Draw one frame. */
export declare function renderNonogram(ctx: CanvasRenderingContext2D, cells: Cell[][], clues: Clues, cursor: Cursor | null, level: number, elapsed: number, paused: boolean, winText: string | null): void;
