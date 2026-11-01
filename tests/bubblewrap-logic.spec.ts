import { describe, expect, it } from 'vitest'
import {
  COLS, COMBO_CAP, COMBO_WINDOW_MS, ROWS, boardGeometry, bubbleCenter,
  comboActive, createBubbleWrap, hitBubble, popAll, popAt, popAtPoint,
  poppedBoard, poppedCount, stepBubbleWrap,
} from '../src/client/games/bubblewrap/logic.ts'

describe('bubblewrap logic', () => {
  it('a fresh board is untouched with zero score', () => {
    const s = createBubbleWrap(0)
    expect(s.board).toBe(1)
    expect(s.score).toBe(0)
    expect(s.totalPopped).toBe(0)
    expect(poppedCount(s)).toBe(0)
    expect(poppedBoard(s).every((row) => row.every((p) => !p))).toBe(true)
    expect(poppedBoard(s)).toHaveLength(ROWS)
    expect(poppedBoard(s)[0]).toHaveLength(COLS)
  })

  it('popping marks the cell, pays combo-scaled points, and ignores repeats', () => {
    const s = createBubbleWrap()
    expect(popAt(s, 0, 0)).toBe(1)
    expect(popAt(s, 0, 1)).toBe(2)
    expect(popAt(s, 0, 2)).toBe(3)
    expect(s.score).toBe(6)
    expect(poppedBoard(s)[0]![0]).toBe(true)
    expect(popAt(s, 0, 0)).toBe(0)
    expect(s.score).toBe(6)
    expect(s.totalPopped).toBe(3)
    expect(s.bestCombo).toBe(3)
    const pops = s.events.filter((e) => e.type === 'pop')
    expect(pops).toHaveLength(3)
    const ev = pops[pops.length - 1]!
    expect(ev).toMatchObject({ row: 0, col: 2, combo: 3, gained: 3 })
  })

  it('the combo resets once the window expires', () => {
    const s = createBubbleWrap()
    popAt(s, 5, 5)
    expect(comboActive(s)).toBe(true)
    stepBubbleWrap(s, COMBO_WINDOW_MS + 1)
    expect(comboActive(s)).toBe(false)
    expect(s.combo).toBe(0)
    expect(popAt(s, 5, 6)).toBe(1)
    // Inside the window the chain continues.
    popAt(s, 5, 7)
    expect(popAt(s, 5, 8)).toBeGreaterThan(1)
  })

  it('combo gains are capped', () => {
    const s = createBubbleWrap()
    let gained = 0
    for (let col = 0; col <= COMBO_CAP; col += 1) gained = popAt(s, 1, col)
    expect(gained).toBe(1 + COMBO_CAP)
    expect(s.combo).toBe(COMBO_CAP + 1)
    expect(s.bestCombo).toBe(COMBO_CAP + 1)
  })

  it('pointer pops map through hit detection', () => {
    const s = createBubbleWrap()
    const c = bubbleCenter(3, 4)
    expect(hitBubble(c.x, c.y)).toEqual({ row: 3, col: 4 })
    expect(popAtPoint(s, c.x, c.y)).toBe(1)
    expect(poppedBoard(s)[3]![4]).toBe(true)
    // Same cell again: no score, no new pop.
    expect(popAtPoint(s, c.x, c.y)).toBe(0)
    // Cell corner (outside radius), off-grid and HUD area miss.
    const g = boardGeometry()
    expect(hitBubble(c.x + g.r * 0.8, c.y + g.r * 0.8)).toBeNull()
    expect(hitBubble(-20, -20)).toBeNull()
    expect(hitBubble(480, 600)).toBeNull()
    expect(popAtPoint(s, -20, -20)).toBe(0)
  })

  it('popping the last bubble rolls a fresh board', () => {
    const s = createBubbleWrap()
    const total = popAll(s)
    expect(s.totalPopped).toBe(ROWS * COLS)
    expect(s.score).toBe(total)
    expect(s.board).toBe(2)
    expect(poppedCount(s)).toBe(0)
    expect(s.events.some((e) => e.type === 'board' && e.board === 2)).toBe(true)
    expect(s.floats.length).toBeGreaterThan(0)
  })

  it('the same pop script replays identically', () => {
    const script = (s: ReturnType<typeof createBubbleWrap>): number[] => {
      const trace: number[] = []
      for (let i = 0; i < 60; i += 1) {
        popAt(s, (i * 3) % ROWS, (i * 7) % COLS)
        stepBubbleWrap(s, i % 5 === 0 ? COMBO_WINDOW_MS + 1 : 100)
        trace.push(s.score, s.totalPopped, s.bestCombo)
      }
      return trace
    }
    expect(script(createBubbleWrap())).toEqual(script(createBubbleWrap()))
  })
})
