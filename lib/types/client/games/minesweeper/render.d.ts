/**
 * Minesweeper canvas renderer: the mine grid (hidden cells, numbers, flags),
 * a mine-counter HUD, and win/game-over overlays. Palette tuned for the DSH
 * dark shell.
 */
import type { MinesweeperState } from './logic.ts';
export declare const CELL = 30;
export declare const HUD_H = 30;
export declare const BOARD_W: number;
export declare const BOARD_H: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** Draw one frame. */
export declare function renderMinesweeper(ctx: CanvasRenderingContext2D, state: MinesweeperState): void;
