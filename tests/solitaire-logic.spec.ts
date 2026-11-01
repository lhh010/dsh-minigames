import { describe, expect, it } from 'vitest'
import {
  canPlaceOnColumn, canPlaceOnFoundation, cloneState, createSolitaire, drawStock,
  findAutoTarget, hitTest, moveToColumn, moveToFoundation, mulberry32, RANKS,
  shuffledDeck, undo, type Card, type SolitaireState,
} from '../src/client/games/solitaire/logic.ts'

const card = (suit: number, rank: number, faceUp = true): Card => ({ suit, rank, faceUp })

/** 一个最小可测状态：仅替换列与基础堆，其余字段沿用真实初始局。 */
function stateWith(columns: Card[][], foundations: Card[][] = [[], [], [], []], waste: Card[] = []): SolitaireState {
  const s = createSolitaire(1)
  s.columns = columns
  s.foundations = foundations
  s.waste = waste
  s.stock = []
  return s
}

describe('solitaire logic', () => {
  it('deals a deterministic 52-card tableau: column i gets i+1 cards with the last face up', () => {
    const a = createSolitaire(7)
    const b = createSolitaire(7)
    expect(shuffledDeck(7, 1)).toEqual(shuffledDeck(7, 1))
    expect(shuffledDeck(7, 1)).not.toEqual(shuffledDeck(7, 2))
    expect(a.columns.map((c) => c.length)).toEqual([1, 2, 3, 4, 5, 6, 7])
    for (const col of a.columns) {
      expect(col[col.length - 1]!.faceUp).toBe(true)
      for (const c of col.slice(0, -1)) expect(c.faceUp).toBe(false)
    }
    const total = a.columns.flat().length + a.stock.length
    expect(total).toBe(52)
    expect(a.won).toBe(false)
    expect(a.score).toBe(0)
  })

  it('column rules: empty columns only take kings; stacks need alternating colors descending by one', () => {
    const s = stateWith([
      [card(0, 5)],           // 黑桃5（黑）
      [card(1, 7)],           // 红心7（红）
    ])
    expect(canPlaceOnColumn(s, card(1, 4), 0)).toBe(true)  // 红牌叠黑5
    expect(canPlaceOnColumn(s, card(3, 4), 0)).toBe(false) // 黑牌叠黑5，颜色不交替
    expect(canPlaceOnColumn(s, card(1, 3), 0)).toBe(false) // 差 2
    expect(canPlaceOnColumn(s, card(0, 6), 0)).toBe(false) // 比 5 大
    expect(canPlaceOnColumn(s, card(0, 6), 1)).toBe(true)  // 黑牌叠红7
    const empty = stateWith([[], []])
    expect(canPlaceOnColumn(empty, card(0, 13), 0)).toBe(true)
    expect(canPlaceOnColumn(empty, card(0, 12), 0)).toBe(false)
    const hidden = stateWith([[card(0, 5, false)]])
    expect(canPlaceOnColumn(hidden, card(1, 4), 0)).toBe(false) // 暗牌不可叠
  })

  it('foundation rules: empty pile takes an ace, then same suit ascending by one', () => {
    const s = stateWith([[]], [[], [], [], []])
    expect(canPlaceOnFoundation(s, card(0, 1))).toBe(true)
    expect(canPlaceOnFoundation(s, card(0, 2))).toBe(false)
    const withAce = stateWith([[]], [[card(0, 1)], [], [], []])
    expect(canPlaceOnFoundation(withAce, card(0, 2))).toBe(true)
    expect(canPlaceOnFoundation(withAce, card(1, 2))).toBe(false)
    expect(canPlaceOnFoundation(withAce, card(0, 3))).toBe(false)
  })

  it('drawing the stock flips one card; an empty stock recycles the waste face down', () => {
    const s = createSolitaire(5)
    const stockN = s.stock.length
    expect(drawStock(s)).toBe(true)
    expect(s.stock.length).toBe(stockN - 1)
    expect(s.waste.length).toBe(1)
    expect(s.waste[0]!.faceUp).toBe(true)
    expect(s.moves).toBe(1)
    while (s.stock.length > 0) drawStock(s)
    expect(s.stock.length).toBe(0)
    expect(s.waste.length).toBe(stockN)
    expect(drawStock(s)).toBe(true)
    expect(s.stock.length).toBe(stockN)
    expect(s.waste.length).toBe(0)
    for (const c of s.stock) expect(c.faceUp).toBe(false)
  })

  it('moves score: +10 to foundation, +5 for flipping a hidden card underneath; invalid moves change nothing', () => {
    const s = stateWith([
      [card(0, 5, false), card(3, 1)], // 暗牌下压一张梅花A
      [],
    ])
    const before = cloneState(s)
    expect(moveToColumn(s, { zone: 'column', index: 0, cardIndex: 1 }, 1)).toBe(false)
    expect(s).toEqual(before) // 空列不收 A，未发生任何改动
    expect(moveToFoundation(s, { zone: 'column', index: 0, cardIndex: 1 })).toBe(true)
    expect(s.score).toBe(15)
    expect(s.foundations[3]).toEqual([card(3, 1)])
    expect(s.columns[0]!.length).toBe(1)
    expect(s.columns[0]![0]!.faceUp).toBe(true)
    expect(s.moves).toBe(1)
    // 再收一张不连续的牌：失败且分数不变。
    expect(moveToFoundation(s, { zone: 'column', index: 0, cardIndex: 0 })).toBe(false)
    expect(s.score).toBe(15)
  })

  it('undo restores the full previous snapshot and drains to false', () => {
    const s = stateWith([[card(1, 1)]])
    expect(moveToFoundation(s, { zone: 'column', index: 0, cardIndex: 0 })).toBe(true)
    expect(s.score).toBe(10)
    expect(undo(s)).toBe(true)
    expect(s.score).toBe(0)
    expect(s.columns[0]).toEqual([card(1, 1)])
    expect(s.foundations[1]).toEqual([])
    expect(undo(s)).toBe(false)
  })

  it('the same seed and operation sequence replays identically', () => {
    const mulA = mulberry32(31)
    const mulB = mulberry32(31)
    expect([mulA(), mulA(), mulA()]).toEqual([mulB(), mulB(), mulB()])
    const run = (): string => {
      const s = createSolitaire(31)
      for (let i = 0; i < 200; i += 1) {
        drawStock(s)
        const src = { zone: 'waste' } as const
        const target = findAutoTarget(s, src)
        if (target?.to === 'foundation') moveToFoundation(s, src)
        else if (target?.to === 'column') moveToColumn(s, src, target.index)
      }
      return JSON.stringify([s.score, s.moves, s.stock, s.waste, s.foundations, s.columns, s.won])
    }
    expect(run()).toBe(run())
  })

  it('hitTest resolves top-row slots and column cards in logical coordinates', () => {
    const s = createSolitaire(3)
    const stockHit = hitTest(s, 0, 0)
    expect(stockHit).toBeNull() // HUD 区域不可点
    // 第 0 槽（发牌堆）中心。
    const sx = (slot: number) => {
      const gap = (560 - 7 * 70) / 8
      return gap + slot * (70 + gap)
    }
    expect(hitTest(s, sx(0) + 5, 44 + 10)).toEqual({ zone: 'stock' })
    expect(hitTest(s, sx(1) + 5, 44 + 10)).toEqual({ zone: 'waste' })
    expect(hitTest(s, sx(3) + 5, 44 + 10)).toEqual({ zone: 'foundation', index: 1 })
    // 列 2 的顶牌。
    const col = s.columns[2]!
    expect(hitTest(s, sx(2) + 5, 44 + 10 + 98 + 14 + (col.length - 1) * 26 + 5))
      .toEqual({ zone: 'column', index: 2, cardIndex: col.length - 1 })
    expect(RANKS[1]).toBe('A')
  })
})
