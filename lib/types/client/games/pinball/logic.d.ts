/**
 * 弹球台 Pinball pure logic: a vertical table simulated with real 2D physics —
 * gravity, fixed adaptive substeps (≥240Hz at rest, faster while the ball is
 * fast so nothing tunnels), circle-vs-segment walls, round bumpers with an
 * outward impulse kick, slingshot faces, a drop-target bank, and capsule
 * flippers whose surface velocity at the contact point imparts momentum to
 * the ball (the trick that makes real pinball feel).
 *
 * All randomness flows through an injected mulberry32 rng (nudge jitter), so
 * the same seed + input script always produces the identical trajectory. The
 * renderer (render.ts) only draws state; the glue (index.ts) owns input.
 */
/** Logical playfield size. */
export declare const TABLE_W = 420;
export declare const TABLE_H = 680;
export declare const BALL_R = 9;
/** Downward gravity in px/s². */
export declare const GRAVITY = 980;
/** Baseline substep rate (dt ≤ 1/240 at rest; speed adds more substeps). */
export declare const BASE_SUBSTEP_DT: number;
/** Max ball travel per substep (fraction of the radius) — anti-tunneling. */
export declare const MAX_SUBSTEP_TRAVEL: number;
/** Absolute speed clamp (also bounds the substep count). */
export declare const MAX_SPEED = 2400;
/** Wall / slant restitution. */
export declare const WALL_E = 0.55;
/** Normal approach speeds below this settle instead of micro-bouncing. */
export declare const REST_SPEED = 40;
/** Global linear damping per second (exp form) — keeps the table live but bounded. */
export declare const DAMPING_K = 0.12;
/** Bumper: restitution, min outward kick px/s, score, re-trigger cooldown. */
export declare const BUMPER_E = 1.4;
export declare const BUMPER_KICK = 260;
export declare const BUMPER_POINTS = 150;
export declare const BUMPER_COOLDOWN = 0.12;
/** Slingshot: restitution (impulse kick along the normal), min kick, score. */
export declare const SLING_E = 2;
export declare const SLING_KICK = 380;
export declare const SLING_POINTS = 75;
export declare const SLING_COOLDOWN = 0.2;
/** Drop targets: score each, bonus for clearing the 3-bank. */
export declare const TARGET_POINTS = 50;
export declare const BANK_BONUS = 500;
/** Flippers: pivot capsule radius, swing speed, spring return speed. */
export declare const FLIPPER_R = 8.5;
export declare const FLIPPER_OMEGA = 18;
export declare const FLIPPER_RETURN = 12;
/** Flipper collision restitution and how much surface velocity is imparted. */
export declare const FLIPPER_E = 0.4;
export declare const FLIPPER_SURFACE_FACTOR = 0.45;
/** Plunger: charge time to full, launch speed range px/s. */
export declare const PLUNGER_CHARGE_S = 1.4;
export declare const PLUNGER_MIN_SPEED = 650;
export declare const PLUNGER_MAX_SPEED = 1450;
/** Balls per game. */
export declare const BALLS_PER_GAME = 3;
/** Nudge: 3 within this window → tilt; tilt disables flippers this long. */
export declare const NUDGE_WINDOW = 5;
export declare const TILT_SECONDS = 2;
/** Ball is lost once its center sinks this far past the bottom. */
export declare const DRAIN_Y: number;
/** Score needed to advance from level l (cumulative within one game). */
export declare function levelThreshold(level: number): number;
export type PinballResult = 'playing' | 'paused' | 'gameOver';
export interface Ball {
    x: number;
    y: number;
    vx: number;
    vy: number;
}
export interface Bumper {
    x: number;
    y: number;
    r: number;
    /** Re-trigger cooldown remaining (s). */
    cd: number;
}
export interface Sling {
    ax: number;
    ay: number;
    bx: number;
    by: number;
    cd: number;
}
export interface DropTarget {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    down: boolean;
}
export interface Wall {
    ax: number;
    ay: number;
    bx: number;
    by: number;
}
export type FlipperSide = 'left' | 'right';
export interface Flipper {
    side: FlipperSide;
    px: number;
    py: number;
    len: number;
    /** Current / rest / raised angles in radians (atan2 convention, +y down). */
    angle: number;
    rest: number;
    active: number;
    held: boolean;
    /** Current angular velocity (rad/s) — drives contact surface velocity. */
    omega: number;
}
export type PinballEvent = {
    kind: 'bumper';
    x: number;
    y: number;
} | {
    kind: 'sling';
    x: number;
    y: number;
} | {
    kind: 'target';
    x: number;
    y: number;
} | {
    kind: 'bank';
    x: number;
    y: number;
} | {
    kind: 'levelUp';
    level: number;
} | {
    kind: 'drain';
} | {
    kind: 'launch';
    speed: number;
} | {
    kind: 'tilt';
};
export interface PinballState {
    result: PinballResult;
    /** Result to restore when unpausing. */
    pausedFrom: PinballResult | null;
    level: number;
    score: number;
    ballsLeft: number;
    ball: Ball;
    flippers: {
        left: Flipper;
        right: Flipper;
    };
    bumpers: Bumper[];
    slings: Sling[];
    targets: DropTarget[];
    walls: Wall[];
    /** Plunger charge 0..1 while Space is held. */
    plunger: number;
    plungerHeld: boolean;
    /** Recent nudge times (s since game start) inside the tilt window. */
    nudges: number[];
    /** Tilt penalty remaining (s); flippers are disabled while > 0. */
    tiltTimer: number;
    time: number;
    msg: string;
    msgTimer: number;
    events: PinballEvent[];
    rng: () => number;
}
/** mulberry32 seeded PRNG (identical to the other games' rng). */
export declare function mulberry32(seed: number): () => number;
/** Left flipper pivot (bottom-left of the playfield, just past the outlane). */
export declare const LEFT_PIVOT: {
    x: number;
    y: number;
};
export declare const RIGHT_PIVOT: {
    x: number;
    y: number;
};
export declare const FLIPPER_LEN = 68;
export declare function makeFlipper(side: FlipperSide): Flipper;
/** Tip of a flipper at its current angle. */
export declare function flipperTip(f: Flipper): {
    x: number;
    y: number;
};
/** The three seeded bumper layouts; level N uses preset (N-1) % 3. */
export declare const BUMPER_PRESETS: {
    x: number;
    y: number;
}[][];
/** Ball spawn: resting on the launch-lane floor. */
export declare const BALL_SPAWN: {
    x: number;
    y: number;
};
/** True while the ball sits at the launch-lane bottom (plunger may fire). */
export declare function ballInLaunchZone(ball: Ball): boolean;
/** Fresh state: one game at `level` with the preset rack and a live ball. */
export declare function createGame(level: number, seed: number): PinballState;
/** Restart the table: same level and preset, zeroed score and balls. */
export declare function restart(state: PinballState): void;
/**
 * Closest point on segment (a→b) to p, with the squared distance.
 * @returns the closest point and d² (pure geometry).
 */
