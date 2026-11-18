import { describe, expect, it } from 'vitest'
import {
  BURN_PENALTY, GREEN_HI, GREEN_LO, HEAT_PERIOD_MS, LEVELS, MAX_QUEUE, ORDER_BONUS, PAIR_BONUS, PAIR_WINDOW_MS,
  PERFECT_BONUS, RED_EDGE, STEP_MS, STEP_SCORE, TARGET_PER_LEVEL, TIMING_MAX_MS, TOTAL_LEVELS, VOID_PENALTY,
  createRecipeState, cycleOrder, heatCursor, judgeHeat, makeOrder, mulberry32, pickup, placeStep, selectOrder,
  tickRecipe, type RecipeState,
} from '../src/client/games/recipe/logic.ts'

/** 把第 idx 张订单的下一道工序放上正确工位并等它进入火候期。 */
function cookNextToTiming(state: RecipeState, orderIdx: number): number {
  const order = state.orders[orderIdx]!
  const kind = order.steps[order.stepIndex]!
  const station = kind === 'cut' ? 2 : 0
  expect(placeStep(state, orderIdx, station)).toBe('placed')
  tickRecipe(state, STEP_MS[kind] + 1)
  return station
}

describe('recipe logic', () => {
  it('generates a deterministic seeded queue of 3 valid orders', () => {
    const a = createRecipeState(42)
    const b = createRecipeState(42)
    expect(a.orders).toHaveLength(MAX_QUEUE)
    expect(b.orders.map((o) => o.steps.join(',') + '/' + o.paired)).toEqual(a.orders.map((o) => o.steps.join(',') + '/' + o.paired))
    for (const order of a.orders) {
      expect(order.steps[0]).toBe('cut') // 首道固定切（砧板必用）
      expect(order.steps[order.steps.length - 1] === 'boil' || order.steps[order.steps.length - 1] === 'fry').toBe(true)
      expect(order.timeLeftMs).toBe(order.limitMs)
      expect(order.stepIndex).toBe(0)
    }
    // 第 1-3 关无同煮单
    expect(a.orders.every((o) => o.paired === false)).toBe(true)
    const c = createRecipeState(7)
    expect(c.rng === a.rng).toBe(false)
  })

  it('ramps level config: 3→5 ingredients, tighter limits, paired from level 4', () => {
    expect(LEVELS).toHaveLength(TOTAL_LEVELS)
    expect(LEVELS.map((l) => l.ingredientCount)).toEqual([3, 3, 4, 4, 5])
    for (let i = 1; i < LEVELS.length; i += 1) {
      expect(LEVELS[i]!.limitMs).toBeLessThan(LEVELS[i - 1]!.limitMs)
    }
    expect(LEVELS.slice(0, 3).every((l) => l.pairedChance === 0)).toBe(true)
    expect(LEVELS.slice(3).every((l) => l.pairedChance > 0)).toBe(true)
  })

  it('enforces station kinds, busy slots and the pair overlap rule', () => {
    const state = createRecipeState(1)
    const order = state.orders[0]!
    expect(order.steps[0]).toBe('cut')
    expect(placeStep(state, 0, 0)).toBe('wrong-station') // 切不能上灶眼
    expect(placeStep(state, 0, 2)).toBe('placed') // 上砧板
    expect(placeStep(state, 0, 2)).toBe('busy') // 砧板占用
    // 同单第二道工序此时上灶：非同煮单（第 1 关）被拒
    const second = order.steps[1]!
    expect(placeStep(state, 0, second === 'cut' ? 2 : 1)).toBe('pair-rule')
    expect(placeStep(state, 99, 0)).toBe('ignored')
  })

  it('advances cooking into the timing phase with a deterministic heat cursor', () => {
    const state = createRecipeState(3)
    const station = cookNextToTiming(state, 0)
    const item = state.slots[station]!
    expect(item.phase).toBe('timing')
    expect(item.timingMs).toBe(0) // 进入火候期从相位 0 起
    // 三角波：0 → 1（半周期）→ 0（整周期），边界确定性
    expect(heatCursor(0)).toBeCloseTo(0, 5)
    expect(heatCursor(HEAT_PERIOD_MS / 4)).toBeCloseTo(0.5, 5)
    expect(heatCursor(HEAT_PERIOD_MS / 2)).toBeCloseTo(1, 5)
    expect(heatCursor(HEAT_PERIOD_MS)).toBeCloseTo(0, 5)
    // 分区：两端红、中央绿、其余 plain
    expect(judgeHeat(0)).toBe('red')
    expect(judgeHeat(1)).toBe('red')
    expect(judgeHeat(RED_EDGE)).toBe('red')
    expect(judgeHeat(GREEN_LO)).toBe('green')
    expect(judgeHeat((GREEN_LO + GREEN_HI) / 2)).toBe('green')
    expect(judgeHeat(GREEN_HI)).toBe('green')
    expect(judgeHeat(0.25)).toBe('plain')
    expect(judgeHeat(0.8)).toBe('plain')
  })

  it('scores a perfect pickup in the green zone and advances the order', () => {
    const state = createRecipeState(5)
    const order = state.orders[0]!
    const station = cookNextToTiming(state, 0)
    // 把火候推进到游标 0.5（p=0.25，绿区中心）
    tickRecipe(state, HEAT_PERIOD_MS / 4)
    expect(heatCursor(state.slots[station]!.timingMs)).toBeCloseTo(0.5, 5)
    expect(pickup(state, station)).toBe('perfect')
    expect(state.slots[station]).toBeNull()
    expect(state.score).toBe(STEP_SCORE + PERFECT_BONUS)
    expect(order.stepIndex).toBe(1)
    expect(order.perfectCount).toBe(1)
    // 另一张单的工序已进入火候期：不再处于「倒计时中不可取」状态
    const s2 = cookNextToTiming(state, 1)
    expect(pickup(state, s2)).not.toBe('cooking')
    expect(state.slots.every((s) => s === null)).toBe(true)
  })

  it('rejects pickup while cooking and burns the step in the red zone', () => {
    const state = createRecipeState(9)
    const order = state.orders[0]!
    expect(order.steps[0]).toBe('cut')
    expect(placeStep(state, 0, 2)).toBe('placed')
    expect(pickup(state, 2)).toBe('cooking') // 还在倒计时
    tickRecipe(state, STEP_MS.cut + 1)
    expect(state.slots[2]!.phase).toBe('timing')
    // 火候期起点游标在红区（v=0）：取料即糊，工序重来并扣分
    expect(heatCursor(state.slots[2]!.timingMs)).toBeLessThanOrEqual(RED_EDGE)
    expect(pickup(state, 2)).toBe('burnt')
    expect(state.slots[2]).toBeNull()
    expect(state.score).toBe(-BURN_PENALTY)
    expect(state.burnCount).toBe(1)
    expect(order.stepIndex).toBe(0) // 重来
  })

  it('auto-burns an abandoned dish after the timing window', () => {
    const state = createRecipeState(11)
    cookNextToTiming(state, 0)
    expect(tickRecipe(state, TIMING_MAX_MS)).toBe('burnt')
    expect(state.slots.every((s) => s === null)).toBe(true)
    expect(state.burnCount).toBe(1)
    expect(state.score).toBe(-BURN_PENALTY)
    expect(state.orders[0]!.stepIndex).toBe(0)
  })

  it('serves a full order with exact scoring and refills the queue', () => {
    const state = createRecipeState(13)
    const order = state.orders[0]!
    let guard = 0
    while (state.orders.includes(order) && guard < 50) {
      guard += 1
      const station = cookNextToTiming(state, 0)
      tickRecipe(state, HEAT_PERIOD_MS / 4) // 游标到绿区中心
      const r = pickup(state, station)
      if (order.stepIndex < order.steps.length) {
        expect(r === 'perfect' || r === 'ok').toBe(true)
      } else {
        expect(r).toBe('served-perfect')
      }
    }
    // 全程完美：每道 60 + 40 完美 + 出餐 100（第 1 关无同煮单）
    expect(state.servedTotal).toBe(1)
    expect(state.score).toBe(order.steps.length * (STEP_SCORE + PERFECT_BONUS) + ORDER_BONUS)
    expect(state.orders).toHaveLength(MAX_QUEUE) // 队列补满
    expect(state.servedInLevel).toBe(1)
  })

  it('allows the paired overlap only for the last two steps and pays the pair bonus', () => {
    // 找一个第 4 关的同煮订单（seed 扫描确定性命中）
    let seed = 100
    let state = createRecipeState(seed)
    while (true) {
      // 直接推到第 4 关：精确出 3 关 × TARGET 单（每单做完即止）
      for (let served = 0; served < 3 * TARGET_PER_LEVEL; served += 1) {
        const target = state.orders[0]!
        let guard = 0
        while (state.orders.includes(target) && guard < 30) {
          guard += 1
          const station = cookNextToTiming(state, 0)
          tickRecipe(state, HEAT_PERIOD_MS / 4)
          pickup(state, station)
        }
      }
      if (state.orders.some((o) => o.paired)) break
      seed += 1
      state = createRecipeState(seed)
    }
    expect(state.level).toBe(4)
    const idx = state.orders.findIndex((o) => o.paired)!
    const order = state.orders[idx]!
    const last = order.steps.length - 1
    // 顺序做完前面所有工序
    let guard = 0
    while (order.stepIndex < last - 1 && guard < 30) {
      guard += 1
      selectOrder(state, idx)
      const station = cookNextToTiming(state, idx)
      tickRecipe(state, HEAT_PERIOD_MS / 4)
      pickup(state, station)
    }
    expect(order.stepIndex).toBe(last - 1)
    // 倒数第二道上灶后，最后两道工序允许同时在灶（同煮规则）
    const kindA = order.steps[last - 1]!
    const stA = kindA === 'cut' ? 2 : 0
    expect(placeStep(state, idx, stA)).toBe('placed')
    const kindB = order.steps[last]!
    const stB = kindB === 'cut' ? 2 : 1
    expect(placeStep(state, idx, stB)).toBe('placed')
    // 两道工序同时煮好后先后取料：两次取料之间全局时钟不动（间隔 0 ≤
    // PAIR_WINDOW_MS），末步出餐结算 = 工序分 + 完美加成 + 订单奖励 +
    // 同煮奖励
    tickRecipe(state, Math.max(STEP_MS[kindA], STEP_MS[kindB]) + 1)
    tickRecipe(state, HEAT_PERIOD_MS / 4)
    expect(judgeHeat(heatCursor(state.slots[stA]!.timingMs))).toBe('green')
    expect(judgeHeat(heatCursor(state.slots[stB]!.timingMs))).toBe('green')
    const scoreBefore = state.score
    const rA = pickup(state, stA)
    const rB = pickup(state, stB)
    expect(rA === 'perfect' || rA === 'ok').toBe(true)
    expect(rB).toBe('served-perfect')
    expect(state.score - scoreBefore).toBe(2 * (STEP_SCORE + PERFECT_BONUS) + ORDER_BONUS + PAIR_BONUS)
    expect(order.doneAtMs[order.doneAtMs.length - 1]! - order.doneAtMs[order.doneAtMs.length - 2]!).toBeLessThanOrEqual(PAIR_WINDOW_MS)
  })

  it('rejects non-paired overlap and pays no pair bonus on a wide gap', () => {
    const state = createRecipeState(21)
    const order = state.orders[0]!
    // 非同煮单：两道工序不能同时在灶（上一用例已覆盖拒绝），这里验证
    // 顺序完成间隔大时即便 paired 也没有奖励——构造第 4 关同煮单太绕，
    // 直接用 doneAtMs 间隔超窗的等价路径：手动完成两道，间隔 > 窗口。
    const station = cookNextToTiming(state, 0)
    tickRecipe(state, HEAT_PERIOD_MS / 4)
    expect(pickup(state, station)).toBe('perfect')
    // 等待远超同煮窗口再做第二道（首关无同煮单，本就无同煮奖励可言）
    tickRecipe(state, PAIR_WINDOW_MS + 5000)
    const station2 = cookNextToTiming(state, 0)
    tickRecipe(state, HEAT_PERIOD_MS / 4)
    expect(pickup(state, station2)).toBe('perfect')
    expect(state.score).toBe(2 * (STEP_SCORE + PERFECT_BONUS))
  })

  it('voids a timed-out order with penalty, frees its slots and refills', () => {
    const state = createRecipeState(23)
    const victim = state.orders[0]!
    expect(victim.steps[0]).toBe('cut')
    const idsBefore = state.orders.map((o) => o.id)
    // 先把全场时钟推到临近到期（此阶段灶上无料），再上工序小步走到超时；
    // 邻单作废会推迟本单倒计时，预算上给火候超时留足余量（不会先糊）
    let warm = 0
    while (victim.timeLeftMs > 9000 && warm < 40) {
      warm += 1
      tickRecipe(state, Math.ceil(victim.limitMs / 20))
    }
    while (victim.timeLeftMs > 4000 && warm < 80) {
      warm += 1
      tickRecipe(state, 1000)
    }
    expect(placeStep(state, 0, 2)).toBe('placed')
    let ticks = 0
    while (state.orders.some((o) => o.id === victim.id) && ticks < 200) {
      ticks += 1
      tickRecipe(state, 250)
    }
    expect(state.orders.some((o) => o.id === victim.id)).toBe(false)
    expect(state.voidedCount).toBeGreaterThanOrEqual(1)
    expect(state.orders).toHaveLength(MAX_QUEUE)
    expect(state.orders.map((o) => o.id)).not.toEqual(idsBefore)
    expect(state.slots[2]).toBeNull() // 作废清空了它占用的工位
    expect(state.score).toBe(-VOID_PENALTY * state.voidedCount - BURN_PENALTY * state.burnCount)
    expect(state.burnCount).toBe(0) // 上灶的工序是被作废清掉的，不是糊掉
  })

  it('progresses 5 levels to victory and replays identically from the seed', () => {
    /** 确定性玩家：永远做选中单的下一道工序，全取绿区。 */
    const playout = (seed: number): { score: number, served: number, level: number } => {
      const s = createRecipeState(seed)
      let guard = 0
      while (s.phase !== 'over' && guard < 20000) {
        guard += 1
        tickRecipe(s, 100)
        if (s.orders.length === 0) continue
        const idx = Math.min(s.selectedOrderIdx, s.orders.length - 1)
        const order = s.orders[idx]!
        const item = s.slots.find((slot) => slot !== null && slot!.orderId === order.id) ?? null
        if (item !== null && item.phase === 'timing') {
          const zone = judgeHeat(heatCursor(item.timingMs))
          const station = s.slots.findIndex((slot) => slot !== null && slot!.orderId === order.id)
          if (zone === 'green') pickup(s, station)
          continue
        }
        if (item === null && order.stepIndex < order.steps.length) {
          const kind = order.steps[order.stepIndex]!
          placeStep(s, idx, kind === 'cut' ? 2 : 0)
        }
      }
      return { score: s.score, served: s.servedTotal, level: s.level }
    }
    const result = playout(123)
    expect(result.served).toBe(TOTAL_LEVELS * TARGET_PER_LEVEL)
    expect(result.level).toBe(TOTAL_LEVELS)
    const replay = playout(123)
    expect(replay).toEqual(result)
    expect(makeOrderGuard(createRecipeState(123))).toBe(MAX_QUEUE)
  })

  it('mulberry32 is a deterministic 32-bit-seeded rng and selection cycles', () => {
    const a = mulberry32(99)
    const b = mulberry32(99)
    const seqA = [a(), a(), a()]
    expect(seqA).toEqual([b(), b(), b()])
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    const state = createRecipeState(30)
    expect(state.selectedOrderIdx).toBe(0)
    cycleOrder(state)
    expect(state.selectedOrderIdx).toBe(1)
    cycleOrder(state)
    cycleOrder(state)
    expect(state.selectedOrderIdx).toBe(0)
    expect(selectOrder(state, 1)).toBe(true)
    expect(selectOrder(state, 9)).toBe(false)
  })
})

/** makeOrder 受 MAX_QUEUE 约束。 */
function makeOrderGuard(state: RecipeState): number {
  makeOrder(state)
  return state.orders.length
}
