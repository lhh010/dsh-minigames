import { describe, expect, it } from 'vitest'
import {
  CATEGORIES, CATEGORY_LABELS, faceCounts, longestRun, mulberry32,
  rollDice, scoreCategory, totalScore, upperBonus, upperSubtotal,
} from '../src/client/games/yahtzee/logic.ts'

describe('yahtzee 计分格', () => {
  it('上区一点s~六点s按对应面值求和', () => {
    const dice = [1, 3, 3, 6, 3]
    expect(scoreCategory('ones', dice)).toBe(1)
    expect(scoreCategory('twos', dice)).toBe(0)
    expect(scoreCategory('threes', dice)).toBe(9)
    expect(scoreCategory('fours', dice)).toBe(0)
    expect(scoreCategory('fives', dice)).toBe(0)
    expect(scoreCategory('sixes', dice)).toBe(6)
  })

  it('三同/四同取全部骰面总和，不满足为 0', () => {
    expect(scoreCategory('threeKind', [5, 5, 5, 2, 1])).toBe(18)
    expect(scoreCategory('threeKind', [5, 5, 2, 2, 1])).toBe(0)
    expect(scoreCategory('fourKind', [2, 2, 2, 2, 6])).toBe(14)
    expect(scoreCategory('fourKind', [2, 2, 2, 6, 6])).toBe(0)
    // 四同天然满足三同。
    expect(scoreCategory('threeKind', [4, 4, 4, 4, 1])).toBe(17)
  })

  it('葫芦严格三同一对 25，四同一对与五同不算', () => {
    expect(scoreCategory('fullHouse', [3, 3, 3, 5, 5])).toBe(25)
    expect(scoreCategory('fullHouse', [3, 3, 3, 3, 5])).toBe(0)
    expect(scoreCategory('fullHouse', [6, 6, 6, 6, 6])).toBe(0)
    expect(scoreCategory('fullHouse', [1, 2, 3, 4, 5])).toBe(0)
  })

  it('小顺 30 / 大顺 40 按最长连续顺子判定（重复面不计）', () => {
    expect(scoreCategory('smallStraight', [1, 2, 3, 4, 4])).toBe(30)
    expect(scoreCategory('largeStraight', [1, 2, 3, 4, 4])).toBe(0)
    expect(scoreCategory('largeStraight', [2, 3, 4, 5, 6])).toBe(40)
    expect(scoreCategory('smallStraight', [6, 1, 3, 4, 5])).toBe(30)
    expect(scoreCategory('smallStraight', [1, 2, 3, 5, 6])).toBe(0)
    expect(scoreCategory('largeStraight', [1, 2, 3, 5, 6])).toBe(0)
  })

  it('快艇五同 50，机会恒为总和', () => {
    expect(scoreCategory('yahtzee', [4, 4, 4, 4, 4])).toBe(50)
    expect(scoreCategory('yahtzee', [4, 4, 4, 4, 1])).toBe(0)
    expect(scoreCategory('chance', [6, 6, 5, 2, 1])).toBe(20)
    expect(scoreCategory('chance', [1, 1, 1, 1, 1])).toBe(5)
  })

  it('longestRun 与 faceCounts 处理重复面', () => {
    expect(longestRun([1, 2, 3, 4, 4])).toBe(4)
    expect(longestRun([2, 2, 4, 4, 6])).toBe(1)
    expect(longestRun([3, 4, 5, 6, 6])).toBe(4)
    expect(faceCounts([1, 1, 6, 6, 6])).toEqual([2, 0, 0, 0, 0, 3])
  })
})

describe('yahtzee 掷骰', () => {
  it('rollDice 同种子确定，锁定骰保留原值，面值在 1..6', () => {
    const a = rollDice(4242, [1, 2, 3, 4, 5], [false, true, false, false, true])
    const b = rollDice(4242, [1, 2, 3, 4, 5], [false, true, false, false, true])
    expect(a).toEqual(b)
    expect(a[1]).toBe(2)
    expect(a[4]).toBe(5)
    for (const face of a) {
      expect(face).toBeGreaterThanOrEqual(1)
      expect(face).toBeLessThanOrEqual(6)
      expect(Number.isInteger(face)).toBe(true)
    }
  })

  it('不同种子覆盖真实面值空间且 mulberry32 序列同种子一致', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 60; i += 1) for (const f of rollDice(i, [1, 1, 1, 1, 1], [])) seen.add(f)
    expect(seen.size).toBeGreaterThan(1)
    const r1 = mulberry32(9)
    const r2 = mulberry32(9)
    for (let i = 0; i < 10; i += 1) expect(r1()).toBe(r2())
  })
})

describe('yahtzee 汇总', () => {
  it('上区小计 63 起加成 35，62 不加', () => {
    const base = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15 } as const
    expect(upperSubtotal({ ...base, sixes: 18 })).toBe(63)
    expect(upperBonus({ ...base, sixes: 18 })).toBe(35)
    expect(upperSubtotal({ ...base, sixes: 17 })).toBe(62)
    expect(upperBonus({ ...base, sixes: 17 })).toBe(0)
  })

  it('总分 = 已填实分 + 上区加成 + 快速艇奖励×50', () => {
    const scores = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, fullHouse: 25, yahtzee: 50, chance: 20 }
    // 已填 158（上区 63 + 葫芦 25 + 快艇 50 + 机会 20）+ 上区加成 35 = 193。
    expect(totalScore(scores, 0)).toBe(193)
    expect(totalScore(scores, 2)).toBe(293)
    expect(totalScore({}, 1)).toBe(50)
  })

  it('13 格齐全、互不相同且都有中文名', () => {
    expect(CATEGORIES).toHaveLength(13)
    expect(new Set(CATEGORIES).size).toBe(13)
    for (const c of CATEGORIES) expect(CATEGORY_LABELS[c].length).toBeGreaterThan(0)
  })
})
