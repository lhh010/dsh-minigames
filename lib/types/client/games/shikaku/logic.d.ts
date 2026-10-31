/**
 * 四角填方 (Shikaku) pure logic. An n×n grid must be partitioned into
 * rectangles so that every rectangle contains exactly one numbered clue and
 * its area equals that number.
 *
 * Generation: a random recursive split partitions the board into rectangles
 * (area capped), each rectangle plants its clue at a random cell — a solution
 * exists by construction. Each roll is verified by a node-budgeted solver
 * that counts partitions up to two (rectangles anchored at the
 * topmost-leftmost uncovered clue); a level ships only when exactly one
 * solution is proven, otherwise the seed advances — after the attempt cap
 * the first roll ships with a 多解 badge (the flow pattern).
 */
/** Board edge lengths of the ten levels. */
export declare const LEVEL_SIZES: readonly [6, 7, 8, 9, 10, 9, 10, 11, 11, 12];
/** A rectangle as inclusive corners [r1, c1, r2, c2]. */
export type Rect = readonly [number, number, number, number];
/** A generated level: clue cells plus one valid partition. */
export interface ShikakuPuzzle {
    /** Board edge length in cells. */
    size: number;
    /** Clues: cell index → required rectangle area. */
    clues: readonly {
        cell: number;
        area: number;
    }[];
    /** The generating partition (one rect per clue, same order). */
    solution: readonly Rect[];
    /** Whether the solver proved exactly one solution. */
    unique: boolean;
}
/** mulberry32 PRNG: small, fast, deterministic per seed. */
export declare function mulberry32(seed: number): () => number;
/** Board edge length of a 1-based level (levels wrap after the 10th). */
export declare function levelSize(level: number): number;
/** Win score: base 100×level plus a time bonus that decays 5/second. */
export declare function computeScore(level: number, seconds: number): number;
/** Area of a rectangle. */
export declare function rectArea(rect: Rect): number;
/** True when a rectangle covers cell (r, c). */
export declare function rectCovers(rect: Rect, r: number, c: number): boolean;
/**
 * Interactive placement check: a rect is committable when it lies inside the
 * board, covers exactly one clue, and that clue's area equals the rect area.
 */
export declare function rectAllowed(size: number, clues: readonly {
    cell: number;
    area: number;
}[], rect: Rect): boolean;
/** Win: the placed rects cover every cell exactly once. */
export declare function isWon(size: number, rects: readonly Rect[]): boolean;
/** Solver outcome: partitions found (capped at 2), budget status, nodes. */
export interface SolveResult {
    solutions: number;
    /** True when the node budget ran out before the search space closed. */
    exhausted: boolean;
    nodes: number;
}
/**
 * Count valid partitions up to two via DFS. The topmost-leftmost uncovered
 * CLUE cell anchors the next rectangle (a clue cell need not be its
 * rectangle's corner); every inside-board rectangle of the clue's area that
 * contains it, covers only free cells and no other clue is tried. Returns
 * solution count with budget status.
 */
export declare function solveCount(puzzle: ShikakuPuzzle, maxNodes?: number): SolveResult;
/** Generation attempts per puzzle: uniqueness re-rolls, smaller boards more. */
export declare function attemptCap(size: number): number;
/**
 * Generate a puzzle deterministically from seed.
 *
 * Re-rolls derived seeds until the solver proves exactly one partition;
 * after the attempt cap the first roll ships with unique: false (always
 * solvable — the clues come from a concrete partition).
 */
export declare function puzzleFromSeed(seed: number, size: number): ShikakuPuzzle;
