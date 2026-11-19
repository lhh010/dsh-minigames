import { describe, expect, it } from 'vitest'
import {
  applyHint, conflictsAt, countSolutionsX, createSudokuXState, generateSolutionX,
  hasConflict, LEVEL_GIVENS, makePuzzleX, MAX_ERRORS, mulberry32, place, tick,
  toggleNote, winScore, SIZE,
} from '../src/client/games/sudokuX/logic.ts'

function isCompleteValidX(grid: (number | null)[][]): boolean {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (grid[r]![c] === null) return false
    }
  }
  const unit = (cells: number[]): boolean => new Set(cells).size === 9
  for (let i = 0; i < SIZE; i += 1) {
    if (!unit(grid[i]!.map(v => v as number))) return false
    if (!unit(grid.map(row => row[i] as number))) return false
  }
  for (let br = 0; br < 3; br += 1) {
    for (let bc = 0; bc < 3; bc += 1) {
      const box: number[] = []
      for (let dr = 0; dr < 3; dr += 1) {
        for (let dc = 0; dc < 3; dc += 1) box.push(grid[br * 3 + dr]![bc * 3 + dc] as number)
      }
      if (!unit(box)) return false
    }
  }
  const main: number[] = []
  const anti: number[] = []
  for (let i = 0; i < SIZE; i += 1) {
    main.push(grid[i]![i] as number)
    anti.push(grid[i]![SIZE - 1 - i] as number)
  }
  return unit(main) && unit(anti)
}

