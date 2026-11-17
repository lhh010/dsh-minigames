import { describe, expect, it } from 'vitest'
import {
  AI_ERR_DECAY, AI_X, BLAST_R, HP, H, MAX_ROUND_TURNS, P_X, ROUNDS,
  TERRAIN_SAMPLES, TERRAIN_STEP, TURRET_R, WIND_MAX,
  aiPlan, carveCrater, createArtillery, fireShot, generateTerrain, mulberry32,
  simulateShot, stepArtillery, terrainYAt,
} from '../src/client/games/artillery/logic.ts'

/** 步进直到条件满足或到达步数上限（确定性，dt 固定 16ms）。 */
function runUntil(state: ReturnType<typeof createArtillery>, ok: (s: ReturnType<typeof createArtillery>) => boolean, maxSteps = 5000): number {
  for (let i = 0; i < maxSteps; i += 1) {
    if (ok(state)) return i
    stepArtillery(state, 16)
  }
  throw new Error('runUntil: condition not reached')
}

/** 把状态压成平地战场（消地形随机性，专测物理与结算）。 */
function flatten(state: ReturnType<typeof createArtillery>): void {
  state.terrain = Array<number>(TERRAIN_SAMPLES).fill(300)
  state.player.y = 300
  state.ai.y = 300
  state.wind = 0
}

