/**
 * Peg Solitaire (孔明棋) pure logic: classic English 7×7 cross board.
 * A board is a length-49 Uint8Array with index = row * 7 + col (0-based);
 * value 1 = peg, 0 = empty hole. Indices outside the cross-shaped hole mask
 * are always 0 and are never valid move endpoints. Deterministic functions
 * over plain arrays — no DOM, no timers; the undo stack lives in the glue.
 */
export declare const SIZE = 7;
/** Index of the board center hole (row 3, col 3). */
export declare const CENTER = 24;
export type PegBoard = Uint8Array;
/** 49 flags: 1 at each of the 33 holes, 0 at the four corner blocks. */
export declare const BOARD_MASK: PegBoard;
/** Is `index` a hole of the board? */
export declare function isHole(index: number): boolean;
/** Number of pegs currently on the board. */
export declare function pegCount(board: PegBoard): number;
/** One challenge: a start position plus a win goal. */
export interface PegLevel {
    /** Chinese HUD name. */
    name: string;
    /** Win needs exactly 1 peg; 'center' additionally requires it at {@link CENTER}. */
    goal: 'center' | 'any';
}
export declare const LEVELS: readonly PegLevel[];
/** Start board per level index (0..2); matches {@link LEVELS}. */
export declare const START_BOARDS: readonly PegBoard[];
/** The index jumped over when moving from `from` to `to`, or null if not a 2-step orthogonal line. */
export declare function jumpedPeg(from: number, to: number): number | null;
/**
 * Apply a jump: peg at `from` leaps over the adjacent peg into empty `to`,
 * removing the jumped peg.
 * @returns the new board, or null when the move is illegal (off-board,
 *   off-mask, no source peg, no jumped peg, or occupied landing).
 */
export declare function applyMove(board: PegBoard, from: number, to: number): PegBoard | null;
/** All legal [from, to] jumps on `board`. */
export declare function legalMoves(board: PegBoard): [number, number][];
/**
 * Win check for a level index into {@link LEVELS}.
 * @returns true when the board meets the level goal (1 peg; L1 also requires it at center).
 */
export declare function isWin(board: PegBoard, level: number): boolean;
