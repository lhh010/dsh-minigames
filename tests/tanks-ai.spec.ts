import { describe, expect, it } from 'vitest'
import {
  createWorld, stepWorld, TILE, GRID_W, GRID_H, buildFlowField, flowAt,
  type WorldState,
} from '../src/client/games/tanks/logic.ts'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const idle = { up: false, down: false, left: false, right: false, fire: false }

/**
 * Count direction flips of an enemy across decision ticks: the anti-oscillation
 * commitment should make the heading stick, so a given tick-to-tick heading
 * change is followed by a stable run rather than alternating every tick.
 */
function headingRunLengths(state: WorldState, enemyIndex: number, ticks: number): number[] {
  const runs: number[] = []
  let prev = state.enemies[enemyIndex]!.targetDir
  let len = 1
  const dt = 1 / 60
  const perTick = Math.round(0.45 / dt) // decisions every AI_TICK
  for (let i = 0; i < ticks; i += 1) {
    for (let k = 0; k < perTick; k += 1) stepWorld(state, dt, idle)
    const cur = state.enemies[enemyIndex]?.targetDir
    if (cur === undefined) break
    if (cur === prev) len += 1
    else { runs.push(len); prev = cur; len = 1 }
  }
  runs.push(len)
  return runs
}

describe('tanks AI anti-oscillation', () => {
  it('a chasing enemy keeps its heading for multiple decision ticks (no per-tick flip)', () => {
    const world = createWorld(lcg(5))
    world.player.x = 7 * TILE
    world.player.y = 11 * TILE
    // One enemy at a distance with a clear route: watch its chase headings.
    world.enemies = [{
      id: 1, kind: 'enemy', x: 2 * TILE, y: 2 * TILE,
      dir: 2, targetDir: 2, hp: 1, cooldown: 5, alive: true, invuln: 0,
    }]
    const runs = headingRunLengths(world, 0, 40)
    // At least one run longer than 1 (commitment holds), and no long
    // alternating pattern: mean run length comfortably above 1.
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length
    expect(Math.max(...runs)).toBeGreaterThan(1)
    expect(mean).toBeGreaterThan(1.3)
  })

  it('the enemy actually closes distance over time (no corner bounce)', () => {
    const world = createWorld(lcg(9))
    world.player.x = 7 * TILE
    world.player.y = 11 * TILE
    world.enemies = [{
      id: 1, kind: 'enemy', x: 1 * TILE, y: 1 * TILE,
      dir: 2, targetDir: 2, hp: 1, cooldown: 5, alive: true, invuln: 0,
    }]
    const startDist = Math.hypot(world.player.x - world.enemies[0]!.x, world.player.y - world.enemies[0]!.y)
    const dt = 1 / 60
    for (let i = 0; i < 60 * 30; i += 1) stepWorld(world, dt, idle)
    const endDist = world.enemies.length > 0
      ? Math.hypot(world.player.x - world.enemies[0]!.x, world.player.y - world.enemies[0]!.y)
      : 0
    // It either reached the player (0 / died colliding) or got much closer.
    expect(endDist).toBeLessThan(startDist * 0.75)
  })

  it('the flow field still routes around walls', () => {
    const world = createWorld(lcg(3))
    const flow = buildFlowField(world.grid, 7, 11)
    expect(flowAt(flow, 7, 11)).toBe(0)
    expect(flowAt(flow, 1, 1)).toBeGreaterThan(0)
    expect(GRID_W).toBe(15)
    expect(GRID_H).toBe(13)
  })
})
