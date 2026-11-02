/**
 * 21点（Blackjack）纯逻辑：6 副牌靴（312 张），mulberry32(seed, round)
 * 确定性洗牌，靴内剩余不足切牌点时下一局开局整靴重洗。标准规则：
 * A 就高计 1/11（不爆优先 11，可软可硬），J/Q/K 计 10；玩家回合
 * Hit / Stand / Double（仅首两张且余额足够）；天生 Blackjack 赔 3:2；
 * 庄家小于 17 必须要牌，软 17 按规则表选停（S17 默认停牌，H17 要牌）；
 * 对子可分一手为两手（分牌后的 21 点不算天生 Blackjack，分 A 各补一张
 * 即停）。下注档 25/50/100/250；结算后余额不足最低注时重新发放 500。
 *
 * 所有操作都直接修改传入的 state（发牌从 shoe 末尾弹出），同一 seed
 * 与同一操作序列必然得到同一状态，可脱离 DOM 直接模拟验证。
 */

/** 靴内副数。 */
export const DECK_COUNT = 6
/** 切牌点：靴内剩余不足此数时，下一局开局整靴重洗。 */
export const CUT_CARD = 60
/** 下注档（B 键循环切换）。 */
export const BET_STEPS: readonly number[] = [25, 50, 100, 250]
/** 最低注（下注档最小值）。 */
export const MIN_BET = BET_STEPS[0]!
/** 初始余额。 */
export const START_BANKROLL = 1000
/** 破产重发金额（结算后余额不足最低注时补发）。 */
export const REBUY_AMOUNT = 500
/** 最多同时手数（对子分牌一次，1 手 → 2 手）。 */
export const MAX_HANDS = 2

/** 庄家软 17 规则表：S17 停牌，H17 要牌。 */
export type DealerRule = 'S17' | 'H17'

/** 一张牌：花色 0-3（♠♥♦♣）、点数 1-13（A..K）。 */
export interface Card {
  suit: number
  rank: number
}

/** 手牌点数：total 为就高不爆的总点，soft 表示含按 11 计的 A。 */
export interface HandValue {
  total: number
  soft: boolean
  busted: boolean
}

/** 一手玩家牌及其注码与结算结果。 */
export interface Hand {
  cards: Card[]
  /** 本手注码（Double 后翻倍）。 */
  bet: number
  doubled: boolean
  /** 来自分牌（其 2 张 21 点不算天生 Blackjack）。 */
  fromSplit: boolean
  stood: boolean
  /** 结算结果；未结算为 null。 */
  outcome: HandOutcome | null
  /** 结算返还金额（含本金；输为 0）；未结算为 0。 */
  payout: number
}

/** 一手牌的结算分支。 */
export type HandOutcome = 'blackjack' | 'win' | 'push' | 'lose'

/** 牌局阶段：下注（含发牌前）/ 玩家回合 / 已结算。 */
export type GamePhase = 'betting' | 'player' | 'settled'

/** 一局游戏的完整可测状态。 */
export interface BlackjackState {
  seed: number
  /** 规则表（庄家软 17 行为）。 */
  rule: DealerRule
  /** 已开局数（含当前局；R 重开从 1 重新计）。 */
  round: number
  bankroll: number
  /** 当前选中的下注档索引（BET_STEPS 下标）。 */
  betStep: number
  phase: GamePhase
  /** 牌靴（发牌从末尾弹出）。 */
  shoe: Card[]
  /** 弃牌堆（整靴重洗时清空）。 */
  discard: Card[]
  /** 整靴重洗次数。 */
  reshuffles: number
  /** 破产重发次数。 */
  rebuys: number
  /** 玩家手（分牌后 2 手）。 */
  hands: Hand[]
  /** 当前操作手索引。 */
  active: number
  dealer: Card[]
  /** 庄家暗牌是否尚未翻开。 */
  holeHidden: boolean
  /** 最近一次操作的提示文案。 */
  message: string
}

/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 局号混合进种子：同 seed 不同 round 得到独立洗牌序列。 */
function roundSeed(seed: number, round: number): number {
  return (seed + round * 0x9e3779b9) >>> 0
}

/** 构造一副洗好的 6 副牌靴（Fisher-Yates）。 */
export function makeShoe(seed: number, round: number): Card[] {
  const rng = mulberry32(roundSeed(seed, round))
  const shoe: Card[] = []
  for (let d = 0; d < DECK_COUNT; d += 1) {
    for (let suit = 0; suit < 4; suit += 1) {
      for (let rank = 1; rank <= 13; rank += 1) shoe.push({ suit, rank })
    }
  }
  for (let i = shoe.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = shoe[i]!
    shoe[i] = shoe[j]!
    shoe[j] = tmp
  }
  return shoe
}

/** 单张牌点值：J/Q/K 计 10，A 计 1（软硬由 handValue 决定）。 */
export function cardValue(rank: number): number {
  return Math.min(rank, 10)
}

/** 构造一张指定点数（花色默认黑桃）的牌，测试布鞋用。 */
export function makeCard(rank: number, suit = 0): Card {
  return { suit, rank }
}

