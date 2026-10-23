/**
 * Stack (堆塔) pure logic: blocks of width W slide horizontally (ping-pong)
 * at the current top layer; drop() trims the slider to its overlap with the
 * block below — a perfect drop (offset ≤ PERFECT_TOL px) keeps the full
 * width, anything else cuts the overhang off as a falling piece, and no
 * overlap at all collapses the tower. Speed ramps every RAMP_EVERY layers;
 * slider direction alternates layer by layer; per-layer speed jitter comes
 * from the seeded mulberry32 stream, so a run is deterministic given (seed,
 * dt, drop timings). Time is in milliseconds throughout.
 */
/** Logical canvas size (HUD strip lives inside this height). */
export declare const W = 420;
export declare const H = 640;
export declare const HUD_H = 30;
/** Layer geometry: every block is BLOCK_H tall; the tower stands on BASE_Y. */
export declare const BLOCK_H = 24;
export declare const BASE_Y: number;
/** Width of the ground (layer 0) block. */
export declare const START_W = 240;
/** Slider offset (px) at or under which a drop counts as perfect. */
export declare const PERFECT_TOL = 3;
/** Slider speed at layer 0 and the additive ramp per 5 layers, px/s. */
export declare const BASE_SPEED = 150;
export declare const SPEED_STEP = 22;
export declare const RAMP_EVERY = 5;
export declare const NORMAL_SCORE = 1;
export declare const PERFECT_SCORE = 3;
export declare const STREAK_BONUS = 10;
/** Every STREAK_BONUS_EVERY-th consecutive perfect pays STREAK_BONUS extra. */
export declare const STREAK_BONUS_EVERY = 5;
/** Gravity on cut-off overhang pieces, px/s². */
export declare const GRAVITY = 1100;
/** Falling pieces are culled this far below the ground line, px. */
export declare const FALL_CULL = 320;
/**
 * mulberry32 PRNG: small, fast, seedable — used for the initial slider side
 * and the per-layer speed jitter.
 * @param seed - any uint32; identical seeds produce identical streams.
 * @returns a () => number in [0, 1).
 */
export declare function mulberry32(seed: number): () => number;
/** One placed block: left edge x and width w (both in logical px). */
export interface PlacedBlock {
    x: number;
    w: number;
}
/** The moving block at the top layer. */
export interface Slider {
    x: number;
    w: number;
    /** +1 slides right, -1 slides left; ping-pong reflects at the walls. */
    dir: number;
    /** Current speed in px/s (BASE_SPEED ramp × per-layer jitter). */
    speed: number;
}
/** A cut-off overhang tumbling off the tower. */
export interface FallingPiece {
    x: number;
    w: number;
    /** Top edge y in tower coordinates (y grows downward, BASE_Y is ground). */
    y: number;
    vy: number;
}
export interface StackState {
    /** Placed layers, bottom (layer 0, the ground slab) first. */
    blocks: PlacedBlock[];
    slider: Slider;
    falling: FallingPiece[];
    /** Number of placed layers above the ground slab. */
    layers: number;
    score: number;
    /** Consecutive perfect drops; a normal drop resets it to 0. */
    streak: number;
    over: boolean;
    rng: () => number;
}
/** Top-edge y of layer `i` in tower coordinates. */
export declare function layerTopY(i: number): number;
/** Slider speed for a layer count, ramped every RAMP_EVERY layers. */
export declare function sliderSpeed(layers: number): number;
/**
 * A fresh run: ground slab centered, first slider entering from a seeded
 * side with jittered speed.
 * @param seed - mulberry32 seed for the side/speed jitter stream.
 */
export declare function createState(seed: number): StackState;
/**
 * Advance the ping-pong slider and the falling pieces by `dt` ms. No input
 * here — dropping is {@link drop}. Does nothing once the tower collapsed.
 * @param state - the run (mutated in place).
 * @param dt - elapsed milliseconds (clamp upstream).
 */
export declare function step(state: StackState, dt: number): void;
/** What one drop did to the tower. */
export type DropResult = 'perfect' | 'ok' | 'gameover';
export interface DropOutcome {
    state: StackState;
    result: DropResult;
    /** Overlap width in px; ≤ 0 means the tower collapsed. */
    overlap: number;
}
/**
 * Drop the slider onto the block below. The overlap becomes the new placed
 * block; the overhang (if any) detaches as a falling piece. Perfect drops
 * (offset ≤ PERFECT_TOL) keep the full width, score +PERFECT_SCORE, and pay
 * +STREAK_BONUS on every STREAK_BONUS_EVERY-th consecutive perfect; normal
 * drops score +NORMAL_SCORE and reset the streak. When the overlap is ≤ 0
 * the tower collapses. A new slider then enters from the alternating side.
 * @param state - the run (mutated in place; also returned).
 * @returns the outcome with the same state reference.
 */
export declare function drop(state: StackState): DropOutcome;
