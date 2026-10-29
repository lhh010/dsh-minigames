/**
 * Chess renderer: checkered 8x8 board, unicode pieces, selection + legal-move
 * highlights, last-move markers, check ring, promotion picker, HUD and
 * overlays. Uses the shared visual kit (../theme.ts).
 */
import { type Move, type Position } from './logic.ts';
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
export interface ChessView {
    pos: Position;
    /** Selected square (0x88) or -1. */
    selected: number;
    /** Destination squares of the selected piece's legal moves. */
    targets: ReadonlySet<number>;
    lastMove: Move | null;
    /** King square currently in check, or -1. */
    checkSquare: number;
    levelLabel: string;
    /** Overlay title, or null while playing. */
    statusText: string | null;
    statusSub: string;
    statusColor: string;
    paused: boolean;
    /** Pending promotion: piece traveled from→to, picker shown until chosen. */
    promotion: {
        from: number;
        to: number;
        white: boolean;
    } | null;
    thinking: boolean;
}
export declare function squareX(s: number): number;
export declare function squareY(s: number): number;
/** 0x88 square under the pointer, or -1. */
export declare function squareAt(x: number, y: number): number;
declare const PROMO_PIECES: readonly ["q", "r", "b", "n"];
export type PromoPick = (typeof PROMO_PIECES)[number];
/** Promotion-picker button under the pointer, or null (picker at the top rank). */
export declare function promotionAt(x: number, y: number): PromoPick | null;
export declare function renderChess(ctx: CanvasRenderingContext2D, view: ChessView): void;
export {};
