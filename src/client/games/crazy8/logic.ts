/**
 * 疯狂八号（Crazy Eights，UNO 前身）纯逻辑：52 张标准牌（4 花色 × 13
 * 点），1v1 人类对 AI，每人起手 5 张、翻 1 张作弃牌堆顶。轮流出牌：
 * 与顶牌同花色或同点数可出；8 为万能牌，出时宣告下一花色；Q（皇后）
 * 为跳过牌——出 Q 后下家被跳过，轮转回到出牌者本人。无牌可出则从牌堆
 * 摸 1 张：摸到可出的牌可打出（也可放弃出牌权直接过轮），摸到不可出
 * 的牌自动过轮。牌堆耗尽时把弃牌堆（保留顶牌）重洗为新牌堆；双方连
 * 续无牌可出且无牌可摸判本局平局。任一方手牌出完赢一局，先赢
 * WINS_TO_MATCH（2）局（3 局 2 胜）赢整场，每局先手在两家间交替。
 *
 * 所有随机（洗牌、AI 决策噪声）都走注入 seed 的 mulberry32，同一
 * seed 与同一操作序列必然得到同一状态，可脱离 DOM 直接模拟验证。
 */

/** 起手手牌张数。 */
export const HAND_SIZE = 5
/** 赢得多少局后赢得整场（3 局 2 胜）。 */
export const WINS_TO_MATCH = 2
/** 跳过牌的点数（Q）。 */
export const SKIP_RANK = 12
/** 万能牌的点数（8）。 */
export const WILD_RANK = 8

/** 一张牌：花色 0-3（♠♥♦♣）、点数 1-13（A..K）。 */
export interface Card {
  suit: number
  rank: number
}

/** 玩家编号：0 人类、1 AI。 */
export type PlayerId = 0 | 1

/** 一局的可测完整状态（rng 为 seed 派生的内部随机源，不参与快照比较）。 */
export interface Crazy8State {
  seed: number
  /** 当前局序号（从 1 起）。 */
  round: number
  /** 双方已赢局数（0 人类 / 1 AI）。 */
  wins: [number, number]
  /** 牌堆（摸牌从末尾弹出）。 */
  drawPile: Card[]
  /** 弃牌堆（末位为顶牌）。 */
  discard: Card[]
  /** 双方手牌。 */
  hands: [Card[], Card[]]
  /** 当前行动方。 */
  turn: PlayerId
  /** 当前有效花色（8 宣告后覆盖顶牌花色）。 */
  activeSuit: number
  /** 人类刚打出 8，等待宣告花色。 */
  pendingSuitChoice: boolean
  /** 出 Q 置位：下一次轮转时跳过下家。 */
  skipPending: boolean
  /** 刚摸到的牌可出（当前玩家仍持有出牌权）。 */
  drawnPlayable: boolean
  /** 连续无出牌的回合数（≥2 且无牌可摸判平局）。 */
  passStreak: number
  /** 弃牌堆重洗次数。 */
  reshuffles: number
  /** 本局结果：玩家编号 / -1 平局 / null 进行中。 */
  roundWinner: PlayerId | -1 | null
  /** 整场结果：玩家编号 / null 进行中。 */
  matchWinner: PlayerId | null
  /** 面向玩家的提示文案。 */
  message: string
  /** 内部确定性随机源（seed+局号派生）。 */
  rng: () => number
}

/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 非负整数种子。
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

/** Fisher-Yates 原地洗牌（使用注入随机源）。 */
function shuffle(cards: Card[], rng: () => number): Card[] {
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = cards[i]!
    cards[i] = cards[j]!
    cards[j] = tmp
  }
  return cards
}

/**
 * 构造一副洗好的 52 张标准牌。
 * @param seed - 种子。
 * @param round - 局号（混合进种子）。
 */
export function makeDeck(seed: number, round: number): Card[] {
  const rng = mulberry32(roundSeed(seed, round))
  const deck: Card[] = []
  for (let suit = 0; suit < 4; suit += 1) {
    for (let rank = 1; rank <= 13; rank += 1) deck.push({ suit, rank })
  }
  return shuffle(deck, rng)
}