describe('sudokuX logic', () => {
  it('mulberry32 是确定性的：同种子同序列', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = Array.from({ length: 20 }, () => a())
    const seqB = Array.from({ length: 20 }, () => b())
    expect(seqA).toEqual(seqB)
    const c = mulberry32(43)
    expect(seqA[0]).not.toBe(c())
  })

  it('生成器产出满足行/列/宫/两条对角线的完整解', () => {
    for (const seed of [1, 7, 2026]) {
      expect(isCompleteValidX(generateSolutionX(mulberry32(seed)))).toBe(true)
    }
  })

  it('挖洞保持唯一解且达到目标提示数（40→28 五关递进）', () => {
    for (let level = 0; level < LEVEL_GIVENS.length; level += 1) {
      const rng = mulberry32(100 + level)
      const puzzle = makePuzzleX(generateSolutionX(rng), LEVEL_GIVENS[level]!, rng)
      const clues = puzzle.flat().filter(v => v !== null).length
      expect(clues).toBe(LEVEL_GIVENS[level]!)
      expect(countSolutionsX(puzzle, 2)).toBe(1)
    }
    // 递进：提示数严格递减
    for (let i = 1; i < LEVEL_GIVENS.length; i += 1) {
      expect(LEVEL_GIVENS[i]!).toBeLessThan(LEVEL_GIVENS[i - 1]!)
    }
  })

  it('同种子完全可重放，不同种子通常不同', () => {
    const a = createSudokuXState(555, 0)
    const b = createSudokuXState(555, 0)
    expect(b.grid).toEqual(a.grid)
    expect(b.solution).toEqual(a.solution)
    const c = createSudokuXState(556, 0)
    expect(c.grid).not.toEqual(a.grid)
  })

  it('冲突检测覆盖行/列/宫/对角线四类', () => {
    const state = createSudokuXState(9, 0)
    const g = state.grid
    const sol = state.solution
    // 行冲突：(0,0) 与 (0,1) 放同一个解值
    g[0]![1] = sol[0]![1]!
    g[0]![0] = sol[0]![1]!
    expect(conflictsAt(state, 0, 0)).toContain('row')
    g[0]![0] = sol[0]![0]!
    // 列冲突：(1,4) 与 (2,4) 同列不同行
    g[2]![4] = sol[2]![4]!
    g[1]![4] = sol[2]![4]!
    expect(conflictsAt(state, 1, 4)).toContain('col')
    g[1]![4] = sol[1]![4]!
    // 宫冲突：(3,0) 与 (3,1) 同宫
    g[3]![1] = sol[3]![1]!
    g[3]![0] = sol[3]![1]!
    expect(conflictsAt(state, 3, 0)).toContain('box')
    g[3]![0] = sol[3]![0]!
    // 主对角线冲突：(2,2) 与 (5,5) 同对角线且不同行/列/宫
    g[5]![5] = sol[5]![5]!
    g[2]![2] = sol[5]![5]!
    expect(conflictsAt(state, 2, 2)).toContain('diag')
    g[2]![2] = sol[2]![2]!
    // 副对角线冲突：(1,7) 与 (4,4)
    g[4]![4] = sol[4]![4]!
    g[1]![7] = sol[4]![4]!
    expect(conflictsAt(state, 1, 7)).toContain('diag')
    g[1]![7] = sol[1]![7]!
    // 还原后无任何冲突
    expect(hasConflict(state)).toBe(false)
  })

  it('place：提示格不可改，填对落子，填错计错并在 3 次后判负', () => {
    const state = createSudokuXState(31, 1)
    let freeR = -1
    let freeC = -1
    outer: for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (state.puzzle[r]![c] === null) { freeR = r; freeC = c; break outer }
      }
    }
    // 找一个提示格
    let clueR = 0
    let clueC = 0
    outer2: for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (state.puzzle[r]![c] !== null) { clueR = r; clueC = c; break outer2 }
      }
    }
    expect(place(state, clueR, clueC, 5)).toBe(false)
    // 填对
    const good = state.solution[freeR]![freeC]!
    expect(place(state, freeR, freeC, good)).toBe(true)
    expect(state.grid[freeR]![freeC]).toBe(good)
    expect(state.errors).toBe(0)
    // 填错三次（每次先清空，再填与解值不同的错误值）
    for (let i = 0; i < MAX_ERRORS; i += 1) {
      place(state, freeR, freeC, 0)
      const wrong = ((good + i) % 9) + 1
      place(state, freeR, freeC, wrong)
      expect(state.grid[freeR]![freeC]).toBe(wrong)
      if (i < MAX_ERRORS - 1) expect(state.failed).toBe(false)
    }
    expect(state.errors).toBe(MAX_ERRORS)
    expect(state.failed).toBe(true)
    // 判负后不可再操作
    expect(place(state, freeR, freeC, 0)).toBe(false)
  })

  it('笔记：空格可切换、已填格拒绝、落子清理自身与邻居笔记', () => {
    const state = createSudokuXState(77, 0)
    // 找一个可编辑的主对角线格（邻居覆盖行/列/宫/对角线四类）
    let r = 0
    let c = 0
    outerNote: for (let i = 0; i < SIZE; i += 1) {
      if (state.puzzle[i]![i] === null && state.grid[i]![i] === null) { r = i; c = i; break outerNote }
    }
    expect(state.grid[r]![c]).toBeNull()
    expect(toggleNote(state, r, c, 3)).toBe(true)
    expect(state.notes[r]![c]![2]).toBe(true)
    expect(toggleNote(state, r, c, 3)).toBe(true)
    expect(state.notes[r]![c]![2]).toBe(false)
    // 邻居预置笔记 n，落子后应被清掉
    const n = state.solution[r]![c]!
    state.notes[0]![c]![n - 1] = true
    state.notes[r]![0]![n - 1] = true
    expect(place(state, r, c, n)).toBe(true)
    expect(state.notes[r]![c]![n - 1]).toBe(false)
    expect(state.notes[0]![c]![n - 1]).toBe(false)
    expect(state.notes[r]![0]![n - 1]).toBe(false)
    // 已填格不可记笔记
    expect(toggleNote(state, r, c, 5)).toBe(false)
  })

  it('提示：填入的是正确值且计数递增；满盘时返回 null', () => {
    const state = createSudokuXState(123, 0)
    const before = state.grid.map(row => [...row])
    const hint = applyHint(state)
    expect(hint).not.toBeNull()
    expect(state.grid[hint!.r]![hint!.c]).toBe(state.solution[hint!.r]![hint!.c])
    expect(before[hint!.r]![hint!.c]).toBeNull()
    expect(state.hintsUsed).toBe(1)
    // 连续提示填满整盘 → 过关，再提示返回 null
    for (let i = 0; i < 81; i += 1) {
      if (state.won) break
      applyHint(state)
    }
    expect(state.won).toBe(true)
    expect(applyHint(state)).toBeNull()
  })

  it('过关判定：解值填满即 won，计时冻结', () => {
    const state = createSudokuXState(2024, 2)
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (state.grid[r]![c] === null) {
          const ok = place(state, r, c, state.solution[r]![c]!)
          expect(ok).toBe(true)
        }
      }
    }
    expect(state.won).toBe(true)
    const frozen = state.elapsed
    tick(state, 5)
    expect(state.elapsed).toBe(frozen)
    expect(winScore(state)).toBeGreaterThan(0)
  })

  it('错误填法不判胜：满盘但含冲突时不会 won', () => {
    const state = createSudokuXState(88, 0)
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (state.grid[r]![c] === null) state.grid[r]![c] = 1
      }
    }
    // 直接改 grid（绕过 place 的判错）也必须被过关判定识破
    expect(hasConflict(state)).toBe(true)
    expect(state.won).toBe(false)
  })

  it('难度递进 + 重放：关卡影响提示数，重放局与原局一致', () => {
    const easy = createSudokuXState(404, 0)
    const hard = createSudokuXState(404, 4)
    const countClues = (s: typeof easy): number => s.puzzle.flat().filter(v => v !== null).length
    expect(countClues(hard)).toBeLessThan(countClues(easy))
    // 重放：按种子重建第 4 关与首次完全一致
    const hardReplay = createSudokuXState(404, 4)
    expect(hardReplay.grid).toEqual(hard.grid)
    expect(hardReplay.puzzle).toEqual(hard.puzzle)
    expect(hardReplay.solution).toEqual(hard.solution)
  })
})
