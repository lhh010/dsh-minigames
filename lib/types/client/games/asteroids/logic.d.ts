/**
 * Asteroids pure logic: a vector world with inertia physics — a thrusting,
 * rotating ship, rate-limited bullets, jagged rocks that split twice (large →
 * medium → small), wrap-around edges, wrap-aware collisions, lives with
 * respawn invulnerability, and endless waves. Deterministic given
 * (dt, input, rng); the game instance in index.ts drives it with rAF and the
 * unit tests drive it directly. Time is in milliseconds throughout.
 */
/** Logical canvas size. */
export declare const W = 960;
export declare const H = 600;
export type RockSize = 'large' | 'medium' | 'small';
/** Collision/spawn radii per rock size. */
export declare const ROCK_RADIUS: Record<RockSize, number>;
/** Score awarded for shooting a rock of each size. */
export declare const ROCK_SCORE: Record<RockSize, number>;
export declare const FIRE_INTERVAL = 180;
export declare const MAX_BULLETS = 8;
export declare const BULLET_LIFE = 1100;
export declare const RESPAWN_INVULN = 2000;
export declare const WAVE_DELAY = 1500;
export interface Ship {
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** Heading in radians; 0 points up, growing clockwise. */
    angle: number;
    /** Whether thrust was applied this step (render draws the flame). */
    thrusting: boolean;
}
export interface Rock {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: RockSize;
    /** Current body rotation in radians. */
    angle: number;
    /** Rotation speed in rad/s (signed). */
    spin: number;
    /**
     * Stable per-vertex radius multipliers (0.72–1.28), one per VERT_COUNT
     * slice: the pregenerated jagged silhouette of this rock.
     */
    verts: number[];
}
export interface Bullet {
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** Remaining lifetime in ms. */
    life: number;
}
export interface PlayerInput {
    left: boolean;
    right: boolean;
    thrust: boolean;
    /** Fire is level-triggered; the world respects the rate limit. */
    fire: boolean;
}
/** One rock destruction this step — the render side bursts particles here. */
export interface DestructionEvent {
    x: number;
    y: number;
    size: RockSize;
}
export interface AsteroidsState {
    ship: Ship;
    rocks: Rock[];
    bullets: Bullet[];
    /** Rock destructions of the most recent step; cleared on each entry. */
    events: DestructionEvent[];
    score: number;
    wave: number;
    lives: number;
    result: 'none' | 'lose';
    /** ms until firing is allowed again. */
    fireCooldown: number;
    /** ms of remaining respawn invulnerability. */
    invuln: number;
    /** ms until the next wave spawns; null while rocks remain. */
    waveClearTimer: number | null;
    t: number;
    rng: () => number;
}
/** A fresh world at wave 1 with the ship centered. */
export declare function createAsteroids(rng?: () => number): AsteroidsState;
/**
 * Advance the world by dt milliseconds under the player's held inputs.
 * @param state - the world (mutated in place).
 * @param dt - elapsed milliseconds (clamp upstream; large steps blur physics).
 * @param input - player held keys this step.
 */
export declare function updateAsteroids(state: AsteroidsState, dt: number, input: PlayerInput): void;
