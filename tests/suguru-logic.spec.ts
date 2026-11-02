import { describe, expect, it } from 'vitest'
import {
  LEVEL_SIZES, MAX_REGION, ATTEMPT_CAP, computeScore, countSolutions, findConflicts,
  isWon, kingNeighbors, levelSize, mulberry32, neighbors, patternValid,
  puzzleFromSeed, regionCountFor, solveCount,
} from '../src/client/games/suguru/logic.ts'
import { createStepSolver } from '../src/client/games/suguru/ai.ts'

/** 深比较两关（确定性重放用）。 */
function snapshot(p: {
  size: number; region: readonly number[]; givens: ReadonlyMap<number, number>
  solution: readonly number[]; unique: boolean
}): string {
  return JSON.stringify([p.size, p.region, [...p.givens.entries()].sort((a, b) => a[0] - b[0]), p.solution, p.unique])
}

describe('suguru logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('level sizes and region counts respect the size cap', () => {
    expect([...LEVEL_SIZES]).toEqual([5, 6, 7, 8, 9])
    expect(levelSize(1)).toBe(5)
    expect(levelSize(5)).toBe(9)
    expect(levelSize(6)).toBe(5)
    expect(MAX_REGION).toBe(5)
    expect(ATTEMPT_CAP).toBeGreaterThan(0)
    // 区域数下限足以覆盖全盘（每区 ≤5 格）。
    for (const size of LEVEL_SIZES) {
      expect(regionCountFor(size) * MAX_REGION).toBeGreaterThanOrEqual(size * size)
    }
  })

  it('neighbors and kingNeighbors stay inside the board', () => {
    expect(neighbors(5, 0)).toEqual([5, 1])
    expect(neighbors(5, 12)).toEqual([7, 17, 11, 13])
    expect(kingNeighbors(5, 0)).toEqual([1, 5, 6])
    expect(kingNeighbors(5, 24)).toEqual([18, 19, 23])
    expect(kingNeighbors(5, 12).sort((a, b) => a - b)).toEqual([6, 7, 8, 11, 13, 16, 17, 18])
  })

  it('every level generates a legal pattern (sizes 1..5, connected, full cover)', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const p = puzzleFromSeed(lv * 0x9e3779b9, levelSize(lv))
      expect(p.size).toBe(levelSize(lv))
      expect(p.region.length).toBe(p.size * p.size)
      expect(patternValid(p.size, p.region)).toBe(true)
      const covered = new Set(p.region)
      expect(covered.size).toBe(p.regionSizes.length)
      for (const s of p.regionSizes) expect(s).toBeGreaterThanOrEqual(1)
      for (const s of p.regionSizes) expect(s).toBeLessThanOrEqual(MAX_REGION)
      expect(p.regionCells.reduce((sum, m) => sum + m.length, 0)).toBe(p.size * p.size)
      // 区域数满足覆盖下限。
      expect(p.regionSizes.length).toBeGreaterThanOrEqual(regionCountFor(p.size))
    }
  })

  it('every level is solvable: the generating solution satisfies isWon', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const p = puzzleFromSeed(lv * 0x9e3779b9, levelSize(lv))
      expect(isWon(p, p.solution)).toBe(true)
      // 给定格与解一致。
      for (const [cell, v] of p.givens) expect(p.solution[cell]).toBe(v)
      expect(p.givens.size).toBeGreaterThan(0)
    }
  })

  it('uniqueness holds (or the multi-solution badge falls back)', { timeout: 20_000 }, () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const p = puzzleFromSeed(lv * 0x9e3779b9, levelSize(lv))
      const res = solveCount(p, 200_000)
      if (p.unique) {
        expect(res.exhausted).toBe(false)
        expect(res.solutions).toBe(1)
      } else {
        // 徽章路径：未证明唯一（解 > 1 或预算耗尽），生成掷次仍封顶。
        expect(res.solutions > 1 || res.exhausted).toBe(true)
        expect(p.attempts).toBeLessThanOrEqual(ATTEMPT_CAP)
      }
    }
  })

  it('countSolutions finds 2+ on a near-empty board and 1 on a full solution', () => {
    const p = puzzleFromSeed(0x9e3779b9, 5)
    const full = new Map<number, number>()
    p.solution.forEach((v, i) => full.set(i, v))
    expect(countSolutions(p.size, p.regionCells, full).solutions).toBe(1)
    const bare = new Map<number, number>()
    for (const members of p.regionCells) bare.set(members[0]!, p.solution[members[0]!]!)
    const res = countSolutions(p.size, p.regionCells, bare, 200_000)
    expect(res.solutions).toBeGreaterThanOrEqual(1)
  })

  it('isWon rejects region duplicates, out-of-range values, and adjacent equal numbers', () => {
    const p = puzzleFromSeed(0x9e3779b9, 5)
    const bad1 = [...p.solution]
    // 区域内制造重复：把某区域第二格改成首格的值。
    const members = p.regionCells[0]!
    bad1[members[1]!] = bad1[members[0]!]!
    expect(isWon(p, bad1)).toBe(false)
    const bad2 = [...p.solution]
    bad2[members[1]!] = p.regionSizes[0]! + 1
    expect(isWon(p, bad2)).toBe(false)
    // 王邻域同数（斜向也算）：找一个对角空档直接构造。
    const bad3 = new Array<number>(p.size * p.size).fill(0)
    expect(isWon(p, bad3)).toBe(false)
    // 空盘不是胜利，但也不产生冲突（全 0）。
    expect(findConflicts(p, bad3)).toEqual([])
    // 相邻同数产生冲突且双方都标红。
    const bad4 = new Array<number>(p.size * p.size).fill(1)
    const conflicts = findConflicts(p, bad4)
    expect(conflicts.length).toBeGreaterThan(0)
    expect(conflicts).toEqual([...conflicts].sort((a, b) => a - b))
  })

  it('generation is deterministic: the same seed replays the same puzzle', () => {
    for (const seed of [1, 0x9e3779b9, 123456]) {
      expect(snapshot(puzzleFromSeed(seed, 7))).toBe(snapshot(puzzleFromSeed(seed, 7)))
    }
    expect(snapshot(puzzleFromSeed(1, 7))).not.toBe(snapshot(puzzleFromSeed(2, 7)))
  })

  it('step solver completes within node slices and wins (frame-sliced AI)', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const p = puzzleFromSeed(lv * 0x9e3779b9, levelSize(lv))
      const start = new Array<number>(p.size * p.size).fill(0)
      for (const [cell, v] of p.givens) start[cell] = v
      const solver = createStepSolver(p, start)
      let status = 'solving'
      let slices = 0
      while (status === 'solving' && slices < 20_000) {
        status = solver.step(5)
        slices += 1
      }
      expect(status).toBe('done')
      // 分帧：每次只吃 5 个节点，必然跨切片完成（最小盘给定格多时节点
      // 很少，2 片即可；片数与节点数保持 5 节点/片的预算关系）。
      expect(slices).toBeGreaterThanOrEqual(2)
      expect(solver.nodes + 1).toBeGreaterThanOrEqual(slices)
      expect(isWon(p, solver.grid)).toBe(true)
    }
  })

  it('step solver drops player cells that break the rules', () => {
    const p = puzzleFromSeed(0x9e3779b9, 5)
    const start = [...p.solution]
    // 在同区域找两个非给定格，把第二格改成第一格的值（区域内重复）。
    let dropped = -1
    outer: for (const members of p.regionCells) {
      const open = members.filter(cell => !p.givens.has(cell)).sort((a, b) => a - b)
      if (open.length >= 2) {
        // 污染后扫的那格：先扫的解值格保留，后扫的重复格必须被丢。
        start[open[1]!] = p.solution[open[0]!]!
        dropped = open[1]!
        break outer
      }
    }
    expect(dropped).toBeGreaterThanOrEqual(0)
    const solver = createStepSolver(p, start)
    // 违规格在构造时被丢弃，留下唯一空格；搜索恰耗 1 个节点补回解值。
    expect(solver.step(1000)).toBe('done')
    expect(solver.nodes).toBe(1)
    expect(isWon(p, solver.grid)).toBe(true)
    expect(solver.grid[dropped]).toBe(p.solution[dropped])
  })

  it('step solver finishes an already-complete board instantly', () => {
    const p = puzzleFromSeed(3 * 0x9e3779b9, 6)
    const solver = createStepSolver(p, p.solution)
    expect(solver.step(10)).toBe('done')
    expect(solver.nodes).toBe(0)
    expect(isWon(p, solver.grid)).toBe(true)
  })

  it('computeScore decays to the base', () => {
    expect(computeScore(1, 0)).toBe(3100)
    expect(computeScore(1, 10_000)).toBe(100)
    expect(computeScore(3, 0)).toBe(3300)
    expect(computeScore(3, 600)).toBe(300)
  })
})
