import { describe, expect, it } from 'vitest'
import {
  CHECKERS, ROUNDS_TO_WIN,
  aiTurn, applyMove, canBearOff, chooseAiTurn, createBackgammon,
  deriveDice, enumerateTurns, hasAnyMove, initialBoard, legalSingleMoves,
  mulberry32, nextRound, pipCount, playerMove, rollFor,
} from '../src/client/games/backgammon/logic.ts'

/** 便捷构造：you/ai 各点棋子数（稀疏写法 {点: 数}），其余清零。 */
function boardOf(youMap: Record<number, number>, aiMap: Record<number, number>) {
  const b = initialBoard()
  b.you = new Array<number>(24).fill(0)
  b.ai = new Array<number>(24).fill(0)
  for (const k of Object.keys(youMap)) b.you[Number(k) - 1] = youMap[Number(k)]!
  for (const k of Object.keys(aiMap)) b.ai[Number(k) - 1] = aiMap[Number(k)]!
  return b
}

describe('backgammon 初始盘与掷骰', () => {
  it('标准初始盘：每方 15 子、位置正确、pip 各 167', () => {
    const b = initialBoard()
    expect(b.you.reduce((x, y) => x + y, 0)).toBe(CHECKERS)
    expect(b.ai.reduce((x, y) => x + y, 0)).toBe(CHECKERS)
    expect(b.you[23]).toBe(2)
    expect(b.you[12]).toBe(5)
    expect(b.you[7]).toBe(3)
    expect(b.you[5]).toBe(5)
    expect(b.ai[0]).toBe(2)
    expect(b.ai[11]).toBe(5)
    expect(b.ai[16]).toBe(3)
    expect(b.ai[18]).toBe(5)
    expect(pipCount(b, 'you')).toBe(167)
    expect(pipCount(b, 'ai')).toBe(167)
  })

  it('deriveDice 同状态确定、面值 1..6、掷骰计数器推进覆盖多种骰面', () => {
    const s = createBackgammon(777)
    const d1 = deriveDice(s)
    expect(deriveDice(s)).toEqual(d1)
    for (const v of d1) {
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
    }
    const seen = new Set<string>()
    for (let i = 0; i < 40; i += 1) {
      s.rollNo = i
      const d = deriveDice(s)
      seen.add(d[0]! + '-' + d[1]!)
    }
    expect(seen.size).toBeGreaterThan(5)
  })

  it('mulberry32 同种子序列一致、不同种子不同', () => {
    const a = mulberry32(5)
    const b = mulberry32(5)
    for (let i = 0; i < 10; i += 1) expect(a()).toBe(b())
    expect(mulberry32(6)()).not.toBe(mulberry32(5)())
  })
})