/**
 * 手牌点数：A 先计 1，能不爆升为 11（就高不爆）；soft 表示仍有按
 * 11 计的 A。
 * @param cards - 手牌。
 * @returns total 总点、soft 是否软牌、busted 是否爆点。
 */
export function handValue(cards: Card[]): HandValue {
  let total = 0
  let aces = 0
  for (const c of cards) {
    total += cardValue(c.rank)
    if (c.rank === 1) aces += 1
  }
  let soft = false
  while (aces > 0 && total + 10 <= 21) {
    total += 10
    soft = true
    aces -= 1
  }
  return { total, soft, busted: total > 21 }
}

/**
 * 天生 Blackjack：首两张恰 21 点且非分牌手。
 * @param hand - 目标手。
 */
export function isNaturalBlackjack(hand: Hand): boolean {
  return !hand.fromSplit && hand.cards.length === 2 && handValue(hand.cards).total === 21
}

/**
 * 庄家规则表：总点 <17 必须要牌；恰软 17 时 S17 停、H17 要。
 * @param dealer - 庄家手牌。
 * @param rule - 规则表。
 */
export function dealerMustHit(dealer: Card[], rule: DealerRule): boolean {
  const v = handValue(dealer)
  if (v.total < 17) return true
  return v.total === 17 && v.soft && rule === 'H17'
}

function emptyHand(bet: number, fromSplit = false): Hand {
  return { cards: [], bet, doubled: false, fromSplit, stood: false, outcome: null, payout: 0 }
}

/**
 * 开新局：round 0、余额 1000、按 (seed, 0) 洗整靴。
 * @param seed - 基础种子。
 * @param rule - 庄家软 17 规则表，默认 S17。
 */
export function createBlackjack(seed: number, rule: DealerRule = 'S17'): BlackjackState {
  return {
    seed,
    rule,
    round: 0,
    bankroll: START_BANKROLL,
    betStep: 0,
    phase: 'betting',
    shoe: makeShoe(seed, 0),
    discard: [],
    reshuffles: 0,
    rebuys: 0,
    hands: [],
    active: 0,
    dealer: [],
    holeHidden: true,
    message: 'Enter 发牌 · B 换注',
  }
}

/** 发一张（从靴末弹出）；靴空时按当前局号应急重洗（正常流程不会触发）。 */
function draw(state: BlackjackState): Card {
  if (state.shoe.length === 0) {
    state.shoe = makeShoe(state.seed, state.round)
    state.reshuffles += 1
  }
  return state.shoe.pop()!
}

/** 局开局检查切牌点：剩余不足 CUT_CARD 则整靴重洗、弃牌清空。 */
function reshuffleIfNeeded(state: BlackjackState): void {
  if (state.shoe.length >= CUT_CARD) return
  state.discard = []
  state.shoe = makeShoe(state.seed, state.round)
  state.reshuffles += 1
}

/**
 * 循环切换下注档（B 键）。
 * @returns 切换后的下注档索引。
 */
export function cycleBetStep(state: BlackjackState): number {
  state.betStep = (state.betStep + 1) % BET_STEPS.length
  if (state.phase === 'betting' || state.phase === 'settled') {
    state.message = '下注 ' + BET_STEPS[state.betStep]! + ' · Enter 发牌'
  }
  return state.betStep
}

/**
 * 发牌开局：扣注、（必要时）重洗、按 玩家-庄家-玩家-庄家 发四张；
 * 玩家天生 Blackjack 时立即开庄结算。
 * @returns 余额不足（发牌失败）为 false。
 */
export function dealRound(state: BlackjackState): boolean {
  if (state.phase === 'player') return false
  const bet = BET_STEPS[state.betStep]!
  if (state.bankroll < bet) {
    state.message = '余额不足 ' + bet + ' · B 换小注'
    return false
  }
  state.round += 1
  reshuffleIfNeeded(state)
  state.bankroll -= bet
  state.hands = [emptyHand(bet)]
  state.active = 0
  state.dealer = []
  state.holeHidden = true
  state.phase = 'player'
  const player = state.hands[0]!
  player.cards.push(draw(state))
  state.dealer.push(draw(state))
  player.cards.push(draw(state))
  state.dealer.push(draw(state))
  if (isNaturalBlackjack(player)) {
    state.message = 'Blackjack！开庄…'
    finishRound(state)
  } else {
    state.message = 'H 要牌 · S 停牌 · D 加倍'
  }
  return true
}

/** 当前操作手；越界（结算后）返回 null。 */
export function activeHand(state: BlackjackState): Hand | null {
  return state.hands[state.active] ?? null
}

/** 玩家手是否已定（停牌即定；未停但爆点或 21 点亦定）。 */
function handDone(hand: Hand): boolean {
  if (hand.stood) return true
  const v = handValue(hand.cards)
  return v.busted || v.total === 21
}

/** 推进到下一未定手；全部定案则开庄结算。 */
function advance(state: BlackjackState): void {
  while (state.active < state.hands.length) {
    const hand = state.hands[state.active]!
    if (!handDone(hand)) return
    state.active += 1
  }
  finishRound(state)
}

