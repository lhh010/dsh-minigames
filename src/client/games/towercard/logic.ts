/**
 * 迷你爬塔 TowerCard 纯逻辑：三层循环（战斗→奖励→下一层，共 10 层，第
 * 5/10 层 boss）。回合制卡牌战斗——每回合 3 能量、手牌 5 张，攻击/格挡/
 * 特殊（连击、抽牌、能量、虚弱）四类牌；敌人按固定/交替/蓄力三段模式机
 * 行动，蓄力回合 telegraph 警示。所有随机经注入 seed（mulberry32）驱动，
 * 同一 seed 整塔重放逐位确定。本文件无 DOM、无计时器，全部函数直接改写
 * state 或返回纯值，供测试与渲染共用。
 */

/** 牌种类别。 */
export type CardKind = 'attack' | 'block' | 'combo' | 'draw' | 'energy' | 'weaken'

/** 一张牌：attack/block 携带数值，特殊牌效果固定。 */
export interface Card {
  id: number
  kind: CardKind
  /** 攻击伤害或格挡量；其余类别为 0。 */
  value: number
}

/** 敌人攻击模式：fixed 每回合平砍，alternate 攻/防交替，charge 蓄力后重击。 */
export type EnemyPattern = 'fixed' | 'alternate' | 'charge'

/** 一名敌人。 */
export interface Enemy {
  name: string
  hp: number
  maxHp: number
  atk: number
  pattern: EnemyPattern
  block: number
  /** 虚弱剩余回合数（>0 时该敌人造成伤害 -25%）。 */
  weakTurns: number
  /** 蓄力中：本回合结束将释放重击。 */
  charging: boolean
  /** 已行动回合数（alternate 判奇偶用）。 */
  turnIndex: number
  dead: boolean
}

/** 奖励选项：加牌 / 治疗 / 删牌。 */
export type RewardKind = 'add' | 'heal' | 'remove'

/** 一项奖励。 */
export interface RewardOption {
  kind: RewardKind
  /** add：拟加入的牌；heal：回复量；remove：无附加数据。 */
  card?: Card
  heal: number
  /** 展示文案。 */
  label: string
}

/** 塔的阶段。 */
export type TowerPhase = 'battle' | 'reward' | 'dead' | 'won'

/** 玩家侧运行时数值。 */
export interface PlayerState {
  hp: number
  maxHp: number
  block: number
  energy: number
  energyMax: number
}

/** 整塔状态（含 rng，供 seed 确定性延续到洗牌与奖励）。 */
export interface TowerState {
  rng: () => number
  nextCardId: number
  floor: number
  phase: TowerPhase
  player: PlayerState
  /** 抽牌堆（末尾为顶）。 */
  deck: Card[]
  hand: Card[]
  discard: Card[]
  enemies: Enemy[]
  rewards: RewardOption[]
  /** 战斗内回合计数（含当前）。 */
  turn: number
  message: string
}

/** 顶部常量：初始血量 / 每回合能量 / 手牌数 / 起始牌组 / 总层数。 */
export const START_HP = 80
export const ENERGY_PER_TURN = 3
export const HAND_SIZE = 5
export const START_DECK_SIZE = 12
export const TOTAL_FLOORS = 10
/** 胜利回血量。 */
export const VICTORY_HEAL = 6
/** 虚弱减伤比例（乘 0.75 向下取整）。 */
export const WEAK_FACTOR = 0.75

/**
 * mulberry32 确定性伪随机数发生器（注入 seed 用）。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates 洗牌（用 state 的 rng，就地修改数组）。 */
function shuffle(cards: Card[], rng: () => number): void {
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = cards[i]!
    cards[i] = cards[j]!
    cards[j] = tmp
  }
}

/** 新建一张牌（id 由 state 计数器发放）。 */
function makeCard(state: TowerState, kind: CardKind, value = 0): Card {
  const card: Card = { id: state.nextCardId, kind, value }
  state.nextCardId += 1
  return card
}

/** 造一张随机数值牌（奖励加牌用）：攻击 6-12 / 格挡 5-8 / 特殊固定。 */
function rollCard(state: TowerState, kind: CardKind): Card {
  if (kind === 'attack') return makeCard(state, 'attack', 6 + Math.floor(state.rng() * 7))
  if (kind === 'block') return makeCard(state, 'block', 5 + Math.floor(state.rng() * 4))
  return makeCard(state, kind, 0)
}

/** 特殊牌效果常量。 */
export const COMBO_HITS = 2
export const COMBO_EACH = 5
export const DRAW_COUNT = 2

/** 各类牌的能量费用（energy 牌 0 费回 2 能量）。 */
export function cardCost(kind: CardKind): number {
  return kind === 'energy' ? 0 : 1
}

