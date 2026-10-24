/**
 * 桥 (Hashi / Hashiwokakero) pure logic. Islands numbered 1-8 sit on a grid;
 * bridges (1 or 2 per pair, horizontal or vertical only, never crossing) must
 * give every island exactly its number of bridge ends and leave all islands
 * in one connected group.
 *
 * Generation: a seeded random spanning tree (randomized DFS, short edges
 * preferred) over random grid cells, then extended — some tree edges upgraded
 * to double bridges plus a few extra non-crossing edges, degrees capped at 8.
 * Island numbers are the final degrees, so a solution always exists. Every
 * roll is verified by a node-budgeted backtracking solver that stops at two
 * solutions; a level ships only when exactly one is proven, otherwise the
 * seed advances (see {@link puzzleFromSeed}).
 *
 * Placed-bridge encoding: a Map from {@link bridgeKey} ("min:max" island
 * indices) to 1|2. Insertion order is the placement order, so the last key is
 * the most recently added bridge (that is what Backspace/Z undoes).
 */
/** Board edge lengths of the five levels. */
export declare const LEVEL_SIZES: readonly [5, 6, 7, 8, 9];
/** Degree cap: no island number exceeds what stays readable on a 9x9 board. */
export declare const MAX_DEGREE = 8;
/** A numbered island; x/y are grid cells, n is the required bridge-end count. */
export interface Island {
    x: number;
    y: number;
    n: number;
}
/** One bridge between two islands (indices into the island array). */
export interface Bridge {
    a: number;
    b: number;
    count: 1 | 2;
}
/** A generated level: the islands to solve plus one valid solution. */
export interface HashiPuzzle {
    /** Board edge length in cells. */
    size: number;
    islands: Island[];
    /** The generator's own bridges — always a valid solution. */
    bridges: Bridge[];
    /** Whether the solver proved this puzzle has exactly one solution. */
    unique: boolean;
}
/** Bridge count on one pair: 0 none, 1 single, 2 double. */
export type BridgeCount = 0 | 1 | 2;
/** Player bridges: bridgeKey → 1|2. */
export type Placed = ReadonlyMap<string, 1 | 2>;
/** mulberry32 PRNG: small, fast, deterministic per seed. */
export declare function mulberry32(seed: number): () => number;
/** Key of the bridge between islands a and b (order-independent). */
export declare function bridgeKey(a: number, b: number): string;
/** Bridge count between two islands (0 when none is placed). */
export declare function bridgeBetween(placed: Placed, a: number, b: number): BridgeCount;
/** Bridge ends touching each island, indexed like `islands`. */
export declare function degrees(islands: Island[], placed: Placed): number[];
/**
 * Cycle the bridge between a and b: 0 → 1 → 2 → 0. Pure — returns a new map,
 * whose insertion order doubles as the undo order. The caller must have
 * checked {@link legalLine}; cycling an illegal pair is undefined.
 * @param placed - current bridges.
 * @param a - first island index.
 * @param b - second island index.
 * @returns the updated bridges.
 */
export declare function cycleBridge(placed: Placed, a: number, b: number): Placed;
/** Drop the most recently placed bridge (Backspace / Z). */
export declare function removeLastBridge(placed: Placed): Placed;
/**
 * Whether islands a and b may carry a bridge: same row or column, distinct
 * cells, and no other island strictly between them.
 * @param islands - the level's islands.
 * @param a - first island index.
 * @param b - second island index.
 */
export declare function legalLine(islands: Island[], a: number, b: number): boolean;
/** Placed bridges as Bridge records, in placement order. */
export declare function placedBridges(islands: Island[], placed: Placed): Bridge[];
/** Whether all islands are reachable from island 0 over the placed bridges. */
export declare function connectedCheck(islands: Island[], placed: Placed): boolean;
/**
 * Win check: every island has exactly its number of bridge ends, the bridges
 * form one connected group, and no two bridges cross.
 * @param islands - the level's islands.
 * @param placed - the player's bridges.
 */
export declare function isSolved(islands: Island[], placed: Placed): boolean;
/**
 * Count the solutions of a puzzle's island/number set (the generator's own
 * `bridges` field is ignored — a player only ever sees the numbers).
 *
 * Backtracking over the legal pairs with constraint propagation: branch on the
 * island with the fewest open bridge options, enumerate the ways to spend its
 * remaining count, prune on over-bridged islands, unreachable remainders,
 * crossings, and an odd total remainder.
 * @param puzzle - the level to solve.
 * @param budget - search-node cap.
 * @returns 0, 1, or 2 (capped: 2 means "at least two"), or -1 when the budget
 * ran out before the search completed.
 */
export declare function countSolutions(puzzle: HashiPuzzle, budget?: number): number;
/**
 * A deterministic level for one seed: random rolls at `seed`, `seed+1`, …,
 * each verified by {@link countSolutions}; the first roll proven unique wins.
 *
 * RELAXATION: if no roll is proven unique within {@link MAX_ATTEMPTS} the best
 * roll is kept with `unique: false` — it is still solvable (the generator's own
 * bridges are a solution), so the level stays playable and the badge reads
 * 「多解」 instead of lying with 「唯一解」.
 * @param seed - base seed; attempts advance it by one.
 * @param size - board edge length in cells (see {@link LEVEL_SIZES}).
 */
export declare function puzzleFromSeed(seed: number, size: number): HashiPuzzle;
