/**
 * Sudoku canvas renderer on the shared theme kit: gradient background, a
 * panel board with glowing cursor/conflict highlights, themed digits, a
 * hudPair HUD, a win overlay, and a particle burst when the puzzle is solved.
 */
import type { SudokuState } from './logic.ts';
import { type Difficulty } from './logic.ts';
export declare const CELL = 40;
export declare const HUD_H = 30;
export declare const BOARD_W: number;
export declare const BOARD_H: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** Draw one frame; cursor is the selected cell or null.
 * @param paused - show the pause overlay. */
export declare function renderSudoku(ctx: CanvasRenderingContext2D, state: SudokuState, difficulty: Difficulty, cursor: {
    r: number;
    c: number;
} | null, paused: boolean): void;
