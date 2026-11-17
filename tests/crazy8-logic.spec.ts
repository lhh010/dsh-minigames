import { describe, expect, it } from 'vitest'
import {
  HAND_SIZE, aiBestSuit, aiTakeTurn, canPlayCard, chooseSuit, createCrazy8,
  drawCard, makeCard, matchScore, nextRound, passOrDraw, playCard,
  playableIndices, snapshot, topCard, type Crazy8State,
} from '../src/client/games/crazy8/logic.ts'

/**
 * 布阵：直接设置顶牌、有效花色与双方手牌（测试用，保留 rng）。
 * @param s - 目标状态。
 * @param top - 弃牌堆顶牌。
 * @param hand0 - 人类手牌。
 * @param hand1 - AI 手牌。
 */
function rig(s: Crazy8State, top: ReturnType<typeof makeCard>, hand0: ReturnType<typeof makeCard>[], hand1: ReturnType<typeof makeCard>[]): void {
  s.discard = [top]
  s.activeSuit = top.suit
  s.hands = [hand0.slice(), hand1.slice()]
  s.turn = 0
  s.pendingSuitChoice = false
  s.skipPending = false
  s.drawnPlayable = false
  s.passStreak = 0
  s.roundWinner = null
}

describe('crazy8 logic', () => {
  it('开局发牌：52 张标准牌、双方各 5 张、弃牌顶 1 张、牌堆 41 张', () => {
    const s = createCrazy8(7)
    expect(s.hands[0]).toHaveLength(HAND_SIZE)
    expect(s.hands[1]).toHaveLength(HAND_SIZE)
    expect(s.discard).toHaveLength(1)
    expect(s.drawPile).toHaveLength(52 - HAND_SIZE * 2 - 1)
    expect(s.turn).toBe(0)
    expect(s.activeSuit).toBe(topCard(s).suit)
    const seen = new Set([...s.drawPile, ...s.discard, ...s.hands[0], ...s.hands[1]].map(c => c.suit * 13 + c.rank))
    expect(seen.size).toBe(52)
  })

  it('出牌合法性：同花或同点可出，8 万能，非法牌拒出且手牌不变', () => {
    expect(canPlayCard(makeCard(3, 0), 0, 5)).toBe(true)
    expect(canPlayCard(makeCard(5, 1), 0, 5)).toBe(true)
    expect(canPlayCard(makeCard(8, 2), 0, 5)).toBe(true)
    expect(canPlayCard(makeCard(9, 1), 0, 5)).toBe(false)
    const s = createCrazy8(11)
    rig(s, makeCard(5, 0), [makeCard(9, 1), makeCard(3, 0)], [])
    expect(playCard(s, 0)).toBe(false)
    expect(s.hands[0]).toHaveLength(2)
    expect(playCard(s, 0)).toBe(false) // 9♥ 仍不合法
    expect(playCard(s, 1)).toBe(true) // 3♠ 同花
    expect(topCard(s)).toEqual(makeCard(3, 0))
    expect(s.activeSuit).toBe(0)
    expect(s.turn).toBe(1)
  })

  it('出 8：人类进入花色宣告，chooseSuit 生效后按新花色接牌', () => {
    const s = createCrazy8(12)
    rig(s, makeCard(5, 0), [makeCard(8, 2), makeCard(4, 3)], [makeCard(2, 1)])
    expect(playCard(s, 0)).toBe(true)
    expect(s.pendingSuitChoice).toBe(true)
    expect(s.turn).toBe(0) // 宣告前不轮转
    expect(chooseSuit(s, 3)).toBe(true)
    expect(s.pendingSuitChoice).toBe(false)
    expect(s.activeSuit).toBe(3)
    expect(s.turn).toBe(1)
    // AI 回合无可出（2♥ 不匹配梅花/8 已打出），返回后宣告花色仍生效。
    aiTakeTurn(s)
    expect(topCard(s).rank).toBe(8)
  })

  it('Q 跳过：出 Q 后下家被跳过，轮转回到出牌者', () => {
    const s = createCrazy8(13)
    rig(s, makeCard(5, 0), [makeCard(12, 0), makeCard(2, 0)], [makeCard(9, 1)])
    expect(playCard(s, 0)).toBe(true)
    expect(topCard(s).rank).toBe(12)
    expect(s.skipPending).toBe(false) // 已在轮转中消耗
    expect(s.turn).toBe(0) // AI 被跳过，回到人类
  })

  it('摸牌：无可出摸 1 张；摸到可出保留出牌权；摸到不可出自动过轮', () => {
    const s = createCrazy8(14)
    // 摸到不可出：过轮。
    rig(s, makeCard(5, 0), [makeCard(9, 1)], [makeCard(9, 1)])
    s.drawPile = [makeCard(11, 2)]
    passOrDraw(s)
    expect(s.hands[0]).toHaveLength(2)
    expect(s.drawnPlayable).toBe(false)
    expect(s.turn).toBe(1)
    // 摸到可出：保留出牌权。
    const s2 = createCrazy8(14)
    rig(s2, makeCard(5, 0), [makeCard(9, 1)], [makeCard(9, 1)])
    s2.drawPile = [makeCard(5, 2)]
    passOrDraw(s2)
    expect(s2.drawnPlayable).toBe(true)
    expect(s2.turn).toBe(0)
    expect(playableIndices(s2)).toHaveLength(1) // 摸到的 5♦ 可出
    expect(playCard(s2, 1)).toBe(true)
    expect(s2.turn).toBe(1)
  })

  it('手牌出完判胜：wins 累计，3 局 2 胜定 matchWinner，积分按规范累计', () => {
    const s = createCrazy8(15)
    rig(s, makeCard(5, 0), [makeCard(5, 1)], [])
    expect(playCard(s, 0)).toBe(true)
    expect(s.roundWinner).toBe(0)
    expect(s.wins).toEqual([1, 0])
    expect(s.matchWinner).toBeNull()
    expect(matchScore(s)).toBe(100)
    nextRound(s)
    expect(s.round).toBe(2)
    expect(s.hands[0]).toHaveLength(HAND_SIZE)
    expect(s.turn).toBe(1) // 第 2 局 AI 先手
    s.turn = 0
    rig(s, makeCard(5, 0), [makeCard(5, 1)], [])
    playCard(s, 0)
    expect(s.matchWinner).toBe(0)
    expect(matchScore(s)).toBe(250)
    nextRound(s)
    expect(s.round).toBe(2) // 整场结束不再进局
  })

  it('牌堆耗尽：弃牌堆重洗为新牌堆（保留顶牌），reshuffles 计数', () => {
    const s = createCrazy8(16)
    rig(s, makeCard(5, 0), [], [])
    s.drawPile = []
    // 末位为顶牌：重洗保留 7♥，其余 4 张入牌堆。
    s.discard = [makeCard(2, 2), makeCard(9, 3), makeCard(11, 0), makeCard(3, 1), makeCard(7, 1)]
    const card = drawCard(s)
    expect(card).not.toBeNull()
    expect(s.drawPile).toHaveLength(3) // 重洗 4 张、摸走 1 张
    expect(s.discard).toEqual([makeCard(7, 1)])
    expect(s.reshuffles).toBe(1)
    expect(topCard(s)).toEqual(makeCard(7, 1))
  })

  it('双方困死：无牌可摸且连续两回合无出牌判本局平局，不计局分', () => {
    const s = createCrazy8(17)
    rig(s, makeCard(5, 0), [makeCard(9, 1)], [makeCard(9, 2)])
    s.drawPile = []
    s.discard = [makeCard(5, 0)]
    passOrDraw(s)
    expect(s.turn).toBe(1)
    passOrDraw(s)
    expect(s.roundWinner).toBe(-1)
    expect(s.wins).toEqual([0, 0])
    nextRound(s)
    expect(s.roundWinner).toBeNull()
    expect(s.hands[0]).toHaveLength(HAND_SIZE)
  })

  it('AI 策略：有非 8 可出时留 8，优先出手中最多花色；仅剩 8 时兜底并宣告多数花色', () => {
    const s = createCrazy8(18)
    // 顶 5♦：8♠（万能）与 9♥（不可出）与 5♥（同点）——应出 5♥ 而留 8。
    rig(s, makeCard(5, 2), [], [makeCard(8, 0), makeCard(9, 1), makeCard(5, 1)])
    s.turn = 1
    aiTakeTurn(s)
    expect(topCard(s)).toEqual(makeCard(5, 1))
    expect(s.activeSuit).toBe(1)
    expect(s.hands[1]!.some(c => c.rank === 8)).toBe(true)
    // 只剩 8 可出：打出并宣告手中最多花色（红心 2 张）。
    const s2 = createCrazy8(18)
    rig(s2, makeCard(5, 2), [], [makeCard(8, 0), makeCard(2, 1), makeCard(3, 1), makeCard(10, 3)])
    s2.turn = 1
    expect(aiBestSuit(s2)).toBe(1)
    aiTakeTurn(s2)
    expect(topCard(s2)!.rank).toBe(8)
    expect(s2.activeSuit).toBe(1)
  })

  it('AI 整场自动对局：同 seed 重放快照完全一致且必达 matchWinner', () => {
    const run = (): Record<string, unknown> => {
      const s = createCrazy8(2026)
      let guard = 0
      while (s.matchWinner === null && guard < 10000) {
        guard += 1
        if (s.pendingSuitChoice) chooseSuit(s, 2)
        else if (s.roundWinner !== null) nextRound(s)
        else aiTakeTurn(s)
      }
      expect(guard).toBeLessThan(10000)
      expect(s.matchWinner).not.toBeNull()
      return snapshot(s)
    }
    expect(run()).toEqual(run())
  })

  it('人机脚本重放：固定人类策略整场重放一致（确定性不受人类侧影响）', () => {
    const run = (): Record<string, unknown> => {
      const s = createCrazy8(99)
      let guard = 0
      while (s.matchWinner === null && guard < 10000) {
        guard += 1
        if (s.pendingSuitChoice) {
          chooseSuit(s, 2)
        } else if (s.roundWinner !== null) {
          nextRound(s)
        } else if (s.turn === 0) {
          const idx = playableIndices(s)[0]
          if (idx !== undefined) playCard(s, idx, s.hands[0]![idx]!.rank === 8 ? 2 : undefined)
          else passOrDraw(s)
        } else {
          aiTakeTurn(s)
        }
      }
      expect(guard).toBeLessThan(10000)
      return snapshot(s)
    }
    expect(run()).toEqual(run())
  })
})
