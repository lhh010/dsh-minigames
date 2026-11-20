import { describe, expect, it } from 'vitest'
import {
  ADJ, CAMP_BOTTOM_IDS, CAMP_FLAG, CAMP_TOP_IDS, CELLS, PIECES_PER_SIDE,
  ROUNDS_TO_WIN, aiChooseMove, applyMove, cellId, chooseGreedyMove,
  countInTargetCamp,
  createCheckersHop, distSum, emptyBoard, hasAnyMove, initialBoard,
  isLocked, jumpTargets, legalTargets, mulberry32, nextRound, playerMove,
  stepsFor,
  type CheckersHopState,
} from '../src/client/games/checkershop/logic.ts'

describe('checkershop 盘面结构', () => {
  it('81 格 = 中央六角 61 + 两营区各 10；cellId 与 CELLS 一一对应', () => {
    expect(CELLS.length).toBe(81)
    expect(CAMP_TOP_IDS.length).toBe(10)
    expect(CAMP_BOTTOM_IDS.length).toBe(10)
    let hexCount = 0
    for (let i = 0; i < CELLS.length; i += 1) {
      if (CAMP_FLAG[i] === 0) hexCount += 1
    }
    expect(hexCount).toBe(61)
    for (let i = 0; i < CELLS.length; i += 1) {
      expect(cellId(CELLS[i]!.q, CELLS[i]!.r)).toBe(i)
    }
    expect(cellId(9, 9)).toBe(-1)
    expect(cellId(0, -9)).toBe(-1)
  })

  it('邻接表对称、无自环、方向数合法（角点 2、内部最多 6）', () => {
    expect(ADJ.length).toBe(81)
    for (let i = 0; i < CELLS.length; i += 1) {
      const ns = ADJ[i]!
      expect(new Set(ns).size).toBe(ns.length)
      expect(ns.includes(i)).toBe(false)
      expect(ns.length).toBeGreaterThanOrEqual(2)
      expect(ns.length).toBeLessThanOrEqual(6)
      for (const nb of ns) expect(ADJ[nb]!).toContain(i)
    }
    // 六角区中心有 6 个邻居，营区尖角（距中心最远端）只有 2 个。
    expect(ADJ[cellId(0, 0)]!.length).toBe(6)
    expect(ADJ[cellId(4, -8)]!.length).toBe(2)
    expect(ADJ[cellId(-4, 8)]!.length).toBe(2)
  })
})