describe('artillery logic', () => {
  it('generates bounded, continuous sine-stacked terrain with flat turret pads', () => {
    const a = generateTerrain(mulberry32(42))
    const b = generateTerrain(mulberry32(42))
    expect(a).toEqual(b)
    expect(a).toHaveLength(TERRAIN_SAMPLES)
    for (const y of a) {
      expect(y).toBeGreaterThanOrEqual(H * 0.3)
      expect(y).toBeLessThanOrEqual(H * 0.82)
    }
    for (let i = 1; i < a.length; i += 1) {
      expect(Math.abs(a[i]! - a[i - 1]!)).toBeLessThanOrEqual(30)
    }
    // 两门炮台脚下 ±3 采样完全整平。
    for (const tx of [P_X, AI_X]) {
      const idx = Math.round(tx / TERRAIN_STEP)
      const pad = a[idx]!
      for (let d = -3; d <= 3; d += 1) {
        expect(Math.abs(a[idx + d]! - pad)).toBeLessThanOrEqual(0.51)
      }
    }
  })

  it('interpolates the height field and carves craters only inside the circle', () => {
    const t = [100, 110, 130, 140]
    const terrain: number[] = []
    for (let i = 0; i < TERRAIN_SAMPLES; i += 1) terrain.push(t[Math.min(3, Math.floor(i / 8))]!)
    expect(terrainYAt(terrain, 0)).toBeCloseTo(terrain[0]!, 9)
    expect(terrainYAt(terrain, -50)).toBeCloseTo(terrain[0]!, 9)
    expect(terrainYAt(terrain, 9999)).toBeCloseTo(terrain[TERRAIN_SAMPLES - 1]!, 9)
    // 构造已知斜坡：两端 200/300，中点 250。
    const slope: number[] = []
    for (let i = 0; i < TERRAIN_SAMPLES; i += 1) slope.push(200 + (100 * i) / (TERRAIN_SAMPLES - 1))
    expect(terrainYAt(slope, (TERRAIN_SAMPLES - 1) * TERRAIN_STEP / 2)).toBeCloseTo(250, 6)
    // 炸坑：圆内削低到圆下缘，圆外不动。
    const flat = Array<number>(TERRAIN_SAMPLES).fill(200)
    carveCrater(flat, 300, 200, 30)
    expect(flat[60]!).toBeCloseTo(230, 0)
    expect(flat[53]!).toBe(200)
    expect(flat[67]!).toBe(200)
  })

  it('starts a fresh match aimed at the player with wind in range', () => {
    const s = createArtillery(7)
    expect(s.round).toBe(1)
    expect(s.pointsPlayer).toBe(0)
    expect(s.pointsAi).toBe(0)
    expect(s.player.hp).toBe(HP)
    expect(s.ai.hp).toBe(HP)
    expect(s.turn).toBe('player')
    expect(s.phase).toBe('aim')
    expect(Math.abs(s.wind)).toBeLessThanOrEqual(WIND_MAX)
    expect(s.player.y).toBeCloseTo(terrainYAt(s.terrain, P_X), 6)
    expect(s.ai.y).toBeCloseTo(terrainYAt(s.terrain, AI_X), 6)
    expect(s.projectile).toBeNull()
  })

  it('fireShot computes muzzle velocity, clamps inputs and gates on phase', () => {
    const s = createArtillery(3)
    flatten(s)
    expect(fireShot(s, 120, 150)).toBe(true)
    expect(s.player.angle).toBe(90)
    expect(s.phase).toBe('flying')
    const p = s.projectile!
    expect(p.vx).toBeGreaterThanOrEqual(0) // 90 度垂直向上
    expect(p.vy).toBeLessThan(0)
    // 飞行中再发射无效。
    expect(fireShot(s, 45, 60)).toBe(false)
    s.phase = 'settle'
    expect(fireShot(s, 45, 60)).toBe(false)
    // 45 度满力：初速分量模长 = MAX_SPEED，方向右上。
    const s2 = createArtillery(4)
    flatten(s2)
    fireShot(s2, 45, 100)
    const q = s2.projectile!
    expect(Math.hypot(q.vx, q.vy)).toBeCloseTo(560, 6)
    expect(q.vx).toBeGreaterThan(0)
    expect(q.vy).toBeLessThan(0)
    expect(q.vx).toBeCloseTo(-q.vy, 6)
  })

  it('a shell arcs under gravity and craters the terrain on impact', () => {
    const s = createArtillery(11)
    flatten(s)
    fireShot(s, 45, 40)
    runUntil(s, (st) => st.phase === 'settle', 3000)
    expect(s.events.some((ev) => ev.type === 'explode')).toBe(true)
    // 弹坑：落点附近高度场被削低（y 增大）。
    const impact = s.events.find((ev) => ev.type === 'explode') as { type: 'explode', x: number, y: number }
    const idx = Math.round(impact.x / TERRAIN_STEP)
    expect(s.terrain[idx]!).toBeGreaterThan(300)
    expect(s.terrain[idx]!).toBeLessThanOrEqual(300 + BLAST_R + 1)
    expect(s.projectile).toBeNull()
  })

  it('wind bends the trajectory: same shot, opposite winds, different impact x', () => {
    const fly = (wind: number): number => {
      const s = createArtillery(5)
      flatten(s)
      s.wind = wind
      fireShot(s, 45, 60)
      runUntil(s, (st) => st.phase === 'settle', 3000)
      const ev = s.events.find((e) => e.type === 'explode') as { type: 'explode', x: number }
      return ev.x
    }
    const right = fly(WIND_MAX)
    const left = fly(-WIND_MAX)
    expect(right).toBeGreaterThan(left)
    expect(right - left).toBeGreaterThan(30)
  })

  it('a shell landing on the enemy turret damages it and craters the hill', () => {
    const s = createArtillery(9)
    flatten(s)
    // 搜一个正好砸在敌方炮台上的力度。
    let bestP = 60, bestErr = Infinity
    for (let p = 50; p <= 100; p += 1) {
      const impact = simulateShot(s.terrain, s.player, 'player', 45, p, 0)
      const err = Math.abs(impact.x - AI_X)
      if (err < bestErr) { bestErr = err; bestP = p }
    }
    expect(bestErr).toBeLessThanOrEqual(TURRET_R)
    fireShot(s, 45, bestP)
    runUntil(s, (st) => st.phase === 'settle', 3000)
    expect(s.ai.hp).toBeLessThan(HP)
    expect(s.ai.hp).toBeGreaterThanOrEqual(0)
    expect(s.events.some((ev) => ev.type === 'explode')).toBe(true)
  })

  it('a blast that eats the support makes the turret slide down and lose extra hp', () => {
    const s = createArtillery(13)
    flatten(s)
    const yBefore = s.ai.y
    // 落点在敌台脚边：爆心波及扣 1 血，支撑被炸空坠落再扣 1。
    let bestA = 45, bestP = 60, bestErr = Infinity
    for (let a = 20; a <= 80; a += 1) {
      for (let p = 30; p <= 100; p += 1) {
        const impact = simulateShot(s.terrain, s.player, 'player', a, p, 0)
        const err = Math.abs(impact.x - (AI_X - 20))
        if (err < bestErr) { bestErr = err; bestA = a; bestP = p }
      }
    }
    fireShot(s, bestA, bestP)
    runUntil(s, (st) => st.phase === 'settle', 3000)
    expect(s.events.some((ev) => ev.type === 'fall' && ev.side === 'ai')).toBe(true)
    expect(s.ai.y).toBeGreaterThan(yBefore + 5)
    expect(s.ai.hp).toBeLessThanOrEqual(HP - 2)
  })

  it('aiPlan converges by correction: error scale decays, ideal solution lands on target', () => {
    const s = createArtillery(17)
    flatten(s)
    // 误差比例接近 0 时：规划弹着点逼近玩家炮台。
    s.aiErrScale = 0.001
    const plan = aiPlan(s)
    const impact = simulateShot(s.terrain, s.ai, 'ai', plan.angle, plan.power, 0)
    expect(Math.abs(impact.x - P_X)).toBeLessThanOrEqual(30)
    // 首发之后误差按系数衰减。
    const s2 = createArtillery(17)
    s2.aiErrScale = 1
    aiPlan(s2)
    expect(s2.aiErrScale).toBeCloseTo(AI_ERR_DECAY, 9)
    // aiThink 到时自动开火进入飞行。
    const s3 = createArtillery(19)
    s3.phase = 'aiThink'
    s3.turn = 'ai'
    s3.thinkMs = 16
    stepArtillery(s3, 16)
    expect(s3.phase).toBe('flying')
    expect(s3.turn).toBe('ai')
  })

  it('round and match flow: hp exhaustion scores the round, five rounds end the match', () => {
    const s = createArtillery(23)
    const terrainBefore = [...s.terrain]
    // 第一局：击杀敌方 → 玩家得分，进入 roundOver，随后重生成新地形开第二局。
    s.ai.hp = 0
    s.phase = 'settle'
    s.settleMs = 1
    stepArtillery(s, 16)
    expect(s.phase).toBe('roundOver')
    expect(s.pointsPlayer).toBe(1)
    expect(s.events.some((ev) => ev.type === 'roundEnd' && ev.winner === 'player')).toBe(true)
    stepArtillery(s, 5000)
    expect(s.round).toBe(2)
    expect(s.player.hp).toBe(HP)
    expect(s.ai.hp).toBe(HP)
    expect(s.terrain).not.toEqual(terrainBefore)
    // 僵局保护：MAX_ROUND_TURNS 回合后判平不得分。
    s.turnCount = MAX_ROUND_TURNS
    s.phase = 'settle'
    s.settleMs = 1
    stepArtillery(s, 16)
    expect(s.pointsPlayer).toBe(1)
    expect(s.pointsAi).toBe(0)
    // 直落五局：最后一局结束进 matchOver 并给出胜负。
    s.round = ROUNDS
    s.ai.hp = 0
    s.phase = 'settle'
    s.settleMs = 1
    stepArtillery(s, 16)
    stepArtillery(s, 5000)
    expect(s.phase).toBe('matchOver')
    expect(s.winner).toBe('player')
    expect(s.pointsPlayer).toBe(2)
  })

  it('replays an entire scripted match identically for one seed', () => {
    const script = (): unknown[] => {
      const s = createArtillery(2024)
      const trace: unknown[] = []
      for (let i = 0; i < 90000 && s.phase !== 'matchOver'; i += 1) {
        stepArtillery(s, 16)
        if (s.phase === 'aim' && s.turn === 'player') fireShot(s, 45, 70)
        for (const ev of s.events) {
          if (ev.type === 'roundEnd') trace.push(ev.winner, s.round, s.pointsPlayer, s.pointsAi)
        }
      }
      trace.push('end', s.round, s.pointsPlayer, s.pointsAi, s.winner)
      return trace
    }
    expect(script()).toEqual(script())
  })
})
