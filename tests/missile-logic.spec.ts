import { describe, expect, it } from 'vitest'
import {
  BATTERY_X, BATTERY_Y, CITY_HALF, CITY_XS, EXPLOSION_MS, EXPLOSION_R,
  GROUND_Y, INTERMISSION_MS, INTERCEPTOR_SPEED, MAX_INTERCEPTORS, SUB_MS, W, WAVES,
  buildWave, createMissile, enemyPos, explosionRadius, fireMissile, mulberry32,
  stepMissile, type EnemyMissile,
} from '../src/client/games/missile/logic.ts'

/** 快进 ms（按 16ms 逻辑帧推进，不触发任何输入）。 */
function fastForward(state: ReturnType<typeof createMissile>, ms: number): void {
  let left = ms
  while (left > 0) {
    const dt = Math.min(16, left)
    stepMissile(state, dt)
    left -= dt
  }
}

/** 一发永不出击的占位弹：pending 非空可压住波次结算。 */
function blocker(): EnemyMissile {
  return {
    sx: 10, sy: 0, tx: 30, ty: GROUND_Y, speed: 50,
    spawnAt: 1e9, progress: 0, splitAt: 1,
    c1x: 0, c1y: 0, c2x: 0, c2y: 0,
  }
}

/** 直落某座城市的来袭弹。 */
function strike(tx: number, speed = 300): EnemyMissile {
  return {
    sx: tx, sy: 0, tx, ty: GROUND_Y, speed,
    spawnAt: 0, progress: 0, splitAt: 1,
    c1x: 0, c1y: 0, c2x: 0, c2y: 0,
  }
}

