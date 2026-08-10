/**
 * Match-3 (消消乐) pure logic — click-to-remove mode: each gem kind is a
 * distinct color; clicking a cell removes its 4-connected same-color group.
 * Bigger groups score super-linearly (quadratic), remaining gems fall to the
 * bottom (no refill within a level), and reaching the level target wins —
 * winning raises the target for the next level. Deterministic functions over
 * a plain state object; the game instance in index.ts drives the clear/fall
 * animation and the unit tests drive the logic directly.
 */
export interface Position {
    r: number;
    c: number;
}
export interface Match3State {
    rows: number;
    cols: number;
    /** Number of gem kinds (1..kinds), each its own color. */
    kinds: number;
    /** rows x cols; 0 = empty, 1..kinds = a gem kind. */
    grid: number[][];
    /** Current level score (resets each level). */
    score: number;
    /** Total score this level must reach to win. */
    target: number;
    level: number;
    result: 'none' | 'win' | 'lose';
    rng: () => number;
}
export declare const DEFAULT_ROWS = 8;
export declare const DEFAULT_COLS = 8;
export declare const DEFAULT_KINDS = 5;
/** Score for removing a 4-connected group of `size` — super-linear (quadratic),
 * so one big pop vastly outweighs many small ones. */
export declare function scoreForGroup(size: number): number;
/** The target score a level requires; each level adds 400 (800, 1200, 1600,
 * ...). A greedy solver clears ~1700 points on a typical board, so the early
 * levels are comfortably reachable and later ones become the natural end. */
export declare function levelTarget(level: number): number;
/** Fill the board with random gems (groups are fine — they are what you click). */
export declare function shuffle(state: Match3State): void;
/** A fresh, playable level-1 board. */
export declare function createMatch3State(rng?: () => number, rows?: number, cols?: number, kinds?: number): Match3State;
/** The 4-connected same-color group containing `pos` (empty when the cell is empty). */
export declare function groupAt(grid: number[][], pos: Position): Position[];
/** Size of the largest 4-connected group on the board (0 when empty). */
export declare function largestGroupSize(grid: number[][]): number;
/** Whether any group of size >= 2 remains (the board still has moves). */
export declare function hasRemovableGroup(grid: number[][]): boolean;
/** Plan a removal for animation: the cells to flash and the cells that fall. */
export interface RemovalPlan {
    removed: Position[];
    /** Kept cells moving straight down (from = old position, to = new). */
    falls: {
        from: Position;
        to: Position;
    }[];
}
/** Compute the fall mapping a removal will cause (matches {@link applyRemoval}). */
export declare function planRemoval(grid: number[][], positions: Position[]): RemovalPlan;
/** Commit a removal: zero the cells and drop everything above them. */
export declare function applyRemoval(grid: number[][], positions: Position[]): void;
/** Remove the group at `pos`, score it, and let the rest fall. Returns the group. */
export declare function removeGroup(state: Match3State, pos: Position): Position[];
/** Re-evaluate win/lose after a removal (no-op once a result is set). */
export declare function updateResult(state: Match3State): void;
/** Start the next level: fresh board, reset score, doubled target. */
export declare function advanceLevel(state: Match3State): void;
/** Restart the whole run from level 1. */
export declare function restart(state: Match3State): void;