/** 牌面名（渲染与日志共用）。 */
export function cardName(card: Card): string {
  if (card.kind === 'attack') return '斩击 ' + card.value
  if (card.kind === 'block') return '护壁 ' + card.value
  if (card.kind === 'combo') return '连击 x2'
  if (card.kind === 'draw') return '洞察 抽2'
  if (card.kind === 'energy') return '水晶 +1能量'
  return '诅咒 虚弱2回合'
}

/**
 * 按层数生成敌人配置（数值随层数递增；5/10 层为 boss 单体蓄力模式）。
 * @param state - 塔状态（rng 用于血量/攻击抖动）。
 * @param floor - 1..10 层号。
 * @returns 敌人数组。
 */
function makeEnemies(state: TowerState, floor: number): Enemy[] {
  const r = state.rng
  const make = (name: string, hp: number, atk: number, pattern: EnemyPattern): Enemy => ({
    name, hp, maxHp: hp, atk, pattern, block: 0, weakTurns: 0,
    charging: false, turnIndex: 0, dead: false,
  })
  if (floor === 5) return [make('石像守卫·中柱', 58, 9, 'charge')]
  if (floor === TOTAL_FLOORS) return [make('塔顶魔像', 92, 12, 'charge')]
  if (floor <= 4) {
    const hp = 13 + floor * 3 + Math.floor(r() * 4)
    const atk = 4 + floor + Math.floor(r() * 2)
    const pattern: EnemyPattern = floor <= 1 ? 'fixed' : r() < 0.5 ? 'alternate' : 'fixed'
    return [make('塔鼠掠夺者', hp, atk, pattern)]
  }
  // 6-9 层：1-2 名精英。
  if (r() < 0.45) {
    return [
      make('鸦面武士', 20 + floor + Math.floor(r() * 4), 6 + Math.floor(r() * 2), 'alternate'),
      make('鸦面射手', 16 + floor + Math.floor(r() * 4), 5 + Math.floor(r() * 2), 'fixed'),
    ]
  }
  return [make('缚链魔', 24 + floor * 2 + Math.floor(r() * 5), 7 + Math.floor(r() * 3), 'charge')]
}

/**
 * 开创整塔（起始 12 张：4 攻 4 格 + 连击/抽牌/能量/虚弱 各 1）。
 * @param seed - 种子。
 * @returns 第 1 层战斗就绪的塔状态。
 */
export function createTower(seed: number): TowerState {
  const state: TowerState = {
    rng: mulberry32(seed),
    nextCardId: 1,
    floor: 1,
    phase: 'battle',
    player: { hp: START_HP, maxHp: START_HP, block: 0, energy: ENERGY_PER_TURN, energyMax: ENERGY_PER_TURN },
    deck: [], hand: [], discard: [],
    enemies: [], rewards: [],
    turn: 1,
    message: '',
  }
  for (let i = 0; i < 4; i += 1) state.deck.push(makeCard(state, 'attack', 6 + i % 7))
  for (let i = 0; i < 4; i += 1) state.deck.push(makeCard(state, 'block', 5 + i % 4))
  state.deck.push(makeCard(state, 'combo'))
  state.deck.push(makeCard(state, 'draw'))
  state.deck.push(makeCard(state, 'energy'))
  state.deck.push(makeCard(state, 'weaken'))
  state.enemies = makeEnemies(state, 1)
  shuffle(state.deck, state.rng)
  drawUpTo(state)
  state.message = '第 1 层 · ' + state.enemies[0]!.name + ' 来袭'
  return state
}

/** 抽牌堆见底时把弃牌堆洗回（rng 确定）。 */
function refillDeck(state: TowerState): void {
  if (state.deck.length === 0 && state.discard.length > 0) {
    shuffle(state.discard, state.rng)
    state.deck = state.discard
    state.discard = []
  }
}

/** 抽一张牌入手（无牌可抽则静默）。 */
function drawOne(state: TowerState): void {
  refillDeck(state)
  const card = state.deck.pop()
  if (card !== undefined) state.hand.push(card)
}

/** 补满手牌至 HAND_SIZE。 */
function drawUpTo(state: TowerState): void {
  while (state.hand.length < HAND_SIZE) {
    const before = state.hand.length
    drawOne(state)
    if (state.hand.length === before) break
  }
}

/**
 * 出牌合法性：战斗中、索引有效、能量足够。
 * @param state - 塔状态。
 * @param handIndex - 手牌下标。
 */
export function canPlayCard(state: TowerState, handIndex: number): boolean {
  if (state.phase !== 'battle') return false
  const card = state.hand[handIndex]
  if (card === undefined) return false
  return state.player.energy >= cardCost(card.kind)
}

