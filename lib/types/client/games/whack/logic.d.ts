/**
 * Whack-a-mole pure logic: a 5x5 grid of holes; up to five moles pop up in
 * random holes for short windows and the player clicks holes to whack them.
 * 30-second rounds, +1 per hit, -1 per miss (floor 0). Deterministic
 * functions over a plain state object driven by an explicit clock.
 */
export declare const HOLES = 25;
export declare const DURATION = 30;
export declare const MAX_MOLES = 5;
export interface WhackState {
    /** Holes with a mole up right now (never more than MAX_MOLES). */
    moles: number[];
    /** Seconds until each mole retreats (parallel to `moles`). */
    moleTimes: number[];
    /** Seconds remaining in the round. */
    remaining: number;
    score: number;
    over: boolean;
    /** Countdown until the next mole pops up (while under MAX_MOLES). */
    spawnT: number;
    rng: () => number;
}
/** A fresh round: no moles, full timer. */
export declare function createWhackState(rng?: () => number): WhackState;
/** Advance the round clock: timer, mole retreats and pops. */
export declare function tickWhack(state: WhackState, dt: number): void;
/** Click a hole: hit a mole +1, miss -1. Returns whether it was a hit. */
export declare function whack(state: WhackState, hole: number): boolean;
