import { describe, expect, it } from 'vitest'
import {
  createPacmanState, isWall, stepPacman,
  CELL, COLS, GHOST_DELAY, PLAYER_SPAWN, ROWS,
} from '../src/client/games/pacman/logic.ts'
import type { PacmanState } from '../src/client/games/pacman/logic.ts'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Teleport the player to a specific cell centre (x, y in world px). */
function placePlayer(state: PacmanState, r: number, c: number): void {
  state.px = c * CELL + CELL / 2
  state.py = r * CELL + CELL / 2
}

describe('pacman logic', () => {
  it('builds a maze with walls, dots and power pellets', () => {
    const state = createPacmanState(lcg(1))
    expect(state.grid.length).toBe(ROWS)
    expect(state.grid[0]!.every(cell => cell === '#')).toBe(true)
    expect(state.dotsLeft).toBeGreaterThan(100)
    expect(state.grid[1]![1]).toBe('.')
    expect(state.grid[2]![1]).toBe('o')
    expect(state.lives).toBe(3)
    expect(state.over).toBe(false)
    expect(state.won).toBe(false)
  })

  it('spawns the player on an open cell', () => {
    const state = createPacmanState(lcg(1))
    expect(isWall(state, PLAYER_SPAWN.r, PLAYER_SPAWN.c)).toBe(false)
  })

  it('moving into a dot consumes it and scores', () => {
    const state = createPacmanState(lcg(1))
    placePlayer(state, 1, 1)
    // Clear the dot under the spawn feet so only the next cell's dot counts.
    state.grid[1]![1] = ' '
    state.dotsLeft -= 1
    const dotsBefore = state.dotsLeft
    state.dir = 1
    state.intent = 1
    // ~16 steps reach inside cell (1,2) without crossing into (1,3).
    for (let i = 0; i < 16; i += 1) stepPacman(state, 1 / 60)
    expect(state.dotsLeft).toBe(dotsBefore - 1)
    expect(state.score).toBeGreaterThanOrEqual(10)
    expect(state.grid[1]![2]).toBe(' ')
  })

  it('a wall stops the player from moving through it', () => {
    const state = createPacmanState(lcg(1))
    // Row 0 is all walls; aim up from row 1 — the player must stay in row 1.
    placePlayer(state, 1, 1)
    state.dir = 0
    state.intent = 0
    for (let i = 0; i < 120; i += 1) stepPacman(state, 1 / 60)
    expect(state.py).toBeGreaterThanOrEqual(CELL - 1) // never entered row 0
  })

  it('after being blocked by a wall the player snaps back and keeps eating', () => {
    const state = createPacmanState(lcg(1))
    placePlayer(state, 1, 1)
    state.grid[1]![1] = ' ' // clear the spawn dot
    state.dotsLeft -= 1
    // Push up into the top wall (should snap back to the cell centre)...
    state.dir = 0
    state.intent = 0
    for (let i = 0; i < 30; i += 1) stepPacman(state, 1 / 60)
    // ...then turn right: the player must not be wedged, so it eats (1,2).
    state.intent = 1
    for (let i = 0; i < 16; i += 1) stepPacman(state, 1 / 60)
    expect(state.grid[1]![2]).toBe(' ')
    expect(state.score).toBeGreaterThanOrEqual(10)
  })

  it('ghosts snap back instead of wedging into a wall', () => {
    const state = createPacmanState(lcg(1))
    state.ghostDelay = 0
    const ghost = state.ghosts[0]!
    // Place the ghost in row 1 aiming straight up into the wall row.
    ghost.x = 1 * CELL + CELL / 2
    ghost.y = 1 * CELL + CELL / 2
    ghost.dir = 0
    const startX = ghost.x
    const startY = ghost.y
    for (let i = 0; i < 120; i += 1) stepPacman(state, 1 / 60)
    // Never inside a wall...
    expect(isWall(state, Math.floor(ghost.y / CELL), Math.floor(ghost.x / CELL))).toBe(false)
    // ...and it escaped the spawn cell (moved at least one cell away).
    const moved = Math.abs(ghost.x - startX) + Math.abs(ghost.y - startY)
    expect(moved).toBeGreaterThan(CELL)
  })

  it('a power pellet triggers fright', () => {
    const state = createPacmanState(lcg(1))
    // The pellet at (2,1) is walled in horizontally; approach from above.
    placePlayer(state, 1, 1)
    state.dir = 2
    state.intent = 2
    for (let i = 0; i < 90; i += 1) stepPacman(state, 1 / 60)
    expect(state.fright).toBeGreaterThan(0)
    expect(state.score).toBeGreaterThanOrEqual(50)
  })

  it('touching a ghost while not frightened costs a life', () => {
    const state = createPacmanState(lcg(1))
    state.ghostDelay = 0 // skip the opening grace period for this test
    state.fright = 0
    // Park a ghost one cell below the player so contact is immediate.
    const ghost = state.ghosts[0]!
    ghost.x = state.px
    ghost.y = state.py + CELL
    for (let i = 0; i < 120 && !state.over; i += 1) stepPacman(state, 1 / 60)
    expect(state.lives).toBeLessThan(3)
  })

  it('eating a frightened ghost scores and respawns it', () => {
    const state = createPacmanState(lcg(1))
    state.ghostDelay = 0 // collisions only matter once the delay is over
    const ghost = state.ghosts[0]!
    ghost.x = state.px // overlap the player
    ghost.y = state.py
    state.fright = 3
    const before = state.score
    stepPacman(state, 1 / 60)
    expect(state.score).toBe(before + 200)
    expect(ghost.x).toBe(ghost.homeX)
    expect(ghost.y).toBe(ghost.homeY)
  })

  it('ghosts stay put during the opening delay so the run cannot insta-end', () => {
    const state = createPacmanState(lcg(1))
    expect(state.ghostDelay).toBe(GHOST_DELAY)
    const ghostX = state.ghosts[0]!.x
    // No movement while the delay is active — a head-on spawn cannot kill.
    for (let i = 0; i < 30; i += 1) stepPacman(state, 1 / 60) // 0.5s
    expect(state.ghosts[0]!.x).toBe(ghostX)
    expect(state.lives).toBe(3)
    expect(state.over).toBe(false)
  })

  it('clearing every dot wins', () => {
    const state = createPacmanState(lcg(1))
    state.dotsLeft = 0
    stepPacman(state, 1 / 60)
    expect(state.won).toBe(true)
  })

  it('losing all lives ends the run', () => {
    const state = createPacmanState(lcg(1))
    state.ghostDelay = 0 // collisions only matter once the delay is over
    state.lives = 1
    state.fright = 0
    const ghost = state.ghosts[0]!
    ghost.x = state.px
    ghost.y = state.py
    stepPacman(state, 1 / 60)
    expect(state.over).toBe(true)
    expect(COLS).toBe(19)
  })
})
