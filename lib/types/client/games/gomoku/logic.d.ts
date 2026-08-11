/**
 * Gomoku (五子棋) pure logic: 15x15 board, two players alternate placing
 * stones; five in a row wins. A simple heuristic AI scores candidate moves by
 * attack + defense line evaluation. Deterministic functions over a plain state
 * object.
 */
export declare const SIZE = 15;
export type Cell = 0 | 1 | 2;
export interface GomokuState {
    board: Cell[][];
    /** Whose turn: 1 = player, 2 = AI. */
    turn: Cell;
    winner: Cell;
    over: boolean;
}
export interface Move {
    r: number;
    c: number;
}
/** A fresh empty board; the player moves first. */
export declare function createGomokuState(): GomokuState;
/** Check for a win after the last move at (r, c). */
export declare function checkWin(board: Cell[][], r: number, c: number): boolean;
/** Place a stone for the current turn; advances the turn and checks the win. */
export declare function place(state: GomokuState, r: number, c: number): boolean;
/**
 * Choose the AI's move: winning moves first, then blocking the player's
 * winning moves, then the best scored empty cell near existing stones.
 */
export declare function chooseAiMove(state: GomokuState): Move | null;
