/**
 * 管道连线 renderer: colored dot pairs, thick rounded path pipes with a
 * bright drag head, the hover cell, HUD, and the win/pause overlays. Uses
 * the shared visual kit (../theme.ts).
 */
import type { CellPaths, FlowPuzzle } from './logic.ts';
/** What the renderer needs for one frame. */
export interface FlowView {
    puzzle: FlowPuzzle;
    paths: CellPaths;
    /** Color being dragged, or -1. */
    activeColor: number;
    /** Cell under the pointer, or -1. */
    hoverCell: number;
    levelLabel: string;
    elapsed: string;
    /** Connected-pair count over total pairs, e.g. "2/4". */
    connected: string;
    solved: boolean;
    paused: boolean;
}
export declare function logicalW(size: number): number;
export declare function logicalH(size: number): number;
/** Center pixel of a cell index. */
export declare function cellCenter(size: number, cell: number): {
    x: number;
    y: number;
};
/** Cell index under the pointer, or -1 (generous half-cell tolerance). */
export declare function cellAt(size: number, x: number, y: number): number;
export declare function renderFlow(ctx: CanvasRenderingContext2D, view: FlowView): void;
