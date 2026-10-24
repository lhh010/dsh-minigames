/**
 * Mini Go (9x9) pure rules: liberties, captures, suicide prohibition, simple
 * ko, pass, and area (Chinese) scoring. The board is a flat Int8Array
 * (0 empty, 1 black, 2 white) in row-major order; all functions are pure
 * (they return fresh boards) so the AI and the tests can explore freely.
 */
export declare const BLACK = 1;
export declare const WHITE = 2;
/** Komi for White under area scoring (9x9 uses the standard 6.5). */
export declare const KOMI = 6.5;
/** Black wins when its area exceeds half the board plus komi compensation. */
export declare const WIN_THRESHOLD = 40.5;
export interface GoBoard {
    readonly size: number;
    readonly cells: Int8Array;
}
/** Create an empty size×size board. */
export declare function createBoard(size?: number): GoBoard;
export declare function idx(board: GoBoard, r: number, c: number): number;
export declare function rc(board: GoBoard, i: number): {
    r: number;
    c: number;
};
/** Orthogonal neighbors of a point, clipped to the board. */
export declare function neighbors(board: GoBoard, i: number): number[];
/** The connected stone group containing i plus its liberty set. */
export declare function groupAndLiberties(board: GoBoard, i: number): {
    stones: number[];
    liberties: Set<number>;
};
/** Whether playing color at i would repeat the previous position (simple ko). */
export declare function wouldRepeat(board: GoBoard, i: number, color: number, prev: GoBoard | null): boolean;
/**
 * Place color at i. Returns the new board plus the captured stones, or null
 * when the move is illegal (occupied or suicide — ko is checked by the
 * caller against the previous position).
 */
export declare function play(board: GoBoard, i: number, color: number): {
    board: GoBoard;
    captured: number[];
} | null;
/** All legal moves for color (ignores ko; the caller applies it). */
export declare function legalMoves(board: GoBoard, color: number): number[];
/** Whether playing at i is fully legal (occupancy, suicide, simple ko). */
export declare function isLegal(board: GoBoard, i: number, color: number, prev: GoBoard | null): boolean;
/**
 * Area (Chinese) scoring: each color scores its stones plus the empty points
 * reachable from only that color. Returns the two areas and the winner.
 */
export declare function areaScore(board: GoBoard, komi?: number): {
    black: number;
    white: number;
    winner: 0 | 1 | 2;
};
/** Per-level AI configuration (ply search depth / node budget). */
export declare const AI_LEVELS: readonly [{
    readonly label: "L1";
    readonly depth: 0;
}, {
    readonly label: "L2";
    readonly depth: 1;
}, {
    readonly label: "L3";
    readonly depth: 2;
}];
