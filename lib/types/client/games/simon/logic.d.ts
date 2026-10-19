/**
 * Simon pure logic: a growing pad sequence is shown by flashing, then the
 * player repeats it. Correct full repeat scores the round number and grows
 * the sequence by one; a wrong pad ends the game. Deterministic functions
 * over a plain state object — no DOM, no timers.
 */
export declare const PAD_COUNT = 4;
/** Keyboard codes for pads 0..3 (also drawn on the pads). */
export declare const PAD_KEYS: readonly ["KeyA", "KeyS", "KeyD", "KeyF"];
/** How long one pad glows during the show phase. */
export declare const FLASH_MS = 350;
/** Flash spacing at round 1. */
export declare const START_INTERVAL_MS = 600;
/** Flash spacing at round RAMP_ROUND and beyond. */
export declare const MIN_INTERVAL_MS = 300;
/** Round at which the ramp bottoms out. */
export declare const RAMP_ROUND = 10;
export type SimonPhase = 'idle' | 'showing' | 'input' | 'over';
export interface SimonState {
    phase: SimonPhase;
    /** The full sequence to repeat; length === round. */
    sequence: number[];
    /** Player input position during 'input'. */
    inputIndex: number;
    /** Which flash is currently showing during 'showing'. */
    showIndex: number;
    round: number;
    score: number;
    rng: () => number;
}
export declare function createSimonState(rng?: () => number): SimonState;
/** Flash spacing for a round: linear ramp from START_INTERVAL_MS at round 1 to MIN_INTERVAL_MS at RAMP_ROUND. */
export declare function flashInterval(round: number): number;
/** Begin a round: append one pad and (re)start the show phase from the first flash. */
export declare function startRound(state: SimonState): void;
/**
 * Advance the show phase by one flash.
 * @returns true when the whole sequence has been shown and the phase is now 'input'.
 */
export declare function advanceShow(state: SimonState): boolean;
/** The pad currently flashing (during 'showing'), or null. */
export declare function showingPad(state: SimonState): number | null;
/**
 * Press a pad during the input phase.
 * @returns 'ignored' outside 'input'; 'correct' for a continuing match;
 *   'round-clear' when the full sequence was repeated; 'wrong' on game over.
 */
export declare function press(state: SimonState, pad: number): 'ignored' | 'correct' | 'round-clear' | 'wrong';