describe('backgammon 单步走法', () => {
  it('常规行进与阻挡：对方 2+ 子占据的目标点不可入', () => {
    const b = initialBoard()
    // you 掷 5：24→19 被 ai 的 19 点 5 子挡、6→1 被 ai 的 1 点 2 子挡；
    // 13→8、8→3 可走。
    const fives = legalSingleMoves(b, 'you', 5)
    expect(fives.map(m => m.from).sort((x, y) => x - y)).toEqual([8, 13])
    // you 掷 1：24→23 可走；13→12 被 ai 12 点挡住。
    const ones = legalSingleMoves(b, 'you', 1)
    expect(ones.map(m => m.from).sort((x, y) => x - y)).toEqual([6, 8, 24])
    // ai 掷 3：1→4、12→15、17→20、19→22 均可走。
    const threes = legalSingleMoves(b, 'ai', 3)
    expect(threes.map(m => m.from).sort((x, y) => x - y)).toEqual([1, 12, 17, 19])
  })

  it('中栏优先：上栏时只生成入场步，入场点被挡则该骰作废', () => {
    const b = boardOf({ 6: 14 }, { 19: 3, 20: 2 })
    b.barYou = 1
    // 掷 6 入 19 点被 3 枚 ai 子挡住；掷 5 入 20 点被 2 枚挡住 → 均无步。
    expect(legalSingleMoves(b, 'you', 6)).toEqual([])
    expect(legalSingleMoves(b, 'you', 5)).toEqual([])
    // 掷 4 入 21 点为空点，可入场且不打吃。
    expect(legalSingleMoves(b, 'you', 4)).toEqual([{ die: 4, from: 0, to: 21, hit: false }])
    // 家里的 6 点纵有 14 子也不生成普通步（中栏优先）。
    expect(legalSingleMoves(b, 'you', 3)).toEqual([{ die: 3, from: 0, to: 22, hit: false }])
  })

  it('打吃与上栏：落在对方单子上，对方子上栏、己方占据该点', () => {
    const b = boardOf({ 8: 3 }, { 5: 1, 6: 4 })
    const hitMove = legalSingleMoves(b, 'you', 3).find(m => m.to === 5)
    expect(hitMove).toBeDefined()
    expect(hitMove!.hit).toBe(true)
    applyMove(b, 'you', hitMove!)
    expect(b.you[4]).toBe(1)
    expect(b.ai[4]).toBe(0)
    expect(b.barAi).toBe(1)
    // 对方单子点换成双子后既不打吃也不可入。
    const b2 = boardOf({ 8: 3 }, { 5: 2 })
    expect(legalSingleMoves(b2, 'you', 3).find(m => m.to === 5)).toBeUndefined()
  })

  it('bear off 资格与恰好/超出规则（you 与 ai 双向）', () => {
    // you 全部在内区：1 点 2、2 点 2、4 点 1、6 点 10。
    const b = boardOf({ 1: 2, 2: 2, 4: 1, 6: 10 }, {})
    expect(canBearOff(b, 'you')).toBe(true)
    // 掷 1：1 点恰好出；也允许 2→1、4→3、6→5 的普通步。
    const ones = legalSingleMoves(b, 'you', 1).map(m => m.from + '>' + m.to)
    expect(ones).toContain('1>0')
    expect(ones).toContain('2>1')
    // 掷 4：4 点恰好出；6 点不可超出移出（4 点身后仍有 5、6 点子）。
    const fours = legalSingleMoves(b, 'you', 4).map(m => m.from + '>' + m.to)
    expect(fours).toContain('4>0')
    expect(fours).not.toContain('6>0')
    // 掷 6：只有 6 点恰好出（其余点身后均有子，不可超出）。
    expect(legalSingleMoves(b, 'you', 6).map(m => m.from + '>' + m.to)).toEqual(['6>0'])
    // 超出合法：更高点清空后，掷 5 可从 2 点超出移出。
    const b3 = boardOf({ 1: 3, 2: 12 }, {})
    expect(legalSingleMoves(b3, 'you', 5).map(m => m.from + '>' + m.to)).toContain('2>0')
    // 未全入内区：无 bear off 资格、不生成出局步。
    const b4 = boardOf({ 1: 2, 2: 2, 4: 1, 6: 9, 9: 1 }, {})
    expect(canBearOff(b4, 'you')).toBe(false)
    expect(legalSingleMoves(b4, 'you', 1).some(m => m.to === 0)).toBe(false)
    // ai 方向镜像：家门 24 点。22 点距出口 3，掷 3 恰好出。
    const ai = boardOf({}, { 22: 15 })
    expect(canBearOff(ai, 'ai')).toBe(true)
    expect(legalSingleMoves(ai, 'ai', 3).map(m => m.from + '>' + m.to)).toContain('22>0')
    // 19 点距出口 6，掷 6 恰好出且是唯一出局步。
    const aiB = boardOf({}, { 19: 15 })
    expect(legalSingleMoves(aiB, 'ai', 6).map(m => m.from + '>' + m.to)).toEqual(['19>0'])
    // ai 超出：更低点清空后掷 6 可从 20 点（距 5）超出移出。
    const ai2 = boardOf({}, { 20: 15 })
    expect(legalSingleMoves(ai2, 'ai', 6).map(m => m.from + '>' + m.to)).toContain('20>0')
    // 但 19 点还有子（更远离出口）时，20 点不可超出移出。
    const ai3 = boardOf({}, { 19: 1, 20: 14 })
    expect(legalSingleMoves(ai3, 'ai', 6).map(m => m.from + '>' + m.to)).not.toContain('20>0')
  })
})

