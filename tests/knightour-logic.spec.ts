import { describe, expect, it } from 'vitest'
import {
  undoTour,
  bestHint, createTour, knightMoves, moveTour, mulberry32, randomStart,
  reachableMoves, tourStatus, warnsdorffDegree, warnsdorffTour,
} from '../src/client/games/knightour/logic.ts'

describe('knightour move generation', () => {
  it('knightMoves: 中心格 8 步、角落 2 步、边缘过滤越界', () => {
    // 8x8 中心 d5（行 3 列 3 = 27）全部 8 个马步在盘内。
    expect(knightMoves(8, 27)).toHaveLength(8)
    // 角 a0（序号 0）只有 (2,1) 与 (1,2) 两个目标。
    expect(knightMoves(8, 0)).toEqual([10, 17])
    // 5x5 同角：目标为 7 与 11。
    expect(knightMoves(5, 0)).toEqual([7, 11])
  })

  it('初始局面只访问起点，可达格为起点的未访问马步', () => {
    const state = createTour(5, 0)
    expect(state.path).toEqual([0])
    expect(state.visited.filter(Boolean)).toHaveLength(1)
    expect(reachableMoves(state)).toEqual([7, 11])
    expect(tourStatus(state)).toBe('playing')
  })

  it('moveTour：合法步追加路径；非马步与已访问格返回 null', () => {
    let state = createTour(8, 0)
    expect(moveTour(state, 11)).toBeNull() // 不是马步目标
    const next = moveTour(state, 10)
    expect(next).not.toBeNull()
    state = next!
    expect(state.path).toEqual([0, 10])
    expect(state.visited[10]).toBe(true)
    expect(moveTour(state, 0)).toBeNull() // 回到已访问格
    expect(next!.hintsUsed).toBe(0) // 局面不可变：原对象未被修改
    expect(next!.path).toHaveLength(2)
  })

  it('中心开局即困毙：未访满且无可达格判 stuck', () => {
    // 3x3 中心格（4）没有任何盘内马步。
    const state = createTour(3, 4)
    expect(reachableMoves(state)).toHaveLength(0)
    expect(tourStatus(state)).toBe('stuck')
  })
})

describe('knightour warnsdorff hint', () => {
  it('warnsdorffDegree：空盘角落 2、中心 8；访问邻格后递减', () => {
    const state = createTour(8, 0)
    expect(warnsdorffDegree(state, 0)).toBe(2) // 空盘角落出度 2
    expect(warnsdorffDegree(state, 27)).toBe(8)
    const after = moveTour(state, 10)!
    expect(warnsdorffDegree(after, 27)).toBe(7) // 10 被占后中心出度降 1
  })

  it('bestHint：选出度最小的可达格，平局取格序号最小', () => {
    const state = createTour(8, 0)
    // 可达格 10（出度 4）与 17（出度 5），提示应指向 10。
    expect(bestHint(state)).toBe(10)
    const none = createTour(3, 4)
    expect(bestHint(none)).toBeNull()
  })
})

describe('knightour determinism', () => {
  it('mulberry32 同种子同序列；randomStart 奇数盘限定多数色格', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    const rng = mulberry32(7)
    for (let i = 0; i < 50; i += 1) {
      const start = randomStart(5, rng)
      const row = Math.floor(start / 5)
      const col = start % 5
      expect((row + col) % 2).toBe(0)
    }
    // 偶数盘任意格都合法。
    expect(randomStart(8, rng)).toBeLessThan(64)
  })

  it('warnsdorffTour：同种子结果完全一致（确定性）', () => {
    expect(warnsdorffTour(8, 12, 99)).toEqual(warnsdorffTour(8, 12, 99))
    expect(warnsdorffTour(5, 0, 3)).toEqual(warnsdorffTour(5, 0, 3))
  })

  it('存在种子使 5x5 Warnsdorff 贪心从角格走满全盘', () => {
    let full: number[] | null = null
    for (let seed = 1; seed <= 200 && full === null; seed += 1) {
      const path = warnsdorffTour(5, 0, seed)
      if (path.length === 25) full = path
    }
    expect(full).not.toBeNull()
    // 重放到局面对象上应逐步合法并最终过关。
    let state = createTour(5, 0)
    for (const cell of full!.slice(1)) {
      const next = moveTour(state, cell)
      expect(next).not.toBeNull()
      state = next!
    }
    expect(state.path).toHaveLength(25)
    expect(new Set(state.path).size).toBe(25)
    expect(tourStatus(state)).toBe('won')
  })
})

describe('undoTour', () => {
  it('pops the last move and rebuilds visited; start cannot undo', () => {
    const s0 = createTour(5, 12)
    const s1 = moveTour(s0, knightMoves(5, 12)[0]!)
    expect(s1).not.toBeNull()
    const back = undoTour(s1!)
    expect(back!.path).toEqual(s0.path)
    expect(back!.visited[12]).toBe(true)
    expect(back!.visited[knightMoves(5, 12)[0]!]).toBe(false)
    expect(undoTour(s0)).toBeNull()
  })
})
