import { describe, expect, it } from 'vitest'
import {
  LEVEL_SIZES, boardFromSeed, computeScore, conflictingLights, isSolved,
  levelSize, litCells, mulberry32, neighborsOf, numberViolations,
} from '../src/client/games/akari/logic.ts'

describe('akari logic', () => {
  /** 手工搭一张 5×5 盘：角上数字墙 1，(1,2) 无数字墙。 */
  const manual = (): { board: ReturnType<typeof boardFromSeed>; } => {
    const size = 5
    const walls = new Int8Array(size * size).fill(-1)
    walls[0] = 1        // (0,0) 数字墙 1
    walls[7] = -2       // (1,2) 无数字墙
    const solution = new Set<number>()
    return { board: { size, walls, solution } }
  }

  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(11)
    const b = mulberry32(11)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(mulberry32(3)()).not.toBe(mulberry32(4)())
  })

  it('neighborsOf stays inside the board', () => {
    expect(neighborsOf(5, 0)).toEqual([5, 1])
    expect(neighborsOf(5, 24)).toEqual([19, 23])
    expect(neighborsOf(5, 12)).toEqual([7, 17, 11, 13])
  })

  it('light spreads along row and column until a wall', () => {
    const { board } = manual()
    const lights = new Set<number>([2]) // (0,2)
    const lit = litCells(board, lights)
    // 同行 (0,1)(0,3)(0,4) 照亮；(1,2) 是墙，列向下传播到此为止——
    // (1,2) 自身与更下方的 (2,2)(3,2)(4,2) 均不照亮。
    expect(lit.has(2)).toBe(true)
    expect(lit.has(1)).toBe(true)
    expect(lit.has(4)).toBe(true)
    expect(lit.has(12)).toBe(false)
    expect(lit.has(22)).toBe(false)
    expect(lit.has(7)).toBe(false)
    expect(lit.has(17)).toBe(false)
    // (1,0) 不在灯的行/列 → 未照亮。
    expect(lit.has(5)).toBe(false)
  })

  it('lights sharing an unblocked line conflict; a wall between them does not', () => {
    const { board } = manual()
    // (0,1) 与 (0,4)：同行，(1,2) 墙不在该行 → 冲突。
    expect(conflictingLights(board, new Set([1, 4]))).toEqual(new Set([1, 4]))
    // (0,2) 与 (4,2)：同列，但 (1,2) 是墙 → 不冲突。
    expect(conflictingLights(board, new Set([2, 22])).size).toBe(0)
  })

  it('number walls report violations on wrong neighbor light counts', () => {
    const { board } = manual()
    // (0,0) 数字墙 1：正邻 (0,1) 与 (1,0)。
    expect(numberViolations(board, new Set<number>())).toEqual(new Set([0]))
    expect(numberViolations(board, new Set([1]))).toEqual(new Set())
    expect(numberViolations(board, new Set([1, 5]))).toEqual(new Set([0]))
  })

  it('every level generates a board whose constructed solution solves it', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const board = boardFromSeed(lv * 0x85ebca6b, levelSize(lv))
      expect(board.size).toBe(levelSize(lv))
      expect(board.walls.length).toBe(levelSize(lv) ** 2)
      // 生成解满足全部规则（构造法保证）。
      expect(isSolved(board, board.solution)).toBe(true)
      // 盘上至少有一个数字墙（有线索可推）。
      let digits = 0
      for (let i = 0; i < board.walls.length; i += 1) if (board.walls[i]! >= 0) digits += 1
      expect(digits).toBeGreaterThan(0)
    }
  })

  it('generation is deterministic per seed and varies across seeds', () => {
    const a = boardFromSeed(0x12345678, 8)
    const b = boardFromSeed(0x12345678, 8)
    expect([...a.walls]).toEqual([...b.walls])
    expect([...a.solution]).toEqual([...b.solution])
    let diff = false
    const c = boardFromSeed(0x87654321, 8)
    for (let i = 0; i < a.walls.length; i += 1) {
      if (a.walls[i] !== c.walls[i]) { diff = true; break }
    }
    expect(diff).toBe(true)
  })

  it('isSolved rejects missing coverage, conflicts, and number breaks', () => {
    const board = boardFromSeed(1 * 0x85ebca6b, levelSize(1))
    expect(isSolved(board, new Set<number>())).toBe(false)        // 全黑未照亮
    expect(isSolved(board, board.solution)).toBe(true)            // 生成解过关
    // 多放一盏灯（在空白格）必然破坏规则或仍过关？——放一个必冲突位：
    // 与某解灯同行且中间无墙的格。找解灯同行右侧第一格。
    const size = board.size
    let broke = false
    for (const light of board.solution) {
      const r = Math.floor(light / size)
      const c = light % size
      const right = r * size + c + 1
      if (c + 1 < size && board.walls[right] === -1 && !board.solution.has(right)) {
        const extra = new Set(board.solution)
        extra.add(right)
        expect(isSolved(board, extra)).toBe(false)                // 互视冲突
        broke = true
        break
      }
    }
    expect(broke).toBe(true)
  })

  it('levelSize wraps after the 5th level and computeScore decays to the base', () => {
    expect(LEVEL_SIZES).toEqual([7, 8, 8, 9, 10])
    expect(levelSize(1)).toBe(7)
    expect(levelSize(6)).toBe(7)
    expect(computeScore(1, 0)).toBe(3100)
    expect(computeScore(1, 10_000)).toBe(100)
    expect(computeScore(5, 0)).toBe(3500)
  })
})
