/**
 * Mini Bowling pure logic: a top-down ten-pin lane. The ball is thrown from
 * the foul line with aim (±25°) + power; lane friction is exponential, and in
 * the back third of the lane the ball's spin applies a lateral hook
 * acceleration. Pins are light circles (mass 0.25× ball) in the standard
 * triangle; collisions are elastic with restitution (0.75 ball-pin, 0.8
 * pin-pin). A pin is knocked when it is ever faster than {@link KNOCK_SPEED}
 * or displaced beyond {@link KNOCK_DISP} from its spot; knocked pins are
 * swept once the ball has passed the pin deck, and the next roll in the same
 * frame plays the survivors.
 *
 * Scoring is real ten-pin (strike = 10 + next two rolls, spare = 10 + next
 * roll) via the pure {@link scoreGame} function; a level is a 5-frame game
 * whose LAST frame uses 10th-frame bonus-roll rules (so a perfect level is
 * exactly 150), and levels advance on pinfall thresholds 60/80/100/120/150.
 *
 * All randomness (rack jitter, re-rack seeds) flows through seeded mulberry32
 * streams, so identical seeds + throw scripts produce identical pinfall.
 */
export declare const LANE_W = 200;
export declare const LANE_H = 640;
export declare const BALL_RADIUS = 13;
/** Foul line y; the ball is placed just behind it. */
export declare const FOUL_Y: number;
export declare const PIN_R = 7;
/** Ball mass; pins are 0.25× this. */
export declare const BALL_MASS = 1;
export declare const PIN_MASS = 0.25;
export declare const BALL_PIN_E = 0.75;
export declare const PIN_PIN_E = 0.8;
/** Exponential lane friction per second for the ball (v *= exp(-k·dt)). */
export declare const BALL_FRICTION_K = 0.35;
/** Pins slide on the deck with much higher friction. */
export declare const PIN_FRICTION_K = 3.2;
export declare const STOP_SPEED = 6;
/** Substep ceiling: the ball is fast and pins are small — no tunneling. */
export declare const MAX_SUBSTEP_DT: number;
export declare const MAX_THROW_SPEED = 400;
/** Throws below this power are ignored (taps do not launch the ball). */
export declare const MIN_THROW_POWER = 0.2;
/** Aim range: ±25° from straight up-lane. */
export declare const MAX_AIM: number;
/** Lateral hook acceleration (units/s²) applied in the back third while spinning. */
export declare const HOOK_ACCEL = 40;
/** Hook region starts here (back third of the lane, y grows downward). */
export declare const HOOK_Y: number;
export declare const KNOCK_SPEED = 40;
export declare const KNOCK_DISP = 4;
/** Center-to-center pin spacing in the triangle. */
export declare const PIN_GAP = 30;
export declare const HEAD_PIN_Y = 110;
/** Ball above this y has fully passed the deck → sweep knocked pins. */
export declare const DECK_TOP = 20;
/** A level is a 5-frame game with 10th-frame rules on its last frame. */
export declare const FRAMES_PER_LEVEL = 5;
export declare const LEVEL_THRESHOLDS: readonly [60, 80, 100, 120, 150];
/** Rack positional jitter amplitude (fraction of pin radius). */
export declare const RACK_JITTER = 0.04;
/** Kickback wall restitution for pins (lane sides and the back wall). */
export declare const KICKBACK_E = 0.35;
export type BowlingPhase = 'aiming' | 'rolling' | 'paused' | 'levelWon' | 'gameOver';
/** A moving circle participant (the ball and pins both satisfy it). */
export interface Body {
    x: number;
    y: number;
    vx: number;
    vy: number;
}
export interface BowlingBall extends Body {
    /** True once the ball is in a gutter: straight, no hook, no pin hits. */
    gutter: boolean;
    /** True while the ball is on the lane (set false when it exits the top or rests). */
    live: boolean;
    atRest: boolean;
}
export interface Pin extends Body {
    id: number;
    spotX: number;
    spotY: number;
    knocked: boolean;
    /** Knocked AND already swept off the deck (excluded from the simulation). */
    swept: boolean;
    atRest: boolean;
}
export type BowlingEvent = {
    kind: 'pin';
    x: number;
    y: number;
} | {
    kind: 'gutter';
} | {
    kind: 'strike';
} | {
    kind: 'spare';
} | {
    kind: 'levelWon';
    score: number;
} | {
    kind: 'gameOver';
    score: number;
};
export interface BowlingState {
    phase: BowlingPhase;
    level: number;
    /** Flat pinfall per roll for the whole level game (scoreGame input). */
    rolls: number[];
    /** 0-based frame index within the level. */
    frame: number;
    /** Pinfall of the rolls already made in the current frame. */
    frameRolls: number[];
    /** Pins knocked by the roll currently in flight (counted at sweep/settle). */
    rollKnocked: number;
    pins: Pin[];
    ball: BowlingBall;
    /** Aim in radians, 0 = straight up-lane, positive = rightward. */
    aimAngle: number;
    /** Charge 0..1 (Space held). */
    power: number;
    /** Spin -1..1 (A = left hook, D = right hook), set while charging. */
    spin: number;
    msg: string;
    msgTimer: number;
    events: BowlingEvent[];
    /** Seeded stream for re-rack seeds (rack itself uses derived seeds). */
    rng: () => number;
    /** Level seed so restarts replay the identical rack sequence. */
    seed: number;
    pausedFrom: BowlingPhase | null;
}
/** mulberry32 seeded PRNG (identical to the other games' rng). */
export declare function mulberry32(seed: number): () => number;
/**
 * Real ten-pin scoring over a flat rolls array (10 per frame, strike = one
 * roll). Frame N < last: strike scores 10 + next two rolls, else two rolls
 * with spare = 10 + next roll. The LAST frame grants bonus rolls
 * (strike/spare → a third roll) exactly like the 10th frame, so a perfect
 * sheet scores 30 × frames. Missing future rolls count 0, so a partial sheet
 * scores its resolved frames only.
 * @param rolls - flat pinfall per roll.
 * @param frames - frame count (10 for a full game, 5 for a level).
 * @returns the cumulative score.
 */