/** 对敌人结算伤害：先扣格挡再扣血，返回实际掉血。 */
function damageEnemy(enemy: Enemy, amount: number): number {
  const absorbed = Math.min(enemy.block, amount)
  enemy.block -= absorbed
  const hpLoss = amount - absorbed
  enemy.hp -= hpLoss
  if (enemy.hp <= 0) {
    enemy.hp = 0
    enemy.dead = true
  }
  return hpLoss
}

/** 对玩家结算伤害：先扣格挡再扣血（不在此判死亡，由 endTurn 统一收尾）。 */
function damagePlayer(state: TowerState, amount: number): void {
  const absorbed = Math.min(state.player.block, amount)
  state.player.block -= absorbed
  state.player.hp -= amount - absorbed
}

/** 存活敌人下标列表。 */
function aliveEnemies(state: TowerState): number[] {
  const out: number[] = []
  for (let i = 0; i < state.enemies.length; i += 1) {
    if (!state.enemies[i]!.dead) out.push(i)
  }
  return out
}

/** 攻击目标解析：指定无效时取第一个存活敌人，无敌人返回 -1。 */
function resolveTarget(state: TowerState, targetIndex: number): number {
  if (targetIndex >= 0 && !state.enemies[targetIndex]?.dead) return targetIndex
  const alive = aliveEnemies(state)
  return alive.length > 0 ? alive[0]! : -1
}

/**
 * 打出一张手牌。
 * @param state - 塔状态。
 * @param handIndex - 手牌下标。
 * @param targetIndex - 攻击目标敌人下标（无效则取首个存活敌人）。
 * @returns 是否成功打出（非法返回 false 且不改状态）。
 */
export function playCard(state: TowerState, handIndex: number, targetIndex = -1): boolean {
  if (!canPlayCard(state, handIndex)) return false
  const card = state.hand[handIndex]!
  state.hand.splice(handIndex, 1)
  state.player.energy -= cardCost(card.kind)
  if (card.kind === 'attack') {
    const t = resolveTarget(state, targetIndex)
    if (t >= 0) damageEnemy(state.enemies[t]!, card.value)
  } else if (card.kind === 'block') {
    state.player.block += card.value
  } else if (card.kind === 'combo') {
    const t = resolveTarget(state, targetIndex)
    if (t >= 0) {
      for (let i = 0; i < COMBO_HITS; i += 1) damageEnemy(state.enemies[t]!, COMBO_EACH)
    }
  } else if (card.kind === 'draw') {
    for (let i = 0; i < DRAW_COUNT; i += 1) drawOne(state)
  } else if (card.kind === 'energy') {
    state.player.energy += 1
  } else {
    const alive = aliveEnemies(state)
    for (const i of alive) state.enemies[i]!.weakTurns = Math.max(state.enemies[i]!.weakTurns, 2)
  }
  state.discard.push(card)
  if (aliveEnemies(state).length === 0) finishBattle(state)
  return true
}

/**
 * 敌人下一步意图（渲染 telegraph 用）。
 * @returns attack 为常规伤害（已含虚弱折减），big 为蓄力重击，charge 为本回合蓄力，defend 为加格挡。
 */
export function enemyIntent(enemy: Enemy): { type: 'attack' | 'big' | 'charge' | 'defend'; dmg: number } {
  const weak = enemy.weakTurns > 0
  const raw = (n: number): number => Math.floor(n * (weak ? WEAK_FACTOR : 1))
  if (enemy.pattern === 'fixed') return { type: 'attack', dmg: raw(enemy.atk) }
  if (enemy.pattern === 'alternate') {
    return enemy.turnIndex % 2 === 0
      ? { type: 'attack', dmg: raw(enemy.atk) }
      : { type: 'defend', dmg: 0 }
  }
  // charge：蓄力中则下回合重击，否则本回合蓄力。
  return enemy.charging ? { type: 'big', dmg: raw(enemy.atk * 2) } : { type: 'charge', dmg: 0 }
}

/**
 * 结束回合：弃手牌 → 存活敌人依次行动 → 清玩家格挡 → 重抽手牌、回能量。
 * 全灭则进奖励层（第 10 层直接通关）；玩家血归零判负。
 */
