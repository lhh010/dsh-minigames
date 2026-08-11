/**
 * 2048 pure logic: a 4x4 board of power-of-two tiles that slide and merge in
 * the four directions. A move is valid when any tile slides or merges; a new
 * 2/4 tile spawns after a valid move; the game is won at 2048 and lost when
 * no moves remain. Deterministic functions over a plain state object.
 */
export declare const SIZE = 4;
export interface Tile {
    r: number;
    c: number;
    value: number;
}
export interface Game2048State {
    grid: (number | null)[][];
    score: number;
    won: boolean;
    over: boolean;
    rng: () => number;
}
export declare const WIN_VALUE = 2048;
/** Spawn a 2 (90%) or 4 (10%) on a random empty cell. */
export declare function spawnTile(state: Game2048State): void;
/** A fresh board with two starting tiles. */
export declare function create2048State(rng?: () => number): Game2048State;
/**
 * Apply a move in one direction (0 up, 1 right, 2 down, 3 left). Valid moves
 * spawn a tile and update score/win/over.
 */
export declare function move2048(state: Game2048State, dir: 0 | 1 | 2 | 3): boolean;
