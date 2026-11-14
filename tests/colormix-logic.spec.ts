import { describe, expect, it } from 'vitest'
import {
  colorDistance,
  isWithinThreshold,
  makeLevel,
  mixColor,
  mulberry32,
  nameFor,
  scoreFor,
  LEVELS,
} from '../src/client/games/colormix/logic.ts'

describe('colormix mixColor', () => {
  it('averages channels linearly across drops', () => {
    // 红+黄+蓝 各一滴：通道平均 (170, 85, 85)。
    expect(mixColor([0, 1, 2])).toEqual([170, 85, 85])
    // 两红一黄：((255*2+255)/3, 255/3, 0) = (255, 85, 0)。
    expect(mixColor([0, 0, 1])).toEqual([255, 85, 0])
  })

  it('rounds each channel and returns black for no drops', () => {
    // 三红一蓝：(191.25, 0, 63.75) → 四舍五入 (191, 0, 64)。
    expect(mixColor([0, 0, 0, 2])).toEqual([191, 0, 64])
    expect(mixColor([])).toEqual([0, 0, 0])
  })
})

describe('colormix colorDistance / threshold', () => {
  it('computes euclidean distance', () => {
    expect(colorDistance([0, 0, 0], [3, 4, 0])).toBe(5)
    expect(colorDistance([10, 20, 30], [10, 20, 30])).toBe(0)
    expect(colorDistance([0, 0, 0], [255, 255, 255])).toBeCloseTo(Math.sqrt(3) * 255, 6)
  })

  it('judges inclusively at the threshold', () => {
    expect(isWithinThreshold(48, 48)).toBe(true)
    expect(isWithinThreshold(48.1, 48)).toBe(false)
    expect(isWithinThreshold(0, 22)).toBe(true)
  })
})

describe('colormix scoreFor', () => {
  it('rewards spared drops and precision', () => {
    // 零误差 + 省两滴：100 + 60 + 50 = 210。
    expect(scoreFor(0, 48, 2)).toBe(210)
    // 恰好压线：100 + 0 + 0 = 100。
    expect(scoreFor(48, 48, 0)).toBe(100)
    // 半程精度：100 + 30 + 25 = 155。
    expect(scoreFor(24, 48, 1)).toBe(155)
  })
})

describe('colormix makeLevel', () => {
  it('is deterministic per (seed, level)', () => {
    expect(makeLevel(12345, 0)).toEqual(makeLevel(12345, 0))
    expect(makeLevel(12345, 4)).toEqual(makeLevel(12345, 4))
    expect(makeLevel(12345, 0)).not.toEqual(makeLevel(54321, 0))
  })

  it('derives a solvable target with spare drops and mixed primaries', () => {
    for (const seed of [0, 1, 7, 42, 99, 1_000_003, 0xffff_ffff]) {
      for (let idx = 0; idx < LEVELS.length; idx += 1) {
        const round = makeLevel(seed, idx)
        // 目标恰等于配方混合 → 滴数内零误差可解。
        expect(round.target).toEqual(mixColor(round.recipe))
        expect(round.recipe.length).toBeLessThanOrEqual(round.config.maxDrops - 1)
        expect(new Set(round.recipe).size).toBeGreaterThanOrEqual(2)
        expect(round.name).not.toBe('')
      }
    }
  })
})

describe('colormix LEVELS ramp', () => {
  it('tightens thresholds and drops across five levels', () => {
    expect(LEVELS).toHaveLength(5)
    for (let i = 1; i < LEVELS.length; i += 1) {
      expect(LEVELS[i]!.threshold).toBeLessThan(LEVELS[i - 1]!.threshold)
      expect(LEVELS[i]!.maxDrops).toBeLessThanOrEqual(LEVELS[i - 1]!.maxDrops)
    }
    expect(LEVELS[0]!.threshold).toBe(60)
    expect(LEVELS[4]!.threshold).toBe(22)
  })
})

describe('colormix nameFor', () => {
  it('names primaries, mixes and neutrals', () => {
    expect(nameFor([255, 0, 0])).toBe('红')
    expect(nameFor([255, 255, 0])).toBe('黄')
    expect(nameFor([0, 0, 255])).toBe('蓝')
    expect(nameFor([85, 200, 85])).toBe('绿')
    expect(nameFor([128, 128, 128])).toBe('灰')
    expect(nameFor([10, 10, 12])).toBe('灰')
  })

  it('mulberry32 sequences are seeded-deterministic', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    for (let i = 0; i < 10; i += 1) expect(a()).toBe(b())
  })
})
