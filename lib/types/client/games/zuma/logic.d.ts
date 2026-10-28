/**
 * Zuma (祖玛) pure logic: a chain of colored balls rolls along a fixed
 * S-curve track toward a sink hole. The shooter at screen center fires a
 * ball into the chain; 3+ consecutive same-color balls explode, the chain
 * splits, and the trailing segment pulls forward at a constant closing
 * speed — matching junction colors merge and can chain-react.
 *
 * All randomness flows through an injected mulberry32 rng reseeded
 * deterministically per level (baseSeed ^ level), so a restart of the same
 * level replays identically. The renderer (render.ts) only draws state.
 */
export declare const LOGICAL_W = 480;
export declare const LOGICAL_H = 640;
/** Ball radius in logical px; adjacent chain balls touch (SPACING = 2R). */
export declare const BALL_R = 11;
export declare const SPACING: number;
/** Level speed model: 26 + 4N px/s, capped. */
export declare const BASE_SPEED = 26;
export declare const SPEED_PER_LEVEL = 4;
export declare const MAX_SPEED = 66;
/** Extra speed a trailing segment gains while closing a gap (constant close rate). */
export declare const GAP_CLOSE_SPEED = 70;
export declare const SHOT_SPEED = 460;
export declare const AIM_SPEED = 2.2;
/** Gap-closing merge award per ball of the trailing segment. */
export declare const MERGE_POINTS_PER_BALL = 5;
/** Explosion award per ball, multiplied by the chain-reaction depth. */
export declare const MATCH_POINTS_PER_BALL = 10;
/** The head ball is lost once it reaches the sink rim. */
export declare const SINK_R = 20;
/** Shooter mount (screen center of the lower half, clear of the track). */
export declare const SHOOTER: {
    readonly x: 250;
    readonly y: 430;
};
/** Stable palette; per-level color count slices a prefix. */
export declare const PALETTE: readonly ["#f7768e", "#7aa2f7", "#9ece6a", "#e0af68", "#bb9af7"];
/** Total track length in px (fixed; the track itself has no randomness). */
export declare const TRACK_LENGTH: number;
/** A point on the track at arc length s (clamped), with the tangent angle. */
export declare function trackAt(s: number): {
    x: number;
    y: number;
    a: number;
};
/** One chain ball: track position s (head-first array: index 0 = largest s). */
export interface Ball {
    s: number;
    /** Palette color index. */
    color: number;
}
export interface Shot {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: number;
}
export type GameResult = 'ready' | 'playing' | 'paused' | 'over';
export type ZumaEvent = {
    kind: 'fire';
} | {
    kind: 'insert';
    at: number;
} | {
    kind: 'match';
    count: number;
    depth: number;
    points: number;
    x: number;
    y: number;
} | {
    kind: 'merge';
    count: number;
    points: number;
    x: number;
    y: number;
} | {
    kind: 'miss';
} | {
    kind: 'level';
    level: number;
} | {
    kind: 'over';
};
export interface ZumaState {
    result: GameResult;
    baseSeed: number;
    level: number;
    score: number;
    /** Chain-reaction depth for combo scoring; resets on each player insert. */
    chainDepth: number;
    balls: Ball[];
    /** Balls still to spawn this level. */
    remaining: number;
    spawnTimer: number;
    shot: Shot | null;
    /** Shooter aim angle (radians; -PI/2 points up). */
    angle: number;
    current: number;
    next: number;
    t: number;
    msg: string;
    msgTimer: number;
    events: ZumaEvent[];
    rng: () => number;
}
export interface ZumaInput {
    left: boolean;
    right: boolean;
}
/** mulberry32 seeded PRNG. */
export declare function mulberry32(seed: number): () => number;
/** Level speed in px/s: 26 + 4N, capped at MAX_SPEED. */
export declare function levelSpeed(level: number): number;
/** Color count: 4 on levels 1-2, 5 from level 3. */
export declare function colorCount(level: number): number;
/** Spawn interval grows slightly with the level. */
export declare function spawnInterval(level: number): number;
/** Total chain balls a level spawns. */
export declare function levelBallCount(level: number): number;
/** Deterministic per-level seed: restart replays the same layout. */
export declare function levelSeed(baseSeed: number, level: number): number;
/** (Re)start a level: fresh chain, deterministic rng, shooter reloaded. */
export declare function startLevel(state: ZumaState, level: number): void;
/** A fresh game in the ready state at level 1 (glue overrides the level). */
export declare function createState(seed?: number): ZumaState;
/** Start (or restart after over) the current level; resets the score. */
export declare function startRun(state: ZumaState): void;
/** Toggle between playing and paused; no-op otherwise. */
export declare function togglePause(state: ZumaState): void;
/** Maximal same-color run (of touching balls) containing index idx: [lo, hi]. */
export declare function runAround(balls: readonly Ball[], idx: number): [number, number];
/**
 * Resolve a potential match around idx; explodes a 3+ run and awards
 * 10/ball × depth. Returns the exploded count (0 when no match).
 */
export declare function resolveMatches(state: ZumaState, idx: number, depth: number): number;
/**
 * Advance the chain one dt: the head group moves at the level speed; each
 * trailing group gains GAP_CLOSE_SPEED so its gap to the group ahead closes
 * at a constant rate. On contact the group snaps flush, a gap-closed merge
 * awards 5/ball of the trailing segment, and matching junction colors
 * chain-react (explode at depth+1).
 */
export declare function advanceChain(state: ZumaState, dt: number): void;
/**
 * Insert a fired ball directly after chain ball hitIdx: it takes position
 * hit.s - SPACING and the whole tail side shifts back by SPACING (spacing
 * behind is preserved). Then the insertion match resolves at depth 1.
 */
export declare function insertBall(state: ZumaState, hitIdx: number, color: number): void;
/** Aim the shooter at a logical-space point. */
export declare function setAim(state: ZumaState, x: number, y: number): void;
/**
 * Fire the current ball along the aim angle. The shooter never fires a
 * color absent from the chain (rerolled from chain colors when stale).
 */
export declare function fire(state: ZumaState): boolean;
/**
 * Advance the game by dt seconds under the held aim inputs. Mutates the
 * state in place; only runs while playing.
 */
export declare function step(state: ZumaState, dt: number, input?: ZumaInput): void;
