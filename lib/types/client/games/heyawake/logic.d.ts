/**
 * 别府涂黑 (Heyawake) pure logic. The grid is partitioned into rectangular
 * rooms; some rooms carry a number — exactly that many shaded cells inside.
 * Shaded cells may never touch orthogonally, and the unshaded (white) cells
 * must form one connected region.
 *
 * Generation: a random room partition (recursive splits), then a randomized
 * no-touch shading per room meeting its number (rooms without numbers get a
 * random 0..2 count); white connectivity verified, re-rolled when broken.
 * Solvable by construction; a budgeted DFS counts shadings up to two — a
 * level ships only when exactly one solution is proven, else the seed
 * advances (the flow pattern).
 */
/** Board edge lengths of the five levels. */
export declare const LEVEL_SIZES: readonly [6, 7, 8, 9, 10];
/** A room as inclusive corners [r1, c1, r2, c2] with its shaded count. */
export interface Room {
    rect: readonly [number, number, number, number];
    /** Required shaded-cell count; undefined = unconstrained room. */
    count: number | undefined;
}
/** A generated level. */
export interface HeyaPuzzle {
    /** Board edge length in cells. */
    size: number;
    /** The room partition covering the whole grid. */
    rooms: readonly Room[];
    /** The generating shading: true = black. */
    solution: readonly boolean[];
    /** Whether the solver proved exactly one solution. */
    unique: boolean;
}
/** mulberry32 PRNG: small, fast, deterministic per seed. */
export declare function mulberry32(seed: number): () => number;
/** Board edge length of a 1-based level (levels wrap after the 5th). */
export declare function levelSize(level: number): number;
/** Win score: base 100×level plus a time bonus that decays 5/second. */
export declare function computeScore(level: number, seconds: number): number;
/** Orthogonal neighbors of a cell (grid edges only). */
export declare function neighbors(size: number, cell: number): number[];
/** True when the cell lies inside the room rect. */
export declare function roomCovers(rect: readonly [number, number, number, number], r: number, c: number): boolean;
/**
 * Full rule check: shaded cells never orthogonally adjacent, every numbered
 * room holds exactly its count, whites form one connected region.
 */
export declare function isWon(puzzle: HeyaPuzzle, blacks: ReadonlySet<number>): boolean;
/** Solver outcome: shadings found (capped at 2), budget status, nodes. */
export interface SolveResult {
    solutions: number;
    /** True when the node budget ran out before the search space closed. */
    exhausted: boolean;
    nodes: number;
}
/**
 * Count rule-satisfying shadings up to two via DFS over cells in row-major
 * order with pruning: no touching blacks, numbered rooms' remaining cells
 * can still reach their count, and whites stay connectable (through whites
 * + undecided). Returns count with budget status.
 */
export declare function solveCount(puzzle: HeyaPuzzle, maxNodes?: number): SolveResult;
/** Generation attempts per puzzle. */
export declare function attemptCap(size: number): number;
/**
 * Generate a puzzle deterministically from seed. Re-rolls until the solver
 * proves exactly one shading; after the attempt cap the first solvable roll
 * ships with unique: false. Returns null when no roll was solvable.
 */
export declare function puzzleFromSeed(seed: number, size: number): HeyaPuzzle | null;
