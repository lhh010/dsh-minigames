import { describe, expect, it } from 'vitest'
import {
  LEVEL_WEIGHTS, createStart, generateLevel, isWin, leftTorque, levelSeed, mulberry32,
  netTorque, occupants, placeWeight, removeWeight, rightTorque, slotArm,
} from '../src/client/games/balance/logic.ts'

describe('balance logic', () => {
  it('mulberry32: 同种子序列确定且不同种子序列不同', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const c = mulberry32(43)
    const seqA = [a(), a(), a()]
    const seqB = [b(), b(), b()]
    const seqC = [c(), c(), c()]
    expect(seqA).toEqual(seqB)
    expect(seqA).not.toEqual(seqC)
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('slotArm: 左侧挂点力臂 5..1，右侧 1..5', () => {
    expect(slotArm(0)).toEqual({ side: 'L', distance: 5 })
    expect(slotArm(4)).toEqual({ side: 'L', distance: 1 })
    expect(slotArm(5)).toEqual({ side: 'R', distance: 1 })
    expect(slotArm(9)).toEqual({ side: 'R', distance: 5 })
  })

  it('力矩计算：左力矩 = Σ 重量×力臂，右同理，净力矩 = 左 - 右', () => {
    // 手工局面：重量 4 挂左力臂 2（=8），重量 3 挂右力臂 3（=9），重量 6 未挂。
    const state = { weights: [4, 3, 6], placement: [3, 7, -1] }
    expect(leftTorque(state)).toBe(8)
    expect(rightTorque(state)).toBe(9)
    expect(netTorque(state)).toBe(-1)
  })

  it('placeWeight: 合法挂上返回新状态；占用 / 重复挂 / 越界返回 null，且不改原状态', () => {
    const start = createStart([4, 3, 6])
    const next = placeWeight(start, 0, 3)
    expect(next).not.toBeNull()
    expect(next!.placement).toEqual([3, -1, -1])
    // 原状态不变。
    expect(start.placement).toEqual([-1, -1, -1])
    // 同一挂点再挂 → null。
    expect(placeWeight(next!, 1, 3)).toBeNull()
    // 已挂砝码再挂 → null。
    expect(placeWeight(next!, 0, 0)).toBeNull()
    // 越界。
    expect(placeWeight(start, 0, -1)).toBeNull()
    expect(placeWeight(start, 0, 10)).toBeNull()
    expect(placeWeight(start, 3, 0)).toBeNull()
  })

  it('removeWeight / occupants: 取下放回砝码架，占用表同步', () => {
    const state = placeWeight(createStart([4, 3]), 0, 3)!
    expect(occupants(state)).toEqual([-1, -1, -1, 0, -1, -1, -1, -1, -1, -1])
    const back = removeWeight(state, 0)
    expect(back).not.toBeNull()
    expect(back!.placement).toEqual([-1, -1])
    expect(occupants(back!)).toEqual(new Array(10).fill(-1))
    expect(removeWeight(back!, 0)).toBeNull()
    expect(removeWeight(back!, 5)).toBeNull()
  })

  it('isWin: 全部挂上且净力矩为 0 才过关；未挂满或失衡均不过关', () => {
    // 平衡解：4@左2 = 8，2@右4 = 8。
    const balanced = { weights: [4, 2], placement: [3, 8] }
    expect(isWin(balanced)).toBe(true)
    // 没挂满。
    expect(isWin({ weights: [4, 2], placement: [3, -1] })).toBe(false)
    // 挂满但失衡。
    expect(isWin({ weights: [4, 2], placement: [3, 7] })).toBe(false)
    expect(isWin(createStart([1, 2, 3]))).toBe(false)
  })

  it('generateLevel: 同种子完全确定，砝码数与数值域 (1-9) 正确', () => {
    for (const count of LEVEL_WEIGHTS) {
      const a = generateLevel(mulberry32(7), count)
      const b = generateLevel(mulberry32(7), count)
      expect(a).toEqual(b)
      expect(a.weights).toHaveLength(count)
      for (const v of a.weights) {
        expect(v).toBeGreaterThanOrEqual(1)
        expect(v).toBeLessThanOrEqual(9)
      }
    }
  })

  it('generateLevel: 构造解挂满后恰好平衡且挂点互不冲突（多关多种子）', () => {
    for (let level = 1; level <= LEVEL_WEIGHTS.length; level += 1) {
      const count = LEVEL_WEIGHTS[level - 1]!
      for (const seed of [1, 99, 0xcafe, 123456]) {
        const gen = generateLevel(mulberry32(levelSeed(seed, level)), count)
        const state = createStart(gen.weights)
        let current = state
        for (let i = 0; i < gen.solution.length; i += 1) {
          const next = placeWeight(current, i, gen.solution[i]!)
          expect(next).not.toBeNull()
          current = next!
        }
        expect(current.placement.every(s => s >= 0)).toBe(true)
        expect(netTorque(current)).toBe(0)
        expect(isWin(current)).toBe(true)
        // 挂点互不冲突（placeWeight 已保证，再显式核对占用数）。
        expect(new Set(gen.solution).size).toBe(gen.solution.length)
      }
    }
  })

  it('generateLevel: 数值顺序被打乱（解顺序与生成顺序不保持排序对应）且 LEVEL_WEIGHTS 递进 3→7', () => {
    expect(LEVEL_WEIGHTS).toEqual([3, 4, 5, 6, 7])
    // 打乱校验：跨多个种子，至少存在一关输出不是严格递增（构造解的数值顺序被打乱）。
    let sawUnsorted = false
    for (const seed of [3, 11, 77, 500, 9001]) {
      const gen = generateLevel(mulberry32(seed), 7)
      const sorted = [...gen.weights].sort((x, y) => x - y)
      if (gen.weights.join(',') !== sorted.join(',')) sawUnsorted = true
    }
    expect(sawUnsorted).toBe(true)
  })
})
