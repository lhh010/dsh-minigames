import { describe, expect, it } from 'vitest'
import {
  BET_STEPS, cardValue, createBlackjack, dealRound, dealerMustHit,
  handValue, makeCard, playerDouble, playerHit, playerSplit, playerStand,
  cycleBetStep, type BlackjackState, type Card, type DealerRule,
} from '../src/client/games/blackjack/logic.ts'

/**
 * 布靴：把按发牌顺序给出的牌压到靴顶（发牌从靴末弹出），保留靴内
 * 原有整靴牌，避免触发开局切牌重洗。
 * @param state - 目标状态。
 * @param order - 期望的发牌顺序（先发的在前）。
 */
function rigShoe(state: BlackjackState, order: Card[]): void {
  for (let i = order.length - 1; i >= 0; i -= 1) state.shoe.push(order[i]!)
}

/** 选定下注档（循环切换到目标档）。 */
function setBet(state: BlackjackState, step: number): void {
  while (state.betStep !== step) cycleBetStep(state)
}

/** 自动打一局：低于 17 要牌，否则停牌（不加倍不分牌）。 */
function autoplayRound(state: BlackjackState): void {
  if (!dealRound(state)) return
  while (state.phase === 'player') {
    const hand = state.hands[state.active]!
    if (handValue(hand.cards).total < 17) playerHit(state)
    else playerStand(state)
  }
}

