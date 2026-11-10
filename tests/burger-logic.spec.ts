import { describe, expect, it } from 'vitest'
import {
  BASE_SCORE, BONUS_PER_SEC, COOK_MS, FILLINGS, SHOW_MIN_MS, SHOW_START_MS, TOTAL_ORDERS,
  createBurgerState, mulberry32, orderLength, showWindowMs, skipShow, stackIngredient, tickBurger,
  type BurgerState,
} from '../src/client/games/burger/logic.ts'

/** 跳过当前订单的展示期（逐帧推进或直接 skipShow）。 */
function toBuilding(state: BurgerState): void {
  skipShow(state)
}

describe('burger logic', () => {
  it('generates a deterministic seeded order with bun on both ends', () => {
    const a = createBurgerState(42)
    const b = createBurgerState(42)
    expect(a.phase).toBe('showing')
    expect(a.order).toEqual(b.order)
    expect(a.order[0]).toBe('bun')
    expect(a.order[a.order.length - 1]).toBe('bun')
    for (const layer of a.order.slice(1, -1)) {
      expect(FILLINGS).toContain(layer)
    }
    // 不同种子产生（大概率）不同的订单序列
    const c = createBurgerState(7)
    expect(c.rng === a.rng).toBe(false)
  })

  it('ramps order length 3→6 and shrinks the show window to its floor', () => {
    expect([1, 2, 3, 4].map(orderLength)).toEqual([3, 3, 3, 3])
    expect([5, 8].map(orderLength)).toEqual([4, 4])
    expect([9, 12].map(orderLength)).toEqual([5, 5])
    expect([13, 15, 20].map(orderLength)).toEqual([6, 6, 6])
    expect(showWindowMs(1)).toBe(SHOW_START_MS)
    for (let i = 1; i < 15; i += 1) {
      expect(showWindowMs(i)).toBeGreaterThanOrEqual(SHOW_MIN_MS)
    }
    expect(showWindowMs(20)).toBe(SHOW_MIN_MS)
  })

  it('ends the show window via tick and arms the full cook timer', () => {
    const state = createBurgerState(1)
    const step = 100
    let events = 0
    while (state.phase === 'showing') {
      const ev = tickBurger(state, step)
      if (ev === 'show-done') events += 1
    }
    expect(events).toBe(1)
    expect(state.phase).toBe('building')
    expect(state.timeLeftMs).toBe(COOK_MS)
  })

  it('skipShow jumps straight to building and ignores repeat skips', () => {
    const state = createBurgerState(3)
    expect(skipShow(state)).toBe(true)
    expect(state.phase).toBe('building')
    expect(skipShow(state)).toBe(false)
  })

  it('serves a fully correct stack with base + time bonus and deals the next order', () => {
    const state = createBurgerState(5)
    toBuilding(state)
    state.timeLeftMs = 15400 // 模拟玩家耗时 4.6s → 15 秒剩余
    for (const layer of state.order) {
      const r = stackIngredient(state, layer)
      expect(r === 'correct' || r === 'served').toBe(true)
    }
    expect(state.ordersServed).toBe(1)
    expect(state.score).toBe(BASE_SCORE + BONUS_PER_SEC * 15)
    // 下一单：单号推进、重新展示、长度曲线生效
    expect(state.orderIndex).toBe(2)
    expect(state.phase).toBe('showing')
    expect(state.stacked).toEqual([])
    expect(state.order).toHaveLength(orderLength(2))
  })

  it('voids the whole order and costs a heart on one wrong layer', () => {
    const state = createBurgerState(9)
    toBuilding(state)
    stackIngredient(state, state.order[0]!)
    const wrong = state.order[1]! === FILLINGS[0] ? FILLINGS[1]! : FILLINGS[0]!
    expect(stackIngredient(state, wrong)).toBe('wrong')
    expect(state.hearts).toBe(2)
    expect(state.ordersServed).toBe(0)
    expect(state.score).toBe(0)
    // 作废重来：同单号新订单，重新进入展示期
    expect(state.orderIndex).toBe(1)
    expect(state.phase).toBe('showing')
    expect(state.stacked).toEqual([])
  })

  it('times out into a voided order and ends the match after three losses', () => {
    const state = createBurgerState(11)
    toBuilding(state)
    expect(tickBurger(state, COOK_MS + 1)).toBe('timeout')
    expect(state.hearts).toBe(2)
    expect(state.phase).toBe('showing')
    toBuilding(state)
    expect(tickBurger(state, COOK_MS + 1)).toBe('timeout')
    toBuilding(state)
    expect(tickBurger(state, COOK_MS + 1)).toBe('over')
    expect(state.phase).toBe('over')
    expect(state.hearts).toBe(0)
    // 终局后一切输入与计时都无效
    expect(stackIngredient(state, 'bun')).toBe('ignored')
    expect(tickBurger(state, 1000)).toBe('none')
  })

  it('completes the 15-order match deterministically from one seed', () => {
    const state = createBurgerState(123)
    let guard = 0
    while (state.phase !== 'over' && guard < 1000) {
      guard += 1
      if (state.phase === 'showing') {
        tickBurger(state, state.showMs)
        continue
      }
      tickBurger(state, 1000) // 每单耗时 1s 的确定性玩家
      if (state.phase === 'building') {
        for (const layer of state.order) stackIngredient(state, layer)
      }
    }
    expect(state.ordersServed).toBe(TOTAL_ORDERS)
    // 15 单 × (基础 100 + 19s×10 加成)，扣去最后 tick 消耗前的精确值
    expect(state.score).toBe(15 * (BASE_SCORE + BONUS_PER_SEC * 19))

    const replay = createBurgerState(123)
    let guard2 = 0
    while (replay.phase !== 'over' && guard2 < 1000) {
      guard2 += 1
      if (replay.phase === 'showing') {
        tickBurger(replay, replay.showMs)
        continue
      }
      tickBurger(replay, 1000)
      if (replay.phase === 'building') {
        for (const layer of replay.order) stackIngredient(replay, layer)
      }
    }
    expect(replay.score).toBe(state.score)
    expect(replay.ordersServed).toBe(state.ordersServed)
  })

  it('mulberry32 is a deterministic 32-bit-seeded rng', () => {
    const a = mulberry32(99)
    const b = mulberry32(99)
    const seqA = [a(), a(), a()]
    const seqB = [b(), b(), b()]
    expect(seqA).toEqual(seqB)
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(mulberry32(100)()).not.toBe(seqA[0])
  })
})
