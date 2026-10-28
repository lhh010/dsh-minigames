/**
 * Mini Pool pure logic: a single-player 2D billiards challenge. Nine numbered
 * balls rack in a diamond on the foot spot; the player shoots the cue ball
 * with a clamped power and must pot all nine within a per-level shot budget.
 *
 * All randomness flows through an injected mulberry32 rng (rack jitter), so a
 * level seed always produces the same rack. The renderer (render.ts) only
 * draws state; the glue (index.ts) owns input and audio.
 */
/** Playfield inner size (cushion faces); the 2:1 table ratio. */
export declare const TABLE_W = 200;
export declare const TABLE_H = 100;
export declare const BALL_R = 3.2;
/** Pocket radius ≈ 1.6 × ball radius: a ball pots when its center enters. */
export declare const POCKET_R: number;
/** Exponential friction rate per second at level 1 (v *= exp(-k·dt)). */
export declare const BASE_FRICTION_K = 0.9;
/** Friction increase per level above 1 (harder tables run heavier cloth). */
export declare const FRICTION_K_PER_LEVEL = 0.06;
export declare const FRICTION_K_MAX = 1.5;
/** Cushion restitution (axis-aligned walls, except pocket mouths). */
export declare const CUSHION_RESTITUTION = 0.92;
/** Ball-ball collision restitution (equal masses). */
export declare const BALL_RESTITUTION = 0.95;
/** Speeds below this snap to zero and the ball is marked at-rest. */
export declare const STOP_SPEED = 0.6;
/** Fixed physics substeps per frame (substep dt ≤ 1/48 at the dt clamp). */
export declare const SUBSTEPS = 4;
export declare const MAX_SUBSTEP_DT: number;
/** Cue speed at full power. */
export declare const MAX_SHOT_SPEED = 260;
/** Score per potted object ball. */
export declare const POT_POINTS = 100;
/** Bonus per remaining shot on a level win. */
export declare const SHOT_BONUS = 20;
/** Extra shots charged for potting the cue ball (a scratch). */
export declare const FOUL_PENALTY_SHOTS = 1;
/** Rack positional jitter amplitude (fraction of ball radius). */
export declare const RACK_JITTER = 0.05;
/** Beyond this distance past a rail rim a mouth-riding ball has drained. */
export declare const RIM_DRAIN = 1;
export declare const HEAD_SPOT_X: number;
export declare const FOOT_SPOT_X: number;
export declare const CENTER_Y: number;
export type PoolResult = 'ready' | 'aiming' | 'moving' | 'paused' | 'levelWon' | 'gameOver';
export interface Ball {
    /** 0 = cue ball, 1..9 = numbered object balls. */
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    potted: boolean;
    atRest: boolean;
}
export type PoolEvent = {
    kind: 'pot';
    id: number;
} | {
    kind: 'foul';
} | {
    kind: 'win';
    bonus: number;
} | {
    kind: 'lose';
};
export interface PoolState {
    result: PoolResult;
    level: number;
    shotsUsed: number;
    score: number;
    /** Cumulative potted-ball count (scored already). */
    pottedCount: number;
    balls: Ball[];
    aimAngle: number;
    /** Charge 0..1 (held Space); a drag supplies it directly. */
    power: number;
    msg: string;
    msgTimer: number;
    events: PoolEvent[];
    rng: () => number;
    /** Result to restore when unpausing ('aiming' or 'moving'). */
    pausedFrom: PoolResult | null;
}
/** mulberry32 seeded PRNG (identical to the other games' rng). */
export declare function mulberry32(seed: number): () => number;
/** The six pocket centers: four corners plus two side middles on the long rails. */
export declare function pocketPositions(): {
    x: number;
    y: number;
}[];
/** Shot budget for a level: 12 + level*2. */
export declare function shotsAllowed(level: number): number;
/** Exponential friction rate for a level (grows with level, capped). */
export declare function frictionK(level: number): number;
/** True when the point is inside any pocket (ball center pots). */
export declare function inPocket(x: number, y: number): boolean;
/**
 * Build the 9-ball diamond rack (rows 1-2-3-2-1; the 9 sits in the center)
 * at the foot spot with tiny seeded positional jitter.
 */
export declare function rackBalls(seed: number): Ball[];
/** Fresh state for a level (used at mount, restart, and level advance). */
export declare function createLevel(level: number, seed: number): PoolState;
/**
 * Equal-mass elastic collision along the contact normal with restitution e:
 * the normal velocity components are exchanged scaled by e (a head-on hit
 * swaps them); tangential components are untouched. Positions are separated
 * along the normal when the balls overlap. Returns true when a collision
 * (approaching pair in contact) was resolved.
 * @param a - first ball (mutated).
 * @param b - second ball (mutated).
 * @param e - restitution in [0, 1].
 */
export declare function resolveBallCollision(a: Ball, b: Ball, e: number): boolean;
/**
 * Cushion bounce for one ball against the four rails, skipping wall segments
 * inside pocket mouths (the ball there rolls into the pocket instead).
 */
export declare function applyCushions(b: Ball): void;
/**
 * Advance the simulation by dt seconds using fixed substeps (each ≤
 * MAX_SUBSTEP_DT) for tunneling-free cushions and stable contacts. Only runs
 * while balls are moving; pausing freezes everything.
 */
export declare function step(state: PoolState, dt: number): void;
/** Respot the cue ball at the head spot (nudged if occupied). */
export declare function respotCue(state: PoolState): void;
/**
 * Called once every ball is at rest or potted: applies the scratch penalty,
 * then resolves win (all nine potted → bonus) / lose (budget exhausted).
 */
export declare function finishShot(state: PoolState): void;
/**
 * Fire the cue ball: charges one shot, sets the cue velocity from the clamped
 * power, and enters the moving state. Only legal while aiming.
 * @param state - the game state (mutated).
 * @param angle - shot direction in radians (0 = +x).
 * @param power - 0..1 charge; clamped.
 */
export declare function shoot(state: PoolState, angle: number, power: number): boolean;
/** Restart the CURRENT level: same seed → the identical rack. */
export declare function restartLevel(state: PoolState, seed: number): void;
/** Advance to the next level (keeps the cumulative score and run seed). */
export declare function nextLevel(state: PoolState, seed: number): void;
/** Toggle pause; remembers the result to restore (stored-remainder pattern). */
export declare function togglePause(state: PoolState): void;
export interface AimGuidePoint {
    x: number;
    y: number;
}
export interface AimGuide {
    /** Polyline from the cue ball to the first impact and one bounce beyond. */
    path: AimGuidePoint[];
    /** Id of the first object ball the ray touches, or null. */
    hitBallId: number | null;
    /** Where the cue ball will first contact a ball or wall. */
    impact: AimGuidePoint;
}
/**
 * Ray-circle intersection: smallest t > 0 where the ray hits a circle of
 * radius r around c, or null. Pure geometry, shared with tests.
 */
export declare function rayCircle(ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, r: number): number | null;
/** Smallest t > 0 where the ray hits an axis-aligned wall (0..TABLE_W/H box). */
export declare function rayWall(ox: number, oy: number, dx: number, dy: number): number;
/**
 * Aim guide: cast the aim ray from the cue ball until the first ball contact
 * (inflated to 2R center distance) or wall, then show one bounce beyond it.
 * Pure — no state mutation.
 */
export declare function computeAimGuide(balls: readonly Ball[], angle: number, maxLen?: number): AimGuide;
