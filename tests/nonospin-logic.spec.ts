import { describe, expect, it } from 'vitest'
import {
  LEVEL_CHECKS,
  LEVEL_COUNT,
  LEVEL_SIZES,
  checkBoard,
  cluesFrom,
  countErrors,
  createLevelState,
  createNonospinState,
  displayClues,
  isSolved,
  levelSeed,
  lineClue,
  makePattern,
  restartLevel,
  rotateCluesCW,
  rotateGridCW,
  setCell,
  type Cell,
} from '../src/client/games/nonospin/logic.ts'

describe('nonospin logic', () => {
  it('makePattern 同 seed 完全一致，异 seed 生成不同图案', () => {
    const a1 = makePattern(123, 7)
    const a2 = makePattern(123, 7)
    const b = makePattern(124, 7)
    expect(a1).toEqual(a2)
    expect(a1).not.toEqual(b)
  })

  it('makePattern 拒绝全空与全满', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      for (const size of LEVEL_SIZES) {
        const flat = makePattern(seed, size).flat()
        expect(flat.some(Boolean)).toBe(true)
        expect(flat.some(v => !v)).toBe(true)
      }
    }
  })

  it('lineClue 派生连续黑段，空线为 [0]', () => {
    expect(lineClue([true, true, false, true])).toEqual([2, 1])
    expect(lineClue([false, false, false])).toEqual([0])
    expect(lineClue([true, true, true])).toEqual([3])
  })

  it('cluesFrom 在原朝向推导行列线索', () => {
    const pattern = [
      [true, false, true],
      [true, false, false],
      [true, true, false],
    ]
    const clues = cluesFrom(pattern)
    expect(clues.rows).toEqual([[1, 1], [1], [2]])
    expect(clues.cols).toEqual([[3], [1], [1]])
  })

  it('rotateGridCW 顺时针旋转，转四次复原', () => {
    const grid = [
      [1, 2],
      [3, 4],
    ]
    expect(rotateGridCW(grid)).toEqual([[3, 1], [4, 2]])
    let g = grid
    for (let i = 0; i < 4; i += 1) g = rotateGridCW(g)
    expect(g).toEqual(grid)
  })

  it('rotateCluesCW 恒等于旋转后图案的线索（线索四向轮转）', () => {
    const pattern = makePattern(777, 8)
    const clues = cluesFrom(pattern)
    let rotatedPattern = pattern
    let rotatedClues = clues
    for (let i = 0; i < 4; i += 1) {
      rotatedPattern = rotateGridCW(rotatedPattern)
      rotatedClues = rotateCluesCW(rotatedClues)
      expect(rotatedClues).toEqual(cluesFrom(rotatedPattern))
    }
  })

  it('countErrors 统计错格：空格与叉都算未填', () => {
    const pattern = [
      [true, false],
      [false, true],
    ]
    const cells: Cell[][] = [
      [1, 0],
      [2, 2],
    ]
    expect(countErrors(cells, pattern)).toBe(1)
    expect(isSolved([
      [1, 0],
      [0, 1],
    ] as Cell[][], pattern)).toBe(true)
  })

  it('checkBoard 全对过关：不旋转不消耗校验', () => {
    const state = createNonospinState(42)
    for (let r = 0; r < state.size; r += 1) {
      for (let c = 0; c < state.size; c += 1) {
        if (state.pattern[r]![c]!) setCell(state, r, c, 1)
      }
    }
    const result = checkBoard(state)
    expect(result).toEqual({ errors: 0, won: true, rotated: false })
    expect(state.phase).toBe('won')
    expect(state.rotation).toBe(0)
    expect(state.checksLeft).toBe(state.checksTotal)
  })

  it('checkBoard 有错：报告错格数（不指位置）、旋转盘面并消耗校验', () => {
    const state = createNonospinState(42)
    setCell(state, 0, 0, 1)
    const result = checkBoard(state)
    expect(result.rotated).toBe(true)
    expect(result.errors).toBeGreaterThan(0)
    expect(state.checksLeft).toBe(state.checksTotal - 1)
    expect(state.rotation).toBe(1)
    // 已填格随盘面顺时针轮转：原 (0,0) 转 90 度后到 (0, size-1)。
    expect(state.cells[0]![state.size - 1]).toBe(1)
    expect(state.cells[0]![0]).toBe(0)
  })

  it('校验次数耗尽进入失败，旋转计数对 4 取模', () => {
    const state = createLevelState(9, 4) // 10x10, 3 次校验
    expect(state.checksTotal).toBe(LEVEL_CHECKS[4])
    const first = checkBoard(state)
    expect(first.rotated).toBe(true)
    const second = checkBoard(state)
    expect(second.rotated).toBe(true)
    expect(state.rotation).toBe(2)
    expect(state.phase).toBe('playing')
    const third = checkBoard(state)
    expect(third.rotated).toBe(false)
    expect(state.phase).toBe('failed')
    expect(state.checksLeft).toBe(0)
    // 失败后继续校验是空操作。
    expect(checkBoard(state).errors).toBe(third.errors)
  })

  it('displayClues 与 rotation 次线索轮转一致', () => {
    const state = createNonospinState(2024)
    let expected = state.clues
    for (let round = 0; round < 4; round += 1) {
      expect(displayClues(state)).toEqual(expected)
      checkBoard(state) // 有错必然触发一次旋转
      expected = rotateCluesCW(expected)
      if (state.phase !== 'playing') break
    }
  })

  it('seed 重放：同 seed 各关图案与状态完全一致；restartLevel 复原', () => {
    const run1 = createNonospinState(31415)
    const run2 = createNonospinState(31415)
    expect(run1.pattern).toEqual(run2.pattern)
    expect(levelSeed(31415, 2)).toBe(levelSeed(31415, 2))
    for (let level = 0; level < LEVEL_COUNT; level += 1) {
      expect(createLevelState(31415, level).pattern)
        .toEqual(createLevelState(31415, level).pattern)
    }
    setCell(run1, 0, 0, 1)
    checkBoard(run1)
    restartLevel(run1)
    expect(run1).toEqual(createNonospinState(31415))
  })
})
