import { describe, expect, it } from 'vitest'
import {
  LEVEL_CONFIGS, columnSums, computeScore, initialState, isSolved, levelConfig,
  puzzleFromSeed, rotateRing, solveOffsets, type CircleState,
} from '../src/client/games/circlemath/logic.ts'

describe('circlemath logic', () => {
  it('levelConfig maps 1-based levels onto the progression table and wraps after the last level', () => {
    LEVEL_CONFIGS.forEach((cfg, i) => expect(levelConfig(i + 1)).toEqual(cfg))
    expect(levelConfig(LEVEL_CONFIGS.length + 1)).toEqual(LEVEL_CONFIGS[0])
    expect(LEVEL_CONFIGS.every((c) => c.rings === 3 || c.rings === 4)).toBe(true)
    expect(LEVEL_CONFIGS.every((c) => c.sectors >= 6 && c.sectors <= 8)).toBe(true)
    for (let i = 1; i < LEVEL_CONFIGS.length; i += 1) {
      expect(LEVEL_CONFIGS[i]!.maxSteps).toBeGreaterThanOrEqual(LEVEL_CONFIGS[i - 1]!.maxSteps)
      expect(LEVEL_CONFIGS[i]!.maxValue).toBeGreaterThan(LEVEL_CONFIGS[i - 1]!.maxValue)
    }
  })

  it('puzzleFromSeed is deterministic, keeps numbers in range, and zero offsets are solved', () => {
    for (const [seed, level] of [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]] as const) {
      const p = puzzleFromSeed(seed, level)
      expect(p).toEqual(puzzleFromSeed(seed, level))
      expect(p.rings).toBe(levelConfig(level).rings)
      expect(p.sectors).toBe(levelConfig(level).sectors)
      for (let r = 0; r < p.rings; r += 1) {
        expect(p.numbers[r]).toHaveLength(p.sectors)
        for (const v of p.numbers[r]!) expect(v).toBeGreaterThanOrEqual(1)
        expect(Math.max(...p.numbers[r]!)).toBeLessThanOrEqual(levelConfig(level).maxValue)
      }
      expect(isSolved(p, new Array<number>(p.rings).fill(0))).toBe(true)
      expect(isSolved(p, p.startOffsets)).toBe(false)
    }
  })

  it('columnSums adds each ring sector into the shifted column', () => {
    const p = puzzleFromSeed(42, 1)
    const offsets = [1, 2, 0]
    const sums = columnSums(p, offsets)
    expect(sums).toHaveLength(p.sectors)
    for (let col = 0; col < p.sectors; col += 1) {
      let expectSum = 0
      for (let r = 0; r < p.rings; r += 1) {
        const j = ((col - offsets[r]!) % p.sectors + p.sectors) % p.sectors
        expectSum += p.numbers[r]![j]!
      }
      expect(sums[col]).toBe(expectSum)
    }
    expect(columnSums(p, [-1, 0, 0])).toEqual(columnSums(p, [p.sectors - 1, 0, 0]))
  })

  it('isSolved accepts the generated solution and rejects a one-step rotation', () => {
    const p = puzzleFromSeed(7, 3)
    const solved = new Array<number>(p.rings).fill(0)
    expect(isSolved(p, solved)).toBe(true)
    for (let r = 0; r < p.rings; r += 1) {
      const moved = [...solved]
      moved[r] = 1
      expect(isSolved(p, moved)).toBe(false)
    }
  })

  it('rotateRing counts a step, wraps offsets modulo sectors, and never mutates its input', () => {
    const p = puzzleFromSeed(11, 2)
    let state = initialState(p, levelConfig(2).maxSteps)
    const before = [...state.offsets]
    state = rotateRing(state, 0, 1)
    expect(state.steps).toBe(1)
    expect(state.offsets[0]).toBe(((before[0]! + 1) % p.sectors))
    state = rotateRing(state, 0, -1)
    expect(state.offsets[0]).toBe(before[0])
    state = rotateRing(state, 1, -1)
    expect(state.offsets[1]).toBe((before[1]! - 1 + p.sectors) % p.sectors)
    expect(state.puzzle).toBe(p)
    const same = rotateRing(state, 99, 1)
    expect(same).toBe(state)
    expect(same.steps).toBe(state.steps)
  })

  it('exceeding the step limit loses, but solving at exactly the limit wins', () => {
    const p = puzzleFromSeed(23, 1)
    const solution = solveOffsets(p)
    expect(solution).not.toBeNull()
    let minSteps = 0
    for (let r = 0; r < p.rings; r += 1) {
      const d = (solution![r]! - p.startOffsets[r]! + p.sectors) % p.sectors
      minSteps += Math.min(d, p.sectors - d)
    }
    let state = initialState(p, minSteps)
    for (let r = 0; r < p.rings; r += 1) {
      const d = (solution![r]! - state.offsets[r]! + p.sectors) % p.sectors
      const dir = d <= p.sectors - d ? 1 : -1
      for (let i = 0; i < Math.min(d, p.sectors - d); i += 1) state = rotateRing(state, r, dir)
    }
    expect(state.status).toBe('won')
    expect(state.steps).toBe(minSteps)
    let lost = initialState(p, 1)
    lost = rotateRing(lost, 0, 1)
    lost = rotateRing(lost, 0, 1)
    if (lost.status === 'playing') throw new Error('second step must terminate the game')
    expect(lost.steps).toBe(2)
    const frozen: CircleState = rotateRing(lost, 0, 1)
    expect(frozen).toBe(lost)
  })

  it('solveOffsets finds an alignment for generated puzzles and reports unsolvable ones', () => {
    for (const [seed, level] of [[101, 1], [102, 3], [103, 5]] as const) {
      const p = puzzleFromSeed(seed, level)
      const solution = solveOffsets(p)
      expect(solution).not.toBeNull()
      expect(isSolved(p, solution!)).toBe(true)
    }
    const impossible = {
      rings: 1, sectors: 6, target: 999,
      numbers: [[1, 2, 3, 4, 5, 6]], startOffsets: [0],
    }
    expect(solveOffsets(impossible)).toBeNull()
  })

  it('computeScore pays level base plus a step bonus that decays, and a hint forfeits the bonus', () => {
    expect(computeScore(1, 0, 20, false)).toBe(100 + 2000)
    expect(computeScore(2, 10, 20, false)).toBe(200 + 1000)
    expect(computeScore(3, 20, 20, false)).toBe(300)
    expect(computeScore(4, 99, 20, false)).toBe(400)
    expect(computeScore(1, 0, 20, true)).toBe(100)
  })
})
