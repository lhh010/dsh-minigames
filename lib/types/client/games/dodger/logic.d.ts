/**
 * Dodger (弹幕躲避) pure logic: a player dot chases a target point (mouse or
 * arrow-nudged) on a fixed arena while bullets stream in from the edges aimed
 * at the player. Spawn rate and bullet speed ramp with survival time; grazing
 * a bullet (passing within 1.5x hit radius without touching) scores a
 * once-per-bullet bonus. From t=25s telegraphed full-length laser beams
 * seal rows/columns on an accelerating schedule; from score 350 diagonal
 * beams join the axis pool. From score 800 a seeded fraction of new bullets
 * is homing: slower comets that steer toward the player under a turn-rate
 * cap and live longer. Contact ends the run.
 * Deterministic given (dt, input, rng); time is in milliseconds throughout.
 */
/** Logical arena size (HUD strip lives inside this height). */
export declare const W = 480;
export declare const H = 600;
export declare const HUD_H = 30;
export declare const PLAYER_R = 8;
export declare const BULLET_R = 5;
/** Player chase speed toward the target point, px/s. */
export declare const PLAYER_SPEED = 340;
/** Arrow-key target nudge speed, px/s. */
export declare const KEY_SPEED = 300;
export declare const GRACE_MS = 1500;
export declare const RAMP_MS = 120000;
export declare const AIM_JITTER = 0.35;
export declare const MAX_BULLETS = 120;
export declare const NEAR_MISS_FACTOR = 1.5;
export declare const NEAR_MISS_BONUS = 5;
export declare const SCORE_PER_SECOND = 10;
/** Normal bullets are culled this far beyond the arena border, px. */
export declare const BULLET_CULL_MARGIN = 80;
/** Score at or above which new bullets may roll homing. */
export declare const HOMING_SCORE = 800;
/** Fraction of newly spawned bullets that are homing once unlocked. */
export declare const HOMING_FRACTION = 0.35;
/** Max velocity rotation, rad/s; a fast player can out-orbit them. */
export declare const HOMING_TURN_RATE = 1.6;
/** Homing bullet speed as a factor of the tier speed. */
export declare const HOMING_SPEED_FACTOR = 0.75;
/** Homing lifetime in ms (normal bullets have no lifetime: geometric cull). */
export declare const HOMING_LIFE_MS = 6000;
/** Homing bullets use their own pool cap and do not count against MAX_BULLETS. */
export declare const HOMING_MAX_ALIVE = 24;
/** Homing bullets are culled only past this far-field margin, px. */
export declare const HOMING_CULL_MARGIN = 300;
export declare const LASER_TELEGRAPH_MS = 1100;
export declare const LASER_FIRE_MS = 450;
export declare const LASER_FADE_MS = 300;
/** Full beam thickness in px; collision uses half of this as the beam radius. */
export declare const LASER_BEAM_W = 14;
export declare const LASER_BEAM_HALF: number;
/** First laser may not spawn before this survival time. */
export declare const LASER_START_MS = 25000;
/** Interval ramp duration counted from the first laser. */
export declare const LASER_RAMP_MS = 90000;
/** Max concurrently alive lasers (any phase). */
export declare const LASER_MAX_ALIVE = 2;
/** After the player proves themselves (score ≥ this), lasers may run in
 *  parallel: the alive cap lifts to LASER_MULTI_MAX and the one-at-a-time
 *  restriction drops entirely — crossing grids become the pressure test. */
