import { describe, expect, it } from 'vitest'
import {
  createAsteroids, updateAsteroids,
  W, H, MAX_BULLETS, BULLET_LIFE, RESPAWN_INVULN, WAVE_DELAY,
  type AsteroidsState, type Rock, type RockSize,
} from '../src/client/games/asteroids/logic.ts'

/** Deterministic LCG so spawns, shapes, and splits are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const idle = { left: false, right: false, thrust: false, fire: false }
const FRAME = 1000 / 60

function rockAt(size: RockSize, x: number, y: number): Rock {
  return { x, y, vx: 0, vy: 0, size, angle: 0, spin: 0, verts: Array.from({ length: 10 }, () => 1) }
}

/** Park one rock right above the stationary ship and clear the field. */
function stageRock(state: AsteroidsState, size: RockSize): void {
  state.rocks = [rockAt(size, W / 2, H / 2 - 60)]
  state.bullets = []
  state.ship.x = W / 2
  state.ship.y = H / 2
  state.ship.vx = 0
  state.ship.vy = 0
  state.ship.angle = 0
  state.invuln = RESPAWN_INVULN
  state.fireCooldown = 0
}

describe('asteroids logic', () => {
  it('creates wave 1 with 3 safe-spaced large rocks and a centered ship', () => {
    const state = createAsteroids(lcg(1))
    expect(state.wave).toBe(1)
    expect(state.lives).toBe(3)
    expect(state.result).toBe('none')
    expect(state.ship.x).toBe(W / 2)
    expect(state.ship.y).toBe(H / 2)
    expect(state.rocks).toHaveLength(3)
    expect(state.rocks.every(rock => rock.size === 'large')).toBe(true)
    for (const rock of state.rocks) {
      expect(rock.verts).toHaveLength(10)
      const dist = Math.hypot(rock.x - W / 2, rock.y - H / 2)
      expect(dist).toBeGreaterThan(200) // spawn-safe radius
    }
  })

  it('rotates the ship left and right', () => {
    const state = createAsteroids(lcg(1))
    state.rocks = []
    for (let i = 0; i < 30; i += 1) updateAsteroids(state, FRAME, { ...idle, right: true })
    const right = state.ship.angle
    expect(right).toBeGreaterThan(1)
    for (let i = 0; i < 30; i += 1) updateAsteroids(state, FRAME, { ...idle, left: true })
    // 30 frames right then 30 left cancels out (same speed both ways).
    expect(Math.abs(state.ship.angle)).toBeLessThan(1e-9)
  })

  it('thrust accelerates along the heading and inertia decays gently', () => {
    const state = createAsteroids(lcg(1))
    state.rocks = []
    for (let i = 0; i < 30; i += 1) updateAsteroids(state, FRAME, { ...idle, thrust: true })
    // Heading 0 is up: velocity points up and the ship climbed.
    expect(state.ship.vy).toBeLessThan(-50)
    expect(state.ship.y).not.toBe(H / 2)
    const speedWhileThrusting = Math.hypot(state.ship.vx, state.ship.vy)
    // Release: inertia keeps it moving, damping (~0.99/frame) slows it.
    for (let i = 0; i < 30; i += 1) updateAsteroids(state, FRAME, idle)
    const speedAfter = Math.hypot(state.ship.vx, state.ship.vy)
    expect(speedAfter).toBeGreaterThan(0)
    expect(speedAfter).toBeLessThan(speedWhileThrusting)
    expect(speedAfter).toBeGreaterThan(speedWhileThrusting * 0.6) // gentle, not a brake
  })

  it('wraps ship and rocks on all edges', () => {
    const state = createAsteroids(lcg(1))
    state.rocks = []
    state.ship.x = W - 5
    state.ship.vx = 100
    updateAsteroids(state, 100, idle)
    expect(state.ship.x).toBeLessThan(50) // crossed the right edge to the left side

    state.ship.y = 4
    state.ship.vy = -100
    updateAsteroids(state, 100, idle)
    expect(state.ship.y).toBeGreaterThan(H - 50) // crossed the top edge to the bottom

    state.rocks = [rockAt('large', 2, H / 2)]
    state.rocks[0]!.vx = -200
    updateAsteroids(state, 100, idle)
    expect(state.rocks[0]!.x).toBeGreaterThan(W - 50) // crossed the left edge to the right
  })

  it('collides across the wrap seam (bullet hits a rock on the far side)', () => {
    const state = createAsteroids(lcg(1))
    // Rock just past the left edge; the ship near the right edge aims left.
    state.rocks = [rockAt('small', 10, H / 2)]
    state.ship.x = W - 20
    state.ship.y = H / 2
    state.ship.angle = Math.PI / 2 // facing right: the rock is 30px ahead across the seam
    state.invuln = RESPAWN_INVULN
    const score = state.score
    for (let i = 0; i < 30 && state.rocks.length > 0; i += 1) {
      updateAsteroids(state, FRAME, { ...idle, fire: state.bullets.length === 0 })
    }
    expect(state.rocks).toHaveLength(0)
    expect(state.score).toBe(score + 100)
  })

  it('fire is rate-limited and bullets cap at 8 with a 1.1s lifetime', () => {
    const state = createAsteroids(lcg(1))
    state.rocks = []
    // Hold fire for 2 seconds: never more than MAX_BULLETS live.
    for (let i = 0; i < 120; i += 1) {
      updateAsteroids(state, FRAME, { ...idle, fire: true })
      expect(state.bullets.length).toBeLessThanOrEqual(MAX_BULLETS)
    }
    expect(state.bullets.length).toBeGreaterThan(0)

    // Rate limit: two frames of fire produce one bullet.
    const fresh = createAsteroids(lcg(1))
    fresh.rocks = []
    updateAsteroids(fresh, FRAME, { ...idle, fire: true })
    updateAsteroids(fresh, FRAME, { ...idle, fire: true })
    expect(fresh.bullets).toHaveLength(1)

    // Lifetime: one bullet dies after BULLET_LIFE.
    for (let i = 0; i < Math.ceil((BULLET_LIFE + 100) / FRAME); i += 1) {
      updateAsteroids(fresh, FRAME, idle)
    }
    expect(fresh.bullets).toHaveLength(0)
  })

  it('rocks split large → 2 medium → 2 small → gone, scoring 20/50/100', () => {
    const state = createAsteroids(lcg(1))
    let sawDestructionEvent = false
    const shootAt = (size: RockSize): void => {
      stageRock(state, size)
      const before = state.score
      // One bullet, then coast until the staged rock is gone (children survive).
      updateAsteroids(state, FRAME, { ...idle, fire: true })
      for (let i = 0; i < 60 && state.rocks.length === 1 && state.rocks[0]!.size === size; i += 1) {
        updateAsteroids(state, FRAME, idle)
        if (state.events.length > 0) sawDestructionEvent = true
      }
      expect(state.rocks.some(rock => rock.size === size)).toBe(false)
      expect(state.score).toBe(before + (size === 'large' ? 20 : size === 'medium' ? 50 : 100))
    }
    shootAt('large')
    expect(state.rocks).toHaveLength(2)
    expect(state.rocks.every(rock => rock.size === 'medium')).toBe(true)
    shootAt('medium')
    expect(state.rocks).toHaveLength(2)
    expect(state.rocks.every(rock => rock.size === 'small')).toBe(true)
    shootAt('small')
    expect(state.rocks).toHaveLength(0)
    expect(sawDestructionEvent).toBe(true) // destruction points exposed for render
  })

  it('ship ↔ rock costs a life and grants a 2s respawn invulnerability window', () => {
    const state = createAsteroids(lcg(1))
    state.rocks = [rockAt('large', W / 2 + 30, H / 2)] // overlaps the centered ship
    state.invuln = 0
    updateAsteroids(state, FRAME, idle)
    expect(state.lives).toBe(2)
    expect(state.invuln).toBeGreaterThan(0)
    expect(state.ship.x).toBe(W / 2) // respawned at center

    // While invulnerable, an overlapping rock costs nothing.
    state.rocks = [rockAt('large', W / 2 + 30, H / 2)]
    updateAsteroids(state, FRAME, idle)
    expect(state.lives).toBe(2)

    // After the 2s window the ship is vulnerable again.
    state.rocks = [rockAt('large', 30, 30)] // parked far away while the timer runs
    for (let i = 0; i < Math.ceil(RESPAWN_INVULN / FRAME) + 1; i += 1) updateAsteroids(state, FRAME, idle)
    expect(state.invuln).toBe(0)
    state.rocks = [rockAt('large', W / 2 + 30, H / 2)]
    updateAsteroids(state, FRAME, idle)
    expect(state.lives).toBe(1)
    expect(state.result).toBe('none')
  })

  it('losing the last life ends the game and the world goes inert', () => {
    const state = createAsteroids(lcg(1))
    state.lives = 1
    state.rocks = [rockAt('large', W / 2 + 30, H / 2)]
    state.invuln = 0
    updateAsteroids(state, FRAME, idle)
    expect(state.lives).toBe(0)
    expect(state.result).toBe('lose')
    const x = state.ship.x
    updateAsteroids(state, 1000, { ...idle, thrust: true, right: true, fire: true })
    expect(state.ship.x).toBe(x)
    expect(state.score).toBe(0)
  })

  it('clearing a wave spawns the next wave after the delay', () => {
    const state = createAsteroids(lcg(1))
    state.rocks = []
    updateAsteroids(state, 10, idle) // empty field starts the inter-wave timer
    expect(state.wave).toBe(1)
    expect(state.rocks).toHaveLength(0)
    updateAsteroids(state, WAVE_DELAY, idle)
    expect(state.wave).toBe(2)
    expect(state.rocks).toHaveLength(4) // 2 + wave
    expect(state.rocks.every(rock => rock.size === 'large')).toBe(true)
  })

  it('is deterministic under a seeded rng', () => {
    const run = (): string => {
      const state = createAsteroids(lcg(42))
      for (let i = 0; i < 300; i += 1) {
        updateAsteroids(state, FRAME, {
          left: i % 7 < 2,
          right: i % 13 < 3,
          thrust: i % 5 < 2,
          fire: i % 11 < 4,
        })
      }
      return JSON.stringify({
        ship: state.ship, rocks: state.rocks, bullets: state.bullets,
        score: state.score, wave: state.wave, lives: state.lives, result: state.result,
      })
    }
    expect(run()).toBe(run())
  })
})
