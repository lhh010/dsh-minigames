/**
 * Chess AI: negamax with alpha-beta pruning, MVV-LVA move ordering,
 * quiescence search over captures/promotions, iterative deepening with a
 * node budget, and material + piece-square-table evaluation. Fully
 * deterministic for identical position/depth/budget/seed — a seeded
 * mulberry32 stream breaks ties among equal-scored root moves only.
 */
import { type Move, type Position } from './logic.ts';
/** Hard cap on visited nodes per chooseMove call (all levels share it). */
export declare const NODE_BUDGET = 50000;
export declare const MATE = 100000;
/** Per-level search depths (ply): L1 d2, L2 d3, L3 d4, L4 d5. */
export declare const LEVEL_DEPTH: readonly [2, 3, 4, 5];
/**
 * Static evaluation (centipawns) from the SIDE-TO-MOVE's perspective:
 * material + piece-square tables, White-positive then sign-flipped for Black.
 */
export declare function evaluate(pos: Position): number;
/** Seeded PRNG (mulberry32): deterministic tie-breaking among equal-scored root moves. */
export declare function mulberry32(seed: number): () => number;
export interface SearchResult {
    move: Move | null;
    /** Nodes actually visited (≤ budget + small overshoot). */
    nodes: number;
    /** Deepest iteration whose scores were fully computed. */
    depth: number;
}
/**
 * Pick a move by iterative deepening to `maxDepth` under `budget` nodes.
 * Root moves each search a FULL window: a narrowed window would return
 * fail-soft bounds incomparable across siblings. Ties among equal-scored
 * root moves break via the seeded rng (deterministic per seed).
 */
export declare function chooseMove(pos: Position, maxDepth: number, budget?: number, seed?: number): SearchResult;
