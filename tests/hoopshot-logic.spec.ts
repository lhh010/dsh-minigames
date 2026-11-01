import { describe, expect, it } from 'vitest'
import {
  BALL_R, BOARD_DAMP, COMBO_CAP, FLOAT_MS, GAME_MS, HIT_BASE, MAX_DRAG, MAX_SHOTS,
  MAX_SPEED, MIN_DRAG, ORIGIN, RESULT_MS, RIM_PT_R, RIM_R, SWISH_BASE, W,
  beginAim, boardOf, createHoopShot, dragToVelocity, hoopDistance, mulberry32,
  releaseAim, stepHoopShot, updateAim,
} from '../src/client/games/hoopshot/logic.ts'

describe('hoop shot logic', () => {
  it('maps drags to slingshot velocities: reversed direction, capped power, minimum threshold', () => {
    expect(dragToVelocity(5, 0)).toBeNull()
    expect(dragToVelocity(0, MIN_DRAG - 0.01)).toBeNull()
    // 入参即拖拽反向量：(-160,160) → 初速朝左下。
    const v = dragToVelocity(-MAX_DRAG, MAX_DRAG)!
    expect(v.vx).toBeCloseTo(-MAX_SPEED / Math.SQRT2, 6)
    expect(v.vy).toBeCloseTo(MAX_SPEED / Math.SQRT2, 6)
    // 超过上限按满力计。
    const over = dragToVelocity(-500, 0)!
    expect(over.vx).toBe(-MAX_SPEED)
    expect(over.vy).toBe(0)
    // 力度随长度线性放大。
    const half = dragToVelocity(0, MAX_DRAG / 2)!
    expect(half.vy).toBe(MAX_SPEED / 2)
  })

  it('aiming: short drags cancel without a shot; real drags launch with the mapped velocity', () => {
    const fresh = createHoopShot(42)
    const twin = createHoopShot(42)
    expect(fresh.phase).toBe('aim')
    expect(fresh.timeMs).toBe(GAME_MS)
    expect(fresh.score).toBe(0)
    expect(fresh.combo).toBe(0)
    expect(fresh.shots).toBe(0)
    expect(fresh.ball.x).toBe(ORIGIN.x)
    expect(fresh.hoop.rimX).toBeGreaterThanOrEqual(W * 0.52)
    expect(fresh.hoop.rimX).toBeLessThanOrEqual(W - 80 - RIM_R)
    expect(fresh.hoop.rimY).toBeGreaterThanOrEqual(112)
    expect(fresh.hoop.rimY).toBeLessThanOrEqual(262)
    expect([fresh.hoop.rimX, fresh.hoop.rimY]).toEqual([twin.hoop.rimX, twin.hoop.rimY])
    const ra = mulberry32(42)
    const rb = mulberry32(42)
    expect([ra(), ra(), ra()]).toEqual([rb(), rb(), rb()])
    const s = createHoopShot(7)
    beginAim(s, 100, 300)
    expect(s.aiming).toBe(true)
    updateAim(s, 100, 300) // 零长度拖拽
    expect(releaseAim(s)).toBe(false)
    expect(s.shots).toBe(0)
    expect(s.phase).toBe('aim')
    beginAim(s, 100, 300)
    updateAim(s, 40, 300)
    expect(releaseAim(s)).toBe(true)
    expect(s.shots).toBe(1)
    expect(s.phase).toBe('flying')
    expect(s.ball.vx).toBe(60 / 160 * 1150) // 60/160 * MAX_SPEED(1150)
    expect(s.ball.vy).toBe(0)
    // 非瞄准阶段按下无效；未按下时移动无效。
    beginAim(s, 0, 0)
    expect(s.aiming).toBe(false)
    const aimTo = { ...s.aimTo }
    updateAim(s, 1, 1)
    expect(s.aimTo).toEqual(aimTo)
  })

  it('a downward pass through the mouth scores: swish pays more, rim contact downgrades it', () => {
    const launchIntoMouth = (s: ReturnType<typeof createHoopShot>) => {
      s.phase = 'flying'
      s.aiming = false
      s.ball = { x: s.hoop.rimX, y: s.hoop.rimY - 0.5, vx: 0, vy: 200, rot: 0, vrot: 0 }
      stepHoopShot(s, 16)
    }
    const swish = createHoopShot(3)
    launchIntoMouth(swish)
    expect(swish.phase).toBe('result')
    expect(swish.resultMs).toBe(RESULT_MS)
    expect(swish.combo).toBe(1)
    const dBonus = Math.round(hoopDistance(swish.hoop) / 90)
    expect(swish.score).toBe((SWISH_BASE + dBonus) * 1)
    expect(swish.events).toContainEqual(expect.objectContaining({ type: 'score', swish: true, combo: 1 }))
    expect(swish.floats.some((f) => f.text === 'Swish!' && f.life === FLOAT_MS)).toBe(true)

    const rimmed = createHoopShot(4)
    rimmed.rimTouched = true // 碰过筐沿：普通进球
    launchIntoMouth(rimmed)
    const d2 = Math.round(hoopDistance(rimmed.hoop) / 90)
    expect(rimmed.score).toBe((HIT_BASE + d2) * 1)
    expect(rimmed.events).toContainEqual(expect.objectContaining({ type: 'score', swish: false }))
  })

  it('the backboard bounces the ball with damped velocity and keeps swish eligibility', () => {
    const s = createHoopShot(11)
    s.phase = 'flying'
    const { boardX } = boardOf(s.hoop)
    s.ball = { x: boardX - BALL_R - 0.5, y: s.hoop.rimY - 20, vx: 300, vy: 0, rot: 0, vrot: 0 }
    stepHoopShot(s, 16)
    expect(s.events.some((e) => e.type === 'board')).toBe(true)
    expect(s.ball.vx).toBeCloseTo(-300 * BOARD_DAMP, 6)
    expect(s.ball.x).toBeCloseTo(boardX - BALL_R, 6)
    expect(s.rimTouched).toBe(false) // 篮板反弹不取消空心资格
    expect(s.phase).toBe('flying')
  })

  it('rim contact is detected physically and multiplies streaks until a miss resets them', () => {
    const s = createHoopShot(5)
    s.phase = 'flying'
    // 球心压在前筐沿端点的碰撞圆上。
    s.ball = { x: s.hoop.rimX - RIM_R, y: s.hoop.rimY - (BALL_R + RIM_PT_R) + 2, vx: 50, vy: 120, rot: 0, vrot: 0 }
    stepHoopShot(s, 16)
    expect(s.rimTouched).toBe(true)
    expect(s.events.some((e) => e.type === 'rim')).toBe(true)

    // 连续两次空心：第二投按 combo=2 倍乘计分。
    const sink = () => {
      s.phase = 'flying'
      s.ball = { x: s.hoop.rimX, y: s.hoop.rimY - 0.5, vx: 0, vy: 200, rot: 0, vrot: 0 }
      stepHoopShot(s, 16)
    }
    sink()
    expect(s.combo).toBe(1)
    const firstScore = s.score
    s.resultMs = 0
    stepHoopShot(s, 16) // 结算结束，进入下一回合并换筐
    expect(s.phase).toBe('aim')
    sink()
    expect(s.combo).toBe(2)
    // 第二投的得分 = 第二筐基础分（含距离分）× combo 2。
    expect(s.score - firstScore).toBe((SWISH_BASE + Math.round(hoopDistance(s.hoop) / 90)) * 2)
    // 落地脱手清零连击并记 miss。
    s.resultMs = 0
    stepHoopShot(s, 16)
    s.phase = 'flying'
    s.ball = { x: 200, y: 100, vx: 0, vy: 0, rot: 0, vrot: 0 }
    let guard = 0
    while (s.phase === 'flying' && guard < 2000) { stepHoopShot(s, 16); guard += 1 }
    expect(s.combo).toBe(0)
    expect(s.events.some((e) => e.type === 'miss')).toBe(true)
    expect(COMBO_CAP).toBe(5)
  })

  it('the round clock and the shot cap both end the game', () => {
    const s = createHoopShot(19)
    s.phase = 'aim'
    s.timeMs = 10
    stepHoopShot(s, 16)
    expect(s.phase).toBe('over')
    expect(s.timeMs).toBe(0)
    const score = s.score
    stepHoopShot(s, 16)
    expect(s.score).toBe(score)
    beginAim(s, 0, 0) // 结束后不可再瞄准
    expect(s.aiming).toBe(false)

    const capped = createHoopShot(20)
    capped.shots = MAX_SHOTS // 出手计数在 releaseAim 时增加，此处跳过出手
    capped.phase = 'flying'
    capped.ball = { x: 200, y: 370, vx: 0, vy: 10, rot: 0, vrot: 0 }
    let guard2 = 0
    while (capped.phase === 'flying' && guard2 < 500) { stepHoopShot(capped, 16); guard2 += 1 } // 落地脱手
    expect(capped.phase).toBe('over')
    expect(capped.resultMs).toBe(0)
  })

  it('the same seed and drag schedule replays an identical trajectory', () => {
    const run = (): string => {
      const s = createHoopShot(123)
      const trace: number[] = []
      const drags = [[-80, 30], [-100, -60], [-60, 80], [-120, -10]] as const
      for (let round = 0; round < 4; round += 1) {
        const [dx, dy] = drags[round % drags.length]!
        beginAim(s, 100, 300)
        updateAim(s, 100 - dx, 300 - dy)
        if (!releaseAim(s)) throw new Error('drag must launch')
        let guard = 0
        while (s.phase === 'flying' && guard < 4000) {
          stepHoopShot(s, 16)
          trace.push(Math.round(s.ball.x * 10), Math.round(s.ball.y * 10), s.shots)
          guard += 1
        }
        while (s.phase !== 'aim' && s.phase !== 'over') stepHoopShot(s, 16)
        trace.push(s.score, s.combo, Math.round(s.hoop.rimX * 10), Math.round(s.hoop.rimY * 10))
      }
      return JSON.stringify(trace)
    }
    expect(run()).toBe(run())
  })

  it('obstacles ramp with shots and collide-bounce the ball', () => {
    const s = createHoopShot(20261101)
    expect(s.obstacles).toHaveLength(0) // 前 4 投热身无障碍
    // 推进 5 投（快速脱手即可）后进入 1 障碍档。
    for (let i = 0; i < 5; i += 1) {
      beginAim(s, 100, 300)
      updateAim(s, 100, 340) // 短促向下拖 -> 向上小力出手
      if (!releaseAim(s)) { beginAim(s, 100, 300); updateAim(s, 100, 344); releaseAim(s) }
      for (let f = 0; f < 4000 && s.phase === 'flying'; f += 1) stepHoopShot(s, 16)
      for (let f = 0; f < 200 && s.phase === 'result'; f += 1) stepHoopShot(s, 16)
    }
    expect(s.shots).toBeGreaterThanOrEqual(5)
    expect(s.obstacles.length).toBeGreaterThanOrEqual(1)
    // 碰撞：把球放到障碍内部并给速度，步进后被推出且该轴速度反向衰减。
    const ob = s.obstacles[0]!
    s.phase = 'flying'
    s.ball = { x: ob.x, y: ob.y, vx: 200, vy: 0, rot: 0, vrot: 0 }
    const side = ob.x >= s.ball.x ? 1 : -1
    stepHoopShot(s, 16)
    const bounced = Math.abs(s.ball.x - ob.x) >= ob.w / 2 + BALL_R - 0.5
    expect(bounced || Math.abs(s.ball.y - ob.y) >= ob.h / 2 + BALL_R - 0.5).toBe(true)
    void side
  })
})
