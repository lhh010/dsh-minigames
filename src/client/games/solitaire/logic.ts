/**
 * 纸牌接龙（Klondike Solitaire）纯逻辑：标准 52 张牌，确定性洗牌
 * mulberry32(seed + 局号)，发 7 列（第 i 列 i+1 张、列首翻开）+ 发牌堆
 * + 废牌堆 + 4 个基础堆。规则：列上叠牌红黑交替且比上一张小 1，空列只
 * 能放 K，基础堆同花色从 A 递增。计分：进基础堆 +10、翻开暗牌 +5。
 * 所有操作均为纯函数（就地更新 + undo 快照栈），同一 seed 与操作序列
 * 必然得到同一状态，可脱离 DOM 直接模拟验证。
 */

/** 逻辑画布宽度 px。 */
export const W = 560
/** 逻辑画布高度 px。 */
export const H = 680
/** HUD 条高度 px（含在 H 内）。 */
export const HUD_H = 34

/** 牌面宽度 px。 */
export const CARD_W = 70
/** 牌面高度 px。 */
export const CARD_H = 98
/** 顶排（发牌堆/废牌堆/基础堆）y 坐标。 */
export const TOP_Y = HUD_H + 10
/** 列区 y 坐标。 */
export const COL_Y = TOP_Y + CARD_H + 14
/** 暗牌纵向层叠偏移 px。 */
export const OFFSET_DOWN = 18
/** 明牌纵向层叠偏移 px。 */
export const OFFSET_UP = 26

/** 花色记号（索引 0-3：黑桃/红心/方块/梅花，红黑红黑交替判定用）。 */
export const SUITS = ['♠', '♥', '♦', '♣'] as const
/** 牌点显示（1-13 → A..K）。 */
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const

/** 一张牌：花色 0-3、点数 1-13、是否翻开。 */
export interface Card {
  suit: number
  rank: number
  faceUp: boolean
}

/** 一张牌是否红色（红心/方块）。 */
export function isRed(card: Card): boolean {
  return card.suit === 1 || card.suit === 2
}

/** 移动源：废牌堆顶 / 基础堆顶 / 列中某张已翻开的牌（含其下整段）。 */
export type CardSource =
  | { zone: 'waste' }
  | { zone: 'foundation', index: number }
  | { zone: 'column', index: number, cardIndex: number }

/** 点击命中的区域。 */
export type HitZone =
  | { zone: 'stock' }
  | { zone: 'waste' }
  | { zone: 'foundation', index: number }
  | { zone: 'column', index: number, cardIndex: number }
  | null

