import { describe, expect, it } from 'vitest'
import {
  LEVELS, attacks, conflictCount, conflictingQueens, createBoard, isSolved,
  mulberry32, queenSafe, randomSolution, toggle, winScore, type Pos, type QueensState,
} from '../src/client/games/queens8/logic.ts'

/** 经典八皇后解（按行列出各皇后列号）。 */
const CLASSIC_8 = [0, 4, 7, 5, 2, 6, 1, 3]

/** 由列号数组构造 Pos 列表。 */
function toQueens(cols: number[]): Pos[] {
  return cols.map((col, row) => ({ row, col }))
}

/** 深比较用的局面快照（JSON 拷贝）。 */
function snap(state: QueensState): QueensState {
  return JSON.parse(JSON.stringify(state)) as QueensState
}

describe('queens8 logic', () => {
  it('attacks / queenSafe：同行、同列、两对角线均不安全，错开才安全', () => {
    const queens = toQueens([0, 4]) // (0,0) 与 (1,4)
    expect(attacks({ row: 0, col: 0 }, { row: 0, col: 5 })).toBe(true) // 同行
    expect(attacks({ row: 0, col: 0 }, { row: 5, col: 0 })).toBe(true) // 同列
    expect(attacks({ row: 0, col: 0 }, { row: 3, col: 3 })).toBe(true) // 主对角线
    expect(attacks({ row: 0, col: 0 }, { row: 2, col: -2 })).toBe(true) // 反对角线（负列也成立）
    expect(attacks({ row: 0, col: 0 }, { row: 1, col: 2 })).toBe(false) // 马位安全
    expect(attacks({ row: 2, col: 2 }, { row: 5, col: 5 })).toBe(true)
    expect(queenSafe(queens, 2, 1)).toBe(true)
    expect(queenSafe(queens, 0, 7)).toBe(false) // 同行
    expect(queenSafe(queens, 3, 4)).toBe(false) // 同列
    expect(queenSafe(queens, 2, 5)).toBe(false) // 与 (1,4) 同对角线
    expect(queenSafe(queens, 2, 2)).toBe(false) // 与 (0,0) 同对角线
    expect(queenSafe(queens, 7, 7)).toBe(false) // 与 (0,0) 同对角线
  })

  it('queenSafe / conflictCount：经典八皇后解两两安全、零冲突', () => {
    const queens = toQueens(CLASSIC_8)
    expect(queens).toHaveLength(8)
    for (let i = 0; i < 8; i += 1) {
      const others = queens.filter((_, j) => j !== i)
      expect(queenSafe(others, queens[i]!.row, queens[i]!.col)).toBe(true)
    }
    expect(conflictCount(queens)).toBe(0)
    expect(conflictingQueens(queens)).toEqual(Array.from({ length: 8 }, () => false))
  })

  it('conflictCount / conflictingQueens：冲突对计数与红色标记精确到 involved 皇后', () => {
    // (0,0) 与 (1,0) 同列冲突，(3,4) 单独安全。
    const board = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 3, col: 4 }]
    expect(conflictCount(board)).toBe(1)
    expect(conflictingQueens(board)).toEqual([true, true, false])
    // (0,0)、(1,1)、(2,2) 两两同对角线：3 对冲突。
    const diag = [{ row: 0, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 2 }]
    expect(conflictCount(diag)).toBe(3)
    expect(conflictingQueens(diag)).toEqual([true, true, true])
    // 空盘与单皇后无冲突。
    expect(conflictCount([])).toBe(0)
    expect(conflictCount([{ row: 4, col: 4 }])).toBe(0)
  })

  it('toggle：空格放置计一步、再点移除不计步，纯函数不修改入参', () => {
    let state = createBoard(4)
    const empty = snap(state)
    expect(state.queens).toHaveLength(0)
    expect(state.won).toBe(false)
    state = toggle(state, 0, 1)!
    expect(state.queens).toEqual([{ row: 0, col: 1 }])
    expect(state.moves).toBe(1)
    state = toggle(state, 1, 3)!
    expect(state.moves).toBe(2)
    state = toggle(state, 1, 3)! // 移除
    expect(state.queens).toEqual([{ row: 0, col: 1 }])
    expect(state.moves).toBe(2) // 移除不计步
    state = toggle(state, 1, 3)! // 重新放置又计一步
    expect(state.moves).toBe(3)
    // 纯函数：最先的入参未被改动。
    expect(empty).toEqual(snap(createBoard(4)))
  })

  it('toggle：越界与已过关局面返回 null', () => {
    const state = createBoard(4)
    expect(toggle(state, -1, 0)).toBeNull()
    expect(toggle(state, 0, 4)).toBeNull()
    expect(toggle(state, 4, 4)).toBeNull()
    const won: QueensState = { size: 4, queens: toQueens([1, 3, 0, 2]), moves: 4, won: true }
    expect(toggle(won, 2, 2)).toBeNull()
  })

  it('isSolved / toggle：放满 N 个零冲突才过关，少一个或带冲突都不算', () => {
    const safe4 = toQueens([1, 3, 0, 2])
    expect(conflictCount(safe4)).toBe(0)
    let state = createBoard(4)
    for (const q of safe4) {
      state = toggle(state, q.row, q.col)!
    }
    expect(state.won).toBe(true)
    expect(isSolved(state)).toBe(true)
    // 少一个皇后。
    expect(isSolved({ size: 4, queens: safe4.slice(0, 3), moves: 3, won: false })).toBe(false)
    // 放满但同列冲突。
    const bad4 = toQueens([1, 3, 0, 1])
    expect(conflictCount(bad4)).toBeGreaterThan(0)
    expect(isSolved({ size: 4, queens: bad4, moves: 4, won: false })).toBe(false)
  })

  it('winScore：越快分越高、步数越少分越高、下限 N×10、纯确定函数', () => {
    const fast = winScore(8, 20, 8)
    const slow = winScore(8, 120, 8)
    const sloppy = winScore(8, 20, 12)
    expect(fast).toBeGreaterThan(slow)
    expect(fast).toBeGreaterThan(sloppy) // 多余放置惩罚
    expect(winScore(8, 20, 8)).toBe(fast) // 同参同分
    expect(winScore(4, 0, 4)).toBe(4 * 4 * 10 + 4 * 30 * 4) // 满时间奖励
    // 时间封顶后：只剩底分。
    expect(winScore(4, 9999, 4)).toBe(4 * 4 * 10)
    // 惩罚再多也有下限 N×10。
    expect(winScore(4, 0, 1000)).toBe(4 * 10)
    // 8×8 底分 640，4×4 下限 40。
    expect(winScore(8, 8 * 30, 8)).toBe(640)
  })

  it('randomSolution：各档位同种子同解、解本身合法', () => {
    for (const size of LEVELS) {
      const a = randomSolution(size, mulberry32(42))
      const b = randomSolution(size, mulberry32(42))
      expect(a).not.toBeNull()
      expect(b).not.toBeNull()
      expect(a).toEqual(b) // 确定性
      expect(a).toHaveLength(size)
      expect(conflictCount(a!)).toBe(0) // 是合法解
      // 每行恰一个（按构造成立，校验行列不重）。
      const rows = new Set(a!.map(q => q.row))
      const cols = new Set(a!.map(q => q.col))
      expect(rows.size).toBe(size)
      expect(cols.size).toBe(size)
    }
    // 不同种子通常给出不同解（8 皇后 92 解，连试多对）。
    let differs = 0
    for (let seed = 0; seed < 20; seed += 1) {
      const x = randomSolution(8, mulberry32(seed))!
      const y = randomSolution(8, mulberry32(seed + 100))!
      if (x.some((q, i) => q.col !== y[i]!.col)) differs += 1
    }
    expect(differs).toBeGreaterThan(0)
  })

  it('LEVELS 档位递进：4 → 6 → 8，共三档', () => {
    expect(LEVELS).toEqual([4, 6, 8])
    expect(LEVELS).toHaveLength(3)
  })
})
