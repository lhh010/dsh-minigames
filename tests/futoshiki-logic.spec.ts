import { describe, expect, it } from 'vitest'
import {
  LEVELS, checkLatinComplete, countSolutions, createPuzzle, findConflicts,
  isSolved, mulberry32, satisfiesInequalities, setCell,
} from '../src/client/games/futoshiki/logic.ts'

describe('futoshiki latin square', () => {
  it('checkLatinComplete：完整排列为真，重复/缺数/有空格为假', () => {
    const good = [1, 2, 3, 3, 1, 2, 2, 3, 1]
    expect(checkLatinComplete(good, 3)).toBe(true)
    const dup = [1, 1, 3, 3, 2, 2, 2, 3, 1]
    expect(checkLatinComplete(dup, 3)).toBe(false)
    const withEmpty = [1, 0, 3, 3, 1, 2, 2, 3, 1]
    expect(checkLatinComplete(withEmpty, 3)).toBe(false)
    const colDup = [1, 2, 3, 2, 3, 1, 3, 1, 1]
    expect(checkLatinComplete(colDup, 3)).toBe(false)
  })

  it('satisfiesInequalities：只校验两端已填的约束', () => {
    const cons = [{ a: 0, b: 1, op: '<' as const }, { a: 1, b: 2, op: '>' as const }]
    expect(satisfiesInequalities([1, 2, 0], cons)).toBe(true)
    expect(satisfiesInequalities([2, 1, 0], cons)).toBe(false)
    // 第二条 b 端为空：不参与校验。
    expect(satisfiesInequalities([1, 3, 0], cons)).toBe(true)
    expect(satisfiesInequalities([1, 3, 2], cons)).toBe(true)
    expect(satisfiesInequalities([1, 3, 4], cons)).toBe(false)
  })
})

describe('futoshiki conflicts', () => {
  it('findConflicts：行列重复与不等违反同时标红格子与符号', () => {
    const cons = [{ a: 0, b: 1, op: '<' as const }]
    // 3x3：第 0 列 1 与 1 重复；行内约束 1<2 满足。
    let grid = [1, 2, 3, 1, 3, 2, 3, 1, 2]
    let f = findConflicts(grid, cons)
    expect(f.cells[0]).toBe(true)
    expect(f.cells[3]).toBe(true)
    expect(f.cells[1]).toBe(false)
    expect(f.signs).toEqual([false])
    // 约束违反：2 < 2 不成立 → 两格与符号全红。
    grid = [2, 1, 3, 2, 3, 1, 1, 2, 3]
    f = findConflicts(grid, cons)
    expect(f.signs[0]).toBe(true)
    expect(f.cells[0]).toBe(true)
    expect(f.cells[3]).toBe(true)
  })

  it('isSolved：填满且无冲突才过关', () => {
    const cons = [{ a: 0, b: 1, op: '<' as const }]
    const solved = [1, 2, 3, 3, 1, 2, 2, 3, 1]
    expect(isSolved(solved, cons)).toBe(true)
    expect(isSolved([1, 2, 3, 3, 1, 2, 2, 3, 0], cons)).toBe(false)
    expect(isSolved([2, 1, 3, 3, 1, 2, 1, 3, 2], cons)).toBe(false)
  })
})

describe('futoshiki generator', () => {
  it('mulberry32 与 createPuzzle：同种子完全一致，异种子谜面不同', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    const p1 = createPuzzle(0, 42)
    const p2 = createPuzzle(0, 42)
    expect(p1.givens).toEqual(p2.givens)
    expect(p1.constraints).toEqual(p2.constraints)
    expect(p1.solution).toEqual(p2.solution)
    let differs = false
    for (let seed = 100; seed < 110 && !differs; seed += 1) {
      if (createPuzzle(0, seed).givens.join(',') !== p1.givens.join(',')) differs = true
    }
    expect(differs).toBe(true)
  })

  it('每一关：解是拉丁方、满足全部不等号、提示数与解一致且确有删空', () => {
    for (let i = 0; i < LEVELS.length; i += 1) {
      const p = createPuzzle(i, 7 + i)
      expect(p.size).toBe(LEVELS[i]!.size)
      expect(checkLatinComplete([...p.solution], p.size)).toBe(true)
      expect(satisfiesInequalities(p.solution, p.constraints)).toBe(true)
      for (let cell = 0; cell < p.givens.length; cell += 1) {
        if (p.givens[cell]! !== 0) expect(p.givens[cell]).toBe(p.solution[cell])
      }
      expect(p.constraints.length).toBeGreaterThan(0)
      expect(p.givens.some(v => v === 0)).toBe(true)
    }
  })

  it('每一关谜面在提示数+不等号下解唯一（countSolutions === 1）', () => {
    for (let i = 0; i < LEVELS.length; i += 1) {
      const p = createPuzzle(i, 99)
      expect(countSolutions(p.size, p.givens, p.constraints, 2)).toBe(1)
      // 填回完整解后 isSolved 过关。
      expect(isSolved(p.solution, p.constraints)).toBe(true)
    }
  })

  it('countSolutions：矛盾提示数计 0，稀疏约束下多解且被 cap 截断', () => {
    // 行内重复提示：无解。
    expect(countSolutions(3, [1, 1, 0, 0, 0, 0, 0, 0, 0], [])).toBe(0)
    // 提示间约束冲突（1 > 2 不可能）：无解。
    expect(countSolutions(3, [1, 2, 0, 0, 0, 0, 0, 0, 0], [{ a: 0, b: 1, op: '>' }])).toBe(0)
    // 空盘无约束：拉丁方有多个解，cap=2 截到 2。
    expect(countSolutions(3, new Array<number>(9).fill(0), [])).toBe(2)
  })

  it('setCell：不可变置数与清除', () => {
    const grid = [1, 0, 2]
    const next = setCell(grid, 1, 3)
    expect([...next]).toEqual([1, 3, 2])
    expect(grid).toEqual([1, 0, 2])
    expect(setCell(next, 1, 0)).toEqual([1, 0, 2])
    expect(setCell(next, 1, 3)).toBe(next)
  })
})
