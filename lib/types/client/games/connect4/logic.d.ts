/**
 * Connect Four pure rules: a 7-column x 6-row board stored column-major as a
 * flat Int8Array (index = col * ROWS + row; row 0 is the BOTTOM). 0 empty,
 * 1 = red (player), 2 = yellow (AI). All functions are pure.
 */
export declare const COLS = 7;
export declare const ROWS = 6;
export declare const RED = 1;
export declare const YELLOW = 2;
export type Cell = 0 | 1 | 2;
export type Board = Int8Array;
export declare function createBoard(): Board;
export declare function inBounds(col: number, row: number): boolean;
export declare function at(board: Board, col: number, row: number): Cell;
/** The row a disc dropped into `col` would land on, or -1 when full. */
export declare function dropRow(board: Board, col: number): number;
export declare function legalColumns(board: Board): number[];
export declare function isFull(board: Board): boolean;
/** Drop color into col; returns the new board and the landing row, or null. */
export declare function drop(board: Board, col: number, color: 1 | 2): {
    board: Board;
    row: number;
} | null;
/** All 69 length-4 windows as flat index quadruples (computed once). */
export declare const WINDOWS: readonly [number, number, number, number][];
/** The winning line's four cells, or null. */
export declare function findWinner(board: Board): {
    color: 1 | 2;
    cells: [number, number, number, number];
} | null;
export declare function isWin(board: Board, color: 1 | 2): boolean;
export type GameResult = 'playing' | 'red' | 'yellow' | 'draw';
export declare function result(board: Board): GameResult;
/** Convert a flat index to column/row. */
export declare function toColRow(i: number): {
    col: number;
    row: number;
};
/** Convert column/row to the flat index. */
export declare function toIndex(col: number, row: number): number;
