import { describe, expect, it } from 'vitest'
import {
  applyMove, createStartPosition, inCheck, kingsFacing, legalMoves, positionKey,
  positionWith, status, type Move, type Position,
} from '../src/client/games/xiangqi/logic.ts'
import { MATE, chooseMove, createSearch, evaluate } from '../src/client/games/xiangqi/ai.ts'

/**
 * 取某棋子的全部合法着法目标（"r,c" 字符串，排序）。
 * 注意：构造局面时务必在 4 路放一个挡子，避免将帅对脸干扰着法过滤
 * （对脸约束本身在对脸专项测试中单独覆盖）。
 */
function ms(pos: Position, from: [number, number]): string[] {
  return legalMoves(pos)
    .filter(m => m[0] === from[0] && m[1] === from[1])
    .map(m => m[2] + ',' + m[3])
    .sort()
}

function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1
  const moves = legalMoves(pos)
  if (depth === 1) return moves.length
  let n = 0
  for (const m of moves) n += perft(applyMove(pos, m), depth - 1)
  return n
}

describe('xiangqi 走子生成（perft 与各兵种）', () => {
  it('标准开局 perft 与公认值一致（44 / 1920 / 79666）', () => {
    const start = createStartPosition()
    expect(perft(start, 1)).toBe(44)
    expect(perft(start, 2)).toBe(1920)
    expect(perft(start, 3)).toBe(79666)
  })

  it('车：四方向滑行，遇子即止', () => {
    const pos = positionWith([
      [9, 4, 'K'], [0, 4, 'k'], [4, 4, 'p'],
      [5, 2, 'R'],
    ])
    expect(ms(pos, [5, 2])).toEqual([
      '0,2', '1,2', '2,2', '3,2', '4,2', '5,0', '5,1', '5,3', '5,4', '5,5', '5,6', '5,7', '5,8', '6,2', '7,2', '8,2', '9,2',
    ])
  })

  it('马：日字八向；蹩马腿挡住对应两向', () => {
    const base = positionWith([[9, 4, 'K'], [0, 4, 'k'], [6, 4, 'p'], [5, 2, 'H'], [4, 2, 'p']])
    // 竖腿 (4,2) 被黑卒占据：跳向 row 3 的 (3,1)/(3,3) 被蹩。
    expect(ms(base, [5, 2])).toEqual(['4,0', '4,4', '6,0', '6,4', '7,1', '7,3'])
    const leg2 = positionWith([[9, 4, 'K'], [0, 4, 'k'], [6, 4, 'p'], [5, 2, 'H'], [5, 1, 'P']])
    // 横腿 (5,1) 被己方兵占据：左向 (4,0)/(6,0) 被蹩；右向腿 (5,3) 空，(4,4) 仍可跳。
    expect(ms(leg2, [5, 2])).toEqual(['3,1', '3,3', '4,4', '6,4', '7,1', '7,3'])
    const free = positionWith([[9, 4, 'K'], [0, 4, 'k'], [6, 4, 'p'], [5, 2, 'H']])
    // 无蹩腿时八个方向全开（(6,4) 为吃子目标同样合法）。
    expect(ms(free, [5, 2])).toEqual(['3,1', '3,3', '4,0', '4,4', '6,0', '6,4', '7,1', '7,3'])
  })

  it('炮：平移如车；吃子必须恰好隔一个炮架', () => {
    const pos = positionWith([
      [9, 4, 'K'], [0, 4, 'k'], [4, 4, 'p'],
      [7, 7, 'C'], [5, 7, 'P'], [2, 7, 'h'], [1, 7, 'h'],
    ])
    const cannon = ms(pos, [7, 7])
    // 竖向：非吃子到 (6,7)；(5,7) 己方兵为炮架，越过它恰好打掉 (2,7) 马；
    // (1,7) 之前隔着炮架+目标共两个子，打不到。
    expect(cannon).toContain('6,7')
    expect(cannon).toContain('2,7')
    expect(cannon).not.toContain('1,7')
    expect(cannon).not.toContain('5,7')
    expect(cannon).not.toContain('4,7')
    // 横向无阻自由滑行。
    expect(cannon).toContain('7,0')
    expect(cannon).toContain('7,6')
  })

  it('象：田字且塞象眼；相不过河（但可退）', () => {
    const blocked = positionWith([[9, 4, 'K'], [0, 4, 'k'], [6, 4, 'p'], [9, 2, 'E'], [8, 1, 'P']])
    // 眼 (8,1) 被塞：(7,0) 不可达；(7,4) 的眼 (8,3) 空，可达。
    expect(ms(blocked, [9, 2])).toEqual(['7,4'])
    const atRiver = positionWith([[9, 4, 'K'], [0, 4, 'k'], [6, 4, 'p'], [5, 2, 'E']])
    // 象在 (5,2)：向前田字 (3,0)/(3,4) 过河被禁，向后 (7,0)/(7,4) 合法。
    expect(ms(atRiver, [5, 2])).toEqual(['7,0', '7,4'])
  })

  it('士：只在九宫内斜行一格', () => {
    const pos = positionWith([[9, 4, 'K'], [0, 4, 'k'], [6, 4, 'p'], [9, 3, 'A']])
    expect(ms(pos, [9, 3])).toEqual(['8,4'])
    const center = positionWith([[9, 4, 'K'], [0, 4, 'k'], [6, 4, 'p'], [8, 4, 'A']])
    expect(ms(center, [8, 4])).toEqual(['7,3', '7,5', '9,3', '9,5'])
  })

  it('将：只在九宫内直行一格', () => {
    const pos = positionWith([[9, 4, 'K'], [0, 4, 'k'], [6, 4, 'p']])
    expect(ms(pos, [9, 4])).toEqual(['8,4', '9,3', '9,5'])
  })

  it('兵：未过河只前进；过河可横走；永不后退（红黑对称）', () => {
    const before = positionWith([[9, 4, 'K'], [0, 4, 'k'], [6, 4, 'P']])
    expect(ms(before, [6, 4])).toEqual(['5,4'])
    const crossed = positionWith([[9, 4, 'K'], [0, 4, 'k'], [6, 4, 'p'], [4, 2, 'P']])
    expect(ms(crossed, [4, 2])).toEqual(['3,2', '4,1', '4,3'])
    const blackCrossed = positionWith([[9, 4, 'K'], [0, 4, 'k'], [6, 4, 'P'], [5, 2, 'p']], { turn: 'b' })
    expect(ms(blackCrossed, [5, 2])).toEqual(['5,1', '5,3', '6,2'])
    const blackBefore = positionWith([[9, 4, 'K'], [0, 4, 'k'], [6, 4, 'P'], [4, 2, 'p']], { turn: 'b' })
    // 黑卒 row 4 未过河（黑过河为 row >= 5）：只能向前 (5,2)。
    expect(ms(blackBefore, [4, 2])).toEqual(['5,2'])
  })
})

