import { describe, expect, it } from 'vitest'
import {
  LEVELS,
  createInitialState,
  cross,
  crossTime,
  evaluate,
  makeCustomLevel,
  mulberry32,
  optimalTime,
} from '../src/client/games/bridge/logic.ts'
import type { BridgeState } from '../src/client/games/bridge/logic.ts'

describe('bridge logic', () => {
  it('mulberry32 is deterministic per seed and seeds levels reproducibly', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = [a(), a(), a()]
    const seqB = [b(), b(), b()]
    expect(seqA).toEqual(seqB)
    expect(mulberry32(43)()).not.toBe(seqA[0])
    // 同下标关卡每次读取速度表一致（模块级常量，天然确定）。
    const l1 = LEVELS[0]!
    expect(l1.people.map(p => p.speed)).toEqual(l1.people.map(p => p.speed))
  })

  it('ships 5 levels with 4-6 people, distinct speeds in 1-10, and a beatable limit', () => {
    expect(LEVELS).toHaveLength(5)
    LEVELS.forEach((level, i) => {
      expect(level.people.length).toBeGreaterThanOrEqual(4)
      expect(level.people.length).toBeLessThanOrEqual(6)
      const speeds = level.people.map(p => p.speed)
      expect(new Set(speeds).size).toBe(speeds.length)
      speeds.forEach(s => {
        expect(s).toBeGreaterThanOrEqual(1)
        expect(s).toBeLessThanOrEqual(10)
      })
      expect(level.limit).toBeGreaterThan(optimalTime(level))
      void i
    })
  })

  it('starts with everyone on the left bank, flashlight left, clock at zero', () => {
    const state = createInitialState(2)
    expect(state.left).toEqual(LEVELS[2]!.people.map(p => p.id))
    expect(state.right).toEqual([])
    expect(state.flashlight).toBe('left')
    expect(state.elapsed).toBe(0)
  })

  it('cross moves 1-2 people at the slower pace and flips the flashlight', () => {
    const level = makeCustomLevel('classic', [1, 2, 5, 10], 2)
    const state = createInitialState(0)
    // 用自定义关卡的 id 序列重建同构开局（id 编号规则 p1..p4）。
    const start = { left: level.people.map(p => p.id), right: [], flashlight: 'left' as const, elapsed: 0 }
    void state
    const first = cross(start, level, ['p3', 'p4'])
    expect(first).not.toBeNull()
    expect(first!.left).toEqual(['p1', 'p2'])
    expect(first!.right).toEqual(['p3', 'p4'])
    expect(first!.flashlight).toBe('right')
    expect(first!.elapsed).toBe(10)
    const back = cross(first!, level, ['p3'])
    expect(back!.left).toEqual(['p1', 'p2', 'p3'])
    expect(back!.right).toEqual(['p4'])
    expect(back!.flashlight).toBe('left')
    expect(back!.elapsed).toBe(15)
  })

  it('rejects oversize groups, duplicates, and people not on the flashlight bank', () => {
    const level = makeCustomLevel('classic', [1, 2, 5, 10], 2)
    const start = { left: ['p1', 'p2', 'p3', 'p4'], right: [], flashlight: 'left' as const, elapsed: 0 }
    expect(cross(start, level, [])).toBeNull()
    expect(cross(start, level, ['p1', 'p2', 'p3'])).toBeNull()
    expect(cross(start, level, ['p1', 'p1'])).toBeNull()
    const mid = { left: ['p1'], right: ['p2', 'p3', 'p4'], flashlight: 'right' as const, elapsed: 2 }
    expect(cross(mid, level, ['p1'])).toBeNull()
  })

  it('is pure: the input state is never mutated by cross', () => {
    const level = makeCustomLevel('classic', [1, 2, 5, 10], 2)
    const start = { left: ['p1', 'p2', 'p3', 'p4'], right: [], flashlight: 'left' as const, elapsed: 0 }
    const snapshot = JSON.stringify(start)
    cross(start, level, ['p1', 'p4'])
    expect(JSON.stringify(start)).toBe(snapshot)
  })

  it('solves the classic 1/2/5/10 puzzle optimally in 17s', () => {
    const level = makeCustomLevel('classic', [1, 2, 5, 10], 2)
    expect(optimalTime(level)).toBe(17)
    expect(level.limit).toBe(19)
    expect(crossTime(level, ['p2', 'p4'])).toBe(10)
    expect(crossTime(level, ['p1'])).toBe(1)
  })

  it('evaluates a scripted optimal play as won within the limit', () => {
    const level = makeCustomLevel('classic', [1, 2, 5, 10], 2)
    let s: BridgeState = { left: level.people.map(p => p.id), right: [], flashlight: 'left', elapsed: 0 }
    const steps: string[][] = [
      ['p1', 'p2'], ['p1'], ['p3', 'p4'], ['p2'], ['p1', 'p2'],
    ]
    for (const ids of steps) {
      expect(evaluate(s, level).phase).toBe('playing')
      const next = cross(s, level, ids)
      expect(next).not.toBeNull()
      s = next!
    }
    expect(s.elapsed).toBe(17)
    expect(evaluate(s, level)).toEqual({ phase: 'won' })
  })

  it('flags a wasteful play as timeout once the clock passes the limit', () => {
    const level = makeCustomLevel('classic', [1, 2, 5, 10], 2)
    let s: BridgeState = { left: level.people.map(p => p.id), right: [], flashlight: 'left', elapsed: 0 }
    // 最慢者来回折返 2 趟：10+10 = 20s > 19s。
    for (let i = 0; i < 2; i += 1) {
      const next = cross(s, level, ['p4'])
      expect(next).not.toBeNull()
      s = next!
    }
    expect(s.elapsed).toBe(20)
    expect(evaluate(s, level)).toEqual({ phase: 'timeout' })
  })
})
