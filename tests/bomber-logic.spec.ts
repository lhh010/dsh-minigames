import { describe, expect, it } from 'vitest'
import {
  createWorld, startLevel, stepWorld, placeBomb, tryMove, tileAt, actorTile,
  generateLayout, computeBlast, buildFlowField, flowAt, mulberry32,
  TILE, GRID_W, GRID_H, FUSE_S, MAX_BOMBS, LEVELS, ADVANCE_DELAY, AI_TICK,
  PLAYER_START, CORNER_POCKETS,
} from '../src/client/games/bomber/logic.ts'
import type { Tile, WorldState } from '../src/client/games/bomber/logic.ts'

/** Deterministic rng for tests (mulberry32 itself is exercised via determinism). */
function rng(seed: number): () => number {
  return mulberry32(seed)
}

const idle = { up: false, down: false, left: false, right: false }

/** A fully open board: border walls only (AI/movement tests want geometry they control). */
function openGrid(): Tile[][] {
  const grid: Tile[][] = []
  for (let ty = 0; ty < GRID_H; ty += 1) {
    const row: Tile[] = []
    for (let tx = 0; tx < GRID_W; tx += 1) {
      row.push(tx === 0 || tx === GRID_W - 1 || ty === 0 || ty === GRID_H - 1 ? 2 : 0)
    }
    grid.push(row)
  }
  return grid
}

/**
 * Reset the board to the open grid plus one enemy sealed into a brick pocket
 * at (5,1): it cannot move, chase, or die, so the level never reads as
 * "cleared" while the test exercises movement or bomb mechanics.
 */
function quietWorld(seed = 1): WorldState {
  const state = createWorld(1, rng(seed))
  state.grid = openGrid()
  state.grid[1]![4] = 1
  state.grid[1]![6] = 1
  state.grid[2]![5] = 1
  state.enemies = [{ x: TILE * 5, y: TILE, dir: 2, targetDir: 2, alive: true }]
  return state
}

/** Step the world `seconds` forward in 1/60 chunks with the given input. */
function run(state: WorldState, seconds: number, input = idle): void {
  for (let i = 0; i < Math.round(seconds * 60); i += 1) stepWorld(state, 1 / 60, input)
}

const dist = (state: WorldState, index = 0): number => {
  const e = state.enemies[index]!
  return Math.hypot(e.x - state.player.x, e.y - state.player.y)
}

describe('bomberman layout', () => {
  it('keeps the interior of the four 3×3 spawn corners clear', () => {
    const grid = generateLayout(3, rng(7))
    for (const [cx, cy] of CORNER_POCKETS) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const tx = cx + dx
          const ty = cy + dy
          if (tx >= 1 && tx <= GRID_W - 2 && ty >= 1 && ty <= GRID_H - 2) {
            expect(tileAt(grid, tx, ty)).toBe(0)
          }
        }
      }
    }
  })

  it('places pillars on even/even inner tiles and borders on every level', () => {
    // The four pocket-adjacent pillars (2,2)…(10,8) are cleared by the spawn
    // pockets; every other even/even inner tile stays a pillar.
    const pocketed = new Set(['2,2', '10,2', '2,8', '10,8'])
    for (const level of [1, 3, 5]) {
      const grid = generateLayout(level, rng(level))
      for (let ty = 2; ty < GRID_H - 1; ty += 2) {
        for (let tx = 2; tx < GRID_W - 1; tx += 2) {
          if (pocketed.has(`${tx},${ty}`)) continue
          expect(tileAt(grid, tx, ty)).toBe(2)
        }
      }
      for (let tx = 0; tx < GRID_W; tx += 1) {
        expect(tileAt(grid, tx, 0)).toBe(2)
        expect(tileAt(grid, tx, GRID_H - 1)).toBe(2)
      }
    }
  })

  it('is deterministic per seed and denser on higher levels', () => {
    const a = generateLayout(1, rng(42))
    const b = generateLayout(1, rng(42))
    expect(a).toEqual(b)
    expect(a).not.toEqual(generateLayout(5, rng(42)))
    const bricks = (grid: Tile[][]): number => grid.flat().filter(t => t === 1).length
    expect(bricks(generateLayout(5, rng(99)))).toBeGreaterThan(bricks(generateLayout(1, rng(99))))
  })
})