/**
 * 构造一张指定牌（测试布阵用）。
 * @param rank - 点数 1-13。
 * @param suit - 花色 0-3，默认黑桃。
 */
export function makeCard(rank: number, suit = 0): Card {
  return { suit, rank }
}

/** 手牌中各花色张数统计。 */
function suitCounts(hand: Card[]): number[] {
  const counts = [0, 0, 0, 0]
  for (const c of hand) counts[c.suit]! += 1
  return counts
}

/** 用新洗的牌重开一局（保留 wins / matchWinner）。 */
function freshRound(state: Crazy8State, first: PlayerId): void {
  const deck = makeDeck(state.seed, state.round)
  const hand0: Card[] = []
  const hand1: Card[] = []
  for (let i = 0; i < HAND_SIZE; i += 1) {
    hand0.push(deck.pop()!)
    hand1.push(deck.pop()!)
  }
  const top = deck.pop()!
  state.drawPile = deck
  state.discard = [top]
  state.hands = [hand0, hand1]
  state.turn = first
  state.activeSuit = top.suit
  state.pendingSuitChoice = false
  state.skipPending = false
  state.drawnPlayable = false
  state.passStreak = 0
  state.roundWinner = null
  state.message = '第 ' + state.round + ' 局开始'
}

/**
 * 开一场新比赛。
 * @param seed - 注入种子，决定全部洗牌与 AI 噪声。
 * @returns 初始状态（人类先手）。
 */
export function createCrazy8(seed: number): Crazy8State {
  const state: Crazy8State = {
    seed,
    round: 1,
    wins: [0, 0],
    drawPile: [],
    discard: [],
    hands: [[], []],
    turn: 0,
    activeSuit: 0,
    pendingSuitChoice: false,
    skipPending: false,
    drawnPlayable: false,
    passStreak: 0,
    reshuffles: 0,
    roundWinner: null,
    matchWinner: null,
    message: '',
    rng: mulberry32(roundSeed(seed, 7919)),
  }
  freshRound(state, 0)
  return state
}

/**
 * 弃牌堆顶牌。
 * @param state - 目标状态。
 */
export function topCard(state: Crazy8State): Card {
  return state.discard[state.discard.length - 1]!
}

/**
 * 出牌合法性：8 万能，否则须与有效花色同花或与顶牌同点。
 * @param card - 待出的牌。
 * @param activeSuit - 当前有效花色。
 * @param topRank - 顶牌点数。
 */
export function canPlayCard(card: Card, activeSuit: number, topRank: number): boolean {
  if (card.rank === WILD_RANK) return true
  return card.suit === activeSuit || card.rank === topRank
}

/**
 * 当前行动方可出的手牌下标列表。
 * @param state - 目标状态。
 */
export function playableIndices(state: Crazy8State): number[] {
  const top = topCard(state)
  const result: number[] = []
  const hand = state.hands[state.turn]
  for (let i = 0; i < hand.length; i += 1) {
    if (canPlayCard(hand[i]!, state.activeSuit, top.rank)) result.push(i)
  }
  return result
}

/**
 * 当前行动方是否有可出的牌。
 * @param state - 目标状态。
 */
export function hasPlayable(state: Crazy8State): boolean {
  return playableIndices(state).length > 0
}

/** 结束一次出牌：判胜（手牌空）否则轮转（含 Q 跳过）。 */
function finishPlay(state: Crazy8State, player: PlayerId): void {
  if (state.hands[player].length === 0) {
    state.roundWinner = player
    state.wins[player]! += 1
    state.message = (player === 0 ? '你' : 'AI') + '出完手牌，赢下第 ' + state.round + ' 局'
    if (state.wins[player]! >= WINS_TO_MATCH) state.matchWinner = player
    return
  }
  advanceTurn(state)
}

/** 轮转：Q 跳过下家（轮转回到出牌者），否则交给对手。 */
function advanceTurn(state: Crazy8State): void {
  state.drawnPlayable = false
  if (state.skipPending) {
    state.skipPending = false
    state.message += ' · 下家被跳过'
    return
  }
  state.turn = (1 - state.turn) as PlayerId
}

