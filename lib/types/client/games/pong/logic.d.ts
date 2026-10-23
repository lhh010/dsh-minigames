/**
 * Pong (弹球对打) pure logic: player paddle at the bottom vs an AI paddle at
 * the top on a 480×640 portrait arena. First to WIN_SCORE points wins the
 * match. The ball bounces off the side walls; each paddle hit reflects the
 * outbound angle by the hit offset from the paddle center and speeds the ball
 * up 4% (capped at 2.2× base). A goal past either paddle scores a point, then
 * the ball parks at center for a short serve delay before launching toward
 * the player who lost the point. step() is copy-on-write: it returns a new
 * state and never mutates the argument. Deterministic given (seed, dt, input);
 * time is in milliseconds throughout.
 */
/** Logical arena size (HUD strip lives inside this height). */
export declare const W = 480;
export declare const H = 640;
export declare const HUD_H = 30;
export declare const PADDLE_W = 84;
export declare const PADDLE_H = 12;
/** Gap between a goal line and the paddle's field-facing edge. */
export declare const PADDLE_MARGIN = 34;
/** Top edge of the player paddle (bottom of the arena). */
export declare const PLAYER_Y: number;
/** Top edge of the AI paddle (just below the HUD strip). */
export declare const AI_Y: number;
export declare const BALL_R = 7;
/** Ball speed at serve, px/s; every paddle hit multiplies it by SPEEDUP. */
export declare const BASE_SPEED = 300;
export declare const SPEEDUP = 1.04;
export declare const SPEED_CAP = 2.2;
/** Max outbound angle off vertical at a paddle edge, radians (60°). */
export declare const MAX_BOUNCE: number;
/** Player paddle chase speed toward the pointer/target, px/s. */
export declare const PLAYER_SPEED = 480;
/** Arrow-key target nudge speed, px/s. */
export declare const KEY_SPEED = 380;
/** AI paddle max speed, px/s — below the ball's worst-case lateral speed. */
export declare const AI_SPEED = 260;
/** AI does not react to targets closer than this, px. */
export declare const AI_DEAD_ZONE = 6;
export declare const WIN_SCORE = 7;
export declare const SERVE_MS = 900;
/** Max serve angle off vertical, radians (36°). */
export declare const SERVE_ANGLE: number;
/** Deterministic PRNG (mulberry32) over a 32-bit state word. */
export declare function mulberry32(seed: number): () => number;
/**
 * One mulberry32 step on an explicit state word.
 * @param state - the current 32-bit PRNG state.
 * @returns the uniform value in [0,1) and the next state word.
 */
export declare function mulberry32Step(state: number): {
    value: number;
    next: number;
};
export interface Ball {
    x: number;
    y: number;
    vx: number;
    vy: number;
}
/** Held input: pointer target and/or held keys for one step. */
export interface PongInput {
    playerX?: number;
    left?: boolean;
    right?: boolean;
}
/** Match winner; null while the match runs. */
export type PongWinner = 'player' | 'ai' | null;
export interface PongState {
    /** Paddle center x. */
    playerX: number;
    aiX: number;
    /** Player paddle chase target (pointer x or key-nudged). */
    targetX: number;
    ball: Ball;
    playerScore: number;
    aiScore: number;
    /** Paddle hits in the current rally. */
    rally: number;
    /** Remaining serve countdown; the ball parks at center while > 0. */
    serveCd: number;
    /** Serve direction when the countdown ends: -1 up (to the AI), 1 down. */
    serveDir: -1 | 1;
    over: PongWinner;
    /** 32-bit mulberry32 state word; drives serve angles. */
    rngState: number;
}
/** A fresh match: paddles centered, ball parked at center serving to the player. */
export declare function createState(seed?: number): PongState;
export declare function clampPaddleX(x: number): number;
/** Ball speed after one paddle hit: +4%, capped at SPEED_CAP × BASE_SPEED. */
export declare function nextSpeed(speed: number): number;
/**
 * Classic paddle reflection: outbound angle scales with the hit offset from
 * the paddle center (edge → MAX_BOUNCE off vertical), speed preserved.
 * @param paddleCenter - paddle center x.
 * @param ballX - ball center x at the hit.
 * @param speed - outbound speed.
 * @param dir - vertical direction after the bounce: -1 up (player hit), 1 down.
 * @returns the new velocity.
 */
export declare function paddleReflect(paddleCenter: number, ballX: number, speed: number, dir: -1 | 1): {
    vx: number;
    vy: number;
};
/** Reflect the ball off the left/right walls; keeps x inside [BALL_R, W-BALL_R]. */
export declare function bounceWalls(ball: Ball): void;
/**
 * Advance one fixed step by `dt` ms under the held input (copy-on-write).
 * @param state - the match state (never mutated).
 * @param dt - elapsed milliseconds (clamp upstream).
 * @param input - pointer target x and/or held left/right keys.
 * @returns the new state.
 */
export declare function step(state: PongState, dt: number, input: PongInput): PongState;