export declare const LASER_MULTI_SCORE = 500;
export declare const LASER_MULTI_MAX = 3;
/** Before this time at most one laser may occupy telegraph/fire at once. */
export declare const LASER_SOLO_FIRE_UNTIL = 70000;
/** Probability a laser targets the player's row/col instead of a random one. */
export declare const LASER_AIM_CHANCE = 0.6;
/** Score at or above which diagonal axes join the laser axis pool. */
export declare const LASER_DIAGONAL_SCORE = 350;
/** Laser spawn interval after `tMs`, linear 6s→3.2s over 90s from the first. */
export declare function laserInterval(tMs: number): number;
/** Spawn interval after `tMs` of survival, linear 900→250 over 120s. */
export declare function spawnInterval(tMs: number): number;
/** Bullet speed after `tMs` of survival, linear 90→220 over 120s. */
export declare function bulletSpeed(tMs: number): number;
export interface Bullet {
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** True once this bullet has already paid its near-miss bonus. */
    grazed: boolean;
    /** Homing bullets steer toward the player under a turn-rate cap. */
    homing?: boolean;
    /** ms alive; tracked only for homing bullets (HOMING_LIFE_MS expiry). */
    age?: number;
}
export type LaserPhase = 'telegraph' | 'fire' | 'fade';
/** Beam axis: h seals a row, v a column, d1 runs down-right, d2 down-left. */
export type LaserAxis = 'h' | 'v' | 'd1' | 'd2';
/**
 * A full-length beam. h sits at y=pos, v at x=pos; d1/d2 pass through the
 * anchor (ax, ay) along the 45° axis direction (ax/ay unused for h/v).
 */
export interface Laser {
    axis: LaserAxis;
    pos: number;
    phase: LaserPhase;
    /** ms elapsed in the current phase. */
    phaseT: number;
    /** Diagonal anchor x (d1/d2 only). */
    ax?: number;
    /** Diagonal anchor y (d1/d2 only). */
    ay?: number;
}
/** Unit direction vector of a laser axis. */
export declare function laserDir(axis: LaserAxis): {
    dx: number;
    dy: number;
};
/** Clip the infinite line through (ax, ay) along unit (dx, dy) to the rect
 * [minX, maxX] × [minY, maxY] (parametric Liang–Barsky slab clipping).
 * @returns the boundary-to-boundary segment, or null when the line misses
 * the rect or the direction is zero. */
export declare function lineClip(ax: number, ay: number, dx: number, dy: number, minX: number, minY: number, maxX: number, maxY: number): {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
} | null;
/** Perpendicular distance from (px, py) to the laser's (infinite) beam line. */
export declare function laserDist(l: Laser, px: number, py: number): number;
/** Held arrow/WASD state; also the modality switch (any key arms keyboard). */
export interface DodgerInput {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
}
export interface DodgerState {
    x: number;
    y: number;
    /** Point the player dot chases (mouse position or arrow-nudged). */
    tx: number;
    ty: number;
    bullets: Bullet[];
    t: number;
    score: number;
    grazes: number;
    over: boolean;
    /** Remaining grace-period ms; >0 means contact is forgiven. */
    grace: number;
    /** ms until the next edge spawn. */
    spawnCooldown: number;
    /** Alive lasers in any phase. */
    lasers: Laser[];
    /** ms until the next laser spawn (first laser no earlier than LASER_START_MS). */
    laserCooldown: number;
    rng: () => number;
}
/** A fresh run: player centered, pointer target at the player, grace on. */
export declare function createDodger(rng?: () => number): DodgerState;
/** Clamp the chase target into the playable area (below the HUD strip). */
export declare function setTarget(state: DodgerState, x: number, y: number): void;
/**
 * Spawn one bullet on a random edge point, aimed at the player with jitter.
 * Once score ≥ HOMING_SCORE, a seeded HOMING_FRACTION of spawns are homing
 * (0.75x tier speed, own pool cap HOMING_MAX_ALIVE, do not count against
 * MAX_BULLETS; a full homing pool falls back to a normal bullet).
 * Exposed for tests; stepDodger calls it on its cooldown.
 */
export declare function spawnBullet(state: DodgerState): void;
/**
 * Spawn one laser: 60% aimed at the player (row/col, or the anchor pinned to
 * the player's position for diagonals), 40% at a uniform random position in
 * the field; axis picked uniformly over h/v, plus d1/d2 once score ≥
 * LASER_DIAGONAL_SCORE. Exposed for tests.
 * @param state - the run (laser pushed onto `state.lasers`).
 * @returns the spawned laser.
 */
export declare function spawnLaser(state: DodgerState): Laser;
/**
 * Advance one fixed step by `dt` ms under the held input.
 * @param state - the run (mutated in place).
 * @param dt - elapsed milliseconds (clamp upstream).
 * @param input - held arrow/WASD keys; any held key nudges the chase target.
 * @returns true when the run ended this step.
 */
export declare function stepDodger(state: DodgerState, dt: number, input: DodgerInput): boolean;