describe('backgammon 整回合枚举', () => {
  it('非对子拆分：两种用骰顺序可达时枚举出两步序列', () => {
    const b = initialBoard()
    const turns = enumerateTurns(b, 'you', [3, 1])
    expect(turns.length).toBeGreaterThan(0)
    for (const t of turns) expect(t.length).toBe(2)
    // 先 1 后 3（24→23→20）与先 3 后 1（24→21→20）都在候选里。
    const keys = turns.map(t => t.map(m => m.from + '>' + m.to).join('|'))
    expect(keys).toContain('24>23|23>20')
    expect(keys).toContain('24>21|21>20')
  })

  it('只能用到一骰时须用较大骰面', () => {
    // you 8/7 点各 1 子；ai 双子挡住骰 2 的落点 6 与 5 → 只能走骰 6，
    // 且走完后（8→2 或 7→1）骰 2 皆无步（另一子仍在内区外）。
    const b = boardOf({ 8: 1, 7: 1 }, { 6: 2, 5: 2 })
    const turns = enumerateTurns(b, 'you', [6, 2])
    expect(turns).toHaveLength(2)
    for (const t2 of turns) {
      expect(t2).toHaveLength(1)
      expect(t2[0]!.die).toBe(6)
    }
    expect(turns.map(t2 => t2[0]!.from + '>' + t2[0]!.to).sort()).toEqual(['7>1', '8>2'])
    // 单子版：骰 2 落点被挡、落定 1 点也被堵 → 只剩较大骰 5 一步。
    const b2 = boardOf({ 8: 1 }, { 6: 2, 1: 2 })
    expect(enumerateTurns(b2, 'you', [2, 5])).toEqual([[{ die: 5, from: 8, to: 3, hit: false }]])
  })

  it('对子可连走四步；完全被锁死时枚举为空', () => {
    // 掷 [2,2]：3/4/5/6 点各子均可连走，极大用法为四步。
    const b = boardOf({ 3: 3, 4: 4, 5: 4, 6: 4 }, {})
    const turns = enumerateTurns(b, 'you', [2, 2])
    expect(turns.length).toBeGreaterThan(0)
    for (const t of turns) expect(t.length).toBe(4)
    // 单子连走：6→5→4→3→2 四步。
    const b2 = boardOf({ 6: 1 }, {})
    for (const t of enumerateTurns(b2, 'you', [1, 1])) expect(t.length).toBe(4)
    // 锁死：you 全困 7 点（内区外，无 bear off 资格），ai 全堵 1-6 点。
    const b3 = boardOf({ 7: 15 }, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 })
    expect(enumerateTurns(b3, 'you', [6, 5])).toEqual([])
    expect(hasAnyMove(b3, 'you', [6, 5])).toBe(false)
  })
})

