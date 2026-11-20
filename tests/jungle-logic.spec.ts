import { describe, expect, it } from 'vitest'
import {
  canCapture, createStartPosition, legalMoves, applyMove, status,
  denWinner, denInDanger, positionWith, idx, positionKey,
} from '../src/client/games/jungle/logic.ts'
import { chooseMove, mulberry32 } from '../src/client/games/jungle/ai.ts'

describe('jungle logic', () => {
  it('initial placement: red moves first, 8 beasts per side, dens empty, mirrored rats', () => {
    const pos = createStartPosition()
    expect(pos.turn).toBe('r')
    let red = 0
    let black = 0
    for (const p of pos.board) {
      if (p === '') continue
      if (p === p.toUpperCase()) red += 1
      else black += 1
    }
    expect(red).toBe(8)
    expect(black).toBe(8)
    // 抽查关键位：黑狮左上角、黑鼠河边、红象左下、红鼠河边（中心对称）。
    expect(pos.board[idx(0, 0)]).toBe('l')
    expect(pos.board[idx(2, 0)]).toBe('m')
    expect(pos.board[idx(6, 0)]).toBe('E')
    expect(pos.board[idx(6, 6)]).toBe('M')
    // 两个兽穴开局为空。
    expect(pos.board[idx(0, 3)]).toBe('')
    expect(pos.board[idx(8, 3)]).toBe('')
  })

  it('canCapture: rank order, equal ranks, and the rat/elephant exception both ways', () => {
    expect(canCapture('L', 'w', false, true, false)).toBe(true)
    expect(canCapture('w', 'L', false, true, false)).toBe(false)
    expect(canCapture('C', 'c', false, true, false)).toBe(true)
    expect(canCapture('M', 'e', false, true, false)).toBe(true)
    expect(canCapture('E', 'm', false, true, false)).toBe(false)
    expect(canCapture('m', 'E', false, true, false)).toBe(true)
    expect(canCapture('e', 'M', false, true, false)).toBe(false)
  })

  it('a defender standing in the attacker-side trap can be captured by anything', () => {
    // 黑象站在红方陷阱 (7,3)，红鼠 (6,3) 可吃。
    const pos = positionWith([[7, 3, 'e'], [6, 3, 'M']])
    expect(legalMoves(pos)).toContainEqual([6, 3, 7, 3])
    // 同一头黑象站在己方陷阱 (1,3)（己方陷阱无效力），红猫不可吃。
    const own = positionWith([[1, 3, 'e'], [2, 3, 'C']])
    expect(legalMoves(own)).not.toContainEqual([2, 3, 1, 3])
    // 陷阱归零对任何攻子生效：红狼也能吃陷阱里的黑象。
    const any = positionWith([[7, 3, 'e'], [6, 3, 'W']])
    expect(legalMoves(any)).toContainEqual([6, 3, 7, 3])
  })

  it('orthogonal moves: only the rat enters water; no move enters the own den', () => {
    // 狼 (6,1) 与象 (6,2) 不可入水；鼠可以入水；猫不可进己方兽穴。
    const pos = positionWith([[6, 1, 'W'], [6, 2, 'E'], [7, 3, 'C']])
    const moves = legalMoves(pos)
    expect(moves).not.toContainEqual([6, 1, 5, 1])
    expect(moves).not.toContainEqual([6, 2, 5, 2])
    expect(moves).not.toContainEqual([7, 3, 8, 3])
    expect(moves).toContainEqual([6, 1, 6, 0])
    const rat = positionWith([[6, 1, 'M']])
    expect(legalMoves(rat)).toContainEqual([6, 1, 5, 1])
    // 开局着法全部在盘内且起终点不同（正交一格或合法跳河）。
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
    // 狮 (2,1) 纵向跳过 rows 3-5 col 1 落到 (6,1)；虎 (3,0) 横跳到 (3,3)。
    const lion = positionWith([[2, 1, 'L']])
    expect(legalMoves(lion)).toContainEqual([2, 1, 6, 1])
    const tiger = positionWith([[3, 0, 'T']])
    expect(legalMoves(tiger)).toContainEqual([3, 0, 3, 3])
    // 黑鼠 (4,1) 在水中截断纵跳。
    const blocked = positionWith([[2, 1, 'L'], [4, 1, 'm']])
    expect(legalMoves(blocked)).not.toContainEqual([2, 1, 6, 1])
    // 跳河落点有可吃子照吃；落点为不可吃的大子时不可跳。
    const eatJump = positionWith([[2, 1, 'L'], [6, 1, 'w']])
    expect(legalMoves(eatJump)).toContainEqual([2, 1, 6, 1])
    const noEat = positionWith([[2, 1, 'L'], [6, 1, 'e']])
    expect(legalMoves(noEat)).not.toContainEqual([2, 1, 6, 1])
  })

  it('a water rat cannot capture a land piece but can fight in the water', () => {
    const land = positionWith([[4, 1, 'M'], [4, 0, 'e']])
    expect(legalMoves(land)).not.toContainEqual([4, 1, 4, 0])
    const water = positionWith([[4, 1, 'M'], [3, 1, 'm']])
    expect(legalMoves(water)).toContainEqual([4, 1, 3, 1])
  })

  it('occupying the enemy den wins; applyMove is pure and flips the turn', () => {
    const pos = positionWith([[1, 3, 'L']])
    const before = positionKey(pos)
    const after = applyMove(pos, [1, 3, 0, 3])
    expect(after.board[idx(0, 3)]).toBe('L')
    expect(denWinner(after.board)).toBe('r')
    expect(status(after)).toEqual({ kind: 'den', winner: 'r' })
    expect(after.turn).toBe('b')
    expect(positionKey(pos)).toBe(before)
    expect(positionKey(after)).not.toBe(before)
    expect(after.board[idx(1, 3)]).toBe('')
  })

  it('capture-all and stalemate endings; den danger flag', () => {
    const wipe = positionWith([[0, 0, 'L']])
    expect(status(wipe)).toEqual({ kind: 'capture-all', winner: 'r' })
    // 黑猫被围死且不可入己方兽穴 → 困毙判负。
    const stuck = positionWith([[0, 0, 'c'], [0, 1, 'E'], [1, 0, 'E']], { turn: 'b' })
    expect(status(stuck)).toEqual({ kind: 'stalemate', winner: 'r' })
    expect(denInDanger(positionWith([[7, 3, 'l']]), 'r')).toBe(true)
    expect(denInDanger(positionWith([[7, 3, 'C']]), 'r')).toBe(false)
    expect(denInDanger(createStartPosition(), 'r')).toBe(false)
  })

  it('AI takes the one-move den win and never suggests an illegal move', () => {
    // 黑狮 (7,3) 紧邻红方兽穴：贪心终局分百万级，必然入穴。
    const pos = positionWith([[7, 3, 'l'], [6, 0, 'E']], { turn: 'b' })
    const m = chooseMove(pos, 1, 123)
    expect(m).toEqual([7, 3, 8, 3])
    const start = createStartPosition()
    for (const diff of [1, 2, 3]) {
      const mv = chooseMove(start, diff, 7 + diff)!
      expect(legalMoves(start)).toContainEqual(mv)
    }
  })

  it('AI and mulberry32 are deterministic for identical inputs', () => {
    const pos = createStartPosition()
    const a = chooseMove(pos, 2, 42)
    const b = chooseMove(pos, 2, 42)
    expect(b).toEqual(a)
    expect(chooseMove(pos, 2, 43)).toBeDefined()
    const rng1 = mulberry32(42)
    const rng2 = mulberry32(42)
    expect([rng1(), rng1(), rng1()]).toEqual([rng2(), rng2(), rng2()])
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })

  it('full-game replay: deterministic sequence and a den victory for red', () => {
    const play = (): { keys: string[]; end: ReturnType<typeof status> } => {
      // 稀疏局：红狮已突入黑方陷阱 (1,3)（离黑穴一步，陷阱只降等级
      // 不禁入穴），黑象远在左下；双方均用固定种子的一层贪心走子，
      // 红狮终局入穴分百万级必胜，整局数步内确定结束。
      let pos = positionWith([[1, 3, 'L'], [6, 0, 'e']])
      const keys: string[] = [positionKey(pos)]
      let ply = 0
      let st = status(pos)
      while (st.kind === 'playing' && ply < 40) {
        const seed = pos.turn === 'r' ? 1000 + ply : 2000 + ply * 7
        const m = chooseMove(pos, 1, seed)!
        pos = applyMove(pos, m)
        keys.push(positionKey(pos))
        ply += 1
        st = status(pos)
      }
      return { keys, end: st }
    }
    const first = play()
    const second = play()
    expect(first.end).toEqual({ kind: 'den', winner: 'r' })
    expect(first.keys.length).toBeLessThan(15)
    expect(second).toEqual(first)
  })
})
