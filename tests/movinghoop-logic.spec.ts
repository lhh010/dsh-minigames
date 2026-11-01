import { describe, expect, it } from 'vitest'
import {
  BALL_R, BOB_FROM_SHOTS, COMBO_CAP, COMPLEX_FROM_SHOTS, COMPLEX_OMEGA, FLOAT_MS, GAME_MS,
  GRAVITY, HIT_BASE, MAX_SHOTS, MIN_DRAG, ORIGIN, PATROL_FROM_SHOTS, RESULT_MS, RIM_R,
  SWISH_BASE, W, beginAim, createHoopForMode, createMovingHoop, dragToVelocity, hoopAt,
  motionForShots, mulberry32, releaseAim, stepMovingHoop, updateAim,
  type MovingHoopState,
} from '../src/client/games/movinghoop/logic.ts'

/** 快速脱手打满 n 投（每投落地即结算），把 shots 推到目标值。 */
function burnShots(s: MovingHoopState, n: number): void {
  for (let i = 0; i < n; i += 1) {
    let guard = 0
    while (s.phase !== 'result' && s.phase !== 'over' && guard < 4000) {
      if (s.phase === 'aim') {
        s.shots += 1
        s.phase = 'flying'
        s.ball = { x: 200, y: 100, vx: 0, vy: 0, rot: 0, vrot: 0 }
      }
      stepMovingHoop(s, 16)
      guard += 1
    }
    while (s.phase === 'result' && guard < 8000) { stepMovingHoop(s, 16); guard += 1 }
    if (s.phase === 'over') throw new Error('game ended before burning all shots')
  }
}

