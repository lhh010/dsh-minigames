import { describe, expect, it } from 'vitest'
import { edgeAt, logicalW, logicalH, dotX, dotY } from '../src/client/games/slitherlink/render.ts'
import { hEdgeIndex, vEdgeIndex } from '../src/client/games/slitherlink/logic.ts'

describe('slitherlink hit-testing', () => {
  it('hits every horizontal edge, including the bottom row', () => {
    const w = 5, h = 5
    for (let r = 0; r <= h; r += 1) {
      for (let c = 0; c < w; c += 1) {
        const x = dotX(c) + 23 // middle of the cell span
        const y = dotY(r)
        expect(edgeAt(w, h, x, y)).toBe(hEdgeIndex(w, h, c, r))
      }
    }
  })

  it('hits every vertical edge, including the right column', () => {
    const w = 5, h = 5
    for (let r = 0; r < h; r += 1) {
      for (let c = 0; c <= w; c += 1) {
        const x = dotX(c)
        const y = dotY(r) + 23
        expect(edgeAt(w, h, x, y)).toBe(vEdgeIndex(w, h, c, r))
      }
    }
  })

  it('returns -1 for cell interiors and outside the lattice', () => {
    const w = 5, h = 5
    // Dead center of a cell.
    expect(edgeAt(w, h, dotX(2) + 23, dotY(2) + 23)).toBe(-1)
    // Outside.
    expect(edgeAt(w, h, -10, dotY(2))).toBe(-1)
    expect(edgeAt(w, h, logicalW(w) + 10, dotY(2))).toBe(-1)
    expect(edgeAt(w, h, dotX(2), logicalH(h) + 10)).toBe(-1)
    expect(edgeAt(w, h, dotX(2), 10)).toBe(-1) // HUD strip
  })

  it('logical frame fits the lattice with margins', () => {
    const w = 9, h = 9
    expect(dotX(w)).toBeLessThan(logicalW(w))
    expect(dotY(h)).toBeLessThan(logicalH(h))
  })
})
