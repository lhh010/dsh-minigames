/**
 * Slitherlink renderer: clue numbers in cells, edge segments with line/cross
 * states, the hover highlight, HUD, and the win overlay. Edges are drawn as
 * segments between lattice dots. Uses the shared visual kit (../theme.ts).
 */
import { type Clue, type EdgeState } from './logic.ts';
export interface SlitherlinkView {
    w: number;
    h: number;
    clues: Clue[];
    edges: EdgeState[];
    /** Edge index under the pointer, or -1. */
    hover: number;
    levelLabel: string;
    unique: boolean;
    elapsed: string;
    solved: boolean;
    paused: boolean;
}
export declare function logicalW(w: number): number;
export declare function logicalH(h: number): number;
/** Pixel position of lattice dot (col, row). */
export declare function dotX(col: number): number;
export declare function dotY(row: number): number;
/** Edge index under the pointer, or -1. */
export declare function edgeAt(w: number, h: number, x: number, y: number): number;
export declare function renderSlitherlink(ctx: CanvasRenderingContext2D, view: SlitherlinkView): void;
