/**
 * 跳一跳 pure logic: hold to charge a jump, release to leap onto the next
 * platform. Landing near the platform centre scores a bonus; missing the
 * platform ends the run. Deterministic functions over a plain state object.
 */
export interface Platform {
    x: number;
    w: number;
}
export interface HopState {
    /** Current platform index (the one the player is on). */
    index: number;
    platforms: Platform[];
    /** Player horizontal position (world units). */
    playerX: number;
    /** Vertical velocity during a jump (world units/s). */
    vy: number;
    /** Vertical position during a jump (0 = on a platform). */
    y: number;
    /** Charge power 0..1 while holding. */
    power: number;
    /** Airborne flag. */
    jumping: boolean;
    /** True while the fall-off animation is playing (after `over`). */
    falling: boolean;
    score: number;
    over: boolean;
    rng: () => number;
}
/** Fall depth (world units) after which the fall-off animation ends. */
export declare const FALL_END = 150;
/** A fresh run: start platform + two ahead. */
export declare function createHopState(rng?: () => number): HopState;
/** Append platforms far enough ahead. */
export declare function extendPlatforms(state: HopState): void;
/** Start charging (held input). */
export declare function startCharge(state: HopState): void;
/** Advance the charge while held. */
export declare function charge(state: HopState, dt: number): void;
/** Release: jump with the current charge. */
export declare function jump(state: HopState): void;
/** Advance one frame. Returns whether the run ended this frame. */
export declare function stepHop(state: HopState, dt: number): boolean;
