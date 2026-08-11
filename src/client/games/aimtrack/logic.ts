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

export const LOGICAL_W = 480
export const LOGICAL_H = 300
export const WORLD_W = 1600
export const WORLD_H = 1000
export const CAM_X = WORLD_W / 2
export const CAM_Y = WORLD_H / 2
export const CAM_H = 150 // camera height above the ground (world units)
export const TARGET_H_MIN = 30
export const TARGET_H_MAX = 320
export const FOV = Math.PI / 2 // horizontal field of view
export const HIT_ANGLE = 5 * Math.PI / 180 // ±5° yaw to stay locked
export const HIT_PITCH = 4 * Math.PI / 180 // ±4° vertical offset to stay locked
export const SENSITIVITY = 0.0022 // radians per mouse pixel
export const DURATION = 30 // seconds per round
export const SCORE_RATE = 10 // tracking score per second while locked
export const SHOT_SCORE = 20 // score per hit shot
export const TARGET_SPEED = 140 // lateral speed (world units/s)
export const TARGET_H_SPEED = 75 // vertical drift speed (world units/s)
export const RECOIL_PITCH = 0.055 // view kick per shot (radians)
export const RECOIL_MAX = 0.2
export const RECOIL_RECOVER = 0.16 // recovery speed (radians/s)
export const SHAKE_YAW = 0.02 // max random yaw shake per shot (radians)
export const SHAKE_DECAY = 3.2 // shake decay rate (1/s)
export const FLASH_TIME = 0.08 // muzzle flash duration (s)
export const BULLET_RANGE = 700 // flight distance of a missed shot (world units)
export const BULLET_HIT_MS = 0.12 // flight time of a hit shot (s)
export const BULLET_MISS_MS = 0.3 // flight time of a missed shot (s)
export const HIT_FLASH = 0.15 // impact spark duration (s)
const TURN_MIN = 0.4
const TURN_MAX = 1.2
const MAX_TURN = Math.PI / 3
const MAX_PITCH = Math.PI / 6 // ±30°, clamp for the mouse pitch

/** A bullet in flight: world-space segment from the camera to its target. */
export interface Bullet {
  x0: number
  y0: number
  h0: number
  x1: number
  y1: number
  h1: number
  /** 0..1 flight progress. */
  t: number
  /** Flight duration in seconds. */
  dur: number
  hit: boolean
}

export interface FpsTrackState {
  /** View yaw (radians, wrapped to (-π, π]). */
  yaw: number
  /** View pitch (radians, clamped). */
  pitch: number
  targetX: number
  targetY: number
  /** Target height above the ground (world units). */
  targetH: number
  /** Target lateral travel direction (radians). */
  angle: number
  /** Target vertical velocity (world units/s). */
  hVel: number
  score: number
  shots: number
  hits: number
  /** Seconds the target has been locked (tracking time). */
  onTargetTime: number
  /** Recoil kick left on the view pitch; decays in tick. */
  recoilPitch: number
  /** Random yaw shake from the last shot; decays in tick. */
  shakeYaw: number
  /** Seconds of muzzle flash remaining after a shot. */
  flashT: number
  /** Bullet currently in flight, or null. */
  bullet: Bullet | null
  /** Seconds of impact spark remaining after a hit. */
  hitFlashT: number
  elapsed: number
  remaining: number
  over: boolean
  /** Countdown until the target re-directs. */
  turnT: number
  rng: () => number
}