describe('blackjack logic', () => {
  it('点数计算：A 就高不爆，软硬可辨，J/Q/K 计 10', () => {
    expect(cardValue(11)).toBe(10)
    expect(cardValue(13)).toBe(10)
    expect(handValue([makeCard(1), makeCard(1)])).toEqual({ total: 12, soft: true, busted: false })
    expect(handValue([makeCard(1), makeCard(9)])).toEqual({ total: 20, soft: true, busted: false })
    expect(handValue([makeCard(1), makeCard(9), makeCard(5)])).toEqual({ total: 15, soft: false, busted: false })
    expect(handValue([makeCard(1), makeCard(13)])).toEqual({ total: 21, soft: true, busted: false })
    expect(handValue([makeCard(13), makeCard(12), makeCard(2)])).toEqual({ total: 22, soft: false, busted: true })
    // 两张 A 仍软（一张 11 一张 1）。
    expect(handValue([makeCard(1), makeCard(1), makeCard(9)])).toEqual({ total: 21, soft: true, busted: false })
  })

  it('庄家规则表：<17 必要，软 17 按 S17/H17 选停', () => {
    const hard16 = [makeCard(10), makeCard(6)]
    const soft17 = [makeCard(1), makeCard(6)]
    const hard17 = [makeCard(10), makeCard(7)]
    expect(dealerMustHit(hard16, 'S17')).toBe(true)
    expect(dealerMustHit(hard16, 'H17')).toBe(true)
    expect(dealerMustHit(soft17, 'S17')).toBe(false)
    expect(dealerMustHit(soft17, 'H17')).toBe(true)
    expect(dealerMustHit(hard17, 'S17')).toBe(false)
    expect(dealerMustHit(hard17, 'H17')).toBe(false)
  })

  it('天生 Blackjack 赔 3:2（50 注净赢 75）', () => {
    const s = createBlackjack(1)
    setBet(s, 1) // 50
    rigShoe(s, [makeCard(1), makeCard(10), makeCard(13), makeCard(9)])
    expect(dealRound(s)).toBe(true)
    expect(s.phase).toBe('settled')
    expect(s.holeHidden).toBe(false)
    const hand = s.hands[0]!
    expect(hand.outcome).toBe('blackjack')
    expect(hand.payout).toBe(125)
    expect(s.bankroll).toBe(1000 - 50 + 125)
  })

  it('玩家爆点即输：庄家不再要牌，玩家与庄家同爆仍判负', () => {
    const s = createBlackjack(2)
    // 玩家 10+6=16，要牌 10 爆 26；庄家明 10 暗 6（16，本可再要）。
    rigShoe(s, [makeCard(10), makeCard(10), makeCard(6), makeCard(10), makeCard(10)])
    dealRound(s)
    playerHit(s)
    expect(s.phase).toBe('settled')
    expect(s.hands[0]!.outcome).toBe('lose')
    expect(s.hands[0]!.payout).toBe(0)
    expect(s.dealer).toHaveLength(2) // 全爆时庄家不再要牌
    expect(s.bankroll).toBe(1000 - BET_STEPS[0]!)
  })

  it('庄家爆点与平局：庄爆赔 1:1，同点退注', () => {
    const s = createBlackjack(3)
    setBet(s, 1) // 50
    // 玩家 10+10=20 停；庄家 10+6=16 必须再要，补 10 爆 26。
    rigShoe(s, [makeCard(10), makeCard(10), makeCard(10), makeCard(6), makeCard(10)])
    dealRound(s)
    playerStand(s)
    expect(s.dealer).toHaveLength(3)
    expect(s.hands[0]!.outcome).toBe('win')
    expect(s.hands[0]!.payout).toBe(100)
    expect(s.bankroll).toBe(1000 - 50 + 100)

    const p = createBlackjack(4)
    setBet(p, 0) // 25
    // 双方 20 平。
    rigShoe(p, [makeCard(13), makeCard(10), makeCard(12), makeCard(10)])
    dealRound(p)
    playerStand(p)
    expect(p.hands[0]!.outcome).toBe('push')
    expect(p.hands[0]!.payout).toBe(25)
    expect(p.bankroll).toBe(1000) // 退注即无输赢
  })

  it('庄家软 17 实战：S17 停牌两张，H17 再要一张', () => {
    const play = (rule: DealerRule): BlackjackState => {
      const s = createBlackjack(5, rule)
      // 玩家 10+9=19 停；庄家 A+6 软 17；若要牌补 10 → 爆 27。
      rigShoe(s, [makeCard(10), makeCard(1), makeCard(9), makeCard(6), makeCard(10)])
      dealRound(s)
      playerStand(s)
      return s
    }
    const s17 = play('S17')
    expect(s17.dealer).toHaveLength(2)
    expect(s17.hands[0]!.outcome).toBe('win') // 19 > 软17
    const h17 = play('H17')
    expect(h17.dealer).toHaveLength(3)
    expect(h17.hands[0]!.outcome).toBe('win') // 庄家爆点
  })

  it('Double 语义：仅首两张可加倍，注翻倍恰发一张随即结算', () => {
    const s = createBlackjack(6)
    setBet(s, 1) // 50
    // 玩家 5+6=11，加倍补 10 → 21；庄家 10+9=19。
    rigShoe(s, [makeCard(5), makeCard(10), makeCard(6), makeCard(9), makeCard(10)])
    dealRound(s)
    expect(playerDouble(s)).toBe(true)
    const hand = s.hands[0]!
    expect(hand.doubled).toBe(true)
    expect(hand.bet).toBe(100)
    expect(hand.cards).toHaveLength(3)
    expect(s.phase).toBe('settled') // 加倍后立即开庄
    expect(hand.outcome).toBe('win')
    expect(hand.payout).toBe(200)
    expect(s.bankroll).toBe(1000 - 50 - 50 + 200)

    // 三张牌后不可再加倍。
    const t = createBlackjack(7)
    rigShoe(t, [makeCard(2), makeCard(10), makeCard(3), makeCard(9), makeCard(2), makeCard(5)])
    dealRound(t)
    playerHit(t)
    expect(t.hands[0]!.cards).toHaveLength(3)
    expect(playerDouble(t)).toBe(false)
  })

  it('Split：对子分两手各下注，分 A 各补一张即停', () => {
    const s = createBlackjack(8)
    setBet(s, 0) // 25
    // 玩家 8+8，庄家 10+9；分牌后两手各补 3 与 4。
    rigShoe(s, [makeCard(8), makeCard(10), makeCard(8), makeCard(9), makeCard(3), makeCard(4)])
    dealRound(s)
    expect(playerSplit(s)).toBe(true)
    expect(s.hands).toHaveLength(2)
    expect(s.bankroll).toBe(1000 - 25 - 25)
    expect(s.hands[0]!.cards.map(c => c.rank)).toEqual([8, 3])
    expect(s.hands[1]!.cards.map(c => c.rank)).toEqual([8, 4])
    expect(s.hands[0]!.fromSplit).toBe(true)
    expect(s.hands[1]!.fromSplit).toBe(true)
    expect(s.phase).toBe('player') // 未爆未 21，继续两手依次操作
    playerStand(s)
    playerStand(s)
    expect(s.phase).toBe('settled')

    // 分 A 各补一张即自动停牌并开庄。
    const a = createBlackjack(9)
    rigShoe(a, [makeCard(1), makeCard(10), makeCard(1), makeCard(6), makeCard(2), makeCard(5)])
    dealRound(a)
    expect(playerSplit(a)).toBe(true)
    expect(a.hands[0]!.stood).toBe(true)
    expect(a.hands[1]!.stood).toBe(true)
    expect(a.phase).toBe('settled')
  })

  it('筹码守恒：60 局后余额变动 = 结算净和 + 重发补助', () => {
    const s = createBlackjack(100)
    let net = 0
    let rebuys = 0
    for (let r = 0; r < 60; r += 1) {
      const beforeRebuys = s.rebuys
      autoplayRound(s)
      for (const hand of s.hands) net += hand.payout - hand.bet
      if (s.rebuys > beforeRebuys) rebuys += s.rebuys - beforeRebuys
      expect(s.phase).toBe('settled')
    }
    expect(s.bankroll).toBe(1000 + net + 500 * rebuys)
    expect(s.reshuffles).toBeGreaterThanOrEqual(1) // 6 副靴切牌后整靴重洗过
    // 当前靴内牌数守恒：靴 + 弃牌 ≤ 整靴 312（结算后手牌已入弃牌堆）。
    expect(s.shoe.length + s.discard.length).toBeLessThanOrEqual(312)
  })

  it('破产重发：结算后余额不足最低注补 500', () => {
    const s = createBlackjack(11)
    s.bankroll = 25 // 仅剩最低注
    rigShoe(s, [makeCard(10), makeCard(10), makeCard(6), makeCard(10), makeCard(10)])
    dealRound(s)
    playerHit(s) // 爆点输光
    expect(s.bankroll).toBe(0 + 500)
    expect(s.rebuys).toBe(1)
  })

  it('确定性重放：同 seed 同策略序列完全一致', () => {
    const run = (): string => {
      const s = createBlackjack(424242)
      for (let r = 0; r < 40; r += 1) autoplayRound(s)
      return JSON.stringify(s)
    }
    expect(run()).toBe(run())
  })
})