/**
 * 出一张手牌。人类出 8 不带 chosenSuit 时进入花色宣告（等待
 * chooseSuit），其余情况立即结算（8 的花色缺省取 AI 策略的多数花色）。
 * @param state - 目标状态。
 * @param index - 手牌下标。
 * @param chosenSuit - 出 8 时宣告的花色（AI 或脚本必填；人类可省）。
 * @returns 是否合法并已执行（宣告中记为已执行）。
 */
export function playCard(state: Crazy8State, index: number, chosenSuit?: number): boolean {
  if (state.roundWinner !== null || state.pendingSuitChoice) return false
  const player = state.turn
  const hand = state.hands[player]
  const card = hand[index]
  if (card === undefined) return false
  if (!canPlayCard(card, state.activeSuit, topCard(state).rank)) return false
  hand.splice(index, 1)
  state.discard.push(card)
  state.passStreak = 0
  if (card.rank === WILD_RANK) {
    if (player === 0 && chosenSuit === undefined) {
      state.pendingSuitChoice = true
      state.message = '出了万能 8，请宣告花色'
      return true
    }
    state.activeSuit = chosenSuit ?? aiBestSuit(state)
  } else {
    state.activeSuit = card.suit
  }
  if (card.rank === SKIP_RANK) state.skipPending = true
  state.message = (player === 0 ? '你' : 'AI') + '出了 ' + cardLabel(card)
  finishPlay(state, player)
  return true
}

/**
 * 人类出 8 后宣告花色，完成该次出牌的结算。
 * @param state - 目标状态。
 * @param suit - 花色 0-3。
 * @returns 是否生效。
 */
export function chooseSuit(state: Crazy8State, suit: number): boolean {
  if (!state.pendingSuitChoice || suit < 0 || suit > 3) return false
  state.activeSuit = suit
  state.pendingSuitChoice = false
  state.message = '宣告花色：' + ['黑桃', '红心', '方块', '梅花'][suit]
  finishPlay(state, state.turn)
  return true
}

/**
 * 摸一张：牌堆耗尽时先把弃牌堆（保留顶牌）重洗为新牌堆；弃牌堆也
 * 只剩顶牌（全部牌在两家手里）时无牌可摸。
 * @param state - 目标状态。
 * @returns 摸到的牌，无牌可摸返回 null。
 */
export function drawCard(state: Crazy8State): Card | null {
  if (state.drawPile.length === 0) {
    if (state.discard.length <= 1) return null
    const top = state.discard.pop()!
    const pile = state.discard.splice(0, state.discard.length)
    state.drawPile = shuffle(pile, state.rng)
    state.discard = [top]
    state.reshuffles += 1
  }
  return state.drawPile.pop() ?? null
}

/** 双方连续无出牌且无牌可摸：本局平局（不计局分）。 */
function roundDraw(state: Crazy8State): void {
  state.roundWinner = -1
  state.drawnPlayable = false
  state.message = '双方都无牌可出，第 ' + state.round + ' 局平局'
}

/**
 * 无牌可出时的摸牌/过轮：摸到可出的牌保留出牌权（drawnPlayable 置
 * 位，可继续 playCard 或再次 passOrDraw 放弃出牌权）；摸到不可出的
 * 牌或无牌可摸则自动过轮。连续两回合无出牌判本局平局。
 * @param state - 目标状态。
 */
export function passOrDraw(state: Crazy8State): void {
  if (state.roundWinner !== null) return
  if (hasPlayable(state) && !state.drawnPlayable) {
    state.message = '还有可出的牌，不能摸牌'
    return
  }
  if (state.drawnPlayable) {
    state.drawnPlayable = false
    state.passStreak += 1
    if (state.passStreak >= 2) {
      roundDraw(state)
      return
    }
    advanceTurn(state)
    state.message = '放弃出牌，过轮'
    return
  }
  const card = drawCard(state)
  if (card === null) {
    state.passStreak += 1
    if (state.passStreak >= 2) {
      roundDraw(state)
      return
    }
    state.message = '牌堆已空，无牌可摸，过轮'
    advanceTurn(state)
    return
  }
  state.hands[state.turn]!.push(card)
  if (canPlayCard(card, state.activeSuit, topCard(state).rank)) {
    state.drawnPlayable = true
    state.message = '摸到可出的牌，可以打出或点击牌堆放弃'
  } else {
    state.passStreak += 1
    if (state.passStreak >= 2) {
      roundDraw(state)
      return
    }
    state.message = '摸牌后仍无可出，过轮'
    advanceTurn(state)
  }
}

