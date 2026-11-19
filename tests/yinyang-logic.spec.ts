import { describe, expect, it } from 'vitest'
import {
  BLACK, EMPTY, LEVEL_SIZES, WHITE, boardFromSeed, clueDensity, colorConnected,
  computeScore, conflictCells, countSolutions, filledConnected, hintFromBoard,
  isSolvedGrid, levelSize, monoSquares, mulberry32,
} from '../src/client/games/yinyang/logic.ts'

describe('yinyang logic', () => {
  /** 手工搭一张 3×3 盘（辅助构造格值）。 */
  const grid3 = (...rows: number[][]): Int8Array => Int8Array.from(rows.flat())

  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(11)
    const b = mulberry32(11)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(mulberry32(3)()).not.toBe(mulberry32(4)())
  })

  it('levelSize wraps after the 5th level; densities decrease; computeScore decays', () => {
    expect(LEVEL_SIZES).toEqual([6, 7, 8, 9, 10])
    expect(levelSize(1)).toBe(6)
    expect(levelSize(6)).toBe(6)
    expect(clueDensity(6)).toBeGreaterThan(clueDensity(10))
    expect(clueDensity(10)).toBe(0.34)
    expect(computeScore(1, 0)).toBe(3100)
    expect(computeScore(1, 10_000)).toBe(100)
  })

  it('monoSquares and conflictCells flag filled monochrome 2x2 blocks only', () => {
    // 3×3：左上 2×2 全黑违例；右下 2×2 含空格 → 不算。
    const g = grid3(
      [BLACK, BLACK, WHITE],
      [BLACK, BLACK, EMPTY],
      [WHITE, EMPTY, WHITE],
    )
    expect(monoSquares(g, 3)).toEqual([0])
    expect(conflictCells(g, 3)).toEqual(new Set([0, 1, 3, 4]))
    // 无违例棋盘：黑白交替带一条蛇形黑流。
    const ok = grid3(
      [BLACK, WHITE, BLACK],
      [WHITE, BLACK, WHITE],
      [BLACK, WHITE, BLACK],
    )
    expect(monoSquares(ok, 3)).toEqual([])
    expect(conflictCells(ok, 3).size).toBe(0)
  })

  it('colorConnected detects split regions via BFS in four directions', () => {
    // 黑被白从中截断成两片 → 不连通。
    const split = grid3(
      [BLACK, WHITE, BLACK],
      [WHITE, WHITE, WHITE],
      [BLACK, WHITE, BLACK],
    )
    expect(colorConnected(split, 3, BLACK)).toBe(false)
    expect(colorConnected(split, 3, WHITE)).toBe(true)
    // 蛇形黑流四方向相连 → 连通（对角不算：白 (0,1) 与 (1,2) 分离）。
    const snake = grid3(
      [BLACK, WHITE, EMPTY],
      [BLACK, EMPTY, WHITE],
      [BLACK, BLACK, BLACK],
    )
    expect(colorConnected(snake, 3, BLACK)).toBe(true)
    expect(colorConnected(snake, 3, WHITE)).toBe(false)
    // 无已填格的颜色视为连通（无从断裂）。
    expect(colorConnected(new Int8Array(9).fill(EMPTY), 3, WHITE)).toBe(true)
  })

  it('isSolvedGrid requires full, mono-2x2-free, both-connected grids', () => {
    // 已知有效 3×3：顶行黑 + (1,1) 黑，其余白（双色各自连通）。
    const good = grid3(
      [BLACK, BLACK, BLACK],
      [WHITE, BLACK, WHITE],
      [WHITE, WHITE, WHITE],
    )
    expect(isSolvedGrid(good, 3)).toBe(true)
    // 空格未填。
    const holes = Int8Array.from(good)
    holes[4] = EMPTY
    expect(isSolvedGrid(holes, 3)).toBe(false)
    // 同色 2×2：左上角四格全黑。
    const mono = grid3(
      [BLACK, BLACK, BLACK],
      [BLACK, BLACK, WHITE],
      [WHITE, WHITE, WHITE],
    )
    expect(isSolvedGrid(mono, 3)).toBe(false)
    // 黑被白行截断成两片。
    const broken = grid3(
      [BLACK, BLACK, BLACK],
      [WHITE, WHITE, WHITE],
      [BLACK, WHITE, BLACK],
    )
    expect(isSolvedGrid(broken, 3)).toBe(false)
  })

  it('filledConnected reflects the partial-grid connectivity indicator', () => {
    // 两色各自一片（其余空）→ true。
    const both = grid3(
      [BLACK, WHITE, EMPTY],
      [EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY],
    )
    expect(filledConnected(both, 3)).toBe(true)
    // 黑两片 → false。
    const splitBlack = grid3(
      [BLACK, EMPTY, BLACK],
      [EMPTY, EMPTY, EMPTY],
      [WHITE, WHITE, WHITE],
    )
    expect(filledConnected(splitBlack, 3)).toBe(false)
  })

  it('countSolutions counts completions honoring all three constraints', () => {
    // 3×3 全空：合法完成形必须黑白各连通且无 2×2 —— 存在但有限。
    const res = countSolutions(new Int8Array(9).fill(EMPTY), 3, 99)
    expect(res.hitCap).toBe(false)
    expect(res.count).toBeGreaterThan(0)
    // 固定蛇形黑流后剩 (0,2)(1,2) 两格：手算恰 2 种合法完成（B,B 与
    // W,B；W,W 拼出全白 2×2，B,W 使 (0,2) 黑孤离）。
    const guided = grid3(
      [BLACK, WHITE, EMPTY],
      [BLACK, WHITE, EMPTY],
      [BLACK, BLACK, BLACK],
    )
    const res2 = countSolutions(guided, 3, 99)
    expect(res2).toEqual({ count: 2, hitCap: false })
    // 死局：中列全白线索把黑线索 (0,0) 与 (0,2) 永久隔断（3 宽网格任何
    // 左右通路必经中列），任何完成都黑不连通 → 0 解。
    const dead = grid3(
      [BLACK, WHITE, BLACK],
      [EMPTY, WHITE, EMPTY],
      [EMPTY, WHITE, EMPTY],
    )
    expect(countSolutions(dead, 3, 99).count).toBe(0)
  })

  it('every level generates a valid board: solution solves, clues subset, density honored', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const board = boardFromSeed(lv * 0x85ebca6b, levelSize(lv))
      const total = board.size * board.size
      expect(board.size).toBe(levelSize(lv))
      // 生成解满足全部约束。
      expect(isSolvedGrid(board.solution, board.size)).toBe(true)
      // 线索与解一致，且留有空格给玩家。
      let clues = 0
      for (let i = 0; i < total; i += 1) {
        if (board.clues[i] !== EMPTY) {
          clues += 1
          expect(board.clues[i]).toBe(board.solution[i])
        }
      }
      expect(clues).toBeGreaterThan(0)
      expect(clues).toBeLessThan(total)
      // 挖孔向目标密度推进（个别挖孔破坏唯一性被放回，允许少量超出）。
      expect(clues).toBeLessThanOrEqual(Math.round(total * clueDensity(board.size)) + 8)
    }
  }, 30000)

  it('generated puzzles have exactly one solution (uniqueness verified by the solver)', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const board = boardFromSeed(lv * 0x85ebca6b, levelSize(lv))
      const res = countSolutions(board.clues, board.size, 2)
      expect(res.hitCap).toBe(false)
      expect(res.count).toBe(1)
    }
  }, 30000)

  it('generation is deterministic per seed and varies across seeds', () => {
    const a = boardFromSeed(0x12345678, 7)
    const b = boardFromSeed(0x12345678, 7)
    expect([...a.clues]).toEqual([...b.clues])
    expect([...a.solution]).toEqual([...b.solution])
    const c = boardFromSeed(0x87654321, 7)
    let diff = false
    for (let i = 0; i < a.solution.length; i += 1) {
      if (a.solution[i] !== c.solution[i]) { diff = true; break }
    }
    expect(diff).toBe(true)
  }, 30000)

  it('hint fills a forced cell and never contradicts the solution', () => {
    const board = boardFromSeed(2 * 0x85ebca6b, levelSize(2))
    const grid = Int8Array.from(board.clues)
    const hint = hintFromBoard(board, grid)
    expect(hint).not.toBeNull()
    if (hint === null) return
    expect(grid[hint.cell]).toBe(EMPTY)
    // 提示色必与唯一解一致。
    expect(hint.color).toBe(board.solution[hint.cell])
    if (hint.deduced) {
      // 单着推理：反色落子后无解（检查后还原，不污染后续盘面）。
      grid[hint.cell] = hint.color === BLACK ? WHITE : BLACK
      expect(countSolutions(grid, board.size, 1).count).toBe(0)
      grid[hint.cell] = EMPTY
    }
    // 反复用提示可整盘填满并过关（每次都据唯一解推进）。
    let guard = 0
    let cur = hintFromBoard(board, grid)
    while (cur !== null && guard < 200) {
      grid[cur.cell] = cur.color
      cur = hintFromBoard(board, grid)
      guard += 1
    }
    expect(isSolvedGrid(grid, board.size)).toBe(true)
  }, 60000)
})