describe('bomberman movement', () => {
  it('moves the player on open tiles and stops at the border wall', () => {
    const state = quietWorld()
    const startX = state.player.x
    run(state, 0.5, { ...idle, right: true })
    expect(state.player.x).toBeGreaterThan(startX)
    run(state, 8, { ...idle, right: true })
    // Body inset 3: the player stops flush short of the border column.
    expect(state.player.x).toBeLessThan(TILE * (GRID_W - 1) - 24)
  })

  it('blocks movement into walls and bricks, free on open tiles', () => {
    const state = quietWorld()
    state.player.x = TILE * 2
    state.player.y = TILE * 2
    state.grid[1]![2] = 2 // pillar above
    state.grid[2]![3] = 1 // brick to the right
    expect(tryMove(state, state.player, 0, 4)).toBe(false)
    expect(state.player.y).toBe(TILE * 2)
    expect(tryMove(state, state.player, 1, 4)).toBe(false)
    expect(state.player.x).toBe(TILE * 2)
    expect(tryMove(state, state.player, 2, TILE)).toBe(true) // down is open
  })

  it('blocks movement into a living enemy', () => {
    const state = quietWorld()
    state.enemies = [{ x: TILE * 2, y: TILE * 3, dir: 2, targetDir: 2, alive: true }]
    state.player.x = TILE * 2
    state.player.y = TILE * 2
    expect(tryMove(state, state.player, 2, 16)).toBe(false)
    expect(state.player.y).toBe(TILE * 2)
  })
})