/**
 * AI 花色宣告策略：自己手里张数最多的花色（并列取小下标，空手取 0）。
 * @param state - 目标状态（出 8 后手牌已移除该 8）。
 */
export function aiBestSuit(state: Crazy8State): number {
  const counts = suitCounts(state.hands[state.turn])
  let best = 0
  for (let s = 1; s < 4; s += 1) {
    if (counts[s]! > counts[best]!) best = s
  }
  return best
}

/** AI 选牌并出牌：候选池内按（同花张数 + seed 噪声）取最高。 */
function aiPlayBest(state: Crazy8State, pool: number[]): void {
  const hand = state.hands[state.turn]
  const counts = suitCounts(hand)
  let best = pool[0]!
  let bestScore = -Infinity
  for (const i of pool) {
    const c = hand[i]!
    const score = counts[c.suit]! + state.rng() * 0.45
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  const card = hand[best]!
  playCard(state, best, card.rank === WILD_RANK ? aiBestSuit(state) : undefined)
}

/**
 * AI 完整回合（对任一方通用，可脚本重放）：无牌可出先摸牌，摸到可出
 * 则打出；有牌可出时优先出非 8 的牌（8 留到没得出），按手中最多花色
 * 保持灵活性，seed 噪声打破并列。
 * @param state - 目标状态。
 */
export function aiTakeTurn(state: Crazy8State): void {
  if (state.roundWinner !== null || state.pendingSuitChoice) return
  const idxs = playableIndices(state)
  if (idxs.length === 0) {
    const turnBefore = state.turn
    const before = state.hands[turnBefore].length
    passOrDraw(state)
    if (state.roundWinner === null && state.turn === turnBefore && state.hands[turnBefore]!.length > before && hasPlayable(state)) {
      aiPlayBest(state, playableIndices(state))
    }
    return
  }
  const nonWild = idxs.filter(i => state.hands[state.turn]![i]!.rank !== WILD_RANK)
  aiPlayBest(state, nonWild.length > 0 ? nonWild : idxs)
}

/**
 * 进入下一局（先手在两家间交替）；整场已分胜负时忽略。
 * @param state - 目标状态。
 */
export function nextRound(state: Crazy8State): void {
  if (state.matchWinner !== null || state.roundWinner === null) return
  state.round += 1
  freshRound(state, ((state.round - 1) % 2) as PlayerId)
}

/**
 * 整场积分（onScore 上报值）：每赢一局 100 分，先拿下 3 局 2 胜另加
 * 50 分。
 * @param state - 目标状态。
 */
export function matchScore(state: Crazy8State): number {
  return state.wins[0]! * 100 + (state.matchWinner === 0 ? 50 : 0)
}

/** 牌面文案（'红心 8'）。 */
function cardLabel(card: Card): string {
  return ['黑桃', '红心', '方块', '梅花'][card.suit]! + ' ' + ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][card.rank]!
}

/**
 * 状态快照（排除 rng 闭包），供重放对比测试。
 * @param state - 目标状态。
 * @returns 可 toEqual 比较的纯数据对象。
 */
export function snapshot(state: Crazy8State): Record<string, unknown> {
  return {
    seed: state.seed,
    round: state.round,
    wins: [state.wins[0], state.wins[1]],
    drawPile: state.drawPile.map(c => ({ suit: c.suit, rank: c.rank })),
    discard: state.discard.map(c => ({ suit: c.suit, rank: c.rank })),
    hands: [
      state.hands[0]!.map(c => ({ suit: c.suit, rank: c.rank })),
      state.hands[1]!.map(c => ({ suit: c.suit, rank: c.rank })),
    ],
    turn: state.turn,
    activeSuit: state.activeSuit,
    pendingSuitChoice: state.pendingSuitChoice,
    skipPending: state.skipPending,
    drawnPlayable: state.drawnPlayable,
    passStreak: state.passStreak,
    reshuffles: state.reshuffles,
    roundWinner: state.roundWinner,
    matchWinner: state.matchWinner,
  }
}
