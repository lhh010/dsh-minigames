import { describe, expect, it } from 'vitest'
import {
  AI_BLUFF_CHANCE, AI_CHALLENGE_THRESHOLDS, ROUNDS_TO_WIN, START_DICE,
  aiDecide, aiRoll, binomialAtLeast, bidCredibility, challengeProbability, countFace,
  createLiarDice, deserializeState, isLegalRaise, mulberry32, playerBid, playerCallLiar,
  aiTurn, rollDice, serializeState, startNextRound, type LiarDiceState,
} from '../src/client/games/liardice/logic.ts'

/**
 * 布一个可控局面：直接改写双方骰面与当前出价，返回就绪状态。
 * @param seed - 种子。
 * @param yourDice - 己方骰面。
 * @param aiDice - 对方骰面。
 */
function rigState(seed: number, yourDice: number[], aiDice: number[]): LiarDiceState {
  const s = createLiarDice(seed)
  s.yourDice = [...yourDice]
  s.aiDice = [...aiDice]
  s.currentBid = null
  s.bidBy = null
  s.log = []
  s.turn = 'you'
  return s
}

/**
 * 确定性自动打完整场比赛：玩家每口出最低合法抬价（数量 +1 报 2），
 * 数量超全场骰数就喊吹牛；对局结束就开下一局。
 * @param seed - 种子。
 * @returns 打完（matchOver）的状态。
 */
function autoplayMatch(seed: number): LiarDiceState {
  const s = createLiarDice(seed)
  let guard = 0
  while (s.phase !== 'matchOver' && guard < 4000) {
    guard += 1
    if (s.phase === 'roundOver') {
      startNextRound(s)
      continue
    }
    if (s.turn === 'you') {
      const total = s.yourDice.length + s.aiDice.length
      const cur = s.currentBid
      if (cur !== null && cur.count + 1 > total) {
        playerCallLiar(s)
        continue
      }
      const next = cur === null ? { count: 1, face: 4 } : { count: cur.count + 1, face: 2 }
      if (!playerBid(s, next.count, next.face)) {
        playerCallLiar(s)
        continue
      }
    } else {
      aiTurn(s)
    }
  }
  return s
}