describe('backgammon 对局流程', () => {
  it('rollFor 无步可动自动跳过回合；playerMove 落子合法且守恒', () => {
    const s = createBackgammon(2024)
    // 你先掷但被锁死（7 点全困、1-6 点被堵）：掷出后必然跳过，
    // 回合交给 ai、阶段回到 roll。
    s.board = boardOf({ 7: 15 }, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 })
    let guard = 0
    while (s.phase === 'roll' && s.turn === 'you' && guard < 10) {
      rollFor(s)
      guard += 1
    }
    expect(s.turn).toBe('ai')
    expect(s.phase).toBe('roll')
    expect(s.message).toContain('无子可动')
    // 正常走子：清场后你掷骰走一步，棋子总数守恒、非法落点被拒。
    s.board = boardOf({ 6: 15 }, {})
    s.turn = 'you'
    s.phase = 'roll'
    expect(rollFor(s)).toBeTruthy()
    expect(s.phase).toBe('move')
    const move = legalSingleMoves(s.board, 'you', s.remaining[0]!)[0]!
    expect(playerMove(s, move.from, move.to)).toBe(true)
    expect(s.board.you.reduce((x, y) => x + y, 0) + s.board.barYou + s.board.offYou).toBe(CHECKERS)
    expect(playerMove(s, 24, 1)).toBe(false)
  })

  it('全部移出即胜该局；连胜两局夺整场（3 局 2 胜）', () => {
    const s = createBackgammon(42)
    // 第一局：你 14 子已出、1 子在 1 点，任意骰面都可超出移出获胜。
    s.board = boardOf({ 1: 1 }, {})
    s.board.offYou = 14
    s.turn = 'you'
    s.phase = 'roll'
    let guard = 0
    while ((s.phase as string) !== 'roundOver' && guard < 8) {
      rollFor(s)
      if ((s.phase as string) === 'move') {
        if (!playerMove(s, 1, 0)) break
      }
      guard += 1
    }
    expect(s.roundWinner).toBe('you')
    expect(s.roundWinsYou).toBe(1)
    expect(s.phase).toBe('roundOver')
    // 第二局：先手轮换到 ai；构造同样局面再胜 → 整场结束。
    nextRound(s)
    expect(s.round).toBe(2)
    expect(s.turn).toBe('ai')
    s.board = boardOf({ 1: 1 }, {})
    s.board.offYou = 14
    s.turn = 'you'
    s.phase = 'roll'
    guard = 0
    while ((s.phase as string) !== 'matchOver' && guard < 8) {
      rollFor(s)
      if ((s.phase as string) === 'move') {
        if (!playerMove(s, 1, 0)) break
      }
      guard += 1
    }
    expect(s.phase).toBe('matchOver')
    expect(s.matchWinner).toBe('you')
    expect(s.roundWinsYou).toBe(ROUNDS_TO_WIN)
  })

  it('AI 决策确定性：同盘同骰同种子必同选，且选择恒在合法候选内', () => {
    const b = initialBoard()
    const a = chooseAiTurn(b, 'ai', [3, 2], 99)
    expect(a).toEqual(chooseAiTurn(b, 'ai', [3, 2], 99))
    expect(a.length).toBe(2)
    const legal = enumerateTurns(b, 'ai', [3, 2]).map(t => t.map(m => m.from + '>' + m.to).join('|'))
    expect(legal).toContain(a.map(m => m.from + '>' + m.to).join('|'))
    // 打吃优先的直观性：ai 能打吃时选择包含打吃步。
    const b2 = boardOf({ 5: 1, 7: 3 }, { 3: 5, 22: 10 })
    expect(chooseAiTurn(b2, 'ai', [2, 2], 7).some(m => m.hit)).toBe(true)
    // 不同种子决策可变但都合法；aiTurn 就地执行后回合交还。
    for (const seed of [1, 2, 3, 4, 5]) {
      const m = chooseAiTurn(b, 'ai', [6, 4], seed)
      const keys = enumerateTurns(b, 'ai', [6, 4]).map(t => t.map(x => x.from + '>' + x.to).join('|'))
      expect(keys).toContain(m.map(x => x.from + '>' + x.to).join('|'))
    }
  })

  it('整局 seed 重放：双 AI 执子的完整对局两次模拟逐位一致', () => {
    const play = (seed: number) => {
      const s = createBackgammon(seed)
      let guard = 0
      while ((s.phase === 'roll' || s.phase === 'move') && guard < 600) {
        if (s.phase === 'roll') {
          rollFor(s)
        } else if (s.turn === 'ai') {
          aiTurn(s)
        } else {
          // 玩家侧也用贪心决策（换噪声种子）保证确定性。
          const moves = chooseAiTurn(s.board, 'you', s.dice!, (seed ^ 0x5f356495) >>> 0)
          for (const m of moves) {
            applyMove(s.board, 'you', m)
            s.turnMoves.push(m)
          }
          if (s.board.offYou >= CHECKERS) {
            s.roundWinsYou += 1
            s.roundWinner = 'you'
            s.phase = s.roundWinsYou >= ROUNDS_TO_WIN ? 'matchOver' : 'roundOver'
            s.matchWinner = s.phase === 'matchOver' ? 'you' : null
            break
          }
          s.turnMoves = []
          s.turn = 'ai'
          s.phase = 'roll'
        }
        guard += 1
      }
      return {
        offYou: s.board.offYou,
        offAi: s.board.offAi,
        barYou: s.board.barYou,
        you: [...s.board.you],
        ai: [...s.board.ai],
        wins: s.roundWinsYou + ':' + s.roundWinsAi,
        phase: s.phase,
      }
    }
    const first = play(31337)
    const second = play(31337)
    expect(second).toEqual(first)
    expect(first.offYou + first.offAi).toBeGreaterThan(0)
    expect(first.phase === 'roundOver' || first.phase === 'matchOver').toBe(true)
    const third = play(999)
    expect(third.phase === 'roundOver' || third.phase === 'matchOver').toBe(true)
  })
})