function rand(lo: number, hi: number, rng: () => number): number {
  return lo + rng() * (hi - lo)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Normalize an angle to (-π, π]. */
export function normAngle(a: number): number {
  let r = a % (Math.PI * 2)
  if (r > Math.PI) r -= Math.PI * 2
  if (r <= -Math.PI) r += Math.PI * 2
  return r
}

/** A fresh round: looking straight ahead, target in front at camera height. */
export function createFpsTrackState(rng: () => number = Math.random): FpsTrackState {
  return {
    yaw: 0,
    pitch: 0,
    targetX: CAM_X + 420,
    targetY: CAM_Y,
    targetH: CAM_H,
    angle: rand(0, Math.PI * 2, rng),
    hVel: rand(-TARGET_H_SPEED, TARGET_H_SPEED, rng),
    score: 0,
    shots: 0,
    hits: 0,
    onTargetTime: 0,
    recoilPitch: 0,
    shakeYaw: 0,
    flashT: 0,
    bullet: null,
    hitFlashT: 0,
    elapsed: 0,
    remaining: DURATION,
    over: false,
    turnT: rand(TURN_MIN, TURN_MAX, rng),
    rng,
  }
}

/** Rotate the view by mouse deltas (px). Screen-y is down, so moving the
 * mouse down must pitch the view down (standard FPS feel). */
export function turn(state: FpsTrackState, dx: number, dy: number): void {
  state.yaw = normAngle(state.yaw + dx * SENSITIVITY)
  state.pitch = clamp(state.pitch - dy * SENSITIVITY, -MAX_PITCH, MAX_PITCH)
}

/** Effective view yaw including the shot shake. */
export function effectiveYaw(state: FpsTrackState): number {
  return state.yaw + state.shakeYaw
}

/** Effective view pitch including the recoil kick. */
export function effectivePitch(state: FpsTrackState): number {
  return state.pitch + state.recoilPitch
}

/** Distance along the view axis from the camera to the target. */
function targetDepth(state: FpsTrackState): number {
  const dx = state.targetX - CAM_X
  const dy = state.targetY - CAM_Y
  return dx * Math.cos(effectiveYaw(state)) + dy * Math.sin(effectiveYaw(state))
}

/** The target's horizontal offset from the view direction (radians). */
export function targetOffset(state: FpsTrackState): number {
  const targetAngle = Math.atan2(state.targetY - CAM_Y, state.targetX - CAM_X)
  return normAngle(targetAngle - effectiveYaw(state))
}

/** The target's vertical offset from the view pitch (radians). */
export function targetPitchOffset(state: FpsTrackState): number {
  return Math.atan2(state.targetH - CAM_H, Math.max(20, targetDepth(state))) - effectivePitch(state)
}

/** Whether the view is currently locked on the target (both axes). */
export function isLocked(state: FpsTrackState): boolean {
  return Math.abs(targetOffset(state)) < HIT_ANGLE && Math.abs(targetPitchOffset(state)) < HIT_PITCH
}

/** Screen x of the target (0..LOGICAL_W) when visible, or null. */
export function targetScreenX(state: FpsTrackState): number | null {
  const offset = targetOffset(state)
  if (Math.abs(offset) > FOV / 2) return null
  return LOGICAL_W / 2 + (offset / (FOV / 2)) * (LOGICAL_W / 2)
}

/** Screen y of the target (0..LOGICAL_H) when visible, or null. A target
 * above the camera must render above the screen centre (smaller y). */
export function targetScreenY(state: FpsTrackState): number | null {
  if (targetScreenX(state) === null) return null
  const vertical = targetPitchOffset(state)
  const half = Math.PI / 6 // matching the visible pitch range
  if (Math.abs(vertical) > half) return null
  return LOGICAL_H / 2 - (vertical / half) * (LOGICAL_H / 2)
}

/** Fire a shot: spawn a bullet that flies to the target (when locked) or out
 * into the view direction (when not), then apply recoil and shake. */
export function shoot(state: FpsTrackState): boolean {
  if (state.over) return false
  state.shots += 1
  const hit = isLocked(state)
  if (hit) {
    state.hits += 1
    state.score += SHOT_SCORE
  }
  const yaw = effectiveYaw(state)
  const pitch = effectivePitch(state)
  const cosP = Math.cos(pitch)
  if (hit) {
    state.bullet = {
      x0: CAM_X, y0: CAM_Y, h0: CAM_H,
      x1: state.targetX, y1: state.targetY, h1: state.targetH,
      t: 0, dur: BULLET_HIT_MS, hit: true,
    }
  } else {
    state.bullet = {
      x0: CAM_X, y0: CAM_Y, h0: CAM_H,
      x1: CAM_X + cosP * Math.cos(yaw) * BULLET_RANGE,
      y1: CAM_Y + cosP * Math.sin(yaw) * BULLET_RANGE,
      h1: CAM_H + Math.sin(pitch) * BULLET_RANGE,
      t: 0, dur: BULLET_MISS_MS, hit: false,
    }
  }
  state.recoilPitch = Math.min(RECOIL_MAX, state.recoilPitch + RECOIL_PITCH)
  state.shakeYaw += rand(-SHAKE_YAW, SHAKE_YAW, state.rng)
  state.flashT = FLASH_TIME
  return hit
}

/** The bullet's current world position, or null when none is in flight. */
export function bulletPosition(state: FpsTrackState): { x: number; y: number; h: number } | null {
  const bullet = state.bullet
  if (bullet === null) return null
  const k = Math.min(1, bullet.t)
  return {
    x: bullet.x0 + (bullet.x1 - bullet.x0) * k,
    y: bullet.y0 + (bullet.y1 - bullet.y0) * k,
    h: bullet.h0 + (bullet.h1 - bullet.h0) * k,
  }
}

/** Advance one frame: target motion, recoil/shake decay, lock score, timer. */
export function tickFpsTrack(state: FpsTrackState, dt: number): void {
  if (state.over) return
  state.remaining -= dt
  state.elapsed += dt
  if (state.remaining <= 0) {
    state.remaining = 0
    state.over = true
    return
  }

  // Re-direct on a random cadence, then move laterally and vertically.
  state.turnT -= dt
  if (state.turnT <= 0) {
    state.angle += rand(-MAX_TURN, MAX_TURN, state.rng)
    state.hVel = rand(-TARGET_H_SPEED, TARGET_H_SPEED, state.rng)
    state.turnT = rand(TURN_MIN, TURN_MAX, state.rng)
  }
  let nx = state.targetX + Math.cos(state.angle) * TARGET_SPEED * dt
  let ny = state.targetY + Math.sin(state.angle) * TARGET_SPEED * dt
  if (nx < 40 || nx > WORLD_W - 40) {
    nx = clamp(nx, 40, WORLD_W - 40)
    state.angle = Math.PI - state.angle
    state.turnT = rand(TURN_MIN, TURN_MAX, state.rng)
  }
  if (ny < 40 || ny > WORLD_H - 40) {
    ny = clamp(ny, 40, WORLD_H - 40)
    state.angle = -state.angle
    state.turnT = rand(TURN_MIN, TURN_MAX, state.rng)
  }
  state.targetX = nx
  state.targetY = ny
  state.targetH = clamp(state.targetH + state.hVel * dt, TARGET_H_MIN, TARGET_H_MAX)
  if (state.targetH <= TARGET_H_MIN || state.targetH >= TARGET_H_MAX) {
    state.hVel = -state.hVel
  }

  // Recoil recovers and shake dies down.
  state.recoilPitch = Math.max(0, state.recoilPitch - RECOIL_RECOVER * dt)
  state.shakeYaw *= Math.exp(-SHAKE_DECAY * dt)
  if (state.flashT > 0) state.flashT = Math.max(0, state.flashT - dt)
  if (state.hitFlashT > 0) state.hitFlashT = Math.max(0, state.hitFlashT - dt)

  // Advance the bullet; a hit bullet sparks on arrival.
  if (state.bullet !== null) {
    state.bullet.t += dt / state.bullet.dur
    if (state.bullet.t >= 1) {
      if (state.bullet.hit) state.hitFlashT = HIT_FLASH
      state.bullet = null
    }
  }

  if (isLocked(state)) {
    state.score += SCORE_RATE * dt
    state.onTargetTime += dt
  }
}

/** Shot hit-rate (0..1); 0 before any shot. */
export function hitRate(state: FpsTrackState): number {
  return state.shots <= 0 ? 0 : state.hits / state.shots
}
