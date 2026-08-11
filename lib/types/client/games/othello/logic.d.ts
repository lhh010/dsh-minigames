/**
 * Othello (黑白棋) pure logic: an 8x8 board, black (1) moves first; a move is
 * legal when it flanks one or more of the opponent's discs between the new
 * disc and an existing disc of the mover. Sides with no legal move pass;
 * after two consecutive passes the game ends and the side with more discs
 * wins. A heuristic AI favours corners and edges. Deterministic functions
 * over a plain state object.
 */
export declare const SIZE = 8;
export type Cell = 0 | 1 | 2;
export interface OthelloState {
    board: Cell[][];
    /** Whose turn: 1 = black (player), 2 = white (AI). */
    turn: 1 | 2;
    winner: 0 | 1 | 2;
    over: boolean;
    /** Consecutive passes; the game ends at 2. */
    passes: number;
}
export interface Move {
    r: number;
    c: number;
}
/** A fresh board with the classic four-disc opening; black moves first. */
export declare function createOthelloState(): OthelloState;
/** Discs that a move at (r, c) would flip for `player` (empty if illegal). */
export declare function flipsAt(board: Cell[][], r: number, c: number, player: 1 | 2): Array<[number, number]>;
/** All legal moves for `player`. */
export declare function legalMoves(state: OthelloState, player: 1 | 2): Move[];
/** Place a disc for the current turn; returns false when the move is illegal. */
export declare function place(state: OthelloState, r: number, c: number): boolean;
/** The current side passes (used when it has no legal move). */
export declare function passTurn(state: OthelloState): void;
/** Choose the AI's move: the highest-scoring legal cell, or null when passing. */
export declare function chooseAiMove(state: OthelloState): Move | null;
