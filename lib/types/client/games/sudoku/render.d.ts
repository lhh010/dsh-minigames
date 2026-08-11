/**
 * Sudoku canvas renderer: the 9x9 grid with box dividers, fixed clues in
 * dark, player entries in blue, conflicts in red, a cursor highlight, and a
 * difficulty/time HUD.
 */
import type { SudokuState } from './logic.ts';
import { type Difficulty } from './logic.ts';
export declare const CELL = 40;
export declare const HUD_H = 30;
export declare const BOARD_W: number;
export declare const BOARD_H: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** Draw one frame; cursor is the selected cell or null. */
export declare function renderSudoku(ctx: CanvasRenderingContext2D, state: SudokuState, difficulty: Difficulty, cursor: {
    r: number;
    c: number;
} | null): void;