describe('bomberman bombs and explosions', () => {
  it('limits active bombs to MAX_BOMBS and one per tile', () => {
    const state = quietWorld()
    expect(placeBomb(state)).toBe(true)
    expect(placeBomb(state)).toBe(false) // one bomb per tile
    run(state, 0.2, { ...idle, right: true })
    expect(placeBomb(state)).toBe(true)
    run(state, 0.4, { ...idle, right: true })
    expect(placeBomb(state)).toBe(false) // max active bombs
    expect(state.bombs).toHaveLength(MAX_BOMBS)
  })

  it('explodes after the 2.2s fuse with a cross of range 2', () => {
    const state = quietWorld()
    // Walk to a roomy mid-board spot, drop the bomb, then step out of its blast.
    run(state, 1.0, { ...idle, right: true })
    run(state, 1.5, { ...idle, up: true })
    expect(placeBomb(state)).toBe(true)
    const [btx, bty] = actorTile(state.player)
    run(state, 1.0, { ...idle, right: true })
    run(state, FUSE_S - 1.1)
    expect(state.bombs).toHaveLength(1) // fuse not yet burnt down
    run(state, 0.3)
    expect(state.bombs).toHaveLength(0)
    const flameTiles = state.flames.map(f => `${f.tx},${f.ty}`)
    expect(flameTiles).toContain(`${btx},${bty}`)
    for (let step = 1; step <= 2; step += 1) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        expect(flameTiles).toContain(`${btx + dx * step},${bty + dy * step}`)
      }
    }
    expect(state.flames.length).toBe(9) // center + 4 arms × 2 on the open board
    expect(state.player.alive).toBe(true)
  })

  it('stops arms at walls (no flame) and destroys the first brick then stops', () => {
    const grid = openGrid()
    grid[5]![4] = 2 // wall right of center at +1
    grid[4]![3] = 1 // brick up at +1
    grid[7]![3] = 1 // brick down at +2
    const { tiles, bricks } = computeBlast(grid, 3, 5)
    const has = (tx: number, ty: number): boolean => tiles.some(([x, y]) => x === tx && y === ty)
    expect(has(4, 5)).toBe(false) // wall: no flame at all
    expect(has(3, 4)).toBe(true) // brick burns
    expect(has(3, 3)).toBe(false) // flame stopped at the brick
    expect(has(3, 7)).toBe(true) // brick at +2 burns
    expect(has(3, 8)).toBe(false)
    expect(bricks).toEqual([[3, 4], [3, 7]])
  })

  it('awards 10 points per destroyed brick and opens the path', () => {
    const state = quietWorld()
    state.player.x = TILE
    state.player.y = TILE * 5
    state.grid[5]![2] = 1 // brick ahead at (2,5)
    expect(placeBomb(state)).toBe(true) // bomb under the player at (1,5)
    run(state, 0.8, { ...idle, up: true }) // step out of the blast
    run(state, FUSE_S)
    expect(state.grid[5]![2]).toBe(0)
    expect(state.score).toBe(10)
    state.player.x = TILE
    state.player.y = TILE * 5
    expect(tryMove(state, state.player, 1, TILE)).toBe(true) // path is open now
  })

  it('chain-detonates a second bomb caught in the blast', () => {
    const state = quietWorld()
    state.player.x = TILE // (1,5): outside both blasts
    state.player.y = TILE * 5
    state.bombs.push({ tx: 5, ty: 5, fuse: 0.01 })
    state.bombs.push({ tx: 7, ty: 5, fuse: 5 }) // within range 2 of the first
    run(state, 0.1)
    expect(state.bombs).toHaveLength(0) // both went off
    const flameTiles = state.flames.map(f => `${f.tx},${f.ty}`)
    expect(flameTiles).toContain('5,5')
    expect(flameTiles).toContain('9,5') // second bomb's own arm proves it detonated
  })

  it('kills an enemy in the blast (+100) and spares one outside it', () => {
    const state = quietWorld()
    state.player.x = TILE * 5 // (5,3): outside the (1,5) cross
    state.player.y = TILE * 3
    state.enemies = [
      { x: TILE * 3, y: TILE * 5, dir: 2, targetDir: 2, alive: true }, // (3,5) in blast
      { x: TILE * 10, y: TILE * 5, dir: 2, targetDir: 2, alive: true }, // far away
    ]
    state.bombs.push({ tx: 1, ty: 5, fuse: 0.01 })
    run(state, 0.1)
    expect(state.enemies).toHaveLength(1)
    expect(state.score).toBe(100)
    expect(state.player.alive).toBe(true)
  })

  it('kills the player standing in the blast and spares a safe player', () => {
    const safe = quietWorld()
    safe.player.x = TILE * 10
    safe.player.y = TILE * 5
    safe.bombs.push({ tx: 1, ty: 5, fuse: 0.01 })
    run(safe, 0.1)
    expect(safe.player.alive).toBe(true)
    expect(safe.result).toBe('none')

    const hit = createWorld(1, rng(1))
    hit.grid = openGrid()
    hit.enemies = []
    hit.player.x = TILE * 3
    hit.player.y = TILE * 5
    hit.bombs.push({ tx: 1, ty: 5, fuse: 0.01 })
    run(hit, 0.1)
    expect(hit.player.alive).toBe(false)
    expect(hit.result).toBe('lose')
  })
})

describe('bomberman enemy AI', () => {
  it('chases the player and closes distance over N ticks on an open board', () => {
    const state = createWorld(1, rng(9))
    state.grid = openGrid()
    state.player.x = PLAYER_START[0] * TILE
    state.player.y = PLAYER_START[1] * TILE
    state.enemies = [{ x: (GRID_W - 2) * TILE, y: TILE, dir: 2, targetDir: 2, alive: true }]
    const before = dist(state)
    run(state, AI_TICK * 8) // several decision ticks
    expect(dist(state)).toBeLessThan(before - TILE * 2)
    expect(state.player.alive).toBe(true) // has approached but not reached
  })

  it('builds a flow field that routes around a wall and marks walls unreachable', () => {
    const grid = openGrid()
    grid[5]![4] = 2
    grid[5]![5] = 2
    grid[5]![6] = 2
    const flow = buildFlowField(grid, 1, 5) // player left of the wall segment
    expect(flowAt(flow, 1, 5)).toBe(0)
    expect(flowAt(flow, 0, 5)).toBe(-1) // walls are unreachable
    expect(flowAt(flow, 4, 4)).toBe(4) // open tile on the detour
    expect(flowAt(flow, 7, 5)).toBeGreaterThanOrEqual(8) // reachable, around the wall
  })
})

