/**
 * FPS aim-tracking pure logic: the crosshair is fixed at the screen centre
 * and the mouse rotates the view (yaw + pitch). A target drifts around a
 * large world — laterally on a plane and vertically in height — so the
 * player must track it in both axes. Holding it under the crosshair scores
 * continuously; the left mouse button shoots, with recoil that kicks the
 * view up and a random horizontal shake that both decay. 30-second rounds
 * end with a shot hit-rate summary. Deterministic functions over a plain
 * state object.
 */
export declare const LOGICAL_W = 480;
export declare const LOGICAL_H = 300;
export declare const WORLD_W = 1600;
export declare const WORLD_H = 1000;
export declare const CAM_X: number;
export declare const CAM_Y: number;
export declare const CAM_H = 150;
export declare const TARGET_H_MIN = 30;
export declare const TARGET_H_MAX = 320;
export declare const FOV: number;
export declare const HIT_ANGLE: number;
export declare const HIT_PITCH: number;
export declare const SENSITIVITY = 0.0022;
export declare const DURATION = 30;
export declare const SCORE_RATE = 10;
export declare const SHOT_SCORE = 20;
export declare const TARGET_SPEED = 140;
export declare const TARGET_H_SPEED = 75;
export declare const RECOIL_PITCH = 0.055;
export declare const RECOIL_MAX = 0.2;
export declare const RECOIL_RECOVER = 0.16;
export declare const SHAKE_YAW = 0.02;
export declare const SHAKE_DECAY = 3.2;
export declare const FLASH_TIME = 0.08;
export declare const BULLET_RANGE = 700;
export declare const BULLET_HIT_MS = 0.12;
export declare const BULLET_MISS_MS = 0.3;
export declare const HIT_FLASH = 0.15;
/** A bullet in flight: world-space segment from the camera to its target. */
export interface Bullet {
    x0: number;
    y0: number;
    h0: number;
    x1: number;
    y1: number;
    h1: number;
    /** 0..1 flight progress. */
    t: number;
    /** Flight duration in seconds. */
    dur: number;
    hit: boolean;
}
export interface FpsTrackState {
    /** View yaw (radians, wrapped to (-π, π]). */
    yaw: number;
    /** View pitch (radians, clamped). */
    pitch: number;
    targetX: number;
    targetY: number;
    /** Target height above the ground (world units). */
    targetH: number;
    /** Target lateral travel direction (radians). */
    angle: number;
    /** Target vertical velocity (world units/s). */
    hVel: number;
    score: number;
    shots: number;
    hits: number;
    /** Seconds the target has been locked (tracking time). */
    onTargetTime: number;
    /** Recoil kick left on the view pitch; decays in tick. */
    recoilPitch: number;
    /** Random yaw shake from the last shot; decays in tick. */
    shakeYaw: number;
    /** Seconds of muzzle flash remaining after a shot. */
    flashT: number;
    /** Bullet currently in flight, or null. */
    bullet: Bullet | null;
    /** Seconds of impact spark remaining after a hit. */
    hitFlashT: number;
    elapsed: number;
    remaining: number;
    over: boolean;
    /** Countdown until the target re-directs. */
    turnT: number;
    rng: () => number;
}
/** Normalize an angle to (-π, π]. */
export declare function normAngle(a: number): number;
/** A fresh round: looking straight ahead, target in front at camera height. */
export declare function createFpsTrackState(rng?: () => number): FpsTrackState;
/** Rotate the view by mouse deltas (px). Screen-y is down, so moving the
 * mouse down must pitch the view down (standard FPS feel). */
export declare function turn(state: FpsTrackState, dx: number, dy: number): void;
/** Effective view yaw including the shot shake. */
export declare function effectiveYaw(state: FpsTrackState): number;
/** Effective view pitch including the recoil kick. */
export declare function effectivePitch(state: FpsTrackState): number;
/** The target's horizontal offset from the view direction (radians). */
export declare function targetOffset(state: FpsTrackState): number;
/** The target's vertical offset from the view pitch (radians). */
export declare function targetPitchOffset(state: FpsTrackState): number;
/** Whether the view is currently locked on the target (both axes). */
export declare function isLocked(state: FpsTrackState): boolean;
/** Screen x of the target (0..LOGICAL_W) when visible, or null. */
export declare function targetScreenX(state: FpsTrackState): number | null;
/** Screen y of the target (0..LOGICAL_H) when visible, or null. A target
 * above the camera must render above the screen centre (smaller y). */
export declare function targetScreenY(state: FpsTrackState): number | null;
/** Fire a shot: spawn a bullet that flies to the target (when locked) or out
 * into the view direction (when not), then apply recoil and shake. */
export declare function shoot(state: FpsTrackState): boolean;
/** The bullet's current world position, or null when none is in flight. */
export declare function bulletPosition(state: FpsTrackState): {
    x: number;
    y: number;
    h: number;
} | null;
/** Advance one frame: target motion, recoil/shake decay, lock score, timer. */
export declare function tickFpsTrack(state: FpsTrackState, dt: number): void;
/** Shot hit-rate (0..1); 0 before any shot. */
export declare function hitRate(state: FpsTrackState): number;