describe('checkershop 随机与初始局面', () => {
  it('mulberry32 同种子序列一致、异种子不同', () => {
    const a1 = mulberry32(42)
    const a2 = mulberry32(42)
    const b = mulberry32(43)
    const s1 = Array.from({ length: 12 }, () => a1())
    const s2 = Array.from({ length: 12 }, () => a2())
    const s3 = Array.from({ length: 12 }, () => b())
    expect(s1).toEqual(s2)
    expect(s1).not.toEqual(s3)
    for (const v of s1) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('初始局面：各 10 子居己方营区、你先行、无人入对岸、双方都有棋走', () => {
    const s = createCheckersHop(7)
    expect(s.board.reduce((n, v) => n + (v === 1 ? 1 : 0), 0)).toBe(PIECES_PER_SIDE)
    expect(s.board.reduce((n, v) => n + (v === 2 ? 1 : 0), 0)).toBe(PIECES_PER_SIDE)
    for (const id of CAMP_BOTTOM_IDS) expect(s.board[id]).toBe(1)
    for (const id of CAMP_TOP_IDS) expect(s.board[id]).toBe(2)
    expect(s.turn).toBe('you')
    expect(s.phase).toBe('play')
    expect(countInTargetCamp(s.board, 'you')).toBe(0)
    expect(countInTargetCamp(s.board, 'ai')).toBe(0)
    expect(hasAnyMove(s.board, 'you')).toBe(true)
    expect(hasAnyMove(s.board, 'ai')).toBe(true)
    // 双方到各自目标的距离和相等（盘面中心对称）。
    expect(distSum(s.board, 'you')).toBe(distSum(s.board, 'ai'))
    expect(distSum(s.board, 'you')).toBeGreaterThan(0)
  })
})

describe('checkershop 走法生成', () => {
  it('一步走：空盘上中央格恰好 6 个相邻空位；被占则排除', () => {
    const b = emptyBoard()
    const c = cellId(0, 0)
    expect(stepsFor(b, c).length).toBe(6)
    b[cellId(1, 0)]! = 2
    expect(stepsFor(b, c).length).toBe(5)
    expect(stepsFor(b, c)).not.toContain(cellId(1, 0))
  })

  it('跳与链跳：跳过敌我皆可，每个中间落点都可停', () => {
    const b = emptyBoard()
    const start = cellId(0, 0)
    const mid1 = cellId(1, 0)
    const land1 = cellId(2, 0)
    const mid2 = cellId(3, 0)
    const land2 = cellId(4, 0)
    b[start] = 1
    b[mid1] = 2   // 敌子可跳
    b[mid2] = 1   // 己子也可跳
    const js = jumpTargets(b, start)
    // 第一跳落点（可中途停）与链跳第二落点都在可达集。
    expect(js).toContain(land1)
    expect(js).toContain(land2)
    // 起点邻格其余方向空，不应有别的跳点。
    expect(js.length).toBe(2)
    // 合法落点 = 一步走 + 跳点。
    const all = legalTargets(b, start)
    for (const t of [...stepsFor(b, start), ...js]) expect(all).toContain(t)
    expect(all.length).toBe(stepsFor(b, start).length + 2)
  })

  it('营区锁定：进入目标营区的子不能出营、营区内仍可动；未锁定不受限', () => {
    const b = emptyBoard()
    const lockedCell = cellId(2, -5)   // 你的目标（上）营区格
    const inCampNbr = cellId(3, -5)    // 营区内邻居
    const outNbr = cellId(2, -4)       // 营区外（中央区）邻居
    b[lockedCell] = 1
    expect(isLocked(b, lockedCell)).toBe(true)
    const ts = legalTargets(b, lockedCell)
    expect(ts).toContain(inCampNbr)
    expect(ts.every(t => CAMP_TOP_IDS.includes(t))).toBe(true)
    expect(ts).not.toContain(outNbr)
    // 锁定子仍可从营内起跳（跳点也不出营）。
    b[cellId(3, -5)] = 2
    b[cellId(4, -5)] = 0
    const ts2 = legalTargets(b, lockedCell)
    expect(ts2.every(t => CAMP_TOP_IDS.includes(t))).toBe(true)
    // 未锁定（中央区）的子落点可进出任意区域。
    b[cellId(0, 0)] = 1
    expect(isLocked(b, cellId(0, 0))).toBe(false)
    for (const t of legalTargets(b, cellId(0, 0))) {
      expect(CAMP_TOP_IDS.includes(t) || CAMP_BOTTOM_IDS.includes(t) || CAMP_FLAG[t] === 0).toBe(true)
    }
  })
})

describe('checkershop 走子结算与胜负', () => {
  it('applyMove 拒绝非法落点；playerMove 拒绝非己子/非法目标；合法走后换手', () => {
    const s = createCheckersHop(9)
    const from = cellId(-4, 5)
    const legal = legalTargets(s.board, from)
    expect(legal.length).toBeGreaterThan(0)
    expect(() => applyMove(s, from, cellId(0, 0))).toThrow(/illegal move/)
    expect(playerMove(s, cellId(4, -5), legal[0]!)).toBe(false)  // AI 的子
    expect(playerMove(s, from, cellId(0, 0))).toBe(false)        // 非法目标
    expect(playerMove(s, from, legal[0]!)).toBe(true)
    expect(s.turn).toBe('ai')
    expect(s.moveNo).toBe(1)
  })

  it('一步向目标走距离和减 1；第 10 子入营判胜、nextRound 重置并轮换先行', () => {
    const s = createCheckersHop(11)
    const b = s.board
    // 摆到差一步：9 子已在上营区，最后一子在 (0,-4) 紧邻空营格 (1,-5)。
    for (const id of CAMP_TOP_IDS) b[id] = 0
    for (const id of CAMP_BOTTOM_IDS) b[id] = 2
    const nine = CAMP_TOP_IDS.filter(id => id !== cellId(1, -5))
    expect(nine.length).toBe(9)
    for (const id of nine) b[id] = 1
    const last = cellId(0, -4)
    b[last] = 1
    s.turn = 'you'
    expect(countInTargetCamp(b, 'you')).toBe(9)
    const dBefore = distSum(b, 'you')
    expect(playerMove(s, last, cellId(1, -5))).toBe(true)
    expect(distSum(b, 'you')).toBe(dBefore - 1)
    expect(s.phase).toBe('roundEnd')
    expect(s.roundWinner).toBe('you')
    expect(s.roundWinsYou).toBe(1)
    expect(countInTargetCamp(b, 'you')).toBe(PIECES_PER_SIDE)
    nextRound(s)
    expect(s.phase).toBe('play')
    expect(s.roundNo).toBe(2)
    expect(s.turn).toBe('ai')
    expect(countInTargetCamp(s.board, 'you')).toBe(0)
    expect(s.board.reduce((n, v) => n + (v === 1 ? 1 : 0), 0)).toBe(PIECES_PER_SIDE)
  })

  it('两连胜直接 matchEnd 且整场胜者正确', () => {
    const s = createCheckersHop(13)
    s.roundWinsYou = ROUNDS_TO_WIN - 1
    const b = s.board
    for (const id of CAMP_TOP_IDS) b[id] = 0
    for (const id of CAMP_BOTTOM_IDS) b[id] = 2
    for (const id of CAMP_TOP_IDS) b[id] = 0
    const nine = CAMP_TOP_IDS.filter(id => id !== cellId(2, -5))
    for (const id of nine) b[id] = 1
    const last = cellId(2, -4)
    b[last] = 1
    // 差一步：最后一子走进上营区空格即两连胜收官。
    s.turn = 'you'
    expect(playerMove(s, last, cellId(2, -5))).toBe(true)
    expect(s.phase).toBe('matchEnd')
    expect(s.matchWinner).toBe('you')
    expect(s.roundWinsYou).toBe(ROUNDS_TO_WIN)
  })
})

describe('checkershop AI 与重放', () => {
  it('AI 确定性：同种子同选法、走后距离和不升；锁定子不被 AI 移出营', () => {
    const mk = (): CheckersHopState => {
      const s = createCheckersHop(2024)
      s.turn = 'ai'
      return s
    }
    const m1 = aiChooseMove(mk())
    const m2 = aiChooseMove(mk())
    expect(m1).toEqual(m2)
    const s = mk()
    const before = distSum(s.board, 'ai')
    const mv = aiChooseMove(s)!
    expect(mv).not.toBeNull()
    const b = s.board
    b[mv.from] = 0
    b[mv.to] = 2
    expect(distSum(b, 'ai')).toBeLessThanOrEqual(before)
    // 锁定约束：营区内 AI 子的一切落点仍在营内。
    const b2 = emptyBoard()
    const aiLocked = cellId(-1, 5)
    b2[aiLocked] = 2
    for (const t of legalTargets(b2, aiLocked)) {
      expect(CAMP_BOTTOM_IDS.includes(t)).toBe(true)
    }
  })

  it('整场重放：双方贪心自弈，同种子两次哈希完全一致', () => {
    const autoplay = (seed: number): string => {
      const s = createCheckersHop(seed)
      let moves = 0
      while (s.phase !== 'matchEnd' && moves < 3000) {
        if (s.phase === 'roundEnd') {
          nextRound(s)
          continue
        }
        const side = s.turn
        const mv = chooseGreedyMove(s, side)
        if (mv === null) {
          // 该方无棋可走：跳手一次；双方都卡死则跳出（哈希仍确定性）。
          s.turn = side === 'you' ? 'ai' : 'you'
          if (chooseGreedyMove(s, s.turn) === null) break
          continue
        }
        applyMove(s, mv.from, mv.to)
        moves += 1
      }
      return [s.phase, s.roundWinsYou, s.roundWinsAi, s.roundNo, s.moveNo, s.board.join('')].join('|')
    }
    const h1 = autoplay(31337)
    const h2 = autoplay(31337)
    expect(h1).toBe(h2)
    expect(h1.startsWith('matchEnd')).toBe(true)
  })
})
