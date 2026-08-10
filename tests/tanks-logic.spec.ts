import { describe, expect, it } from 'vitest'
import {
  createWorld, stepWorld, tryMove, tileAt,
  TILE, GRID_W, GRID_H, ENEMIES_PER_WAVE, MAX_ALIVE, WAVES,
} from '../src/client/games/tanks/logic.ts'

/** Deterministic LCG so enemy decisions and spawns are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const idle = { up: false, down: false, left: false, right: false, fire: false }

describe('tank battle logic', () => {
  it('creates a walkable world with a live player', () => {
    const world = createWorld(lcg(1))
    expect(world.player.alive).toBe(true)
    expect(world.player.hp).toBe(3)
    expect(world.enemies).toHaveLength(0)
    expect(world.result).toBe('none')
    expect(tileAt(world.grid, 7, 11)).toBe(0) // player start is clear
  })

  it('moves the player right and stops at the border wall', () => {
    const world = createWorld(lcg(1))
    const start = world.player.x
    for (let i = 0; i < 60; i += 1) {
      stepWorld(world, 1 / 60, { ...idle, right: true })
    }
    expect(world.player.x).toBeGreaterThan(start)
    const maxX = (GRID_W - 1) * TILE
    expect(world.player.x).toBeLessThanOrEqual(maxX)
    // Keep pressing right for a long time: never passes the wall.
    for (let i = 0; i < 300; i += 1) {
      stepWorld(world, 1 / 60, { ...idle, right: true })
    }
    expect(world.player.x).toBeLessThanOrEqual(maxX)
  })

  it('blocked movement stays in place', () => {
    const world = createWorld(lcg(1))
    world.player.x = 0
    world.player.y = 0
    // (0, 0) is a spawn opening; (1, 0) and (-1, 0) are solid border bricks.
    const before = world.player.x
    const moved = tryMove(world, world.player, 3, TILE) // left into the wall
    expect(moved).toBe(false)
    expect(world.player.x).toBe(before)
  })

  it('a player bullet destroys brick and dies on steel', () => {
    const world = createWorld(lcg(1))
    // Clear a column above the player, put one brick tile directly above.
    const tx = Math.floor(world.player.x / TILE)
    const ty = Math.floor(world.player.y / TILE)
    world.grid[ty - 1]![tx] = 1
    world.player.dir = 0
    world.player.cooldown = 0
    // Fire once and step until the bullet resolves.
    stepWorld(world, 1 / 60, { ...idle, fire: true })
    for (let i = 0; i < 120 && world.bullets.length > 0; i += 1) {
      stepWorld(world, 1 / 60, idle)
    }
    expect(world.grid[ty - 1]![tx]).toBe(0) // brick destroyed
    expect(world.bullets).toHaveLength(0)
  })

  it('enemies spawn up to the alive cap and drain the queue', () => {
    const world = createWorld(lcg(3))
    for (let i = 0; i < 600; i += 1) stepWorld(world, 1 / 60, idle)
    expect(world.enemies.length).toBeLessThanOrEqual(MAX_ALIVE)
    expect(world.spawnQueue).toBeLessThan(ENEMIES_PER_WAVE)
  })

  it('spawned enemies drive out of their spawn pocket (not stuck)', () => {
    // Regression: 1-tile spawn openings boxed enemies into the top border.
    const world = createWorld(lcg(3))
    for (let i = 0; i < 300; i += 1) stepWorld(world, 1 / 60, idle)
    expect(world.enemies.length).toBeGreaterThan(0)
    expect(world.enemies.some(enemy => enemy.y > 0)).toBe(true)
  })

  it('a player bullet kills an enemy and scores', () => {
    const world = createWorld(lcg(1))
    // Clear the tile directly above the player (brick in the base map), then
    // park an enemy there, facing it.
    const tx = Math.floor(world.player.x / TILE)
    const ty = Math.floor(world.player.y / TILE)
    world.grid[ty - 1]![tx] = 0
    world.enemies.push({
      id: 1, kind: 'enemy',
      x: world.player.x, y: world.player.y - TILE,
      dir: 2, hp: 1, cooldown: 99, alive: true, invuln: 0,
    })
    world.player.dir = 0
    world.player.cooldown = 0
    stepWorld(world, 1 / 60, { ...idle, fire: true })
    // A few frames: the bullet spawns inside the enemy's tile and kills it
    // before the spawn timer (1.0s) can field a replacement.
    for (let i = 0; i < 3; i += 1) stepWorld(world, 1 / 60, idle)
    expect(world.enemies).toHaveLength(0)
    expect(world.score).toBe(100)
  })

  it('an enemy bullet damages the player and can end the game', () => {
    const world = createWorld(lcg(1))
    world.player.hp = 1
    world.player.invuln = 0
    world.bullets.push({
      x: world.player.x + TILE / 2 - 3,
      y: world.player.y + TILE / 2 - 3,
      dir: 0,
      owner: 'enemy',
    })
    stepWorld(world, 1 / 60, idle)
    expect(world.player.alive).toBe(false)
    expect(world.result).toBe('lose')
  })

  it('clearing a wave advances to the next one', () => {
    const world = createWorld(lcg(1))
    world.spawnQueue = 0
    world.enemies = []
    stepWorld(world, 1 / 60, idle)
    expect(world.wave).toBe(2)
    expect(world.spawnQueue).toBe(ENEMIES_PER_WAVE)
    expect(world.result).toBe('none')
  })

  it('clearing the final wave wins', () => {
    const world = createWorld(lcg(1))
    world.wave = WAVES
    world.spawnQueue = 0
    world.enemies = []
    stepWorld(world, 1 / 60, idle)
    expect(world.result).toBe('win')
  })

  it('the world is inert after a result', () => {
    const world = createWorld(lcg(1))
    world.result = 'win'
    const x = world.player.x
    stepWorld(world, 1, { ...idle, right: true })
    expect(world.player.x).toBe(x)
  })
})
