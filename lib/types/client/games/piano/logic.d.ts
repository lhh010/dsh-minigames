/**
 * Piano Tiles pure logic: 4 vertical lanes, one seeded active tile per row
 * scrolling down. Press a lane while its tile covers the judge line; long
 * tiles are HOLDS — press at the head, keep held until the tail passes the
 * line. Empty presses (no tile near the window) are free; early presses,
 * released holds, and tiles sliding past the window cost one of LIVES
 * misses; the run ends when the misses run out.
 *
 * All randomness flows through an injected mulberry32 rng so runs are
 * deterministic under a seed. The renderer (render.ts) only draws state.
 */
export declare const LANE_COUNT = 4;
/** Logical canvas height in px (render.ts mirrors this). */
export declare const LOGIC_H = 640;
/** One tile row height in px; 4 rows are visible. */
export declare const ROW_H = 160;
/** The judge line: tiles must cover it when pressed. */
export declare const LINE_Y: number;
/** Judge window half-height around LINE_Y (early/late tolerance). */
export declare const GRACE: number;
/** A tile is hittable while it overlaps this window (bottom >= HIT_MIN_Y). */
export declare const HIT_MIN_Y: number;
/** An unhit tile whose top passes this y has left the judge window: miss. */
export declare const MISS_Y: number;
/** Rows prefilled above the screen at run start (lead-in for reaction). */
export declare const PREFILL_ROWS = 8;
/** Probability a spawned tile is long (a hold). */
export declare const LONG_CHANCE = 0.18;
/** Misses allowed before the run ends. */
export declare const LIVES = 5;
/** A press counts as "early" (life loss) when a same-lane tile is this
 * close above the window top; farther away the press is a free empty tap. */
export declare const EARLY_RANGE: number;
export declare const BASE_SPEED = 340;
export declare const SPEED_PER_HIT = 7;
export declare const SPEED_ADD_MAX = 460;
/** Score bonus for holding a long tile through its tail. */
export declare const HOLD_BONUS = 3;
/** Timing grades shown on hit; PERFECT/GREAT/GOOD also scale the score. */
export type Grade = 'PERFECT' | 'GREAT' | 'GOOD' | 'BAD' | 'MISS';
/** |center − line| ≤ PERFECT_PX → PERFECT; ≤ GREAT_PX → GREAT; else GOOD. */
export declare const PERFECT_PX = 32;
export declare const GREAT_PX = 64;
/** Seconds the grade text stays on screen. */
export declare const GRADE_SHOW_S = 0.9;
/** Grade for a press whose tile-center sits `offset` px from the judge line. */
export declare function gradeFor(offset: number): Grade;
/** Score multiplier by grade (timing reward on top of the combo multiplier). */
export declare function gradeMultiplier(grade: Grade): number;
export type GameResult = 'ready' | 'playing' | 'paused' | 'over';
export interface Tile {
    /** Lane index 0..3. */
    lane: number;
    /** Screen y of the tile's top edge. */
    y: number;
    /** Row count this tile spans (1 normal, 2 long = hold). */
    len: number;
    /** Already resolved this run; resolved tiles scroll off harmlessly. */
    hit: boolean;
    /** A hold currently held by the player (head pressed, tail not past). */
    holding: boolean;
    /** The hold completed: head pressed AND held through the tail. */
    held: boolean;
}
export type PianoEvent = {
    kind: 'hit';
    lane: number;
    note: number;
    grade: Grade;
} | {
    kind: 'hold-start';
    lane: number;
} | {
    kind: 'hold-done';
    lane: number;
    points: number;
} | {
    kind: 'press';
    lane: number;
    empty: boolean;
} | {
    kind: 'miss-life';
    lane: number;
    reason: 'miss' | 'early' | 'drop';
    grade: Grade;
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
    /** Misses spent; the run ends at LIVES. */
    misses: number;
    tiles: Tile[];
    /** Per-lane press flash (seconds remaining, renderer feedback). */
    laneFlash: number[];
    /** Floating grade text: the grade, its lane, and the t it appeared at. */
    judge: {
        grade: Grade;
        lane: number;
        at: number;
    } | null;
    /** Why the run ended ('' while alive). */
    failReason: '' | 'miss' | 'early' | 'drop' | 'lives';
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
 * (len 2, a hold). Long tiles do not consume an extra row slot — spacing is
 * uniform.
 */
export declare function spawnTile(rng: () => number, y: number): Tile;
/** A fresh state in the ready (attract) state, prefilled deterministically.
 * The prefilled field starts ABOVE the screen: the lowest tile's top sits a
 * full row above y=0 so the first press is ~1.8s away at base speed — the
 * player gets a lead-in instead of an instant judgment. */
export declare function createState(seed?: number): PianoState;
/** Start (or restart) the run from ready/over with the SAME seed. */
export declare function startRun(state: PianoState): void;
/** Toggle between playing and paused; no-op otherwise. */
export declare function togglePause(state: PianoState): void;
/**
 * Press a lane.
 * - A tile overlapping the judge window: normal tiles resolve for combo
 *   score; long tiles ENTER a hold (hold-start) and complete when their
 *   tail passes the line while still held.
 * - No tile in the window, but a same-lane tile within EARLY_RANGE above
 *   it: an early press — costs one life.
 * - Nothing nearby: a free empty tap (combo resets, no life lost).
 */
export declare function pressLane(state: PianoState, lane: number): boolean;
/**
 * Release a lane key. Releasing while a hold's head has not yet crossed the
 * judge line drops the hold and costs a life; after the head crosses, the
 * release is irrelevant (completion is handled in step).
 */
export declare function releaseLane(state: PianoState, lane: number): void;
/**
 * Advance by dt seconds: scroll tiles, spawn rows above the top, decay the
 * lane-press flashes, complete holds whose tails pass the line, and spend a
 * life when an unhit tile leaves the judge window. No-op unless playing, so
 * a paused or over state never advances.
 */
export declare function step(state: PianoState, dt: number): void;
/**
 * Attract-mode step: the tile field scrolls behind the start screen without
 * spawning or failing; hit tiles never appear (nothing is pressed).
 */
export declare function attractStep(state: PianoState, dt: number): void;
