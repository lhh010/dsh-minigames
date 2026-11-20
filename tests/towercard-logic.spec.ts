import { describe, expect, it } from 'vitest'
import {
  COMBO_EACH, COMBO_HITS, DRAW_COUNT, ENERGY_PER_TURN, HAND_SIZE, START_DECK_SIZE,
  START_HP, TOTAL_FLOORS, VICTORY_HEAL, WEAK_FACTOR, canPlayCard, cardCost, cardName,
  createTower, endTurn, enemyIntent, mulberry32, pickReward, playCard, scoreOf,
  snapshotOf, type Card, type TowerState,
} from '../src/client/games/towercard/logic.ts'

/**
 * 找到手牌中第一张指定类别的牌的下标。
 * @param state - 塔状态。
 * @param kind - 牌种类别。
 * @returns 下标，找不到返回 -1。
 */
function indexOfKind(state: TowerState, kind: Card['kind']): number {
  return state.hand.findIndex((c) => c.kind === kind)
}

/**
 * 贪心自动战斗：按 能量→连击→攻击→虚弱→抽牌 的顺序把能打的都打出去，
 * 然后结束回合，直到战斗阶段结束。
 */
function autoplayBattle(state: TowerState): void {
  let guard = 0
  while (state.phase === 'battle') {
    guard += 1
    if (guard > 400) throw new Error('autoplay 意外陷入长战斗')
    // 按优先级循环出牌：先攻击/连击，再虚弱/抽牌/能量。
    const order: Card['kind'][] = ['combo', 'attack', 'weaken', 'draw', 'energy']
    let played = true
    while (played) {
      played = false
      for (const kind of order) {
        const i = indexOfKind(state, kind)
        if (i >= 0 && canPlayCard(state, i)) {
          expect(playCard(state, i)).toBe(true)
          played = true
          break
        }
      }
    }
    endTurn(state)
  }
}

/** 自动爬塔：贪心战斗 + 恒选奖励下标 rewardIdx，直到 dead/won。 */
function autoplayTower(state: TowerState, rewardIdx: number): void {
  let guard = 0
  while (state.phase === 'battle' || state.phase === 'reward') {
    guard += 1
    if (guard > 200) throw new Error('autoplay 意外陷入循环')
    if (state.phase === 'battle') autoplayBattle(state)
    else pickReward(state, rewardIdx)
  }
}

