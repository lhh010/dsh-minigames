import { describe, expect, it } from 'vitest'
import { judge, makeSecret, validRow, LEVELS, mulberry32 } from '../src/client/games/mastermind/logic.ts'

describe('mastermind judge', () => {
  it('all black on an exact match', () => {
    expect(judge([1, 2, 3, 4], [1, 2, 3, 4])).toEqual({ black: 4, white: 0 })
  })

  it('no pegs when no color is shared', () => {
    expect(judge([0, 1, 2, 3], [4, 4, 5, 5])).toEqual({ black: 0, white: 0 })
  })

  it('marks black and white on mixed overlap', () => {
    // secret [1,3,2,5]: pos0 black; 2 和 3 颜色对位置不对 → 两枚白钉。
    expect(judge([1, 2, 3, 4], [1, 3, 2, 5])).toEqual({ black: 1, white: 2 })
  })

  it('full permutation is all white', () => {
    expect(judge([1, 2, 3, 4], [4, 3, 2, 1])).toEqual({ black: 0, white: 4 })
  })

  it('doubled guess colors against distinct secret colors: repeats cannot earn extra whites', () => {
    // secret [1,2,3,4]: 猜 [1,1,2,2] → 黑1（位0）；多余的 1 不算，一枚 2 是白钉。
    expect(judge([1, 1, 2, 2], [1, 2, 3, 4])).toEqual({ black: 1, white: 1 })
  })

  it('doubled guess color against a single secret copy stays bounded', () => {
    // secret 只有一个 1（被黑钉消耗）：猜四个 1 只得 1 黑 0 白。
    expect(judge([1, 1, 1, 1], [1, 2, 3, 4])).toEqual({ black: 1, white: 0 })
  })

  it('doubled secret colors counted in both directions', () => {
    // secret [1,1,2,2] vs 猜 [1,2,1,2]：黑2（位0/位3）+ 白2（两枚错位的 1、2）。
    expect(judge([1, 2, 1, 2], [1, 1, 2, 2])).toEqual({ black: 2, white: 2 })
    // 反向：secret [1,2,3,4] 的变体——猜 [1,1,2,2] 已覆盖；这里测 guess 重复被消耗。
    expect(judge([1, 1, 2, 2], [1, 2, 1, 3])).toEqual({ black: 1, white: 2 })
  })

  it('black consumes its secret peg so repeated guesses only see the remainder', () => {
    // secret [2,1,2,3] 有两枚 2，都在正确位被黑钉消耗：猜四个 2 得 2 黑 0 白。
    expect(judge([2, 2, 2, 2], [2, 1, 2, 3])).toEqual({ black: 2, white: 0 })
  })

  it('scales to 5 pegs (L3)', () => {
    // 位 2 恰好同为 2 → 1 黑，其余四色全错位 → 4 白。
    expect(judge([0, 1, 2, 3, 4], [4, 3, 2, 1, 0])).toEqual({ black: 1, white: 4 })
    expect(judge([0, 1, 2, 3, 4], [0, 1, 2, 3, 4])).toEqual({ black: 5, white: 0 })
  })

  it('black + white never exceeds the row length', () => {
    const vectors: Array<[number[], number[]]> = [
      [[1, 1, 2, 2], [1, 2, 1, 2]],
      [[1, 2, 1, 2], [1, 1, 2, 2]],
      [[2, 2, 2, 2], [2, 2, 1, 3]],
      [[0, 0, 0, 0], [0, 0, 0, 0]],
      [[5, 4, 3, 2], [2, 3, 4, 5]],
      [[1, 1, 1, 2], [1, 2, 2, 2]],
      [[0, 1, 2, 3, 4], [4, 3, 2, 1, 0]],
    ]
    for (const [guess, secret] of vectors) {
      const { black, white } = judge(guess, secret)
      expect(black + white).toBeLessThanOrEqual(secret.length)
    }
  })
})

describe('mastermind makeSecret', () => {
  it('is deterministic for a given seed', () => {
    expect(makeSecret(12345, 4, 6)).toEqual(makeSecret(12345, 4, 6))
    expect(makeSecret(0, 5, 6)).toEqual(makeSecret(0, 5, 6))
  })

  it('returns the requested length with colors in range', () => {
    for (const seed of [0, 1, 7, 42, 99, 1_000_003, 0xffff_ffff]) {
      const secret = makeSecret(seed, 5, 6)
      expect(secret).toHaveLength(5)
      for (const c of secret) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(5)
        expect(Number.isInteger(c)).toBe(true)
      }
    }
  })

  it('different seeds sweep a real share of the color space', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 100; i += 1) for (const c of makeSecret(i, 4, 6)) seen.add(c)
    expect(seen.size).toBe(6)
  })

  it('mulberry32 sequences are seeded-deterministic', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    for (let i = 0; i < 10; i += 1) expect(a()).toBe(b())
  })
})

describe('mastermind validRow', () => {
  it('accepts a full row of in-range color ids', () => {
    expect(validRow([0, 1, 2, 3], 4)).toBe(true)
    expect(validRow([5, 5, 0, 0, 2], 5)).toBe(true)
  })
  it('rejects short, long, out-of-range and non-integer rows', () => {
    expect(validRow([0, 1, 2], 4)).toBe(false)
    expect(validRow([0, 1, 2, 3, 4], 4)).toBe(false)
    expect(validRow([0, 6, 2, 3], 4)).toBe(false)
    expect(validRow([0, -1, 2, 3], 4)).toBe(false)
    expect(validRow([0, 1.5, 2, 3], 4)).toBe(false)
    expect(validRow([], 4)).toBe(false)
  })
})

describe('mastermind LEVELS', () => {
  it('ramps difficulty across three levels', () => {
    expect(LEVELS).toHaveLength(3)
    expect(LEVELS.map(l => l.label)).toEqual(['L1', 'L2', 'L3'])
    expect(LEVELS[0]!.pegs).toBe(4)
    expect(LEVELS[1]!.tries).toBeLessThan(LEVELS[0]!.tries)
    expect(LEVELS[2]!.pegs).toBe(5)
    expect(LEVELS[2]!.tries).toBe(9)
  })

  it('every level uses the 6-color palette and sane try counts', () => {
    for (const level of LEVELS) {
      expect(level.colors).toBe(6)
      expect(level.tries).toBeGreaterThanOrEqual(7)
      expect(level.tries).toBeLessThanOrEqual(10)
      expect(level.pegs).toBeGreaterThanOrEqual(4)
    }
  })
})
