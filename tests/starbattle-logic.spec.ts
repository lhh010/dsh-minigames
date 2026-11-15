import { describe, expect, it } from 'vitest'
import {
  ATTEMPT_CAP, computeScore, cycleMark, findConflicts, generatePartition,
  isWon, levelSize, mulberry32, partitionValid, plantSolution, puzzleFromSeed,
  solveCount, solvePuzzle, starsFor, touches,
  type StarPuzzle,
} from '../src/client/games/starbattle/logic.ts'

describe('starbattle logic', () => {
  it('mulberry32 同种子同序列、异种子异序列', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const c = mulberry32(43)
    const seqA = [a(), a(), a(), a()]
    expect(seqA).toEqual([b(), b(), b(), b()])
    expect(seqA).not.toEqual([c(), c(), c(), c()])
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('starsFor 与 levelSize 映射五个关卡', () => {
    expect(starsFor(6)).toBe(1)
    expect(starsFor(8)).toBe(1)
    expect(starsFor(9)).toBe(2)
    expect(starsFor(10)).toBe(2)
    expect([1, 2, 3, 4, 5].map(levelSize)).toEqual([6, 8, 8, 9, 10])
    expect(levelSize(6)).toBe(6) // 第 5 关后循环
    expect(levelSize(9)).toBe(9)
  })

  it('cycleMark 点击循环状态机：空 → 星 → ✗ → 空', () => {
    expect(cycleMark(0)).toBe(1)
    expect(cycleMark(1)).toBe(2)
    expect(cycleMark(2)).toBe(0)
    let m = 0 as 0 | 1 | 2
    const seen: number[] = []
    for (let i = 0; i < 4; i += 1) {
      seen.push(m)
      m = cycleMark(m)
    }
    expect(seen).toEqual([0, 1, 2, 0])
  })

  it('partitionValid 接受生成划分并拒绝坏划分', () => {
    const rng = mulberry32(7)
    for (const size of [6, 8, 9, 10]) {
      for (let s = 0; s < 4; s += 1) {
        const region = generatePartition(rng, size)
        expect(region).not.toBeNull()
        expect(partitionValid(size, region!)).toBe(true)
      }
    }
    // 空洞：某格不属于任何区域。
    const hole = generatePartition(mulberry32(1), 6)!
    const withHole = hole.slice()
    withHole[0] = -1
    expect(partitionValid(6, withHole)).toBe(false)
    // 越界区域号。
    const over = hole.slice()
    over[3] = 99
    expect(partitionValid(6, over)).toBe(false)
    // 区域数量不对（8 个区编号划给 6 盘）。
    expect(partitionValid(6, [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5])).toBe(false)
    // 不连通：6×6 全 0 号区 + 孤立的 5 号格。
    const broken = new Array<number>(36).fill(0)
    broken[35] = 5
    expect(partitionValid(6, broken)).toBe(false)
  })

  it('touches 只认王步相邻', () => {
    expect(touches(6, 0, 1)).toBe(true)
    expect(touches(6, 0, 7)).toBe(true)
    expect(touches(6, 0, 0)).toBe(false) // 自身
    expect(touches(6, 0, 2)).toBe(false) // 隔一格
    expect(touches(6, 0, 12)).toBe(false) // 隔一行
    expect(touches(6, 14, 21)).toBe(true) // (2,2)-(3,3) 斜向
  })

  it('五关 × 多种子：生成划分子区连通且种植解满足全部约束', { timeout: 60_000 }, () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const size = levelSize(lv)
      for (const seed of [11, 222, 3333]) {
        const puzzle = puzzleFromSeed(lv * 0x9e3779b9 + seed, size)
        expect(puzzle.size).toBe(size)
        expect(puzzle.k).toBe(starsFor(size))
        expect(partitionValid(size, puzzle.region)).toBe(true)
        expect(puzzle.regionCells.length).toBe(size)
        for (const members of puzzle.regionCells) expect(members.length).toBeGreaterThanOrEqual(2)
        expect(puzzle.solution.length).toBe(puzzle.k * size)
        expect(isWon(puzzle, puzzle.solution)).toBe(true)
      }
    }
  })

  it('五关 × 多种子唯一解压测：求解器证明恰一解', { timeout: 120_000 }, () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const size = levelSize(lv)
      for (const seed of [5, 66, 777]) {
        const puzzle = puzzleFromSeed(lv * 0x9e3779b9 + seed, size)
        expect(puzzle.attempts).toBeGreaterThanOrEqual(1)
        expect(puzzle.attempts).toBeLessThanOrEqual(ATTEMPT_CAP)
        expect(puzzle.unique).toBe(true)
        const res = solvePuzzle(puzzle, 500_000)
        expect(res.exhausted).toBe(false)
        expect(res.solutions).toBe(1)
      }
    }
  })

  it('求解器在小盘上封顶计数多解（不耗尽）', () => {
    // 6×6、每行一区、k=1：行约束恒满足，列/邻接约束松弛，解很多。
    const size = 6
    const k = 1
    const region: number[] = []
    for (let cell = 0; cell < size * size; cell += 1) region.push(Math.floor(cell / size))
    const res = solveCount(size, region, k, 200_000)
    expect(res.exhausted).toBe(false)
    expect(res.solutions).toBe(2) // 封顶 2
  })

  it('findConflicts 标红超编与邻接，合法中局零冲突', () => {
    const puzzle: StarPuzzle = {
      size: 6, k: 2,
      region: Array.from({ length: 36 }, (_, i) => Math.floor(i / 6)),
      regionCells: Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => r * 6 + c)),
      solution: [], unique: false, attempts: 1,
    }
    // 行 0 放 3 颗（超编），其中 (0,0) 与 (0,1) 相邻、(0,1) 与 (1,2) 斜邻。
    const bad = [0, 1, 5, 8]
    const conflicts = findConflicts(puzzle, bad)
    expect(conflicts).toContain(0) // 超行编 + 邻接
    expect(conflicts).toContain(1) // 超行编 + 两次邻接
    expect(conflicts).toContain(5) // 超行编
    expect(conflicts).toContain(8) // (1,2) 与 (0,1) 斜邻
    // 合法中局：每行 ≤k、无邻接。
    expect(findConflicts(puzzle, [0, 8])).toEqual([])
    expect(findConflicts(puzzle, [])).toEqual([])
  })

  it('isWon 边界：缺星/重复/邻接/列不均全拒，正解才过', () => {
    const puzzle = puzzleFromSeed(3 * 0x9e3779b9, 6)
    const full = [...puzzle.solution]
    expect(isWon(puzzle, full)).toBe(true)
    expect(isWon(puzzle, full.slice(0, full.length - 1))).toBe(false) // 缺一颗
    expect(isWon(puzzle, [...full, 0])).toBe(false) // 多一颗（也触发重复/超编）
    const dup = full.slice()
    dup[0] = full[1]!
    expect(isWon(puzzle, dup)).toBe(false) // 重复 + 少一颗
    const adjacent = full.slice()
    adjacent[0] = adjacent[1]! - 1 >= 0 && touches(6, adjacent[1]!, adjacent[1]! - 1) ? adjacent[1]! - 1 : adjacent[1]! + 1
    if (!touches(6, adjacent[0]!, adjacent[1]!)) adjacent[0] = adjacent[1]! + 1
    expect(touches(6, adjacent[0]!, adjacent[1]!)).toBe(true)
    expect(isWon(puzzle, adjacent)).toBe(false) // 王步相邻
    // 恰好 kN 颗、无邻接，但某列超编：把两颗星挪到同列。
    const shifted = full.slice()
    const a = full[0]!
    const rowA = Math.floor(a / 6)
    const moved = ((rowA + 1) % 6) * 6 + (a % 6)
    if (!full.includes(moved)) {
      shifted[0] = moved
      if (!touches(6, moved, full[1]!)) {
        expect(isWon(puzzle, shifted)).toBe(false)
      }
    }
    expect(isWon(puzzle, [-1])).toBe(false) // 非法下标
  })

  it('puzzleFromSeed 确定性：同种子深等、异种子异盘', { timeout: 60_000 }, () => {
    for (const [lv, seed] of [[1, 9], [3, 99], [5, 999]] as const) {
      const size = levelSize(lv)
      const a = puzzleFromSeed(seed, size)
      const b = puzzleFromSeed(seed, size)
      expect(a.region).toEqual(b.region)
      expect(a.solution).toEqual(b.solution)
      expect(a.unique).toBe(b.unique)
      expect(a.k).toBe(b.k)
      const c = puzzleFromSeed(seed + 1, size)
      const sameBoard = c.region.every((v, i) => v === a.region[i])
      const sameSolution = c.solution.every((v, i) => v === a.solution[i])
      expect(sameBoard && sameSolution).toBe(false)
    }
  })

  it('确定性重放：同一点击脚本两次推演结果一致', () => {
    const puzzle = puzzleFromSeed(77, 6)
    const run = (): { marks: number[]; wonAt: number } => {
      const rng = mulberry32(1234)
      const marks = new Array<number>(36).fill(0)
      let wonAt = -1
      for (let step = 0; step < 36; step += 1) {
        const cell = Math.floor(rng() * 36)
        marks[cell] = cycleMark(marks[cell] as 0 | 1 | 2)
        const stars: number[] = []
        for (let i = 0; i < 36; i += 1) if (marks[i] === 1) stars.push(i)
        if (wonAt < 0 && isWon(puzzle, stars)) wonAt = step
      }
      return { marks, wonAt }
    }
    const first = run()
    const second = run()
    expect(first.marks).toEqual(second.marks)
    expect(first.wonAt).toBe(second.wonAt)
    // 点击循环不会意外过关：乱点 36 步几乎不可能成完整解，关键是重放一致。
  })

  it('plantSolution 同 rng 同解、永不违反约束', () => {
    for (const size of [6, 8, 10]) {
      const rngA = mulberry32(555)
      const rngB = mulberry32(555)
      const region = generatePartition(mulberry32(31), size)!
      const k = starsFor(size)
      const a = plantSolution(rngA, size, region, k)!
      const b = plantSolution(rngB, size, region, k)!
      expect(a).toEqual(b)
      const puzzle: StarPuzzle = {
        size, k, region, regionCells: [], solution: a, unique: false, attempts: 1,
      }
      expect(isWon(puzzle, a)).toBe(true)
    }
  })

  it('computeScore 随关卡递增、时间奖励衰减到下限 0', () => {
    expect(computeScore(1, 0)).toBe(3100)
    expect(computeScore(2, 0)).toBe(3200)
    expect(computeScore(1, 10)).toBe(3050)
    expect(computeScore(1, 600)).toBe(100) // 奖励耗尽剩基础分
    expect(computeScore(1, 0)).toBeGreaterThan(computeScore(1, 100))
  })
})