describe('xiangqi 将军与对脸', () => {
  it('车将军', () => {
    const pos = positionWith([[9, 4, 'K'], [0, 4, 'k'], [6, 4, 'r']], { turn: 'r' })
    expect(inCheck(pos)).toBe(true)
  })

  it('炮隔一个炮架将军；无炮架不将军', () => {
    const screened = positionWith([
      [9, 4, 'K'], [0, 4, 'k'], [4, 4, 'p'], [9, 0, 'c'], [9, 2, 'p'],
    ], { turn: 'r' })
    expect(inCheck(screened)).toBe(true)
    const bare = positionWith([[9, 4, 'K'], [0, 4, 'k'], [4, 4, 'p'], [9, 0, 'c']], { turn: 'r' })
    expect(inCheck(bare)).toBe(false)
  })

  it('马将军；蹩腿后不将军', () => {
    // 黑马 (8,6) 攻 (9,4)：马腿 (8,5) 必须为空。
    const pos = positionWith([[9, 4, 'K'], [0, 4, 'k'], [4, 4, 'p'], [8, 6, 'h']], { turn: 'r' })
    expect(inCheck(pos)).toBe(true)
    const legged = positionWith([[9, 4, 'K'], [0, 4, 'k'], [4, 4, 'p'], [8, 6, 'h'], [8, 5, 'P']], { turn: 'r' })
    expect(inCheck(legged)).toBe(false)
  })

  it('将帅对脸：中间的兵不能横移出该列；kingsFacing 检测', () => {
    const pos = positionWith([[9, 4, 'K'], [0, 4, 'k'], [4, 4, 'P']])
    // 过河兵横移 (4,3)/(4,5) 会形成对脸，被合法着法过滤；前进 (3,4) 合法。
    expect(ms(pos, [4, 4])).toEqual(['3,4'])
    const cleared = applyMove(pos, [4, 4, 4, 3])
    expect(kingsFacing(cleared.board)).toBe(true)
    // 对脸后轮到黑方：黑将视作被红帅"飞将"攻击。
    expect(inCheck(cleared)).toBe(true)
    // 黑将不能走 (1,4) 维持对脸；可逃 (0,3)/(0,5)。
    const blackMoves = legalMoves(cleared)
    expect(blackMoves).not.toContainEqual([0, 4, 1, 4])
    expect(blackMoves).toContainEqual([0, 4, 0, 3])
    expect(blackMoves).toContainEqual([0, 4, 0, 5])
  })
})