export declare function closestPointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): {
    x: number;
    y: number;
    d2: number;
};
/**
 * Circle-vs-segment collision against a static surface: push the ball out
 * along the contact normal and reflect the normal velocity with restitution
 * `e`. Surfaces with `minKick > 0` (bumpers/slingshots) always leave at least
 * that much outward speed; plain walls settle below {@link REST_SPEED}.
 * @param ball - the ball (mutated on contact).
 * @param r - ball radius.
 * @param e - restitution.
 * @param minKick - minimum outward normal speed after the bounce (0 = none).
 * @param cx - closest point on the segment.
 * @param cy - its y coordinate.
 * @returns true when a contact was resolved.
 */
export declare function bounceOffPoint(ball: Ball, r: number, e: number, minKick: number, cx: number, cy: number): boolean;
/** True while the flipper responds to input (tilt penalty disables them). */
export declare function flippersEnabled(state: PinballState): boolean;
/**
 * Ball vs flipper capsule (segment pivot→tip with radius {@link FLIPPER_R}).
 * The contact point's surface velocity ω×r participates in the bounce: the
 * normal relative velocity is reflected with restitution, then a fraction of
 * the surface velocity along the normal is added — a rising flipper throws
 * the ball up.
 * @param ball - the ball (mutated on contact).
 * @param f - the flipper at its current angle and omega.
 * @returns true when a contact was resolved.
 */
export declare function resolveFlipper(ball: Ball, f: Flipper): boolean;
/** Advance the whole simulation by dt seconds (adaptive fixed substeps). */
export declare function step(state: PinballState, dt: number): void;
/** Hold or release a flipper (ignored while tilted — flippers are dead then). */
export declare function setFlipper(state: PinballState, side: FlipperSide, held: boolean): void;
/**
 * Nudge the table: a tiny seeded-random impulse. Three nudges inside
 * {@link NUDGE_WINDOW} seconds tilt the machine for {@link TILT_SECONDS}.
 * @returns true when the nudge applied.
 */
export declare function nudge(state: PinballState): boolean;
/**
 * Release the plunger: fire the lane ball upward with speed proportional to
 * the clamped charge. No-op (charge discarded) when the ball is elsewhere.
 * @returns the launch speed, or 0 when nothing fired.
 */
export declare function plungerRelease(state: PinballState): number;
/** Toggle pause; remembers the result to restore (stored-remainder pattern). */
export declare function togglePause(state: PinballState): void;
/** Input script entry for {@link hashRun}: fire `a` at time `t` seconds. */
export interface ScriptedInput {
    t: number;
    a: 'leftDown' | 'leftUp' | 'rightDown' | 'rightUp' | 'nudge' | 'plungerDown' | 'plungerRelease';
}
/**
 * Determinism helper: simulate `seconds` at a fixed 60Hz from a fresh game,
 * applying the scripted inputs at their times, and hash the ball trajectory.
 * Same seed + script → same hash; used by tests to freeze determinism.
 */
export declare function hashRun(seed: number, script: ScriptedInput[], seconds: number): number;
