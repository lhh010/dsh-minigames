/**
 * Pseudo-3D racing pure logic: an endless straight road where the player's car
 * accelerates, steers left/right across 3 lanes, and dodges approaching
 * obstacles (cones, rocks, barrels, cars, barriers). Score is distance-based;
 * the speed cap rises with score for escalating intensity. Deterministic
 * functions over a plain state object — the game instance in index.ts drives
 * this with requestAnimationFrame, and the unit tests drive it directly.
 */
export interface Obstacle {
    type: 'cone' | 'rock' | 'barrel' | 'car' | 'barrier';
    /** Lane center offset: -0.6 = left, 0 = center, 0.6 = right. */
    lane: number;
    /** Distance ahead: SPAWN_Z = far, 0 = at the player. */
    z: number;
    /** Forward speed (only 'car' obstacles move; others are static on the road). */
    speed: number;
}
export interface RacingInput {
    left: boolean;
    right: boolean;
    throttle: boolean;
    brake: boolean;
    handbrake: boolean;
}
export interface RacingState {
    speed: number;
    /** -1 = left road edge, 0 = center, 1 = right edge. */
    carX: number;
    distance: number;
    score: number;
    obstacles: Obstacle[];
    nextSpawnZ: number;
    shake: number;
    flash: number;
    over: boolean;
    rng: () => number;
}
/** Distance ahead where obstacles spawn. */
export declare const SPAWN_Z = 100;
export declare const SCORE_PER_POINT = 10;
/** Current speed cap, rising with score. */
export declare function maxSpeed(score: number): number;
/** A fresh run at the starting line. */
export declare function createRacingState(rng?: () => number): RacingState;
/**
 * Advance the run by dt seconds.
 * @param state - the run state (mutated in place).
 * @param dt - elapsed seconds.
 * @param input - held keys this frame.
 */
export declare function step(state: RacingState, dt: number, input: RacingInput): void;