describe('moving hoop logic', () => {
  it('motion modes ramp with the shot count: static → bob → patrol → complex', () => {
    expect(motionForShots(0)).toBe('static')
    expect(motionForShots(BOB_FROM_SHOTS - 1)).toBe('static')
    expect(motionForShots(BOB_FROM_SHOTS)).toBe('bob')
    expect(motionForShots(PATROL_FROM_SHOTS - 1)).toBe('bob')
    expect(motionForShots(PATROL_FROM_SHOTS)).toBe('patrol')
    expect(motionForShots(COMPLEX_FROM_SHOTS - 1)).toBe('patrol')
    expect(motionForShots(COMPLEX_FROM_SHOTS)).toBe('complex')
    expect(motionForShots(MAX_SHOTS - 1)).toBe('complex')
    // 整局推进逐投核对回合模式切换。
    const s = createMovingHoop(31)
    const seen: string[] = [s.hoop.mode]
    for (let target = 1; target < 15; target += 1) {
      burnShots(s, 1)
      seen.push(s.hoop.mode)
    }
    expect(seen.slice(0, BOB_FROM_SHOTS).every((m) => m === 'static')).toBe(true)
    expect(seen[BOB_FROM_SHOTS]).toBe('bob')
    expect(seen[PATROL_FROM_SHOTS]).toBe('patrol')
    expect(seen[COMPLEX_FROM_SHOTS]).toBe('complex')
  })

  it('the first four shots keep the hoop parked at its base position', () => {
    const s = createMovingHoop(7)
    expect(s.hoop.mode).toBe('static')
    expect(s.hoop.rimX).toBe(s.hoop.baseX)
    expect(s.hoop.rimY).toBe(s.hoop.baseY)
    const bx = s.hoop.baseX
    const by = s.hoop.baseY
    for (let i = 0; i < 120; i += 1) {
      stepMovingHoop(s, 16)
      expect(s.hoop.rimX).toBe(bx)
      expect(s.hoop.rimY).toBe(by)
    }
  })

  it('hoopAt is the closed-form motion: bob vertical, patrol horizontal, complex 8-track', () => {
    const bob = createHoopForMode('bob', mulberry32(1))
    expect(bob.ampX).toBe(0)
    expect(bob.ampY).toBeGreaterThan(0)
    const pb = hoopAt(bob, 1234)
    expect(pb.rimX).toBe(bob.baseX)
    expect(pb.rimY).toBeCloseTo(bob.baseY + Math.sin(1.234 * bob.omega) * bob.ampY, 9)

    const patrol = createHoopForMode('patrol', mulberry32(2))
    expect(patrol.ampY).toBe(0)
    expect(patrol.ampX).toBeGreaterThan(0)
    const pp = hoopAt(patrol, 777)
    expect(pp.rimY).toBe(patrol.baseY)
    expect(pp.rimX).toBeCloseTo(patrol.baseX + Math.sin(0.777 * patrol.omega) * patrol.ampX, 9)
    // 巡逻不越界：行程始终在画布内。
    expect(patrol.baseX - patrol.ampX).toBeGreaterThanOrEqual(W * 0.52)
    expect(patrol.baseX + patrol.ampX).toBeLessThanOrEqual(W - 80 - RIM_R)

    const complex = createHoopForMode('complex', mulberry32(3))
    expect(complex.omega).toBe(COMPLEX_OMEGA)
    expect(complex.omega).toBeGreaterThan(patrol.omega)
    // 8 字：x 主频、y 倍频，且轨迹周期闭合。
    const t0 = 500
    const period = (Math.PI * 2 / complex.omega) * 1000
    const a = hoopAt(complex, t0)
    const b = hoopAt(complex, t0 + period)
    expect(b.rimX).toBeCloseTo(a.rimX, 6)
    expect(b.rimY).toBeCloseTo(a.rimY, 6)
    for (let i = 0; i <= 40; i += 1) {
      const p = hoopAt(complex, i * 100)
      expect(Math.abs(p.rimX - complex.baseX)).toBeLessThanOrEqual(complex.ampX + 1e-9)
      expect(Math.abs(p.rimY - complex.baseY)).toBeLessThanOrEqual(complex.ampY + 1e-9)
    }
  })

  it('a numerically solved launch sinks the moving hoop at a chosen frame (bob and complex)', () => {
    const solveAndSink = (mode: 'bob' | 'patrol' | 'complex'): void => {
      const s = createMovingHoop(101)
      s.shots = Math.max(BOB_FROM_SHOTS, 1)
      const hoop = createHoopForMode(mode, mulberry32(11))
      s.hoop = hoop
      s.t = 0
      s.phase = 'flying'
      const dtMs = 16
      const dt = dtMs / 1000
      const n = 80 // 1.28s 后的确定时刻：末段以约 480px/s 陡降穿过筐口
      const target = hoopAt(hoop, n * dtMs)
      // 半隐式欧拉闭式解：y_n = y0 + n·vy0·dt + g·dt²·n(n+1)/2，x_n = x0 + vx·n·dt。
      const vy0 = ((target.rimY + 1 - ORIGIN.y) - GRAVITY * dt * dt * n * (n + 1) / 2) / (n * dt)
      const vx = (target.rimX - ORIGIN.x) / (n * dt)
      expect(vy0).toBeLessThan(0) // 先上抛
      s.ball = { x: ORIGIN.x, y: ORIGIN.y, vx, vy: vy0, rot: 0, vrot: 0 }
      let scored = false
      for (let i = 0; i < n + 2 && !scored; i += 1) {
        stepMovingHoop(s, dtMs)
        scored = s.events.some((e) => e.type === 'score')
      }
      expect(scored).toBe(true)
      const ev = s.events.find((e) => e.type === 'score')!
      expect(ev.type === 'score' && ev.swish).toBe(true) // 无筐沿接触 → 空心
      expect(s.combo).toBe(1)
      expect(s.phase).toBe('result')
      expect(s.resultMs).toBe(RESULT_MS)
      expect(s.shots).toBe(BOB_FROM_SHOTS)
    }
    solveAndSink('bob')
    solveAndSink('patrol')
    solveAndSink('complex')
  })

  it('swish pays more than a rim-touched make; rim contact is detected on the moving rim', () => {
    const launchIntoMouth = (s: MovingHoopState): void => {
      s.phase = 'flying'
      s.aiming = false
      const p = hoopAt(s.hoop, s.t + 16)
      s.ball = { x: p.rimX, y: p.rimY - 0.5, vx: 0, vy: 200, rot: 0, vrot: 0 }
      stepMovingHoop(s, 16)
    }
    const swish = createMovingHoop(3)
    launchIntoMouth(swish)
    expect(swish.phase).toBe('result')
    expect(swish.combo).toBe(1)
    expect(swish.score).toBeGreaterThan(0)
    expect(swish.floats.some((f) => f.text === 'Swish!' && f.life === FLOAT_MS)).toBe(true)

    const rimmed = createMovingHoop(4)
    rimmed.rimTouched = true
    launchIntoMouth(rimmed)
    expect(rimmed.score).toBeLessThan(swish.score + 1)
    expect(rimmed.events).toContainEqual(expect.objectContaining({ type: 'score', swish: false }))

    // 筐沿碰撞：球心压在运动筐前口沿端点的碰撞圆上。
    const s = createMovingHoop(5)
    for (let i = 0; i < 30; i += 1) stepMovingHoop(s, 16)
    s.phase = 'flying'
    s.ball = { x: s.hoop.rimX - RIM_R, y: s.hoop.rimY - (BALL_R + 4) + 2, vx: 50, vy: 120, rot: 0, vrot: 0 }
    stepMovingHoop(s, 16)
    expect(s.rimTouched).toBe(true)
    expect(s.events.some((e) => e.type === 'rim')).toBe(true)
    expect(SWISH_BASE).toBeGreaterThan(HIT_BASE)
  })

  it('streaks multiply scores until a miss resets them; drag threshold still applies', () => {
    const s = createMovingHoop(9)
    // 拖拽过短取消，不计投数。
    beginAim(s, 100, 300)
    updateAim(s, 100, 300 + MIN_DRAG - 1)
    expect(releaseAim(s)).toBe(false)
    expect(s.shots).toBe(0)
    expect(s.phase).toBe('aim')
    // 真实拖拽出手。
    beginAim(s, 100, 300)
    updateAim(s, 40, 300)
    const v = dragToVelocity(60, 0)!
    expect(releaseAim(s)).toBe(true)
    expect(s.ball.vx).toBe(v.vx)
    expect(s.shots).toBe(1)
    s.shots = BOB_FROM_SHOTS // 手动换档：后续回合用浮沉筐
    // 连续两投空心：第二投按 combo=2 倍乘。
    const sink = (): void => {
      s.phase = 'flying'
      const p = hoopAt(s.hoop, s.t + 16)
      s.ball = { x: p.rimX, y: p.rimY - 0.5, vx: 0, vy: 300, rot: 0, vrot: 0 }
      stepMovingHoop(s, 16)
    }
    sink()
    expect(s.combo).toBe(1)
    const first = s.score
    let guard = 0
    while (s.phase !== 'aim' && guard < 400) { stepMovingHoop(s, 16); guard += 1 }
    expect(s.phase).toBe('aim')
    expect(s.hoop.mode).toBe('bob') // 第 2 投出手后仍是浮沉档
    sink()
    expect(s.combo).toBe(2)
    expect(s.score - first).toBe((SWISH_BASE + Math.round(Math.max(0, s.hoop.baseX - ORIGIN.x) / 90)) * 2)
    // 落地脱手清零连击并记 miss。
    guard = 0
    while (s.phase !== 'aim' && guard < 400) { stepMovingHoop(s, 16); guard += 1 }
    s.phase = 'flying'
    s.ball = { x: 200, y: 100, vx: 0, vy: 0, rot: 0, vrot: 0 }
    guard = 0
    while (s.phase === 'flying' && guard < 2000) { stepMovingHoop(s, 16); guard += 1 }
    expect(s.combo).toBe(0)
    expect(s.events.some((e) => e.type === 'miss')).toBe(true)
    expect(COMBO_CAP).toBe(5)
  })

  it('the round clock and the shot cap both end the game', () => {
    const timed = createMovingHoop(19)
    timed.timeMs = 10
    stepMovingHoop(timed, 16)
    expect(timed.phase).toBe('over')
    expect(timed.timeMs).toBe(0)
    const score = timed.score
    stepMovingHoop(timed, 16)
    expect(timed.score).toBe(score)
    beginAim(timed, 0, 0) // 结束后不可再瞄准
    expect(timed.aiming).toBe(false)

    const capped = createMovingHoop(20)
    capped.shots = MAX_SHOTS
    capped.phase = 'flying'
    capped.ball = { x: 200, y: 100, vx: 0, vy: 10, rot: 0, vrot: 0 }
    let guard = 0
    while (capped.phase === 'flying' && guard < 2000) { stepMovingHoop(capped, 16); guard += 1 }
    expect(capped.phase).toBe('over')
    expect(capped.resultMs).toBe(0)
    expect(capped.timeMs).toBeGreaterThan(0)
    expect(capped.timeMs).toBeLessThanOrEqual(GAME_MS)
  })

  it('the same seed and drag schedule replays identical frames across all motion modes', () => {
    const run = (): string => {
      const s = createMovingHoop(123)
      const trace: number[] = []
      const drags = [[-80, 30], [-100, -60], [-60, 80], [-120, -10], [-90, 40], [-110, -20],
        [-70, 60], [-130, 0], [-85, 50], [-105, -30], [-95, 25], [-115, -45], [-75, 70],
        [-125, 10], [-100, 35], [-120, -55]] as const
      for (let round = 0; round < 16; round += 1) {
        const [dx, dy] = drags[round % drags.length]!
        beginAim(s, 100, 300)
        updateAim(s, 100 - dx, 300 - dy)
        if (!releaseAim(s)) throw new Error('drag must launch')
        let guard = 0
        while (s.phase === 'flying' && guard < 4000) {
          stepMovingHoop(s, 16)
          trace.push(Math.round(s.ball.x * 10), Math.round(s.ball.y * 10), s.shots)
          guard += 1
        }
        while (s.phase !== 'aim' && s.phase !== 'over') stepMovingHoop(s, 16)
        trace.push(s.score, s.combo, s.hoop.mode.length, Math.round(s.hoop.rimX * 10), Math.round(s.hoop.rimY * 10))
      }
      return JSON.stringify(trace)
    }
    expect(run()).toBe(run())
  })
})
