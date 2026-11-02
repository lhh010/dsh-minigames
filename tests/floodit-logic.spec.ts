import { describe, expect, it } from 'vitest'
import {
  COLOR_COUNT, boardSizeForLevel, componentOf, createLevel, flood, greedyNextColor,
  greedySolveLength, isUniform, levelBaseScore, mulberry32, scoreFor, type FloodItState,
} from '../src/client/games/floodit/logic.ts'

/** 手工小盘：2×2，颜色分布可控。 */
function handState(board: number[], maxSteps = 10): FloodItState {
  const size = Math.sqrt(board.length)
  if (!Number.isInteger(size)) throw new Error('board must be square')
  return { size, colorCount: COLOR_COUNT, board, steps: 0, maxSteps, won: isUniform(board) }
}

describe('floodit logic', () => {
  it('flood 把左上连通片整体换色并合并相邻同色片', () => {
    // 0|1     换成 1：左上片(0) 与右侧(1)、下方(1) 相邻同色合并成 3 格。
    // 1|2
    const s0 = handState([0, 1, 1, 2])
    const s1 = flood(s0, 1)
    expect(s1.board).toEqual([1, 1, 1, 2])
    expect(s1.steps).toBe(1)
  })

  it('flood 是纯函数，不修改输入状态', () => {
    const board = [0, 1, 0, 1]
    const s0 = handState(board)
    const snapshot = [...s0.board]
    flood(s0, 1)
    flood(s0, 2)
    expect(s0.board).toEqual(snapshot)
    expect(s0.steps).toBe(0)
  })

  it('换当前片同色是无效操作，不消耗步数', () => {
    const s0 = handState([0, 1, 2, 3])
    const s1 = flood(s0, 0)
    expect(s1).toBe(s0)
  })

  it('步数耗尽后 flood 拒绝继续；完成判定为全盘同色', () => {
    const s0 = handState([0, 1, 2, 3], 1)
    const s1 = flood(s0, 1)
    expect(s1.steps).toBe(1)
    expect(s1.won).toBe(false)
    expect(flood(s1, 2)).toBe(s1) // 已达上限
    const done = handState([5, 5, 5, 5])
    expect(done.won).toBe(true)
    expect(flood(done, 0)).toBe(done) // 已胜利
  })

  it('componentOf 返回从左上出发的同色连通片', () => {
    // 0 0 1 / 2 0 1 / 2 2 1
    const board = [0, 0, 1, 2, 0, 1, 2, 2, 1]
    const comp = componentOf(board, 3, 0, 0)
    expect(comp).toEqual([true, true, false, false, true, false, false, false, false])
  })

  it('贪心解步数不超过生成时校准的步数上限（解存在性）', () => {
    for (let level = 0; level < 8; level += 1) {
      const s = createLevel(1234, level)
      expect(s.maxSteps).toBeGreaterThanOrEqual(greedySolveLength(s.board, s.size))
      expect(s.maxSteps).toBeGreaterThanOrEqual(Math.ceil(greedySolveLength(s.board, s.size) * 1))
    }
  })

  it('按贪心逐步行走在上限内通关', () => {
    for (const level of [0, 3, 6, 9, 20]) {
      let s = createLevel(777, level)
      while (!s.won) {
        const c = greedyNextColor(s)
        expect(c).toBeGreaterThanOrEqual(0)
        s = flood(s, c)
        expect(s.steps).toBeLessThanOrEqual(s.maxSteps)
      }
      expect(isUniform(s.board)).toBe(true)
    }
  })

  it('createLevel 确定性：同 (seed, level) 生成完全相同的盘面与上限', () => {
    for (let level = 0; level < 6; level += 1) {
      const a = createLevel(42, level)
      const b = createLevel(42, level)
      expect(a.board).toEqual(b.board)
      expect(a.maxSteps).toBe(b.maxSteps)
      expect(a.size).toBe(b.size)
    }
  })

  it('多关参数表：尺寸 8→14 封顶、六色、计分公式', () => {
    expect(boardSizeForLevel(0)).toBe(8)
    expect(boardSizeForLevel(6)).toBe(14)
    expect(boardSizeForLevel(50)).toBe(14)
    for (let level = 0; level <= 10; level += 1) {
      const s = createLevel(9, level)
      expect(s.size).toBe(boardSizeForLevel(level))
      expect(s.board).toHaveLength(s.size * s.size)
      expect(s.board.every(c => c >= 0 && c < COLOR_COUNT)).toBe(true)
      expect(s.steps).toBe(0)
    }
    expect(levelBaseScore(0)).toBe(100)
    expect(scoreFor(2, 7)).toBe(7 * 10 + 300)
  })

  it('greedyNextColor 在未完成时给出合法候选色且确定', () => {
    const s = createLevel(55, 1)
    const a = greedyNextColor(s)
    const b = greedyNextColor(s)
    expect(a).toBe(b)
    expect(a).not.toBe(s.board[0])
    expect(a).toBeGreaterThanOrEqual(0)
  })

  it('mulberry32 同种子序列一致', () => {
    const r1 = mulberry32(7)
    const r2 = mulberry32(7)
    const a = [r1(), r1(), r1()]
    const b = [r2(), r2(), r2()]
    expect(a).toEqual(b)
  })
})