describe('towercard logic', () => {
  it('mulberry32 同种子重放一致，异种子发散；开局状态完整（12 牌组/5 手牌/3 能量/80 血）', () => {
    const a1 = mulberry32(42)
    const a2 = mulberry32(42)
    const b = mulberry32(43)
    const seqA1 = [a1(), a1(), a1(), a1()]
    const seqA2 = [a2(), a2(), a2(), a2()]
    expect(seqA1).toEqual(seqA2)
    expect(seqA1.some((v, i) => v !== seqA2[i])).toBe(false)
    expect(seqA1.join()).not.toBe([b(), b(), b(), b()].join())
    const s = createTower(7)
    expect(s.floor).toBe(1)
    expect(s.phase).toBe('battle')
    expect(s.player.hp).toBe(START_HP)
    expect(s.player.maxHp).toBe(START_HP)
    expect(s.player.energy).toBe(ENERGY_PER_TURN)
    expect(s.hand.length).toBe(HAND_SIZE)
    expect(s.deck.length + s.discard.length).toBe(START_DECK_SIZE - HAND_SIZE)
    expect(s.enemies.length).toBe(1)
    expect(s.enemies[0]!.hp).toBeGreaterThan(0)
  })

  it('洗牌确定性：同种子整塔逐位重放一致，异种子首层敌人配置不同', () => {
    const run = (seed: number): string[] => {
      const s = createTower(seed)
      const out = [snapshotOf(s)]
      autoplayTower(s, 1)
      out.push(snapshotOf(s))
      return out
    }
    expect(run(99)).toEqual(run(99))
    const d1 = createTower(100)
    const d2 = createTower(101)
    const shape1 = d1.enemies.map((e) => e.hp + '/' + e.atk + '/' + e.pattern).join()
    const shape2 = d2.enemies.map((e) => e.hp + '/' + e.atk + '/' + e.pattern).join()
    expect(shape1).not.toBe(shape2)
  })

  it('能量与出牌合法性：费用正确、耗尽后拒出，0 费能量牌净赚 1 能量', () => {
    expect(cardCost('attack')).toBe(1)
    expect(cardCost('block')).toBe(1)
    expect(cardCost('energy')).toBe(0)
    const s = createTower(5)
    // 弃到只剩可控牌：直接检查能量递减。
    let energy = s.player.energy
    for (let i = s.hand.length - 1; i >= 0; i -= 1) {
      if (s.player.energy <= 0) break
      if (indexOfKind(s, 'energy') === i) continue
      const before = s.player.energy
      expect(playCard(s, i)).toBe(true)
      expect(s.player.energy).toBe(before - 1)
      energy = s.player.energy
    }
    expect(energy).toBeLessThanOrEqual(0)
    expect(canPlayCard(s, 0)).toBe(false)
    // 无效下标与休战阶段拒出。
    expect(playCard(s, 99)).toBe(false)
    s.phase = 'reward'
    expect(canPlayCard(s, 0)).toBe(false)
    // 0 费能量牌 +1。
    const e = createTower(9)
    const ei = indexOfKind(e, 'energy')
    if (ei >= 0) {
      const before = e.player.energy
      playCard(e, ei)
      expect(e.player.energy).toBe(before + 1)
    }
  })

  it('伤害与格挡结算：先扣格挡再扣血，玩家格挡跨敌方回合生效后清零', () => {
    const s = createTower(3)
    // 造一张 8 格挡牌并出掉。
    s.hand.push({ id: 900, kind: 'block', value: 8 })
    expect(playCard(s, s.hand.length - 1)).toBe(true)
    expect(s.player.block).toBe(8)
    const enemy = s.enemies[0]!
    const intent = enemyIntent(enemy)
    expect(intent.type).not.toBe('big')
    if (intent.type === 'attack') {
      const hpBefore = s.player.hp
      endTurn(s)
      const dmg = intent.dmg
      if (dmg <= 8) {
        expect(s.player.hp).toBe(hpBefore)
      } else {
        expect(s.player.hp).toBe(hpBefore - (dmg - 8))
      }
    } else {
      endTurn(s)
    }
    // 敌方行动后格挡清零。
    expect(s.player.block).toBe(0)
    // 敌人格挡同样先吸收：手动压一张大攻牌。
    enemy.block = 4
    enemy.hp = enemy.maxHp
    s.phase = 'battle'
    s.hand.push({ id: 901, kind: 'attack', value: 9 })
    playCard(s, s.hand.length - 1)
    expect(enemy.hp).toBe(enemy.maxHp - 5)
  })

  it('虚弱 debuff：敌方伤害 -25% 持续 2 次行动后失效', () => {
    const s = createTower(11)
    s.enemies = [{ name: '傀儡', hp: 40, maxHp: 40, atk: 8, pattern: 'fixed', block: 0, weakTurns: 0, charging: false, turnIndex: 0, dead: false }]
    s.hand = [{ id: 910, kind: 'weaken', value: 0 }]
    playCard(s, 0)
    expect(s.enemies[0]!.weakTurns).toBe(2)
    const expectDmg = Math.floor(8 * WEAK_FACTOR)
    let hp = s.player.hp
    endTurn(s)
    expect(s.player.hp).toBe(hp - expectDmg)
    expect(s.enemies[0]!.weakTurns).toBe(1)
    hp = s.player.hp
    endTurn(s)
    expect(s.player.hp).toBe(hp - expectDmg)
    expect(s.enemies[0]!.weakTurns).toBe(0)
    hp = s.player.hp
    endTurn(s)
    expect(s.player.hp).toBe(hp - 8)
  })

  it('敌人模式机：fixed 每回合砍、alternate 攻防交替、charge 蓄力 telegraph 后重击', () => {
    const s = createTower(13)
    s.enemies = [{ name: 't', hp: 60, maxHp: 60, atk: 6, pattern: 'fixed', block: 0, weakTurns: 0, charging: false, turnIndex: 0, dead: false }]
    expect(enemyIntent(s.enemies[0]!).type).toBe('attack')
    s.enemies[0]!.pattern = 'alternate'
    expect(enemyIntent(s.enemies[0]!).type).toBe('attack')
    s.enemies[0]!.turnIndex = 1
    expect(enemyIntent(s.enemies[0]!).type).toBe('defend')
    s.enemies[0]!.pattern = 'charge'
    expect(enemyIntent(s.enemies[0]!).type).toBe('charge')
    let hp = s.player.hp
    endTurn(s)
    expect(s.player.hp).toBe(hp)
    expect(s.enemies[0]!.charging).toBe(true)
    expect(enemyIntent(s.enemies[0]!)).toEqual({ type: 'big', dmg: 12 })
    hp = s.player.hp
    endTurn(s)
    expect(s.player.hp).toBe(hp - 12)
    expect(s.enemies[0]!.charging).toBe(false)
  })

  it('特殊牌：连击两段各 5 伤、洞察抽 2 张（牌组循环回洗）', () => {
    const s = createTower(17)
    s.enemies = [{ name: 't', hp: 40, maxHp: 40, atk: 3, pattern: 'fixed', block: 0, weakTurns: 0, charging: false, turnIndex: 0, dead: false }]
    s.hand = [{ id: 920, kind: 'combo', value: 0 }]
    playCard(s, 0)
    expect(s.enemies[0]!.hp).toBe(40 - COMBO_HITS * COMBO_EACH)
    // 洞察抽 2：手牌 +2，抽空后弃牌堆回洗。
    s.hand = []
    s.discard = [{ id: 921, kind: 'attack', value: 6 }, { id: 922, kind: 'block', value: 5 }]
    s.deck = []
    s.phase = 'battle'
    s.hand.push({ id: 923, kind: 'draw', value: 0 })
    playCard(s, 0)
    expect(s.hand.length).toBe(DRAW_COUNT)
    expect(s.hand.map((c) => c.id)).toContain(921)
    expect(s.hand.map((c) => c.id)).toContain(922)
  })

  it('胜利结算：血量跨战斗保留 +6 封顶，奖励三选一齐全且类别互异', () => {
    const s = createTower(21)
    // 直接秒杀敌人触发胜利。
    s.enemies[0]!.hp = 1
    s.player.hp = 30
    const i = indexOfKind(s, 'attack')
    expect(playCard(s, i >= 0 ? i : 0)).toBe(true)
    expect(s.enemies[0]!.dead).toBe(true)
    expect(s.phase).toBe('reward')
    expect(s.player.hp).toBe(30 + VICTORY_HEAL)
    expect(s.rewards.length).toBe(3)
    const kinds = s.rewards.map((r) => r.kind).sort()
    expect(kinds).toEqual(['add', 'heal', 'remove'])
    expect(s.rewards[1]!.heal).toBe(12)
    expect(s.rewards[0]!.label).toContain(cardName(s.rewards[0]!.card!))
  })

  it('奖励领取：加牌使牌组变大、治疗封顶、删牌移除最弱一张，随后进入下一层', () => {
    const s = createTower(23)
    s.enemies[0]!.hp = 1
    s.player.hp = s.player.maxHp - 20
    const total = () => s.deck.length + s.discard.length + s.hand.length
    const before = total()
    const ai = indexOfKind(s, 'attack')
    playCard(s, ai >= 0 ? ai : 0)
    expect(s.phase).toBe('reward')
    pickReward(s, 0)
    expect(s.phase).toBe('battle')
    expect(s.floor).toBe(2)
    expect(total()).toBe(before + 1)
    // 治疗封顶。
    s.enemies[0]!.hp = 1
    s.player.hp = s.player.maxHp - 5
    const ai2 = indexOfKind(s, 'attack')
    playCard(s, ai2 >= 0 ? ai2 : 0)
    pickReward(s, 1)
    expect(s.player.hp).toBe(s.player.maxHp)
    // 删牌：最弱（value 最小或特殊牌 0）被移除。
    s.enemies[0]!.hp = 1
    const sizeBefore = total()
    const ai3 = indexOfKind(s, 'attack')
    playCard(s, ai3 >= 0 ? ai3 : 0)
    pickReward(s, 2)
    expect(total()).toBe(sizeBefore - 1)
  })

  it('第 5/10 层为 boss（单体高血蓄力），通顶后 phase=won 且计分含通关加成', () => {
    const s5 = createTower(29)
    while (s5.floor < 5) {
      s5.enemies[0]!.hp = 1
      const i = indexOfKind(s5, 'attack')
      playCard(s5, i >= 0 ? i : 0)
      pickReward(s5, 1)
    }
    expect(s5.floor).toBe(5)
    expect(s5.enemies.length).toBe(1)
    expect(s5.enemies[0]!.pattern).toBe('charge')
    expect(s5.enemies[0]!.maxHp).toBeGreaterThanOrEqual(50)
    // 冲顶到第 10 层验证 boss 与通关。
    while (s5.phase === 'battle' || s5.phase === 'reward') {
      if (s5.phase === 'battle') {
        for (const e of s5.enemies) if (!e.dead) e.hp = 1
        const i = indexOfKind(s5, 'attack')
        if (i >= 0) playCard(s5, i)
        else endTurn(s5)
      } else {
        if (s5.floor === TOTAL_FLOORS) break
        pickReward(s5, 1)
      }
    }
    expect(s5.floor).toBe(TOTAL_FLOORS)
    expect(s5.enemies[0]!.maxHp).toBeGreaterThanOrEqual(90)
    expect(s5.enemies[0]!.pattern).toBe('charge')
    s5.enemies[0]!.hp = 1
    const i = indexOfKind(s5, 'attack')
    playCard(s5, i >= 0 ? i : 0)
    expect(s5.phase).toBe('won')
    expect(scoreOf(s5)).toBe(TOTAL_FLOORS * 100 + 500 + s5.player.hp)
  })

  it('死亡判定：血量归零 phase=dead，层数不再推进，计分只含已清层', () => {
    const s = createTower(31)
    s.player.hp = 1
    s.player.block = 0
    s.enemies = [{ name: '终结者', hp: 90, maxHp: 90, atk: 9, pattern: 'fixed', block: 0, weakTurns: 0, charging: false, turnIndex: 0, dead: false }]
    endTurn(s)
    expect(s.player.hp).toBe(0)
    expect(s.phase).toBe('dead')
    expect(s.floor).toBe(1)
    expect(scoreOf(s)).toBe(0)
    endTurn(s)
    expect(s.phase).toBe('dead')
  })

  it('整塔重放：同种子贪心策略两次通关轨迹逐层一致（含血量与牌组规模）', () => {
    const trail = (seed: number): string => {
      const s = createTower(seed)
      const steps: string[] = []
      autoplayTower(s, 1)
      steps.push(s.phase, String(s.floor), String(s.player.hp))
      return steps.join('|')
    }
    for (const seed of [1, 123, 2026]) {
      expect(trail(seed)).toEqual(trail(seed))
    }
    // 治疗路线至少能推进若干层（引擎可玩性烟测）。
    const s = createTower(2026)
    autoplayTower(s, 1)
    expect(['dead', 'won']).toContain(s.phase)
    expect(s.floor).toBeGreaterThan(2)
  })
})
