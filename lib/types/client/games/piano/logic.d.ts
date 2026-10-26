/**
 * Piano Tiles pure logic: 4 vertical lanes, one seeded active tile per row
 * scrolling down; a lane press in the hit zone scores with a combo
 * multiplier, a press with no tile in the zone (wrong lane or too early) or
 * a tile scrolling fully past the bottom ends the run (classic rules).
 *
 * All randomness flows through an injected mulberry32 rng so runs are
 * deterministic under a seed. The renderer (render.ts) only draws state.
 */
export declare const LANE_COUNT = 4;
/** Logical canvas height in px (render.ts mirrors this). */
export declare const LOGIC_H = 640;
/** One tile row height in px; 4 rows are visible. */
export declare const ROW_H = 160;
/** Tiles are hittable once their top edge is below this y. */
export declare const HIT_MIN_Y: number;
/** An unhit tile whose top passes this y (the bottom edge) is a miss. */
export declare const MISS_Y = 640;
/** Rows prefilled above/at the screen at run start. */
export declare const PREFILL_ROWS = 5;
/** Probability a spawned tile is long (2 rows, counts as one hit). */
export declare const LONG_CHANCE = 0.18;
export declare const BASE_SPEED = 340;
export declare const SPEED_PER_HIT = 7;
export declare const SPEED_ADD_MAX = 460;
export type GameResult = 'ready' | 'playing' | 'paused' | 'over';
export interface Tile {
    /** Lane index 0..3. */
    lane: number;
    /** Screen y of the tile's top edge. */
    y: number;
    /** Row count this tile spans (1 normal, 2 long; long = one hit). */
    len: number;
    /** Already hit this run; hit tiles scroll off harmlessly. */
    hit: boolean;
}
export type PianoEvent = {
    kind: 'hit';
    lane: number;
    note: number;
} | {
    kind: 'fail';
    reason: 'miss' | 'wrong';
} | {
    kind: 'over';
};
export interface PianoState {
    result: GameResult;
    /** The run seed; R restarts the identical run. */
    seed: number;
    rng: () => number;
    /** Seconds since the run started. */
    t: number;
    /** Scroll speed in px/s, derived from hits. */
    speed: number;
    score: number;
    combo: number;
    /** Total successful hits (drives speed and the note scale). */
    hits: number;
    tiles: Tile[];
    /** Why the run ended ('' while alive). */
    failReason: '' | 'miss' | 'wrong';
    events: PianoEvent[];
}
/** mulberry32 seeded PRNG. */
export declare function mulberry32(seed: number): () => number;
/** Scroll speed for a hit count: ramps linearly, capped. */
export declare function speedAt(hits: number): number;
/** Combo multiplier: 1 at combo 0, +1 every 8 combo, capped at 8. */
export declare function comboMultiplier(combo: number): number;
/**
 * Spawn one row: exactly one lane is active; occasionally the tile is long
 * (len 2). Long tiles do not consume an extra row slot — spacing is uniform.
 */
export declare function spawnTile(rng: () => number, y: number): Tile;
/** A fresh state in the ready (attract) state, prefilled deterministically. */
export declare function createState(seed?: number): PianoState;
/** Start (or restart) the run from ready/over with the SAME seed. */
export declare function startRun(state: PianoState): void;
/** Toggle between playing and paused; no-op otherwise. */
export declare function togglePause(state: PianoState): void;
/**
 * Press a lane. A hit requires an unhit tile in that lane whose top edge is
 * inside the hit zone ([HIT_MIN_Y, MISS_Y]); otherwise the press is a miss
 * and the run ends. Wrong lane and too-early presses both fail here.
 */
export declare function pressLane(state: PianoState, lane: number): boolean;
/**
 * Advance by dt seconds: scroll tiles, spawn rows above the top, and fail
 * the run when an unhit tile fully scrolls past the bottom. No-op unless
 * playing, so a paused or over state never advances.
 */
export declare function step(state: PianoState, dt: number): void;
/**
 * Attract-mode step: the tile field scrolls behind the start screen without
 * spawning or failing; hit tiles never appear (nothing is pressed).
 */
export declare function attractStep(state: PianoState, dt: number): void;