export function endTurn(state: TowerState): void {
  if (state.phase !== 'battle') return
  for (const card of state.hand) state.discard.push(card)
  state.hand = []
  let playerHit = false
  for (const enemy of state.enemies) {
    if (enemy.dead) continue
    const intent = enemyIntent(enemy)
    if (intent.type === 'attack' || intent.type === 'big') {
      damagePlayer(state, intent.dmg)
      playerHit = true
    } else if (intent.type === 'defend') {
      enemy.block += 6
    }
    if (enemy.pattern === 'charge') enemy.charging = !enemy.charging
    enemy.turnIndex += 1
    if (enemy.weakTurns > 0) enemy.weakTurns -= 1
  }
  state.player.block = 0
  if (state.player.hp <= 0) {
    state.player.hp = 0
    state.phase = 'dead'
    state.message = '倒在了第 ' + state.floor + ' 层'
    return
  }
  if (aliveEnemies(state).length === 0) {
    finishBattle(state)
    return
  }
  state.player.energy = state.player.energyMax
  state.turn += 1
  drawUpTo(state)
  state.message = playerHit ? '敌方行动完毕，重新抽牌' : '敌方蓄势，你毫发无伤'
}

/** 战斗胜利收尾：手牌入弃牌堆、回血、第 10 层通关、否则生成三选一奖励。 */
function finishBattle(state: TowerState): void {
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + VICTORY_HEAL)
  state.player.block = 0
  for (const card of state.hand) state.discard.push(card)
  state.hand = []
  if (state.floor >= TOTAL_FLOORS) {
    state.phase = 'won'
    state.message = '十层通顶，塔已臣服'
    return
  }
  state.rewards = makeRewards(state)
  state.phase = 'reward'
  state.message = '战斗胜利，选一项奖励'
}

/**
 * 生成三选一奖励：新牌（随机类别）/ 治疗 12 / 删牌（移除价值最低牌）。
 */
function makeRewards(state: TowerState): RewardOption[] {
  const kinds: CardKind[] = ['attack', 'block', 'combo', 'draw', 'energy', 'weaken']
  const kind = kinds[Math.floor(state.rng() * kinds.length)]!
  const card = rollCard(state, kind)
  return [
    { kind: 'add', card, heal: 0, label: '入组：' + cardName(card) },
    { kind: 'heal', heal: 12, label: '治疗 +12' },
    { kind: 'remove', heal: 0, label: '删牌：移除最弱一张' },
  ]
}

/** 价值最低的牌（删牌目标）：数值牌取最小 value，特殊牌视为 0。 */
function worstCardIndex(state: TowerState): number {
  let worst = -1
  let worstScore = Infinity
  const pool = state.deck.concat(state.discard)
  for (let i = 0; i < pool.length; i += 1) {
    const c = pool[i]!
    const score = c.kind === 'attack' || c.kind === 'block' ? c.value : 0
    if (score < worstScore) {
      worstScore = score
      worst = i
    }
  }
  return worst
}

/**
 * 领取奖励并进入下一层。
 * @param state - 塔状态。
 * @param index - 奖励下标（越界忽略）。
 */
export function pickReward(state: TowerState, index: number): void {
  if (state.phase !== 'reward') return
  const option = state.rewards[index]
  if (option === undefined) return
  if (option.kind === 'add' && option.card !== undefined) {
    state.deck.push(option.card)
  } else if (option.kind === 'heal') {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + option.heal)
  } else {
    const wi = worstCardIndex(state)
    if (wi >= 0) {
      const pool = state.deck.concat(state.discard)
      const target = pool[wi]!
      const di = state.deck.indexOf(target)
      if (di >= 0) state.deck.splice(di, 1)
      else state.discard.splice(state.discard.indexOf(target), 1)
    }
  }
  state.rewards = []
  state.floor += 1
  state.turn = 1
  state.player.energy = state.player.energyMax
  state.player.block = 0
  state.deck = state.deck.concat(state.discard)
  state.discard = []
  state.enemies = makeEnemies(state, state.floor)
  state.phase = 'battle'
  shuffle(state.deck, state.rng)
  drawUpTo(state)
  state.message = '第 ' + state.floor + ' 层 · ' + state.enemies.map((e) => e.name).join('/')
}

/**
 * 计分：已清层数 x100，通顶额外 +500 与剩余血量。
 * @param state - 塔状态。
 */
export function scoreOf(state: TowerState): number {
  const cleared = state.phase === 'won' ? TOTAL_FLOORS : Math.max(0, state.floor - 1)
  return cleared * 100 + (state.phase === 'won' ? 500 + state.player.hp : 0)
}

/** 调试/测试用状态摘要：层数/阶段/血量/牌组尺寸。 */
export function snapshotOf(state: TowerState): string {
  return [
    state.floor, state.phase, state.player.hp, state.player.energy,
    state.deck.length, state.hand.length, state.discard.length,
    state.enemies.map((e) => e.hp + (e.dead ? 'd' : '')).join(','),
  ].join('|')
}
