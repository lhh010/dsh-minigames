/**
 * Typing meteors pure logic: English words fall from the top; typing the
 * first letter of a word locks onto it, matching letters advance, completing
 * the word scores (+10 x letters, x1.5 at streak >= 5) and destroys it. A
 * word crossing the bottom line costs one of 3 lives. Deterministic
 * functions over a plain state object driven by an explicit ms clock.
 */
/** Pool of ~120 common words plus a few spaceless mini-phrases. */
export declare const WORDS: readonly ["cat", "dog", "sun", "map", "key", "ice", "fox", "owl", "sky", "red", "blue", "tree", "star", "moon", "fish", "bird", "book", "rain", "snow", "wind", "fire", "gold", "king", "queen", "ship", "road", "song", "time", "work", "life", "hand", "head", "eyes", "door", "food", "game", "home", "land", "name", "night", "play", "read", "city", "farm", "girl", "boy", "walk", "jump", "run", "fast", "slow", "warm", "cold", "deep", "high", "wide", "open", "close", "light", "dark", "apple", "grape", "lemon", "melon", "peach", "berry", "bread", "rice", "soup", "cake", "cloud", "storm", "field", "grass", "river", "ocean", "beach", "stone", "metal", "wood", "house", "tower", "chair", "table", "phone", "paper", "music", "dance", "smile", "dream", "magic", "sword", "shield", "castle", "dragon", "planet", "rocket", "puzzle", "wonder", "bright", "silver", "shadow", "winter", "summer", "spring", "friend", "family", "school", "letter", "number", "goforit", "letsgo", "comeon", "hurryup", "niceone", "goodjob", "okgo", "staycalm", "hangon", "yougotit"];
/** Spawn interval at elapsed 0. */
export declare const START_SPAWN_MS = 2600;
/** Spawn interval at RAMP_MS and beyond. */
export declare const MIN_SPAWN_MS = 1100;
/** Elapsed time over which spawn/speed ramp. */
export declare const RAMP_MS = 100000;
/** Fall speed at elapsed 0 (px/s). */
export declare const SPEED_START = 22;
/** Fall speed at RAMP_MS and beyond (px/s). */
export declare const SPEED_END = 46;
/** Lives per run. */
export declare const START_LIVES = 3;
/** Screen-shake duration after a wrong letter breaks the lock. */
export declare const SHAKE_MS = 220;
/** Logical y of the danger line (px); a word center reaching it costs a life. */
export declare const FALL_LINE_Y = 520;
/** Logical play-field width used for spawn x positions. */
export declare const FIELD_W = 480;
/** Minimum kept-clear margin on both field sides (px). */
export declare const SIDE_MARGIN = 12;
/** Vertical band (px) within which spawns avoid horizontal overlap. */
export declare const SPAWN_BAND = 30;
/** Y where words enter the field (px). */
export declare const SPAWN_Y = 36;
/**
 * Default rendered-width estimate (px) for a word when no font-measured
 * function is injected: monospace advance plus glow/padding allowance.
 */
export declare function defaultWordWidth(text: string): number;
export interface FallingWord {
    id: number;
    text: string;
    x: number;
    y: number;
}
export interface TypingState {
    words: FallingWord[];
    /** Id of the locked word, or null. */
    lockId: number | null;
    /** Matched prefix of the locked word. */
    typed: string;
    lives: number;
    score: number;
    /** Consecutive completed words without a wrong letter. */
    streak: number;
    over: boolean;
    /** Elapsed play time in ms (drives the ramps). */
    elapsed: number;
    /** Ms until the next spawn. */
    spawnT: number;
    /** Remaining shake time in ms (render hint). */
    shake: number;
    nextId: number;
    /** Last spawned word; the spawner never repeats it immediately. */
    lastWord: string | null;
    rng: () => number;
    /** Rendered width of a word (px); injected from real font metrics. */
    wordWidth: (text: string) => number;
}
/** A fresh run: empty field, full lives, first spawn almost due. */
export declare function createTypingState(rng?: () => number, wordWidth?: (text: string) => number): TypingState;
/** Current spawn interval in ms. */
export declare function spawnInterval(elapsedMs: number): number;
/** Current fall speed in px/s. */
export declare function fallSpeed(elapsedMs: number): number;
/** Pick a pool word, never the same as `last` immediately (pool > 1). */
export declare function pickWord(rng: () => number, last: string | null): string;
/**
 * Pick a spawn position for `text`: keep the word fully inside the side
 * margins and try random x values clear of in-band live words; if every
 * candidate clashes, retry one band higher so the word enters later, and on
 * a still-crowded field accept the least-overlapping x.
 * @returns position with x as the word's left edge.
 */
export declare function pickSpawn(state: TypingState, text: string): {
    x: number;
    y: number;
};
/**
 * Advance the field by `dtMs`: shake decay, fall, bottom-line life loss,
 * game over, and spawning (no immediate word repeats).
 */
export declare function tickTyping(state: TypingState, dtMs: number): void;
export type TypeResult = 'ignored' | 'miss' | 'lock' | 'match' | 'break' | 'complete';
/**
 * Type one letter [a-z].
 * @returns 'ignored' when over or not a letter; 'miss' when no word starts
 *   with it (no penalty); 'lock' when a word was just locked; 'match' for a
 *   continuing match; 'break' when a wrong letter broke the lock (streak
 *   resets, small shake); 'complete' when the locked word was finished.
 */
export declare function typeLetter(state: TypingState, ch: string): TypeResult;
/** ESC: release the lock without a streak penalty. */
export declare function escapeLock(state: TypingState): void;