describe('missile logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(11)
    const b = mulberry32(11)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })

  it('explosion radius expands then shrinks: 0 at both ends, peak 46 at mid', () => {
    expect(explosionRadius(0)).toBe(0)
    expect(explosionRadius(EXPLOSION_MS)).toBe(0)
    expect(explosionRadius(-5)).toBe(0)
    expect(explosionRadius(EXPLOSION_MS + 100)).toBe(0)
    expect(explosionRadius(EXPLOSION_MS / 2)).toBeCloseTo(EXPLOSION_R, 9)
    // 膨胀段上升、收缩段下降、关于中点对称。
    expect(explosionRadius(200)).toBeGreaterThan(explosionRadius(100))
    expect(explosionRadius(800)).toBeGreaterThan(explosionRadius(850))
    expect(explosionRadius(300)).toBeCloseTo(explosionRadius(EXPLOSION_MS - 300), 9)
  })

  it('wave spawn tables are deterministic per seed and scale with wave', () => {
    const cities = [true, true, true, true, true, true]
    const w1a = buildWave(mulberry32(42), 1, cities)
    expect(w1a).toEqual(buildWave(mulberry32(42), 1, cities))
    expect(w1a.length).toBe(4)
    expect(buildWave(mulberry32(42), 6, cities).length).toBe(9)
    // 弹道合理：起点在顶部、目标落在某座存活城市附近。
    for (const m of w1a) {
      expect(m.sy).toBe(0)
      expect(m.sx).toBeGreaterThanOrEqual(20)
      expect(m.sx).toBeLessThanOrEqual(W - 20)
      expect(m.ty).toBe(GROUND_Y)
      expect(CITY_XS.some((cx) => Math.abs(m.tx - cx) <= CITY_HALF)).toBe(true)
    }
    const slow = buildWave(mulberry32(7), 1, cities).reduce((s, m) => s + m.speed, 0)
    const fast = buildWave(mulberry32(7), 5, cities).reduce((s, m) => s + m.speed, 0)
    expect(fast).toBeGreaterThan(slow)
    // 不同种子生成不同弹道表；第 1 波（<3）无分裂。
    expect(buildWave(mulberry32(1), 1, cities)).not.toEqual(buildWave(mulberry32(2), 1, cities))
    expect(w1a.every((m) => m.splitAt === 1)).toBe(true)
  })

  it('MIRV: wave >= 3 missiles split into two children at the preset point', () => {
    const cities = [true, true, true, true, true, true]
    // 找一个第 3 波必含分裂弹的种子。
    let seed = 1
    let wave: ReturnType<typeof buildWave> = []
    while (true) {
      wave = buildWave(mulberry32(seed), 3, cities)
      if (wave.some((m) => m.splitAt < 1)) break
      seed += 1
    }
    const parent = wave.find((m) => m.splitAt < 1)!
    expect(parent.splitAt).toBeGreaterThanOrEqual(0.35)
    expect(parent.splitAt).toBeLessThanOrEqual(0.6)
    // 直接构造只含该弹的一局：pending 只留这一发、立即出击。
    const state = createMissile(99)
    parent.spawnAt = 0
    state.pending = [parent]
    state.enemies.length = 0
    // 分裂时刻 = 全程 × splitAt / speed；提前 40ms 停（未分裂），
    // 再快进 80ms（必过分裂点，子弹落地需数秒，不会进一步消亡）。
    const total = Math.hypot(parent.tx - parent.sx, parent.ty - parent.sy)
    const splitMs = ((total * parent.splitAt) / parent.speed) * 1000
    fastForward(state, Math.max(0, Math.round(splitMs) - 40))
    expect(state.enemies.length).toBe(1)
    expect(state.enemies[0]!.progress).toBeLessThan(parent.splitAt)
    fastForward(state, 80)
    // 分裂后：本弹移除，出现两发子弹，起点即分裂点，航向预决定目标。
    expect(state.enemies.length).toBe(2)
    const px = parent.sx + (parent.tx - parent.sx) * parent.splitAt
    const py = parent.sy + (parent.ty - parent.sy) * parent.splitAt
    for (const child of state.enemies) {
      // 分裂在跨越 splitAt 的首个子步发生，允许一个子步的位移过冲（<1px）。
      expect(Math.abs(child.sx - px)).toBeLessThanOrEqual(1)
      expect(Math.abs(child.sy - py)).toBeLessThanOrEqual(1)
      expect(child.splitAt).toBe(1)
      expect(child.speed).toBeCloseTo(parent.speed * 1.15, 9)
    }
  })

  it('interceptor flies to the exact target point and detonates an explosion', () => {
    const state = createMissile(5)
    expect(fireMissile(state, 120, 200)).toBe(true)
    const itc = state.interceptors[0]!
    const dist = Math.hypot(120 - BATTERY_X, 200 - BATTERY_Y)
    expect(itc.remain).toBeCloseTo(dist, 6)
    // 飞行时间 ≈ 距离 / 速度，误差一个子步。
    const flyMs = (dist / INTERCEPTOR_SPEED) * 1000
    fastForward(state, Math.round(flyMs) - SUB_MS)
    expect(state.interceptors.length).toBe(1)
    fastForward(state, 2 * SUB_MS)
    expect(state.interceptors.length).toBe(0)
    expect(state.explosions.length).toBe(1)
    expect(state.explosions[0]!.x).toBeCloseTo(120, 3)
    expect(state.explosions[0]!.y).toBeCloseTo(200, 3)
    // 超过在飞上限拒发。
    const s2 = createMissile(6)
    for (let i = 0; i < MAX_INTERCEPTORS + 2; i += 1) fireMissile(s2, 60 + i * 40, 120)
    expect(s2.interceptors.length).toBe(MAX_INTERCEPTORS)
  })

  it('an enemy caught in the explosion ball is destroyed and scores', () => {
    const state = createMissile(7)
    // 压住波次结算与出击调度，只留一枚慢速来袭弹途经 (260, 150)。
    state.pending = [blocker()]
    state.enemies.push({
      sx: 260, sy: 60, tx: 260, ty: GROUND_Y, speed: 60,
      spawnAt: 0, progress: 0, splitAt: 1,
      c1x: 0, c1y: 0, c2x: 0, c2y: 0,
    })
    fireMissile(state, 260, 150)
    // 事件按帧清空，逐帧收集。
    let sawIntercept = false
    let left = 4000
    while (left > 0) {
      const dt = Math.min(16, left)
      stepMissile(state, dt)
      if (state.events.some((e) => e.type === 'intercept')) sawIntercept = true
      left -= dt
    }
    // 爆炸球在峰值半径 46 时罩住弹头：得分 = 20 + 10 × 波次，事件落地。
    expect(state.enemies.length).toBe(0)
    expect(sawIntercept).toBe(true)
    expect(state.score).toBe(20 + 10 * state.wave)
    expect(state.wave).toBe(1)
    expect(state.phase).toBe('playing')
  })

  it('a landed missile destroys its city; losing all six ends the game', () => {
    const state = createMissile(8)
    state.pending.length = 0
    state.enemies.length = 0
    state.explosions.length = 0
    state.interceptors.length = 0
    // 六发同时直落六座城市：城市互异，全毁即结束（结算不再触发）。
    for (let i = 0; i < 6; i += 1) state.enemies.push(strike(CITY_XS[i]!))
    fastForward(state, 3000)
    expect(state.cities.every((c) => c === false)).toBe(true)
    expect(state.phase).toBe('over')
    // 结束后分数冻结、时钟仍走。
    const frozen = state.score
    fastForward(state, 1000)
    expect(state.score).toBe(frozen)
  })

  it('clearing a wave grants a city bonus (max 6) and advances; six waves win', () => {
    const state = createMissile(10)
    // 占位弹压住结算；先直落摧毁两座城市。
    state.pending = [blocker()]
    state.enemies.push(strike(CITY_XS[0]!, 100000))
    stepMissile(state, 16)
    expect(state.cities[0]).toBe(false)
    state.enemies.push(strike(CITY_XS[1]!, 100000))
    stepMissile(state, 16)
    expect(state.cities[1]).toBe(false)
    expect(state.cities.filter((c) => c === true).length).toBe(4)
    // 清空占位弹 → 下一子步结算：+1 城恢复、波次加分、进入停顿。
    state.pending.length = 0
    state.enemies.length = 0
    fastForward(state, 2 * SUB_MS)
    expect(state.cities.filter((c) => c === true).length).toBe(5)
    expect(state.score).toBe(50 * 1)
    expect(state.wave).toBe(1)
    expect(state.interT).toBeGreaterThan(0)
    // 波间停顿倒数归零后进入第 2 波。
    fastForward(state, INTERMISSION_MS + 100)
    expect(state.wave).toBe(2)
    expect(state.pending.length).toBe(5)
  })

  it('intercepting every wave through real play wins after six waves', () => {
    const state = createMissile(9)
    let guard = 0
    while (state.phase === 'playing' && guard < 400) {
      guard += 1
      // 把本波所有来袭弹的出发时间拨到现在，然后逐一发拦截弹清空。
      for (const m of state.pending) m.spawnAt = 0
      let inner = 0
      while ((state.enemies.length > 0 || state.pending.length > 0) && inner < 6000) {
        inner += 1
        stepMissile(state, 16)
        if (state.enemies.length > 0 && state.interceptors.length < MAX_INTERCEPTORS) {
          const head = state.enemies[0]!
          const pos = enemyPos(head)
          // 预判 1.1s 后位置发射拦截弹。
          const len = Math.hypot(head.tx - head.sx, head.ty - head.sy)
          const lead = Math.min(1, head.progress + (head.speed * 1.1) / len)
          const fx = head.sx + (head.tx - head.sx) * lead
          const fy = head.sy + (head.ty - head.sy) * lead
          if (fy > 30 && pos.y < GROUND_Y - 20) fireMissile(state, fx, fy)
        }
      }
      if (state.phase !== 'playing') break
      // 波间停顿走完即开下一波（第 6 波清空时结算为 won）。
      fastForward(state, INTERMISSION_MS + 100)
    }
    expect(guard).toBeLessThan(400)
    expect(state.phase).toBe('won')
    expect(state.wave).toBe(WAVES)
  })

  it('jittered frame sizes replay identically (fixed substeps)', () => {
    const jitter = [16, 16, 5, 11, 16, 20, 3, 13]
    const run = (): string => {
      const state = createMissile(13)
      let shot = 0
      for (let k = 0; k < 3000; k += 1) {
        const dt = jitter[k % jitter.length]!
        if (k % 40 === 0 && shot < 30) {
          if (fireMissile(state, 60 + (shot % 8) * 55, 80 + (shot % 5) * 40)) shot += 1
        }
        stepMissile(state, dt)
      }
      return JSON.stringify([
        state.score, state.wave, state.phase, state.cities,
        state.enemies.map((m) => [m.sx, m.tx, m.progress.toFixed(6)]),
        state.explosions.map((e) => e.t),
      ])
    }
    expect(run()).toBe(run())
    expect(SUB_MS).toBe(8)
  })
})