export declare function scoreGame(rolls: readonly number[], frames?: number): number;
/** Score threshold a level's 5-frame game must reach to advance. */
export declare function levelThreshold(level: number): number;
/**
 * The standard 10-pin triangle: 4 rows (1-2-3-4) with the head pin nearest
 * the foul line, seeded micro-jitter that never overlaps pins.
 * @param seed - seed for the jitter stream.
 */
export declare function rackPins(seed: number): Pin[];
/** Fresh state for a level (mount, restart, and level advance). */
export declare function createLevel(level: number, seed: number): BowlingState;
/**
 * Elastic collision between two circles with masses ma/mb and restitution e,
 * along the contact normal. Positions are separated proportionally to inverse
 * mass when overlapping. Returns true when an approaching pair in contact was
 * resolved.
 * @param a - first body (mutated).
 * @param b - second body (mutated).
 * @param ra - radius of a.
 * @param rb - radius of b.
 * @param ma - mass of a.
 * @param mb - mass of b.
 * @param e - restitution in [0, 1].
 */
export declare function resolveCircleCollision(a: Body, b: Body, ra: number, rb: number, ma: number, mb: number, e: number): boolean;
/**
 * Advance the simulation by dt seconds using fixed substeps (each ≤
 * MAX_SUBSTEP_DT). Runs only while a roll is in flight; pausing freezes
 * everything. Ends the roll (via {@link finishRoll}) once the ball is gone
 * or at rest and every live pin has settled.
 */
export declare function step(state: BowlingState, dt: number): void;
/**
 * Called once the roll settles: records pinfall, sweeps the fallen pins, and
 * advances the frame bookkeeping (10th-frame rules on the last frame). Ends
 * the level game after FRAMES_PER_LEVEL frames and grades it against the
 * level threshold.
 */
export declare function finishRoll(state: BowlingState): void;
/**
 * Throw the ball with the current aim, power, and spin. Only legal while
 * aiming; power is clamped to [MIN_THROW_POWER, 1].
 * @param state - the game state (mutated).
 * @returns true when the throw fired.
 */
export declare function throwBall(state: BowlingState): boolean;
/** Current running score of the level game (resolved frames only). */
export declare function currentScore(state: Readonly<BowlingState>): number;
/** Restart the CURRENT level: same seed → identical rack sequence. */
export declare function restartLevel(state: BowlingState): void;
/** Advance to the next level (fresh 5-frame game, thresholds wrap). */
export declare function nextLevel(state: BowlingState): void;
/** Toggle pause; remembers the phase to restore (stored-remainder pattern). */
export declare function togglePause(state: BowlingState): void;
