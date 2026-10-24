/**
 * Mini Go renderer: dark board with accent grid lines and star points,
 * glowing stones, last-move marker, capture counts, and the end-game overlay
 * with the area score. Uses the shared visual kit (../theme.ts).
 */
import { areaScore, type GoBoard } from './logic.ts';
import { roundRectPath } from '../theme.ts';
export declare const SIZE = 9;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
export interface MiniGoView {
    board: GoBoard;
    /** Last played point index, or -1. */
    lastMove: number;
    levelLabel: string;
    captures: {
        black: number;
        white: number;
    };
    moves: number;
    hover: number;
    over: boolean;
    winner: 0 | 1 | 2;
    blackArea: number;
    whiteArea: number;
}
export declare function pointX(c: number): number;
export declare function pointY(r: number): number;
/** Board index under the pointer, or -1. */
export declare function pointAt(x: number, y: number): number;
export declare function renderMiniGo(ctx: CanvasRenderingContext2D, view: MiniGoView): void;
/** Rounded-rect helper re-exported for tests that verify geometry helpers. */
export { roundRectPath };
/** Re-exported so the glue can score without importing logic twice. */
export { areaScore };
