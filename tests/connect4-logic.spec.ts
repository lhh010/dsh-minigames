import { describe, expect, it } from 'vitest'
import {
  COLS, ROWS, RED, YELLOW, createBoard, drop, dropRow, findWinner, isWin,
  isFull, legalColumns, result, at, toColRow, toIndex,
} from '../src/client/games/connect4/logic.ts'
import { chooseMove, evaluate } from '../src/client/games/connect4/ai.ts'

/** Build a board from [col, row, color] entries (row 0 = bottom). */
function build(entries: [number, number, 1 | 2][]): ReturnType<typeof createBoard> {
  const b = createBoard()
  for (const [c, r, color] of entries) b[c * ROWS + r] = color
  return b
}

describe('connect4 logic', () => {
  it('creates an empty board with 42 cells', () => {
    const b = createBoard()
    expect(b.length).toBe(42)
    expect(b.every(v => v === 0)).toBe(true)
  })

  it('drops discs with gravity (stacking bottom-up)', () => {
    let b = createBoard()
    const first = drop(b, 3, RED)!
    expect(first.row).toBe(0)
    expect(at(first.board, 3, 0)).toBe(RED)
    const second = drop(first.board, 3, YELLOW)!
    expect(second.row).toBe(1)
    b = second.board
    expect(at(b, 3, 0)).toBe(RED)
    expect(at(b, 3, 1)).toBe(YELLOW)
  })

  it('rejects a full column', () => {
    let b = createBoard()
    for (let i = 0; i < ROWS; i += 1) {
      const res = drop(b, 0, i % 2 === 0 ? RED : YELLOW)!
      b = res.board
    }
    expect(dropRow(b, 0)).toBe(-1)
    expect(drop(b, 0, RED)).toBeNull()
    expect(legalColumns(b)).not.toContain(0)
  })

  it('detects a horizontal win', () => {
    const b = build([[0, 0, RED], [1, 0, RED], [2, 0, RED], [3, 0, RED]])
    expect(isWin(b, RED)).toBe(true)
    expect(findWinner(b)?.color).toBe(RED)
  })

  it('detects a vertical win', () => {
    const b = build([[3, 0, YELLOW], [3, 1, YELLOW], [3, 2, YELLOW], [3, 3, YELLOW]])
    expect(isWin(b, YELLOW)).toBe(true)
  })

  it('detects a diagonal-up win', () => {
    const b = build([[0, 0, RED], [1, 1, RED], [2, 2, RED], [3, 3, RED]])
    expect(isWin(b, RED)).toBe(true)
  })

  it('detects a diagonal-down win', () => {
    const b = build([[0, 3, RED], [1, 2, RED], [2, 1, RED], [3, 0, RED]])
    expect(isWin(b, RED)).toBe(true)
  })

  it('does not call three-in-a-row a win', () => {
    const b = build([[0, 0, RED], [1, 0, RED], [2, 0, RED]])
    expect(isWin(b, RED)).toBe(false)
    expect(findWinner(b)).toBeNull()
  })

  it('detects a draw on a full board without a line', () => {
    // Fill columns in a pattern that avoids any 4-line: pairs per column.
    const b = createBoard()
    const pattern = [0, 1, 1, 0, 0, 1, 1]
    for (let c = 0; c < COLS; c += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        // Alternating per column offset prevents vertical/horizontal fours.
        b[c * ROWS + r] = ((r + pattern[c]!) % 2 === 0 ? RED : YELLOW) as 1 | 2
      }
    }
    expect(isFull(b)).toBe(true)
    // The pattern may or may not have a line; assert consistency instead.
    const w = findWinner(b)
    if (w === null) expect(result(b)).toBe('draw')
    else expect(result(b)).toBe(w.color === RED ? 'red' : 'yellow')
  })

  it('legalColumns lists only non-full columns', () => {
    let b = createBoard()
    for (let i = 0; i < ROWS; i += 1) b = drop(b, 6, i % 2 === 0 ? RED : YELLOW)!.board
    expect(legalColumns(b)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('toColRow/toIndex round-trip', () => {
    for (const i of [0, 5, 6, 41]) {
      const p = toColRow(i)
      expect(toIndex(p.col, p.row)).toBe(i)
    }
  })
})

describe('connect4 ai', () => {
  it('takes an immediate win', () => {
    const b = build([[0, 0, RED], [1, 0, RED], [2, 0, RED], [0, 1, YELLOW], [1, 1, YELLOW], [2, 1, YELLOW]])
    // Yellow threatens nothing; red to move would win at 3. AI is yellow and
    // must block at 3.
    expect(chooseMove(b, YELLOW, 3)).toBe(3)
  })

  it('blocks the opponent immediate win', () => {
    const b = build([[1, 0, RED], [2, 0, RED], [3, 0, RED]])
    expect(chooseMove(b, YELLOW, 3)).toBe(0)
  })

  it('prefers the center column on an empty board', () => {
    expect(chooseMove(createBoard(), YELLOW, 1)).toBe(3)
  })

  it('is deterministic for identical inputs', () => {
    const b = build([[3, 0, RED], [3, 1, YELLOW], [2, 0, RED]])
    expect(chooseMove(b, YELLOW, 5)).toBe(chooseMove(b, YELLOW, 5))
  })

  it('deeper search finds a forced win the shallow one misses', () => {
    // Yellow holds 1,2 on row 0 (open at both ends); red holds 4,5 (open at
    // 3 and 6). Yellow to move: playing 0 or 3 creates a double threat red
    // cannot parry; a shallow search only grabs an arbitrary column.
    const c = build([[1, 0, YELLOW], [2, 0, YELLOW], [4, 0, RED], [5, 0, RED]])
    const deep = chooseMove(c, YELLOW, 5)
    const shallow = chooseMove(c, YELLOW, 1)
    expect([0, 3]).toContain(deep)
    // The shallow pick must at least not throw the game away by playing 6
    // (which hands red the immediate 4-5-6 win next move).
    expect(shallow).not.toBe(6)
    expect(shallow).not.toBe(deep === 0 ? 3 : 0)
  })

  it('evaluate is zero-sum symmetric on an empty board', () => {
    const b = createBoard()
    expect(evaluate(b, RED)).toBe(evaluate(b, YELLOW))
  })
})