describe('liardice logic', () => {
  it('万能 1 计数：1 计入任意非 1 点数，报 1 只按真实 1 计', () => {
    const dice = [1, 1, 3, 5, 6]
    expect(countFace(dice, 3)).toBe(3) // 3 + 两颗万能 1
    expect(countFace(dice, 5)).toBe(3)
    expect(countFace(dice, 6)).toBe(3)
    expect(countFace(dice, 2)).toBe(2) // 只有万能 1
    expect(countFace(dice, 1)).toBe(2) // 报 1：1 不为自身翻倍
    expect(countFace([4, 4, 4], 4)).toBe(3)
  })

  it('出价合法抬升判定：数量更多或同数量更大点数，否则拒绝', () => {
    expect(isLegalRaise(null, { count: 1, face: 1 })).toBe(true)
    expect(isLegalRaise({ count: 2, face: 3 }, { count: 3, face: 2 })).toBe(true) // 数量更多
    expect(isLegalRaise({ count: 2, face: 3 }, { count: 2, face: 4 })).toBe(true) // 同数量更大点数
    expect(isLegalRaise({ count: 2, face: 3 }, { count: 2, face: 3 })).toBe(false) // 原价
    expect(isLegalRaise({ count: 2, face: 3 }, { count: 2, face: 2 })).toBe(false) // 同数小点
    expect(isLegalRaise({ count: 2, face: 3 }, { count: 1, face: 6 })).toBe(false) // 数量更少
    expect(isLegalRaise({ count: 2, face: 3 }, { count: 0, face: 6 })).toBe(false) // 非法数量
    expect(isLegalRaise({ count: 2, face: 3 }, { count: 2, face: 7 })).toBe(false) // 非法点数
  })

  it('玩家出价：合法落子、记日志与概率，非法（未抬高/非本方回合）被拒', () => {
    const s = rigState(11, [2, 2, 4, 5, 6], [3, 3, 3, 4, 4])
    expect(playerBid(s, 2, 3)).toBe(true)
    expect(s.currentBid).toEqual({ count: 2, face: 3 })
    expect(s.turn).toBe('ai')
    expect(s.log).toHaveLength(1)
    expect(s.log[0]).toMatchObject({ kind: 'bid', by: 'you', bluff: false })
    // 玩家视角概率：己方 0 命中，5 颗未知，P(≥2 | p=1/3) = 1 - (2/3)^5 - 5*(1/3)*(2/3)^4
    const expected = 1 - Math.pow(2 / 3, 5) - 5 * (1 / 3) * Math.pow(2 / 3, 4)
    expect((s.log[0] as { prob: number }).prob).toBeCloseTo(expected, 12)
    expect(bidCredibility(s, { count: 2, face: 3 })).toBeCloseTo(expected, 12)
    // 回合已交给对方，再出价被拒。
    expect(playerBid(s, 5, 6)).toBe(false)
    const t = rigState(12, [2, 2, 4, 5, 6], [3, 3, 3, 4, 4])
    expect(playerBid(t, 2, 3)).toBe(true)
    expect(playerBid(t, 2, 3)).toBe(false) // 需在 ai 回合后才轮到玩家，非法
    expect(t.message).toContain('思考') // 出价成功后交棒
  })

  it('开骰裁决：报数成立怀疑方输骰，吹牛被抓出价方输骰（含万能 1）', () => {
    // 吹牛被抓：对方报 5×6，全场只有 4 颗 6 → 对方输 1 颗。
    const bluff = rigState(21, [2, 2, 3, 4, 5], [6, 6, 6, 6, 2])
    bluff.currentBid = { count: 5, face: 6 }
    bluff.bidBy = 'ai'
    expect(playerCallLiar(bluff)).toBe(true)
    expect(bluff.aiDice).toHaveLength(4)
    expect(bluff.yourDice).toHaveLength(5)
    expect(bluff.lastChallenge).toMatchObject({ total: 4, loser: 'ai', wilds: 0 })
    expect(bluff.currentBid).toBeNull()
    expect(bluff.turn).toBe('ai') // 输家先出下一口价
    expect(bluff.phase).toBe('bidding')

    // 报数成立（万能 1 帮腔）：对方报 4×5，你两颗 1 + 对方两颗 5 = 4 ≥ 4 → 怀疑方（你）输。
    const truth = rigState(22, [1, 1, 2, 3, 4], [5, 5, 6, 6, 6])
    truth.currentBid = { count: 4, face: 5 }
    truth.bidBy = 'ai'
    expect(playerCallLiar(truth)).toBe(true)
    expect(truth.yourDice).toHaveLength(4)
    expect(truth.aiDice).toHaveLength(5)
    expect(truth.lastChallenge).toMatchObject({ total: 4, loser: 'you', wilds: 2 })
  })

  it('局流程：骰子输光即输一局，下一局双方重掷 5 颗、先手交替、开骰记录清空', () => {
    // 你 1 颗，对方 2 颗 5：你报必假的 3×5（实际 2），对方概率 1/3 < 阈值 → 开骰抓诈，你输光本局。
    const t = rigState(32, [4], [5, 5])
    expect(playerBid(t, 3, 5)).toBe(true)
    aiTurn(t)
    expect(t.lastChallenge).toMatchObject({ total: 2, loser: 'you', wilds: 0 })
    expect(t.yourDice).toHaveLength(0)
    expect(t.phase).toBe('roundOver')
    expect(t.roundWinsAi).toBe(1)
    expect(t.roundWinsYou).toBe(0)
    expect(t.matchWinner).toBeNull()
    // 开下一局。
    expect(startNextRound(t)).toBe(true)
    expect(t.round).toBe(2)
    expect(t.roundStarter).toBe('ai') // 偶数局对方先手
    expect(t.yourDice).toHaveLength(START_DICE)
    expect(t.aiDice).toHaveLength(START_DICE)
    expect(t.lastChallenge).toBeNull()
    expect(t.currentBid).toBeNull()
    expect(t.phase).toBe('bidding')
    expect(t.turn).toBe('ai')
    expect(startNextRound(t)).toBe(false) // 非局末不可跳局
  })

  it('3 局 2 胜：先取 2 局者夺冠，比分与冠军正确', () => {
    // 必胜脚本：你五颗 6，对方五颗 2。你报 max(3, k+1)×6（k 为对方余骰，
    // 恒为真价但对方视角概率 < 阈值必开骰）→ 对方连输 5 颗输一局；
    // 对方首价 k×2 后你再压。两个脚本步骤间无随机分支。
    const winRound = (s: LiarDiceState): void => {
      s.yourDice = [6, 6, 6, 6, 6]
      s.aiDice = [2, 2, 2, 2, 2]
      s.turn = 'you'
      s.currentBid = null
      s.bidBy = null
      while (s.phase === 'bidding') {
        if (s.turn === 'you') {
          const k = s.aiDice.length
          const c = Math.max(3, k + 1)
          const cur = s.currentBid
          const count = cur === null ? 3 : c
          if (!playerBid(s, count, 6)) throw new Error('scripted bid rejected')
        } else {
          aiTurn(s) // 对方概率恒 < 阈值：必开骰输 1 颗；余 1 颗时先价 k×2
        }
      }
      expect(s.roundWinsYou + s.roundWinsAi).toBeGreaterThanOrEqual(1)
      expect(s.aiDice).toHaveLength(0)
    }
    const s = createLiarDice(41)
    s.yourDice = [6, 6, 6, 6, 6]
    s.aiDice = [2, 2, 2, 2, 2]
    s.turn = 'you'
    // 第 1 局脚本走完前，先验证对方开价路径：这里由你先手，直接进入脚本。
    winRound(s)
    expect(s.phase).toBe('roundOver')
    expect(s.roundWinsYou).toBe(1)
    expect(startNextRound(s)).toBe(true)
    winRound(s) // 第 2 局（布骰覆盖先手，脚本从你先手走）
    expect(s.phase).toBe('matchOver')
    expect(s.matchWinner).toBe('you')
    expect(s.roundWinsYou).toBe(ROUNDS_TO_WIN)
    expect(s.round).toBe(2)
  })

  it('AI 概率计算精确值：二项尾概率与已知骰视角', () => {
    expect(binomialAtLeast(2, 1 / 3, 1)).toBeCloseTo(5 / 9, 12)
    expect(binomialAtLeast(2, 1 / 3, 2)).toBeCloseTo(1 / 9, 12)
    expect(binomialAtLeast(5, 1 / 3, 4)).toBeCloseTo(10 / 243 + 1 / 243, 12) // C(5,4)+C(5,5) 项
    expect(binomialAtLeast(3, 1 / 2, 0)).toBe(1)
    expect(binomialAtLeast(3, 1 / 2, 4)).toBe(0)
    expect(binomialAtLeast(3, 0, 1)).toBe(0)
    expect(binomialAtLeast(3, 1, 1)).toBe(1)
    // 报 1：单骰命中 1/6；报 2-6：2/6（该点或万能 1）。
    expect(challengeProbability([2, 2, 4], 2, { count: 3, face: 2 })).toBeCloseTo(5 / 9, 12) // 已知 2，还差 1
    expect(challengeProbability([1, 1, 1], 2, { count: 3, face: 1 })).toBe(1) // 已知 3 ≥ 3，必真
    expect(challengeProbability([1], 2, { count: 2, face: 1 })).toBeCloseTo(11 / 36, 12) // 差 1 颗真 1：1-(5/6)^2
    expect(challengeProbability([], 1, { count: 1, face: 4 })).toBeCloseTo(1 / 3, 12)
    expect(challengeProbability([4], 1, { count: 1, face: 4 })).toBe(1) // 已知命中即 1
    expect(challengeProbability([2], 1, { count: 2, face: 5 })).toBe(0) // 未知仅 1 颗不可能差 2
  })

  it('抓诈层：真实概率低于阈值即开骰；阈值随局数收紧', () => {
    // 对方视角：己方（ai）恰 1 颗 6，你 4 颗未知，报 3×6 → P = 33/81 ≈ 0.407。
    const mk = (round: number): LiarDiceState => {
      const s = rigState(51, [3, 3, 3, 3], [6, 2, 3, 4, 5])
      s.round = round
      s.currentBid = { count: 3, face: 6 }
      s.bidBy = 'you'
      s.turn = 'ai'
      return s
    }
    const r1 = mk(1)
    expect(challengeProbability(r1.aiDice, r1.yourDice.length, r1.currentBid!)).toBeCloseTo(33 / 81, 12)
    expect(r1.round).toBe(1)
    expect(AI_CHALLENGE_THRESHOLDS[0]!).toBeLessThan(33 / 81) // 第 1 局容忍
    expect(aiDecide(r1, 0.99)).toMatchObject({ action: 'bid', bluff: false })
    const r3 = mk(3)
    expect(AI_CHALLENGE_THRESHOLDS[2]!).toBeGreaterThan(33 / 81) // 第 3 局收紧后开骰
    expect(aiDecide(r3, 0.99)).toEqual({ action: 'liar' })
    // 概率极低时任何局都立刻开骰。
    const s = rigState(52, [3, 3, 3, 3], [2, 3, 4, 5, 6])
    s.currentBid = { count: 5, face: 6 }
    s.bidBy = 'you'
    expect(challengeProbability(s.aiDice, 5, { count: 5, face: 6 })).toBeLessThan(AI_CHALLENGE_THRESHOLDS[0]!)
    expect(aiDecide(s, 0.5)).toEqual({ action: 'liar' })
  })

  it('诈唬层：决策随机数低于阈值时同点硬加一颗并标记 bluff', () => {
    const s = rigState(61, [3, 3, 3, 3, 3], [6, 2, 3, 4, 5])
    s.currentBid = { count: 2, face: 6 }
    s.bidBy = 'you'
    // 概率 0.868 高于阈值：不走抓诈。
    expect(challengeProbability(s.aiDice, s.yourDice.length, s.currentBid!)).toBeGreaterThan(AI_CHALLENGE_THRESHOLDS[2]!)
    const bluffing = aiDecide(s, 0.01)
    expect(0.01).toBeLessThan(AI_BLUFF_CHANCE)
    expect(bluffing).toEqual({ action: 'bid', bid: { count: 3, face: 6 }, bluff: true })
    const honest = aiDecide(s, 0.99)
    expect(honest).toMatchObject({ action: 'bid', bluff: false })
    expect(isLegalRaise(s.currentBid, (honest as { bid: { count: number, face: number } }).bid)).toBe(true)
  })

  it('AI 决策与掷骰确定性：同 seed 同局面必同决策，不同 seed 序列不同', () => {
    const a = autoplayMatch(99)
    expect(a.phase).toBe('matchOver')
    expect(a.roundWinsYou === ROUNDS_TO_WIN || a.roundWinsAi === ROUNDS_TO_WIN).toBe(true)
    const b = autoplayMatch(99)
    expect(serializeState(b)).toBe(serializeState(a)) // 完全一致
    const c = autoplayMatch(100)
    expect(serializeState(c)).not.toBe(serializeState(a)) // 换 seed 序列不同
    // 派生随机数只依赖 seed/局号/日志长度。
    const s = createLiarDice(7)
    const cloned = deserializeState(serializeState(s))
    expect(aiRoll(cloned)).toBe(aiRoll(s))
    expect(rollDice(mulberry32(42), 3)).toEqual(rollDice(mulberry32(42), 3))
  })

  it('序列化重放：中局克隆分叉后各自打完，结果与不打分叉完全一致', () => {
    // 打半场（打完第一局）后克隆分叉。
    const base = autoplayMatch(123)
    const half = createLiarDice(123)
    let guard = 0
    while (half.phase !== 'roundOver' && guard < 2000) {
      guard += 1
      if (half.turn === 'you') {
        const total = half.yourDice.length + half.aiDice.length
        const cur = half.currentBid
        if (cur !== null && cur.count + 1 > total) {
          playerCallLiar(half)
          continue
        }
        const next = cur === null ? { count: 1, face: 4 } : { count: cur.count + 1, face: 2 }
        if (!playerBid(half, next.count, next.face)) playerCallLiar(half)
      } else {
        aiTurn(half)
      }
    }
    const fork = deserializeState(serializeState(half))
    expect(serializeState(fork)).toBe(serializeState(half)) // 克隆逐字节一致
    const runTo = (s: LiarDiceState): string => {
      let g = 0
      while (s.phase !== 'matchOver' && g < 4000) {
        g += 1
        if (s.phase === 'roundOver') {
          startNextRound(s)
          continue
        }
        if (s.turn === 'you') {
          const total = s.yourDice.length + s.aiDice.length
          const cur = s.currentBid
          if (cur !== null && cur.count + 1 > total) {
            playerCallLiar(s)
            continue
          }
          const next = cur === null ? { count: 1, face: 4 } : { count: cur.count + 1, face: 2 }
          if (!playerBid(s, next.count, next.face)) playerCallLiar(s)
        } else {
          aiTurn(s)
        }
      }
      return serializeState(s)
    }
    expect(runTo(half)).toBe(runTo(fork)) // 分叉重放等价
    expect(JSON.parse(runTo(fork))).toMatchObject({ phase: 'matchOver', seed: 123 })
    expect(base.seed).toBe(123)
  })
})