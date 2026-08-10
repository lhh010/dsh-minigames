/**
 * 数字华容道 (15-puzzle, 4x4 = 16 cells) pure logic: a 4x4 board with tiles
 * 1..15 and one empty cell. Sliding tiles into the empty space (adjacent, or a
 * whole row/column run toward the empty) rearranges them; the puzzle is won
 * when tiles read 1..15 with the empty at the bottom-right. The board is
 * shuffled from the solved state with random valid moves, so every shuffle is
 * solvable. Deterministic functions over a plain state object; the game
 * instance in index.ts drives the slide animation, and the unit tests drive
 * the logic directly.
 */
export interface Position {
    r: number;
    c: number;
}
/** One tile's slide, for the animation (the board is already updated). */
export interface Slide {
    tile: number;
    from: Position;
    to: Position;
}
export interface HuarongState {
    rows: number;
    cols: number;
    /** 0 = empty, 1..15 = tile id. */
    board: number[][];
    empty: Position;
    moves: number;
    solved: boolean;
    /** Elapsed seconds (accumulated by the game instance while playing). */
    elapsed: number;
}
/** Whether the board reads 1..n-1 with the empty last. */
export declare function isSolved(state: HuarongState): boolean;
/**
 * Shuffle by performing random valid slides from the solved state — every
 * shuffle produced this way is solvable (unlike swapping tiles at random).
 * @param state - the board (mutated to a fresh shuffled state).
 * @param steps - number of random slides.
 */
export declare function shuffle(state: HuarongState, steps?: number): void;
/** A fresh, shuffled, solvable 4x4 puzzle. */
export declare function createHuarongState(): HuarongState;
/**
 * Slide the tile(s) between `(r, c)` and the empty toward the empty — the tile
 * at `(r, c)` must share a row or column with the empty. Returns the slide
 * animation entries (the board is already updated), or null when the move is
 * invalid.
 */
export declare function slideAt(state: HuarongState, r: number, c: number): Slide[] | null;
/**
 * Slide a tile adjacent to the empty in the given direction (the tile moves
 * that way into the empty). dir: 0 up, 1 right, 2 down, 3 left.
 */
export declare function slideDirection(state: HuarongState, dir: number): Slide[] | null;