/** 一局游戏的完整可测状态。 */
export interface SolitaireState {
  /** 基础 seed（与局号相加后用于洗牌）。 */
  seed: number
  /** 局号（从 1 起，R 重开 +1，换一副新牌）。 */
  gameNo: number
  /** 累计分。 */
  score: number
  /** 步数（每次有效操作 +1）。 */
  moves: number
  /** 发牌堆（牌背朝上，从末尾发牌）。 */
  stock: Card[]
  /** 废牌堆（顶为末尾）。 */
  waste: Card[]
  /** 4 个基础堆（按花色索引，顶为末尾）。 */
  foundations: Card[][]
  /** 7 列（顶为末尾）。 */
  columns: Card[][]
  /** undo 快照栈（每次有效操作前压入完整克隆）。 */
  undoStack: string[]
  /** 是否已胜利（4 基础堆全满）。 */
  won: boolean
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

/**
 * 深克隆状态（undo 快照 / 测试比对用）。
 * @param state - 当前状态。
 * @returns 结构完全独立的副本。
 */
export function cloneState(state: SolitaireState): SolitaireState {
  return {
    seed: state.seed,
    gameNo: state.gameNo,
    score: state.score,
    moves: state.moves,
    stock: state.stock.map((c) => ({ ...c })),
    waste: state.waste.map((c) => ({ ...c })),
    foundations: state.foundations.map((f) => f.map((c) => ({ ...c }))),
    columns: state.columns.map((c) => c.map((x) => ({ ...x }))),
    undoStack: state.undoStack.slice(),
    won: state.won,
  }
}

/**
 * 生成一副标准 52 张牌并用 mulberry32(seed+局号) Fisher-Yates 洗牌。
 * @param seed - 基础种子。
 * @param gameNo - 局号。
 * @returns 洗好的 52 张牌（全部未翻开）。
 */
export function shuffledDeck(seed: number, gameNo: number): Card[] {
  const rand = mulberry32((seed + gameNo) >>> 0)
  const deck: Card[] = []
  for (let suit = 0; suit < 4; suit += 1) {
    for (let rank = 1; rank <= 13; rank += 1) deck.push({ suit, rank, faceUp: false })
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = deck[i]!
    deck[i] = deck[j]!
    deck[j] = tmp
  }
  return deck
}

/**
 * 新开一局：洗牌、发 7 列（列 i 有 i+1 张、末张翻开），余牌入发牌堆。
 * @param seed - 基础种子。
 * @param gameNo - 局号（默认 1）。
 * @returns 初始状态。
 */
export function createSolitaire(seed: number, gameNo = 1): SolitaireState {
  const deck = shuffledDeck(seed, gameNo)
  const columns: Card[][] = []
  let dealt = 0
  for (let i = 0; i < 7; i += 1) {
    const count = i + 1
    const col = deck.slice(dealt, dealt + count)
    dealt += count
    col[col.length - 1]!.faceUp = true
    columns.push(col)
  }
  return {
    seed,
    gameNo,
    score: 0,
    moves: 0,
    stock: deck.slice(dealt),
    waste: [],
    foundations: [[], [], [], []],
    columns,
    undoStack: [],
    won: false,
  }
}

// ---------------------------------------------------------------------------
// 几何与命中检测（渲染与交互共用的逻辑坐标系）。
// ---------------------------------------------------------------------------

/** 顶排第 slot 个槽位（0 发牌堆、1 废牌堆、3-6 基础堆）的 x 坐标。 */
export function slotX(slot: number): number {
  const gap = (W - 7 * CARD_W) / 8
  return gap + slot * (CARD_W + gap)
}

/** 第 index 列的 x 坐标（与顶排槽位对齐）。 */
export function colX(index: number): number {
  return slotX(index)
}

/** 列内第 cardIndex 张牌的 y 坐标。 */
export function cardY(column: Card[], cardIndex: number): number {
  let y = COL_Y
  for (let i = 0; i < cardIndex && i < column.length; i += 1) {
    y += column[i]!.faceUp ? OFFSET_UP : OFFSET_DOWN
  }
  return y
}

/** 矩形包含判定。 */
function inRect(x: number, y: number, rx: number, ry: number, rw: number, rh: number): boolean {
  return x >= rx && x < rx + rw && y >= ry && y < ry + rh
}

/**
 * 命中检测：逻辑坐标落在哪个可点击对象上（列取命中的具体牌；列底以下
 * 的空白算作命中该列最后一张牌，便于点很长的牌堆）。
 * @param state - 当前状态。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @returns 命中区域描述，未命中返回 null。
 */
export function hitTest(state: SolitaireState, x: number, y: number): HitZone {
  if (y >= TOP_Y && y < TOP_Y + CARD_H) {
    for (let s = 0; s < 7; s += 1) {
      if (inRect(x, y, slotX(s), TOP_Y, CARD_W, CARD_H)) {
        if (s === 0) return { zone: 'stock' }
        if (s === 1) return { zone: 'waste' }
        return { zone: 'foundation', index: s - 2 }
      }
    }
    return null
  }
  if (y >= COL_Y && x >= slotX(0) && x < slotX(6) + CARD_W) {
    let index = -1
    for (let c = 0; c < 7; c += 1) {
      if (x >= slotX(c) && x < slotX(c) + CARD_W) index = c
    }
    if (index < 0) return null
    const column = state.columns[index]!
    if (column.length === 0) return { zone: 'column', index, cardIndex: 0 }
    for (let i = column.length - 1; i >= 0; i -= 1) {
      const cy = cardY(column, i)
      if (y >= cy) return { zone: 'column', index, cardIndex: i }
    }
    return { zone: 'column', index, cardIndex: 0 }
  }
  return null
}

// ---------------------------------------------------------------------------
// 规则判定与操作。
// ---------------------------------------------------------------------------

/**
 * 一张牌能否放到某列列顶：红黑交替且比顶牌小 1；空列只收 K。
 * @param state - 当前状态。
 * @param card - 待放的牌。
 * @param colIndex - 目标列号。
 * @returns true 表示合法。
 */
export function canPlaceOnColumn(state: SolitaireState, card: Card, colIndex: number): boolean {
  const column = state.columns[colIndex]!
  if (column.length === 0) return card.rank === 13
  const top = column[column.length - 1]!
  if (!top.faceUp) return false
  return top.rank === card.rank + 1 && isRed(top) !== isRed(card)
}

/**
 * 一张牌能否收到其花色基础堆：顶牌大 1（空堆收 A）。
 * @param state - 当前状态。
 * @param card - 待收的牌。
 * @returns true 表示合法。
 */
export function canPlaceOnFoundation(state: SolitaireState, card: Card): boolean {
  const pile = state.foundations[card.suit]!
  if (pile.length === 0) return card.rank === 1
  return pile[pile.length - 1]!.rank === card.rank - 1
}

/** 读取移动源对应的牌序列（不修改状态）。 */
function sourceCards(state: SolitaireState, src: CardSource): Card[] {
  if (src.zone === 'waste') return state.waste.length > 0 ? [state.waste[state.waste.length - 1]!] : []
  if (src.zone === 'foundation') {
    const pile = state.foundations[src.index]!
    return pile.length > 0 ? [pile[pile.length - 1]!] : []
  }
  return state.columns[src.index]!.slice(src.cardIndex)
}

/** 移动源是否有效（有牌；列源必须是已翻开的牌）。 */
function sourceValid(state: SolitaireState, src: CardSource): boolean {
  if (src.zone === 'waste') return state.waste.length > 0
  if (src.zone === 'foundation') return state.foundations[src.index]!.length > 0
  const column = state.columns[src.index]!
  return src.cardIndex >= 0 && src.cardIndex < column.length && column[src.cardIndex]!.faceUp
}

/** 从源移走牌序列（就地），列变空后自动翻开新列顶。 */
function takeSource(state: SolitaireState, src: CardSource): Card[] {
  if (src.zone === 'waste') return [state.waste.pop()!]
  if (src.zone === 'foundation') return [state.foundations[src.index]!.pop()!]
  const column = state.columns[src.index]!
  const cards = column.splice(src.cardIndex)
  flipColumnTop(state, column)
  return cards
}

/** 列非空且列顶为暗牌时翻开并 +5 分。 */
function flipColumnTop(state: SolitaireState, column: Card[]): void {
  if (column.length > 0) {
    const top = column[column.length - 1]!
    if (!top.faceUp) {
      top.faceUp = true
      state.score += 5
    }
  }
}

/** 压入 undo 快照并步数 +1。 */
function commit(state: SolitaireState): void {
  state.undoStack.push(JSON.stringify({
    score: state.score, moves: state.moves, stock: state.stock, waste: state.waste,
    foundations: state.foundations, columns: state.columns, won: state.won,
  }))
  state.moves += 1
  if (state.foundations.every((f) => f.length === 13)) state.won = true
}

/**
 * 从发牌堆翻一张到废牌堆（一次一张）；发牌堆空时把废牌堆洗回发牌堆。
 * @param state - 目标状态（就地更新）。
 * @returns true 表示发生了变化。
 */
export function drawStock(state: SolitaireState): boolean {
  if (state.won) return false
  if (state.stock.length === 0) {
    if (state.waste.length === 0) return false
    commit(state)
    while (state.waste.length > 0) {
      const card = state.waste.pop()!
      card.faceUp = false
      state.stock.push(card)
    }
    return true
  }
  commit(state)
  const card = state.stock.pop()!
  card.faceUp = true
  state.waste.push(card)
  return true
}

/**
 * 把源牌序列移到某列（列规则校验，失败不改动）。
 * @param state - 目标状态（就地更新）。
 * @param src - 移动源。
 * @param colIndex - 目标列号。
 * @returns true 表示移动成功。
 */
export function moveToColumn(state: SolitaireState, src: CardSource, colIndex: number): boolean {
  if (state.won || !sourceValid(state, src)) return false
  const cards = sourceCards(state, src)
  if (cards.length === 0 || !canPlaceOnColumn(state, cards[0]!, colIndex)) return false
  commit(state)
  const moving = takeSource(state, src)
  for (const card of moving) state.columns[colIndex]!.push(card)
  return true
}

/**
 * 把源顶牌收进其花色基础堆（+10 分，失败不改动）。
 * @param state - 目标状态（就地更新）。
 * @param src - 移动源（只取顶牌）。
 * @returns true 表示移动成功。
 */
export function moveToFoundation(state: SolitaireState, src: CardSource): boolean {
  if (state.won || !sourceValid(state, src)) return false
  const cards = sourceCards(state, src)
  if (cards.length > 1 || cards.length === 0) return false
  const card = cards[0]!
  if (!canPlaceOnFoundation(state, card)) return false
  commit(state)
  const moving = takeSource(state, src)
  state.foundations[card.suit]!.push(moving[0]!)
  state.score += 10
  return true
}

/**
 * 回退一步：弹出最近一次操作的快照恢复（分数/步数/牌局全还原）。
 * @param state - 目标状态（就地更新）。
 * @returns true 表示回退成功（栈空返回 false）。
 */
export function undo(state: SolitaireState): boolean {
  const snap = state.undoStack.pop()
  if (snap === undefined) return false
  const parsed = JSON.parse(snap) as {
    score: number, moves: number, stock: Card[], waste: Card[],
    foundations: Card[][], columns: Card[][], won: boolean,
  }
  state.score = parsed.score
  state.moves = parsed.moves
  state.stock = parsed.stock
  state.waste = parsed.waste
  state.foundations = parsed.foundations
  state.columns = parsed.columns
  state.won = parsed.won
  return true
}

/**
 * 为源顶牌自动寻找合法目标：优先基础堆，其次最左可行列。
 * @param state - 当前状态。
 * @param src - 移动源（只对单牌生效：废牌堆 / 基础堆 / 列顶）。
 * @returns 目标描述，或 null 表示无处可去。
 */
export function findAutoTarget(state: SolitaireState, src: CardSource): { to: 'foundation' } | { to: 'column', index: number } | null {
  const cards = sourceCards(state, src)
  if (!sourceValid(state, src) || cards.length !== 1) return null
  const card = cards[0]!
  if (canPlaceOnFoundation(state, card)) return { to: 'foundation' }
  for (let i = 0; i < 7; i += 1) {
    if (src.zone === 'column' && src.index === i) continue
    if (canPlaceOnColumn(state, card, i)) return { to: 'column', index: i }
  }
  return null
}

/**
 * 列中某张已翻开的牌（含下方整段）作为合法移动源；命中暗牌时取其上
 * 无明牌则不可选，返回 null。供交互层把点击翻译成移动源。
 * @param state - 当前状态。
 * @param hit - 命中区域。
 * @returns 移动源，或 null（不可选）。
 */
export function selectableSource(state: SolitaireState, hit: HitZone): CardSource | null {
  if (hit === null) return null
  if (hit.zone === 'waste') return { zone: 'waste' }
  if (hit.zone === 'foundation') return { zone: 'foundation', index: hit.index }
  if (hit.zone === 'column') {
    const column = state.columns[hit.index]!
    if (hit.cardIndex >= column.length || (hit.cardIndex < column.length - 1 && !column[hit.cardIndex]!.faceUp)) return null
    if (column.length === 0) return null
    return { zone: 'column', index: hit.index, cardIndex: hit.cardIndex }
  }
  return null
}