describe('xiangqi 将死 / 困毙 / 重复', () => {
  /**
   * 一步杀构造：红车 (3,5) 移 (3,4) 沿 4 路将军，双过河兵 (1,3)/(0,6)
   * 封死黑将 (0,4) 全部出路；黑卒 (3,0) 保证红走其他着法时黑有子可动
   * （否则任何红着都因困毙 instant 获胜，无法区分一步杀）。
   */
  const mateInOne = (): Position => positionWith([
    [9, 4, 'K'], [0, 4, 'k'], [3, 5, 'R'], [1, 3, 'P'], [0, 6, 'P'], [3, 0, 'p'],
  ])

  it('构造杀局：车四路将军为将死', () => {
    const pos = mateInOne()
    const m: Move = [3, 5, 3, 4]
    expect(legalMoves(pos)).toContainEqual(m)
    expect(status(applyMove(pos, m))).toEqual({ kind: 'checkmate', winner: 'r' })
  })

  it('困毙：未被将军但无合法着法也判负', () => {
    const pos = positionWith([
      [2, 4, 'k'], [9, 4, 'K'], [3, 5, 'H'], [2, 6, 'P'], [5, 4, 'P'],
    ], { turn: 'b' })
    expect(inCheck(pos)).toBe(false)
    expect(legalMoves(pos)).toHaveLength(0)
    expect(status(pos)).toEqual({ kind: 'stalemate', winner: 'r' })
  })

  it('三次重复局面判和（长将简化的循环检测）', () => {
    const pos = positionWith([[9, 4, 'K'], [0, 4, 'k'], [5, 2, 'R']])
    expect(status(pos, 3)).toEqual({ kind: 'draw-repetition' })
    expect(status(pos, 2)).toEqual({ kind: 'playing' })
    const flipped = positionWith([[9, 4, 'K'], [0, 4, 'k']], { turn: 'b' })
    expect(positionKey(pos)).not.toBe(positionKey(flipped))
  })
})

describe('xiangqi AI', () => {
  const mateInOne = (): Position => positionWith([
    [9, 4, 'K'], [0, 4, 'k'], [3, 5, 'R'], [1, 3, 'P'], [0, 6, 'P'], [3, 0, 'p'],
  ])

  it('深度 2 即可找到一步杀（且是唯一将杀着法）', () => {
    const res = chooseMove(mateInOne(), 2, 80_000, 1)
    expect(res.move).not.toBeNull()
    expect(res.move).toEqual([3, 5, 3, 4])
    expect(status(applyMove(mateInOne(), res.move!))).toEqual({ kind: 'checkmate', winner: 'r' })
  })

  it('分帧步进器得到与同步搜索相同的一步杀结果', () => {
    const stepper = createSearch(mateInOne(), 3, 80_000, 1)
    let steps = 0
    for (;;) {
      const r = stepper.step()
      steps += 1
      if (r.done) {
        expect(r.result.move).toEqual([3, 5, 3, 4])
        break
      }
      expect(steps).toBeLessThan(500)
    }
    const sync = chooseMove(mateInOne(), 3, 80_000, 1)
    expect(sync.move).toEqual([3, 5, 3, 4])
  })

  it('白吃无根车', () => {
    const pos = positionWith([
      [9, 4, 'K'], [0, 4, 'k'], [4, 4, 'p'], [5, 1, 'R'], [5, 7, 'r'],
    ])
    const res = chooseMove(pos, 3, 80_000, 2)
    expect(res.move).toEqual([5, 1, 5, 7])
  })

  it('遵守节点限额且总有着法', () => {
    const res = chooseMove(createStartPosition(), 4, 500, 4)
    expect(res.nodes).toBeLessThanOrEqual(500 + 64)
    expect(res.move).not.toBeNull()
  })

  it('同种子确定性选步', () => {
    const pos = createStartPosition()
    const a = chooseMove(pos, 3, 20_000, 7)
    const b = chooseMove(pos, 3, 20_000, 7)
    expect(a.move).toEqual(b.move)
  })

  it('将杀分值快于慢杀（MATE 基线生效）', () => {
    expect(MATE).toBeGreaterThan(50_000)
  })

  it('评估子力方向正确：红多一车为大正值', () => {
    const even = positionWith([[9, 4, 'K'], [0, 4, 'k']])
    expect(evaluate(even)).toBe(0)
    const up = positionWith([[9, 4, 'K'], [0, 4, 'k'], [5, 5, 'R']])
    expect(evaluate(up)).toBeGreaterThan(900)
  })

  it('AI 自对弈 8 步保持合法且确定', () => {
    const run = (): string[] => {
      let pos = createStartPosition()
      const keys: string[] = []
      for (let i = 0; i < 8; i += 1) {
        const res = chooseMove(pos, 2, 8_000, 0xabcd + i)
        if (res.move === null) break
        pos = applyMove(pos, res.move)
        keys.push(positionKey(pos))
      }
      return keys
    }
    const first = run()
    expect(first).toHaveLength(8)
    expect(run()).toEqual(first)
  }, 30_000)
})
