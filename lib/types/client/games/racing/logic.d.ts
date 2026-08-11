/**
 * Pseudo-3D racing pure logic: an endless racer modelled after classic
 * OutRun / Pole Position. Speed scales with score; obstacles spawn far ahead
 * (z = SPAWN_Z) and approach the camera (z → 0); collisions cost speed and
 * trigger a screen shake + flash. No DOM, no timers — the game instance in
 * index.ts drives this with requestAnimationFrame, and the unit tests drive
 * it with fixed dt and a seeded rng.
 */
/** Logical viewport width in px (matches render.VIEW_W). */
export declare const VIEW_W = 480;
/** Logical viewport height in px (matches render.VIEW_H). */
export declare const VIEW_H = 320;
/** carX range: -1 = left edge, 0 = center, 1 = right edge. */
export declare const ROAD_HALF_WIDTH = 1;
/** The three lane centres on the road (-1 = left, 0 = center, 1 = right). */
export declare const LANES: readonly [-0.6, 0, 0.6];
/** Distance at which obstacles spawn; they approach the player as z → 0. */
export declare const SPAWN_Z = 100;
/** Base top speed; the actual cap rises with score via maxSpeed. */
export declare const MAX_SPEED = 45;
/** Acceleration when the throttle is held (m/s²). */
export declare const ACCEL = 20;
/** Brake deceleration (m/s²). */
export declare const BRAKE = 35;
/** Coast (no input) drag deceleration (m/s²). */
export declare const COAST = 4;
/** Handbrake deceleration (m/s²). */
export declare const HANDBRAKE = 50;
/** carX change per second at full steer (speed-scaled inside step). */
export declare const STEER_RATE = 2.5;
/** Speed multiplier while off-road (|carX| > 1). */
export declare const GRASS_PENALTY = 0.5;
/** Speed is multiplied by this on a collision. */
export declare const COLLISION_SPEED_LOSS = 0.4;
/** distance / this = score (distance is in px-equivalent units). */
export declare const SCORE_PER_POINT = 10;
/** Base z-units between obstacle spawns; shrinks slightly with score. */
export declare const SPAWN_INTERVAL_BASE = 12;
/** All obstacle archetypes. */
export type ObstacleType = 'cone' | 'rock' | 'barrel' | 'car' | 'barrier';
/** The lane an obstacle occupies: -1 left, 0 center, 1 right. */
export type Lane = -1 | 0 | 1;
export interface Obstacle {
    type: ObstacleType;
    /** Lane centre index: -1, 0, or 1 (maps to LANES). */
    lane: Lane;
    /** Distance ahead; SPAWN_Z far away, 0 at the player car. */
    z: number;
    /** Forward speed of the obstacle (only type 'car' moves under its own power). */
    speed: number;
}
export interface RacingInput {
    /** Steer left (A / ←), level-triggered. */
    left: boolean;
    /** Steer right (D / →), level-triggered. */
    right: boolean;
    /** Accelerate (W / ↑), level-triggered. */
    throttle: boolean;
    /** Brake (S / ↓), level-triggered. */
    brake: boolean;
    /** Handbrake (Space), level-triggered. */
    handbrake: boolean;
}
export interface RacingState {
    /** Current speed along the road in m/s. */
    speed: number;
    /** Horizontal position: -1 left edge, 0 center, 1 right edge. */
    carX: number;
    /** Total travelled distance (px-equivalent); the score derives from it. */
    distance: number;
    /** Score = floor(distance / SCORE_PER_POINT). */
    score: number;
    obstacles: Obstacle[];
    /** Distance until the next obstacle spawns (in z-units). */
    nextSpawnZ: number;
    /** Collision shake remaining (seconds; the renderer scales amplitude by it). */
    shake: number;
    /** Collision flash remaining, 0..1 (a white overlay the renderer fades out). */
    flash: number;
    /** Whether the run has ended. */
    over: boolean;
    /** Seeded rng for deterministic tests. */
    rng: () => number;
}
/** The speed cap at a given score: rises from 45 toward 80. */
export declare function maxSpeed(score: number): number;
/** A fresh run at the starting line. */
export declare function createRacingState(rng?: () => number): RacingState;
/** Roll one random obstacle at z = SPAWN_Z. */
export declare function spawnObstacle(state: RacingState): Obstacle;
/**
 * Whether the player car (at carX) overlaps an obstacle at the given lane when
 * the obstacle is within COLLISION_Z of the camera. Wide barriers also nudge
 * into the adjacent lane.
 * @param state - the run state (reads carX).
 * @param obstacle - the obstacle to test.
 * @returns true on a collision this frame.
 */
export declare function checkCollision(state: RacingState, obstacle: Obstacle): boolean;
/**
 * Advance the run by dt seconds.
 * @param state - the run state (mutated in place).
 * @param dt - elapsed seconds (clamp to <=1/30 upstream).
 * @param input - this frame's held inputs.
 */
export declare function step(state: RacingState, dt: number, input: RacingInput): void;
