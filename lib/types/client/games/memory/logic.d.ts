/**
 * Memory-match pure logic: a grid of face-down cards; flip two at a time and
 * matching pairs are removed. Finished when all pairs are matched. The deck is
 * always solvable by construction (pairs of the same symbol). Deterministic
 * functions over a plain state object.
 */
export declare const PAIRS = 8;
export declare const COLS = 4;
export declare const ROWS = 4;
export interface MemoryState {
    /** Card symbol id (0..PAIRS-1); null when removed. */
    cards: (number | null)[];
    /** Indices currently face-up (max 2). */
    flipped: number[];
    matched: number;
    moves: number;
    finished: boolean;
    rng: () => number;
}
/** A fresh shuffled deck: PAIRS symbols, each appearing twice. */
export declare function createMemoryState(rng?: () => number): MemoryState;
/** Flip a card. Returns 'match' | 'mismatch' | 'noop' when the flip resolved a pair. */
export declare function flip(state: MemoryState, index: number): 'match' | 'mismatch' | 'noop';
/** Turn any face-up cards back down (e.g. after a mismatch reveal delay). */
export declare function resetFlip(state: MemoryState): void;