/**
 * 要牌：向当前手发一张；爆点或恰 21 点自动定案并推进。
 * @returns 非 player 阶段为 false。
 */
export function playerHit(state: BlackjackState): boolean {
  if (state.phase !== 'player') return false
  const hand = activeHand(state)
  if (hand === null || handDone(hand)) return false
  hand.cards.push(draw(state))
  const v = handValue(hand.cards)
  if (v.busted) state.message = '爆点 ' + v.total + '！'
  else if (v.total === 21) state.message = '21 点！'
  else state.message = (v.soft ? '软 ' : '') + v.total + ' · H/S/D'
  advance(state)
  return true
}

/**
 * 停牌：当前手定案并推进。
 * @returns 非 player 阶段为 false。
 */
export function playerStand(state: BlackjackState): boolean {
  if (state.phase !== 'player') return false
  const hand = activeHand(state)
  if (hand === null) return false
  hand.stood = true
  state.message = '停牌 ' + handValue(hand.cards).total
  advance(state)
  return true
}

/**
 * 加倍：仅首两张且余额足够；注翻倍、恰发一张、随即定案推进。
 * @returns 条件不满足为 false。
 */
export function playerDouble(state: BlackjackState): boolean {
  if (state.phase !== 'player') return false
  const hand = activeHand(state)
  if (hand === null || hand.cards.length !== 2) return false
  if (state.bankroll < hand.bet) return false
  state.bankroll -= hand.bet
  hand.bet *= 2
  hand.doubled = true
  hand.cards.push(draw(state))
  const v = handValue(hand.cards)
  state.message = v.busted ? '加倍爆点 ' + v.total + '！' : '加倍 ' + v.total
  advance(state)
  return true
}

/**
 * 分牌：当前手首两张点值相同且手数未满且余额足够，拆为两手各补一张；
 * 分 A 各补一张即自动停牌。
 * @returns 条件不满足为 false。
 */
export function playerSplit(state: BlackjackState): boolean {
  if (state.phase !== 'player') return false
  if (state.hands.length >= MAX_HANDS) return false
  const hand = activeHand(state)
  if (hand === null || hand.cards.length !== 2) return false
  const [a, b] = hand.cards as [Card, Card]
  if (cardValue(a.rank) !== cardValue(b.rank)) return false
  if (state.bankroll < hand.bet) return false
  state.bankroll -= hand.bet
  const split = emptyHand(hand.bet, true)
  hand.fromSplit = true
  split.cards.push(hand.cards.pop()!)
  hand.cards.push(draw(state))
  split.cards.push(draw(state))
  const aces = a.rank === 1
  if (aces) {
    hand.stood = true
    split.stood = true
  }
  state.hands.push(split)
  state.active = 0
  state.message = aces ? '分 A 各一张即停' : '已分牌 · 两手依次操作'
  advance(state)
  return true
}

/**
 * 开庄结算：翻开暗牌；玩家全爆时庄家不再要牌，否则按规则表要牌；
 * 逐手按 爆/BJ/庄BJ/比点 结算并入账；余额不足最低注则重发 500。
 */
export function finishRound(state: BlackjackState): void {
  if (state.phase !== 'player') return
  state.holeHidden = false
  const allBusted = state.hands.every(h => handValue(h.cards).busted)
  if (!allBusted) {
    while (dealerMustHit(state.dealer, state.rule)) state.dealer.push(draw(state))
  }
  const dealerV = handValue(state.dealer)
  const dealerBJ = state.dealer.length === 2 && dealerV.total === 21
  let net = 0
  for (const hand of state.hands) {
    const v = handValue(hand.cards)
    state.discard.push(...hand.cards)
    if (v.busted) {
      hand.outcome = 'lose'
      hand.payout = 0
    } else if (isNaturalBlackjack(hand)) {
      if (dealerBJ) {
        hand.outcome = 'push'
        hand.payout = hand.bet
      } else {
        hand.outcome = 'blackjack'
        hand.payout = hand.bet + Math.floor((hand.bet * 3) / 2)
      }
    } else if (dealerBJ) {
      hand.outcome = 'lose'
      hand.payout = 0
    } else if (dealerV.busted || v.total > dealerV.total) {
      hand.outcome = 'win'
      hand.payout = hand.bet * 2
    } else if (v.total === dealerV.total) {
      hand.outcome = 'push'
      hand.payout = hand.bet
    } else {
      hand.outcome = 'lose'
      hand.payout = 0
    }
    state.bankroll += hand.payout
    net += hand.payout - hand.bet
  }
  state.discard.push(...state.dealer)
  state.phase = 'settled'
  if (state.bankroll < MIN_BET) {
    state.bankroll += REBUY_AMOUNT
    state.rebuys += 1
    state.message = '破产重发 ' + REBUY_AMOUNT + ' · Enter 续局'
  } else {
    state.message = (net > 0 ? '+' + net : net < 0 ? String(net) : '平局') + ' · Enter 续局'
  }
}