describe('bomberman progression', () => {
  it('clears the level on the last enemy and auto-advances with score kept', () => {
    const state = createWorld(1, rng(3))
    state.grid = openGrid()
    state.enemies = [{ x: TILE * 3, y: TILE * 9, dir: 2, targetDir: 2, alive: true }]
    state.player.x = TILE * 3 // (3,7): outside the (1,9) cross
    state.player.y = TILE * 7
    state.bombs.push({ tx: 1, ty: 9, fuse: 0.01 })
    run(state, 0.1)
    expect(state.enemies).toHaveLength(0)
    expect(state.result).toBe('cleared')
    expect(state.score).toBe(100)
    expect(state.advanceTimer).toBeGreaterThan(0)
    run(state, ADVANCE_DELAY + 0.2)
    expect(state.result).toBe('none')
    expect(state.level).toBe(2)
    expect(state.score).toBe(100) // score persists across levels
    expect(state.enemies.length).toBeGreaterThan(0) // fresh level has enemies
  })

  it('wraps levels at LEVELS and enemy count stacks with level', () => {
    expect(createWorld(1, rng(1)).enemies).toHaveLength(2)
    expect(createWorld(2, rng(1)).enemies).toHaveLength(3)
    const state = createWorld(LEVELS, rng(5))
    expect(state.enemies).toHaveLength(4)
    state.enemies = []
    state.result = 'cleared'
    state.advanceTimer = 0.01
    run(state, 0.1)
    expect(state.level).toBe(1) // 5 → 1 wrap
  })

  it('startLevel keeps the score and reseeds the layout deterministically', () => {
    const fresh = createWorld(2, rng(1))
    const kept = createWorld(2, rng(2))
    kept.score = 250
    startLevel(kept, 2, rng(1))
    expect(kept.score).toBe(250)
    expect(kept.grid).toEqual(fresh.grid)
    expect(kept.result).toBe('none')
  })

  it('enemy touch kills the player; the world is inert after game over', () => {
    const state = createWorld(1, rng(2))
    state.grid = openGrid()
    state.enemies = [{ x: TILE * 2, y: TILE * 9, dir: 1, targetDir: 1, alive: true }]
    state.player.x = TILE
    state.player.y = TILE * 9
    run(state, 1.5, { ...idle, right: true })
    expect(state.player.alive).toBe(false)
    expect(state.result).toBe('lose')
    const score = state.score
    const ex = state.enemies.map(e => ({ x: e.x, y: e.y }))
    const px = state.player.x
    run(state, 2)
    expect(state.result).toBe('lose')
    expect(state.score).toBe(score)
    expect(state.player.x).toBe(px)
    expect(state.enemies.map(e => ({ x: e.x, y: e.y }))).toEqual(ex)
  })

  it('is fully deterministic given the same seed and inputs', () => {
    const play = (seed: number): WorldState => {
      const state = createWorld(1, rng(seed))
      state.grid = openGrid()
      run(state, 2, { ...idle, right: true })
      placeBomb(state)
      run(state, 3)
      return state
    }
    const a = play(11)
    const b = play(11)
    expect(a.score).toBe(b.score)
    expect(a.result).toBe(b.result)
    expect(a.enemies.map(e => e.x)).toEqual(b.enemies.map(e => e.x))
    expect(a.flames.map(f => `${f.tx},${f.ty}`)).toEqual(b.flames.map(f => `${f.tx},${f.ty}`))
  })
})
