/**
 * Minesweeper pure logic: a grid of mines, numbers, and hidden cells with
 * flood-fill reveal and flag marking. First click is always safe; the game is
 * won when all non-mine cells are revealed. Deterministic functions over a
 * plain state object — the game instance drives mouse input, tests drive the
 * logic directly.
 */
export declare const COLS = 9;
export declare const ROWS = 9;
export declare const MINES = 10;
export interface Cell {
    mine: boolean;
    /** Adjacent mine count (-1 until revealed). */
    count: number;
    revealed: boolean;
    flagged: boolean;
}
export interface MinesweeperState {
    grid: Cell[][];
    /** Whether mines have been placed yet (first click places them). */
    seeded: boolean;
    revealed: number;
    safeCells: number;
    /** Elapsed seconds since the first click; frozen on win/over. */
    elapsed: number;
    over: boolean;
    won: boolean;
    rng: () => number;
}
/** A fresh unseeded board. */
export declare function createMinesweeperState(rng?: () => number): MinesweeperState;
/** Advance the game clock: counts only after the first click, until the end. */
export declare function tick(state: MinesweeperState, dt: number): void;
/** Place mines avoiding the first-click cell and its neighbours. */
export declare function seedMines(state: MinesweeperState, safeR: number, safeC: number): void;
/** Reveal a cell; flood-fill zeros. Returns true if a mine was hit. */
export declare function reveal(state: MinesweeperState, r: number, c: number): boolean;
/** Toggle a flag on a hidden cell. */
export declare function toggleFlag(state: MinesweeperState, r: number, c: number): void;
/**
 * Chord (double-click a revealed number): when the flagged neighbours equal
 * the cell's count, reveal every unopened, unflagged neighbour — with the
 * classic risk that a mis-placed flag exposes a mine and ends the game.
 */
export declare function chord(state: MinesweeperState, r: number, c: number): void;
/** Reveal all mines (game over display). */
export declare function revealAllMines(state: MinesweeperState): void;
