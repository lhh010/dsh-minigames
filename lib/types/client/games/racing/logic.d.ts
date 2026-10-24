/**
 * Neon Racing pure logic: a pseudo-3D lane racer. The player car sits at a
 * fixed perspective distance (PD) on a curving road; traffic spawns ahead and
 * drives slower; the player changes lanes, accelerates, brakes, and scores
 * for distance, passes, and near-miss combos until a collision.
 *
 * All randomness flows through an injected mulberry32 rng so runs are
 * deterministic under a seed. The renderer (render.ts) only draws state.
 */
export declare const LANES: readonly [-1.7, 0, 1.7];
export declare const ROAD_HW = 3.4;
export declare const RUMBLE_W = 0.35;
export declare const CAR_W = 1;
export declare const CAR_H = 0.75;
export declare const COLLIDE_X = 0.8;
export declare const NEAR_X = 1.35;
export declare const PD = 3;
export declare const SPAWN_Z = 170;
/** Visual distance of the roadside scenery (render-side constant, exported
 * here so the renderer and tests share one value). */
export declare const VIEW_D = 240;
/** Camera height above the road (world units) for the projection. */
export declare const CAM_H = 2;
export declare const MAX_SPEED = 92;
export declare const CRASH_OVER_S = 1.6;
export declare const COMBO_WINDOW_S = 3.2;
export declare const NEAR_MISS_POINTS = 100;
export declare const PASS_POINTS = 30;
export declare const DIST_POINTS_PER_UNIT = 0.5;
export type LaneInput = {
    left: boolean;
    right: boolean;
    accel: boolean;
    brake: boolean;
};
export type GameResult = 'ready' | 'playing' | 'paused' | 'over';
export interface Enemy {
    /** Lane index 0..2. */
    li: number;
    lane: number;
    z: number;
    /** The enemy's own world speed. */
    v: number;
    color: string;
    /** Near-miss already awarded for this enemy. */
    near: boolean;
    /** Already counted as passed. */
    passed: boolean;
}
export interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    max: number;
    size: number;
    color: string;
    grav: number;
}
export interface RacingState {
    result: GameResult;
    /** Seconds since the run started. */
    t: number;
    /** World distance travelled (also the scroll offset). */
    worldZ: number;
    speed: number;
    dist: number;
    score: number;
    passCount: number;
    laneIdx: number;
    /** Smoothed lateral offset (world units) toward the target lane. */
    playerLat: number;
    /** Lateral velocity (for the body roll), derived. */
    latVel: number;
    enemies: Enemy[];
    particles: Particle[];
    spawnTimer: number;
    crashed: boolean;
    crashTimer: number;
    combo: number;
    comboTimer: number;
    /** Seconds remaining on the floating message (near-miss/crash text). */
    msgTimer: number;
    msg: string;
    /** Events emitted by the last step (for audio/particle triggers in the glue). */
    events: RaceEvent[];
    rng: () => number;
}
export type RaceEvent = {
    kind: 'lane';
} | {
    kind: 'near-miss';
    points: number;
    side: number;
} | {
    kind: 'pass';
} | {
    kind: 'crash';
} | {
    kind: 'over';
};
/** Road centre lateral offset at world z (two summed sines = curves). */
export declare function centreAt(z: number): number;
/** mulberry32 seeded PRNG. */
export declare function mulberry32(seed: number): () => number;
export declare const ENEMY_COLORS: readonly ["#ff3b5c", "#ffd23f", "#f4f4f5", "#8b5cf6", "#34d399", "#fb923c", "#2563eb"];
/** A fresh run in the ready (attract) state. */
export declare function createState(seed?: number): RacingState;
/** Start (or restart) a run from the ready/over states. */
export declare function startRun(state: RacingState): void;
/** Toggle between playing and paused; no-op otherwise. */
export declare function togglePause(state: RacingState): void;
/** Request a lane change; clamped and only while playing. */
export declare function changeLane(state: RacingState, dir: number): boolean;
/** Base speed target for the current time (ramps with survival time). */
export declare function baseSpeedAt(t: number): number;
/**
 * Spawn a wave of 1-2 enemies, never blocking all three lanes within the
 * spawn horizon (so the player always has a way through).
 */
export declare function spawnWave(state: RacingState): void;
/**
 * Advance the world by dt seconds under the player's held inputs. Mutates the
 * state in place (the renderer reads it directly). Only runs while playing.
 */
export declare function step(state: RacingState, dt: number, input: LaneInput): void;
/** Attract-mode step: the road scrolls behind the start screen. */
export declare function attractStep(state: RacingState, dt: number): void;
/** The player's smoothed world position at the perspective plane. */
export declare function playerWorldX(state: RacingState): number;
/** Camera lateral offset (partially follows the player). */
export declare function cameraX(state: RacingState): number;
/** Horizontal lanes currently blocked near the spawn horizon. */
export declare function blockedLanes(state: RacingState): Set<number>;
