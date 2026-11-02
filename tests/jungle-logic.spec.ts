import { describe, expect, it } from 'vitest'
import {
  canCapture, createStartPosition, legalMoves, applyMove, status,
  denWinner, denInDanger, positionWith, idx, positionKey,
} from '../src/client/games/jungle/logic.ts'
import { chooseMove, mulberry32 } from '../src/client/games/jungle/ai.ts'

describe('jungle logic', () => {
  it('canCapture: rank order, equal ranks, and the rat/elephant exception both ways', () => {
    // 高吃低、同级互吃。
    expect(canCapture('L', 'w', false, true, false)).toBe(true)
    expect(canCapture('w', 'L', false, true, false)).toBe(false)
    expect(canCapture('C', 'c', false, true, false)).toBe(true)
    // 鼠吃象成立，象吃鼠不成立（对称检查黑方棋子）。
    expect(canCapture('M', 'e', false, true, false)).toBe(true)
    expect(canCapture('E', 'm', false, true, false)).toBe(false)
    expect(canCapture('m', 'E', false, true, false)).toBe(true)
    expect(canCapture('e', 'M', false, true, false)).toBe(false)
  })

  it('a defender standing in the attacker-side trap can be captured by anything', () => {
    // 黑象站在红方陷阱 (7,3)，红鼠 (6,3) 可吃。
    const pos = positionWith([[7, 3, 'e'], [6, 3, 'M']])
    const moves = legalMoves(pos)
    expect(moves).toContainEqual([6, 3, 7, 3])
    // 同一头黑象站在己方陷阱 (1,3)（黑方自己的陷阱无效力），红鼠不可吃。
    const own = positionWith([[1, 3, 'e'], [2, 3, 'C']])
    expect(legalMoves(own)).not.toContainEqual([2, 3, 1, 3])
    // 红方陷阱对红方任何攻子生效：红狼也能吃陷阱里的黑象。
    const any = positionWith([[7, 3, 'e'], [6, 3, 'W']])
    expect(legalMoves(any)).toContainEqual([6, 3, 7, 3])
  })

  it('move generation: only the rat enters water; no move enters the own den', () => {
    // 狼 (6,1) 不可入水 (5,1)；象 (6,2) 不可入水 (5,2)。
    const pos = positionWith([[6, 1, 'W'], [6, 2, 'E'], [7, 3, 'C']])
    const moves = legalMoves(pos)
    expect(moves).not.toContainEqual([6, 1, 5, 1])
    expect(moves).not.toContainEqual([6, 2, 5, 2])
    // 鼠可以入水。
    const rat = positionWith([[6, 1, 'M']])
    expect(legalMoves(rat)).toContainEqual([6, 1, 5, 1])
    // (7,3) 的猫不可进入己方兽穴 (8,3)。
    expect(moves).not.toContainEqual([7, 3, 8, 3])
    // 开局每步都在盘内且起终点不同。
    const start = legalMoves(createStartPosition())
    expect(start.length).toBeGreaterThan(10)
    for (const [fr, fc, tr, tc] of start) {
      expect(fr).toBeGreaterThanOrEqual(0)
      expect(tr).toBeLessThan(9)
      expect(tc).toBeGreaterThanOrEqual(0)
      expect(tc).toBeLessThan(7)
      expect(fr * 7 + fc).not.toBe(tr * 7 + tc)
    }
  })

  it('lion and tiger jump the river; any rat in the water blocks the jump', () => {
    // 狮 (2,1) 纵向跳过 rows 3-5 col 1 落到 (6,1)。
    const lion = positionWith([[2, 1, 'L']])
    expect(legalMoves(lion)).toContainEqual([2, 1, 6, 1])
    // 虎 (3,0) 横向跳过 cols 1-2 落到 (3,3)。
    const tiger = positionWith([[3, 0, 'T']])
    expect(legalMoves(tiger)).toContainEqual([3, 0, 3, 3])
    // 黑鼠 (4,1) 在水中截断狮跳。
    const blocked = positionWith([[2, 1, 'L'], [4, 1, 'm']])
    expect(legalMoves(blocked)).not.toContainEqual([2, 1, 6, 1])
    // 跳河落点有可吃子（狼）时照跳照吃；落点为象时不可吃故不可跳。
    const eatJump = positionWith([[2, 1, 'L'], [6, 1, 'w']])
    expect(legalMoves(eatJump)).toContainEqual([2, 1, 6, 1])
    const noEat = positionWith([[2, 1, 'L'], [6, 1, 'e']])
    expect(legalMoves(noEat)).not.toContainEqual([2, 1, 6, 1])
  })

  it('a water rat cannot capture a land piece but can fight in the water', () => {
    // 水中红鼠 (4,1) 不可吃岸上黑象 (4,0)。
    const land = positionWith([[4, 1, 'M'], [4, 0, 'e']])
    expect(legalMoves(land)).not.toContainEqual([4, 1, 4, 0])
    // 水中红鼠可以吃水中黑鼠 (3,1)。
    const water = positionWith([[4, 1, 'M'], [3, 1, 'm']])
    expect(legalMoves(water)).toContainEqual([4, 1, 3, 1])
  })

  it('occupying the enemy den wins the game', () => {
    const pos = positionWith([[1, 3, 'L']])
    const after = applyMove(pos, [1, 3, 0, 3])
    expect(after.board[idx(0, 3)]).toBe('L')
    expect(denWinner(after.board)).toBe('r')
    expect(status(after)).toEqual({ kind: 'den', winner: 'r' })
  })

  it('applyMove is pure and flips the turn', () => {
    const pos = createStartPosition()
    const before = positionKey(pos)
    const m = legalMoves(pos)[0]!
    const after = applyMove(pos, m)
    expect(after.turn).toBe('b')
    expect(positionKey(pos)).toBe(before)
    expect(positionKey(after)).not.toBe(before)
    expect(after.board[idx(m[0], m[1])]).toBe('')
  })

  it('denInDanger flags an enemy piece adjacent to the den', () => {
    expect(denInDanger(positionWith([[7, 3, 'l']]), 'r')).toBe(true)
    expect(denInDanger(positionWith([[7, 3, 'C']]), 'r')).toBe(false)
    expect(denInDanger(createStartPosition(), 'r')).toBe(false)
  })

  it('capture-all and stalemate endings', () => {
    // 红方全歼黑方。
    const wipe = positionWith([[0, 0, 'L']])
    expect(status(wipe)).toEqual({ kind: 'capture-all', winner: 'r' })
    // 黑方困毙（仅剩的子被围死且不可入己方兽穴）。
    const stuck = positionWith([[0, 0, 'c'], [0, 1, 'E'], [1, 0, 'E']], { turn: 'b' })
    expect(status(stuck)).toEqual({ kind: 'stalemate', winner: 'r' })
  })
})

describe('jungle ai', () => {
  it('takes the one-move den win', () => {
    const pos = positionWith([[7, 3, 'l'], [6, 0, 'E']], { turn: 'b' })
    const r = chooseMove(pos, 2)
    expect(r.move).toEqual([7, 3, 8, 3])
  })

  it('is deterministic for identical inputs', () => {
    const pos = createStartPosition()
    const a = chooseMove(pos, 2)
    const b = chooseMove(pos, 2)
    expect(b.move).toEqual(a.move)
    expect(b.nodes).toBe(a.nodes)
    const rng1 = mulberry32(42)
    const rng2 = mulberry32(42)
    expect([rng1(), rng1(), rng1()]).toEqual([rng2(), rng2(), rng2()])
  })
})
