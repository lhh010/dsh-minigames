/**
 * Connect Four renderer: board frame, glowing discs, column hover, the
 * last-move ring, the winning-line pulse, and the HUD/overlays. Uses the
 * shared visual kit (../theme.ts).
 */
import { type Board } from './logic.ts';
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
export interface Connect4View {
    board: Board;
    /** Column under the pointer, or -1. */
    hoverCol: number;
    lastMove: number;
    levelLabel: string;
    record: {
        w: number;
        d: number;
        l: number;
    };
    result: 'playing' | 'red' | 'yellow' | 'draw';
    winCells: readonly number[] | null;
}
export declare function cellX(col: number): number;
export declare function cellY(row: number): number;
/** Column under the pointer, or -1. */
export declare function colAt(x: number, y: number): number;
export declare function renderConnect4(ctx: CanvasRenderingContext2D, view: Connect4View): void;
