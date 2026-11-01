import { describe, expect, it } from 'vitest'
import {
  BLACK, EMPTY, LEVEL_SIZES, WHITE, computeScore, countSolutions, findConflicts, isWon,
  levelSize, puzzleFromSeed, type TaijiPuzzle,
} from '../src/client/games/taiji/logic.ts'

describe('taiji logic', () => {
  it('levelSize maps 1-based levels onto the size table and wraps after the last level', () => {
    LEVEL_SIZES.forEach((size, i) => expect(levelSize(i + 1)).toBe(size))
    expect(levelSize(LEVEL_SIZES.length + 1)).toBe(LEVEL_SIZES[0])
    expect(LEVEL_SIZES.every((n) => n % 2 === 0)).toBe(true)
  })

  it('puzzleFromSeed is deterministic, keeps clues consistent with the solution, and proves uniqueness', () => {
    for (const [seed, size, level] of [[1, 4, 1], [2, 6, 2], [3, 6, 3], [4, 8, 4], [5, 8, 5]] as const) {
      const p: TaijiPuzzle = puzzleFromSeed(seed, size, level)
      expect(p).toEqual(puzzleFromSeed(seed, size, level))
      expect(p.size).toBe(size)
      expect(p.unique).toBe(true)
      expect(p.clues.size).toBeGreaterThanOrEqual(1)
      expect(countSolutions(size, p.clues)).toBe(1)
      for (const [cell, v] of p.clues) expect(p.solution[cell]).toBe(v)
      // 解是两种棋盘着色极性之一（极性由种子决定，整体一致）。
      const polarities = [[BLACK, WHITE], [WHITE, BLACK]] as const
      const matches = polarities.some(([even, odd]) => p.solution.every((v, cell) => {
        const r = Math.floor(cell / size)
        const c = cell % size
        return v === ((r + c) % 2 === 0 ? even : odd)
      }))
      expect(matches).toBe(true)
    }
  })

  it('countSolutions: an empty board has two polarities, one clue pins it, contradictions have none', () => {
    expect(countSolutions(4, new Map())).toBe(2)
    expect(countSolutions(4, new Map([[0, BLACK]]))).toBe(1)
    expect(countSolutions(4, new Map([[1, WHITE]]))).toBe(1)
    // (0,0) 与 (0,1) 极性相反：同色给定格自相矛盾。
    expect(countSolutions(4, new Map([[0, BLACK], [1, BLACK]]))).toBe(0)
    // 6×6：(0,0) 偶宇称、(0,1) 奇宇称，同色同样矛盾。
    expect(countSolutions(6, new Map([[0, WHITE], [1, WHITE]]))).toBe(0)
  })

  it('isWon accepts only the full checkerboard that honors every clue', () => {
    const p = puzzleFromSeed(7, 6, 2)
    const good = [...p.solution]
    expect(isWon(p, good)).toBe(true)
    // 空盘或未填满：不赢。
    expect(isWon(p, new Array(36).fill(EMPTY))).toBe(false)
    const partial = [...good]
    partial[0] = EMPTY
    expect(isWon(p, partial)).toBe(false)
    // 翻转任意一格都破坏相邻不同色或黑白平衡。
    for (let cell = 0; cell < 36; cell += 1) {
      const broken = [...good]
      broken[cell] = broken[cell] === BLACK ? WHITE : BLACK
      expect(isWon(p, broken)).toBe(false)
    }
    // 破坏任一给定格：不赢。
    const clueCell = [...p.clues.keys()][0]!
    const clueBroken = [...good]
    clueBroken[clueCell] = clueBroken[clueCell] === BLACK ? WHITE : BLACK
    expect(isWon(p, clueBroken)).toBe(false)
  })

  it('findConflicts flags over-black rows/cols and same-colored neighbors, not holes', () => {
    const size = 4
    expect(findConflicts(size, new Array(16).fill(EMPTY))).toEqual({
      rows: new Set(), cols: new Set(), cells: new Set(),
    })
    const grid = new Array<0 | 1 | 2>(16).fill(EMPTY)
    // 第 0 行全黑（4 > 2）与第 0 列全黑。
    for (let j = 0; j < 4; j += 1) grid[j] = BLACK
    for (let i = 1; i < 4; i += 1) grid[i * 4] = BLACK
    // 相邻同色对 (1,1)-(1,2)。
    grid[5] = BLACK
    grid[6] = BLACK
    const c = findConflicts(size, grid)
    expect(c.rows.has(0)).toBe(true)
    expect(c.cols.has(0)).toBe(true)
    for (let j = 0; j < 4; j += 1) expect(c.cells.has(j)).toBe(true)
    expect(c.cells.has(5)).toBe(true)
    expect(c.cells.has(6)).toBe(true)
    // 可补救的欠数不算冲突：行 3 只放了 1 黑且未满。
    expect(c.rows.has(3)).toBe(false)
  })

  it('computeScore pays level base plus a time bonus that decays 5/s and floors at 0', () => {
    expect(computeScore(1, 0)).toBe(100 + 3000)
    expect(computeScore(3, 100)).toBe(300 + 2500)
    expect(computeScore(2, 600)).toBe(200)
    expect(computeScore(5, 1e9)).toBe(500)
    expect(computeScore(1, 599.9)).toBe(100 + 3000 - 2995)
  })
})
