import { describe, expect, it } from 'vitest'
import {
  FALL_POINTS, LOSE_ROW, POP_POINTS, SHOT_SPEED, SHOOTER_Y,
  adjustAim, advanceLevel, aimAt, attachedCells, clampAim, colsIn, connectedSameColor,
  createState, emptyGrid, findSnapCell, fire, initialRows, restartLevel, step, togglePause,
  type BubbleState,
} from '../src/client/games/bubble/logic.ts'

/** Step at 60fps until the shot settles (or the cap hits). */
function settleAll(s: BubbleState, maxFrames = 500): void {
  for (let i = 0; i < maxFrames && s.flying !== null; i += 1) step(s, 1 / 60)
}

/** A state with an empty board and known colors, for hand-built fixtures. */
function blank(): BubbleState {
  const s = createState(1)
  s.grid = emptyGrid()
  s.current = 0
  s.next = 0
  return s
}

/** Fill rows 0..rows-1 across every column with one color. */
function fillRows(s: BubbleState, rows: number, color: number): void {
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < colsIn(r); c += 1) s.grid[r]![c] = color
  }
}

describe('bubble logic', () => {
  it('aim clamps within [0, π] from both sides', () => {
    expect(clampAim(-0.5)).toBe(0)
    expect(clampAim(4)).toBe(Math.PI)
    expect(clampAim(1.5)).toBe(1.5)
    const s = blank()
    adjustAim(s, -99)
    expect(s.aim).toBe(0)
    adjustAim(s, 99)
    expect(s.aim).toBe(Math.PI)
    // Mouse aiming below the shooter clamps too (right side → 0, left → π).
    aimAt(s, 300, SHOOTER_Y + 50)
    expect(s.aim).toBe(0)
    aimAt(s, 20, SHOOTER_Y + 50)
    expect(s.aim).toBe(Math.PI)
  })

  it('a steep shot settles into the correct ceiling cell', () => {
    const s = blank()
    s.aim = Math.PI / 2 - 0.05 // up and slightly right
    fire(s)
    expect(s.flying).not.toBeNull()
    settleAll(s)
    expect(s.flying).toBeNull()
    expect(s.grid[0]![4]).not.toBeNull() // x ≈ 184 snaps to col 4 (center 182)
    expect(s.grid[0]![3]).toBeNull()
    expect(s.result).toBe('playing')
  })

  it('findSnapCell picks the nearest valid cell for ceiling, contact, and ties', () => {
    const empty = emptyGrid()
    expect(findSnapCell(empty, 110, 72)).toEqual({ r: 0, c: 2 }) // exact ceiling center
    const grid = emptyGrid()
    grid[3]![0] = 2 // odd row, center (56, cellY(3))
    // Approach just below-left of the stack: (4,0) is the nearest empty neighbor.
    expect(findSnapCell(grid, 40, 200)).toEqual({ r: 4, c: 0 })
    // An approach below the stack snaps to the underside cell, not the top.
    grid[1]![0] = 0 // center (56, cellY(1))
    expect(findSnapCell(grid, 44, 125)).toEqual({ r: 2, c: 0 })
  })

  it('wall bounce flips vx, preserves speed and vy', () => {
    const s = blank()
    s.grid[0]![0] = 5
    s.grid[0]![1] = 5
    s.grid[0]![2] = 5
    s.aim = Math.PI - 0.5 // up-left toward the left wall
    fire(s)
    const f = s.flying!
    expect(f.vx).toBeLessThan(0)
    let frames = 0
    while (s.flying !== null && s.flying.vx < 0 && frames < 60) {
      step(s, 1 / 60)
      frames += 1
    }
    const after = s.flying
    expect(after).not.toBeNull()
    expect(after!.vx).toBeGreaterThan(0)
    expect(after!.vy).toBe(f.vy) // untouched by the bounce
    expect(Math.hypot(after!.vx, after!.vy)).toBeCloseTo(SHOT_SPEED, 6)
    expect(after!.x).toBeGreaterThanOrEqual(20 + 18) // never inside the left wall
    expect(s.events.some(e => e.kind === 'bounce')).toBe(true)
  })

  it('3 connected same-color bubbles pop and clear the field', () => {
    const s = blank()
    s.grid[0]![0] = 0
    s.grid[0]![1] = 0
    aimAt(s, 110, 72) // target the (0,2) ceiling cell
    fire(s)
    settleAll(s)
    // Landed on (0,2), matched the row of 0s, popped — field is empty.
    expect(s.grid.every(row => row.every(v => v === null))).toBe(true)
    expect(s.result).toBe('won')
    expect(s.score).toBe(POP_POINTS * 3)
    expect(s.events.some(e => e.kind === 'pop' && e.cells.length === 3)).toBe(true)
    expect(s.events.some(e => e.kind === 'clear')).toBe(true)
  })

  it('2 connected same-color bubbles do NOT pop', () => {
    const s = blank()
    s.grid[0]![0] = 0
    aimAt(s, 74, 72) // lands on (0,1) next to it
    fire(s)
    settleAll(s)
    expect(s.grid[0]![0]).toBe(0)
    expect(s.grid[0]![1]).toBe(0)
    expect(s.result).toBe('playing')
    expect(s.score).toBe(0)
  })

  it('no false matches across colors', () => {
    const s = blank()
    s.grid[0]![0] = 0
    s.grid[0]![1] = 1 // different color between them
    aimAt(s, 110, 72)
    fire(s)
    settleAll(s)
    expect(s.grid[0]![2]).toBe(0) // the shot settled
    expect(s.grid[0]![0]).toBe(0)
    expect(s.grid[0]![1]).toBe(1) // nothing popped
    expect(s.result).toBe('playing')
    expect(s.score).toBe(0)
  })

  it('attachedCells keeps ceiling-connected bubbles and drops isolated clusters', () => {
    const grid = emptyGrid()
    grid[0]![0] = 0
    grid[0]![1] = 0
    grid[1]![0] = 1 // hangs under (0,0) → attached through it
    grid[3]![4] = 2 // isolated island → attached to nothing
    const attached = attachedCells(grid)
    expect(attached.has('0,0')).toBe(true)
    expect(attached.has('0,1')).toBe(true)
    expect(attached.has('1,0')).toBe(true)
    expect(attached.has('3,4')).toBe(false)
    expect(connectedSameColor(grid, 0, 1)).toHaveLength(2)
    expect(connectedSameColor(grid, 3, 4)).toHaveLength(1)
  })

  it('after a pop, hangers fall and score = popped×10 + fallen×20', () => {
    const s = blank()
    s.grid[0]![0] = 0
    s.grid[0]![1] = 0
    s.grid[0]![2] = 0
    s.grid[1]![0] = 1 // hangs under (0,0); its only links pop away
    aimAt(s, 92, 103.2) // the (1,1) cell under the row of 0s
    fire(s)
    settleAll(s)
    expect(s.grid.every(row => row.every(v => v === null))).toBe(true)
    const pop = s.events.find(e => e.kind === 'pop')
    const fall = s.events.find(e => e.kind === 'fall')
    expect(pop && pop.kind === 'pop' ? pop.cells.length : 0).toBe(4)
    expect(fall && fall.kind === 'fall' ? fall.cells.length : 0).toBe(1)
    expect(s.score).toBe(POP_POINTS * 4 + FALL_POINTS * 1)
    expect(s.result).toBe('won')
  })

  it('same seed + same shot script → identical board snapshots', () => {
    const run = (): string => {
      const s = createState(42, 2)
      const targets: [number, number][] = [[164, 72], [120, 72], [200, 72], [92, 103.2], [260, 140]]
      for (const [x, y] of targets) {
        aimAt(s, x, y)
        fire(s)
        settleAll(s)
        if (s.result !== 'playing') break
      }
      return JSON.stringify({ grid: s.grid, score: s.score, current: s.current, next: s.next, result: s.result })
    }
    expect(run()).toBe(run())
  })

  it('clearing the field wins; advanceLevel deals the next level and keeps score', () => {
    const s = blank()
    s.grid[0]![0] = 0
    s.grid[0]![1] = 0
    aimAt(s, 110, 72)
    fire(s)
    settleAll(s)
    expect(s.result).toBe('won')
    const kept = s.score
    advanceLevel(s)
    expect(s.result).toBe('playing')
    expect(s.level).toBe(2)
    expect(s.score).toBe(kept)
    expect(initialRows(2)).toBe(6)
    let occupiedRows = 0
    for (let r = 0; r < s.grid.length; r += 1) {
      if (s.grid[r]!.some(v => v !== null)) occupiedRows += 1
    }
    expect(occupiedRows).toBe(initialRows(2))
    expect(initialRows(6)).toBe(5) // wraps after 5
  })

  it('settling at or below the lose row ends the game', () => {
    const s = blank()
    fillRows(s, LOSE_ROW, 0) // full stack down to just above the line
    s.current = 1 // different color: the landing pops nothing
    s.next = 1
    s.aim = Math.PI / 2 // straight up the middle
    fire(s)
    settleAll(s)
    expect(s.flying).toBeNull()
    expect(s.result).toBe('over')
    expect(s.events.some(e => e.kind === 'over')).toBe(true)
    // Over is inert: further steps change nothing.
    const frozen = JSON.stringify(s.grid)
    step(s, 1 / 60)
    expect(JSON.stringify(s.grid)).toBe(frozen)
  })

  it('restartLevel replays the identical initial board and resets the score', () => {
    const fresh = createState(9, 1)
    const s = createState(9, 1)
    aimAt(s, 120, 72)
    fire(s)
    settleAll(s)
    expect(JSON.stringify(s.grid)).not.toBe(JSON.stringify(fresh.grid))
    restartLevel(s)
    expect(s.level).toBe(1)
    expect(s.result).toBe('playing')
    expect(s.score).toBe(0)
    expect(JSON.stringify(s.grid)).toBe(JSON.stringify(fresh.grid))
  })

  it('togglePause only flips between playing and paused, and pauses freeze the shot', () => {
    const s = createState(3, 1)
    togglePause(s)
    expect(s.result).toBe('paused')
    fire(s) // paused: no shot
    expect(s.flying).toBeNull()
    step(s, 1 / 60)
    expect(s.events).toHaveLength(0)
    togglePause(s)
    expect(s.result).toBe('playing')
    s.result = 'over'
    togglePause(s)
    expect(s.result).toBe('over') // no-op outside playing/paused
  })
})
