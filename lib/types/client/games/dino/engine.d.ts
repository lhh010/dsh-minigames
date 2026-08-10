/**
 * Dino runner pure logic: physics, spawning, and collision as deterministic
 * functions over a plain state object. No DOM, no timers — the game instance
 * in index.ts drives this with requestAnimationFrame, and the unit tests
 * drive it with fixed dt and a seeded rng.
 */
/** Logical viewport width in px (height is GROUND_Y + a small margin). */
export declare const VIEW_W = 600;
/** Ground line y (canvas coordinates); low enough for a full jump arc. */
export declare const GROUND_Y = 165;
/** Dino's fixed horizontal position (left edge). */
export declare const DINO_X = 60;
/** Standing dino hitbox. */
export declare const DINO_W = 46;
export declare const DINO_H = 50;
/** Ducking dino hitbox (only while on the ground). */
export declare const DUCK_H = 26;
/** Horizontal scroll px per score point (score = distance / this). */
export declare const SCORE_PER_POINT = 10;
/** Score interval between day/night toggles. */
export declare const THEME_INTERVAL = 800;
/** Every this many points, a rain window starts (1000, 2000, ...). */
export declare const RAIN_START = 1000;
/** Rain window length in points: [mark, mark + RAIN_LENGTH). */
export declare const RAIN_LENGTH = 300;
export interface DinoRect {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface Obstacle {
    kind: 'cactus' | 'cactus-double' | 'bird' | 'bird-ground';
    x: number;
    w: number;
    h: number;
    /** Top edge (canvas coordinates); birds float, cacti sit on the ground. */
    y: number;
}
export interface DinoInput {
    /** Jump is edge-triggered: the caller sets it for the frame the key/click lands. */
    jump: boolean;
    /** Duck is level-triggered: held while the key is down. */
    duck: boolean;
}
export interface DinoState {
    /** Elapsed run time in seconds (frozen once over). */
    t: number;
    /** Current horizontal scroll speed in px/s (grows with score, capped). */
    speed: number;
    /** Total scrolled distance in px; the score derives from it. */
    distance: number;
    /** Score = floor(distance / SCORE_PER_POINT). */
    score: number;
    /** Day/night theme, toggled every THEME_INTERVAL points. */
    night: boolean;
    /** Rain window: drifting rain + fog for RAIN_LENGTH points every RAIN_START. */
    raining: boolean;
    /** Lightning flash intensity 0..1 during rain (decays over ~0.14s). */
    lightning: number;
    /** Seconds until the next lightning strike (counts down while raining). */
    nextStrikeIn: number;
    dino: {
        x: number;
        /** Top edge. */
        y: number;
        vy: number;
        onGround: boolean;
        ducking: boolean;
    };
    obstacles: Obstacle[];
    /** Seconds until the next obstacle spawns. */
    nextSpawnIn: number;
    over: boolean;
    /** Seeded rng for deterministic tests. */
    rng: () => number;
}
/** A new run at the starting line. */
export declare function createDinoState(rng?: () => number): DinoState;
/** The dino's current collision rect: follows the jump, ducking shrinks it. */
export declare function dinoRect(state: DinoState): DinoRect;
/** Shrunk AABB overlap test — the forgiving hitbox the runner actually uses. */
export declare function collides(a: DinoRect, b: DinoRect): boolean;
/**
 * Advance the run by dt seconds.
 * @param state - the run state (mutated in place).
 * @param dt - elapsed seconds (clamp to <=1/30 upstream).
 * @param input - this frame's input.
 */
export declare function step(state: DinoState, dt: number, input: DinoInput): void;
