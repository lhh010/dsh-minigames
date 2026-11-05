import { describe, expect, it } from 'vitest'
import {
  BALL_R, BALLS_PER_GAME, BALL_SPAWN, BUMPER_COOLDOWN, BUMPER_POINTS, DRAIN_Y,
  SERVE_MIN_VY, TABLE_H,
  createGame2, hashRun2, serve, setFlipper2, step2, togglePause2,
  type Pinball2State, type ScriptedInput2,
} from '../src/client/games/pinball2/logic.ts'

function game(seed = 7): Pinball2State {
  return createGame2(seed)
}

/** 以 1/60 帧节奏推进 secs 秒（模拟街机循环）。 */
function run(s: Pinball2State, secs: number): void {
  for (let i = 0; i < Math.round(secs * 60); i += 1) step2(s, 1 / 60)
}

/** 把球摆到某个 bumper 正下方 2px 处并向下压。 */
function aimAtBumper(s: Pinball2State, index: number): void {
  const b = s.bumpers[index]!
  s.ball.x = b.x
  s.ball.y = b.y + b.r + BALL_R - 2
  s.ball.vx = 0
  s.ball.vy = -120
}

describe('pinball2 弹球大师', () => {
  it('新局处于待发球：球停在发球点，空格发球后开始下坠', () => {
    const s = game()
    expect(s.result).toBe('serving')
    expect(s.score).toBe(0)
    expect(s.ballsLeft).toBe(BALLS_PER_GAME)
    expect(s.ball.x).toBe(BALL_SPAWN.x)
    expect(s.ball.y).toBe(BALL_SPAWN.y)
    expect(serve(s)).toBe(true)
    expect(s.result).toBe('playing')
    expect(serve(s)).toBe(false) // playing 阶段不能再发球
    const vy0 = s.ball.vy
    expect(vy0).toBeGreaterThanOrEqual(SERVE_MIN_VY)
    step2(s, 1 / 60)
    expect(s.ball.vy).toBeGreaterThan(vy0) // 重力持续加速
    expect(s.ball.y).toBeGreaterThan(BALL_SPAWN.y)
  })

  it('球撞外墙被弹回并始终留在台面横向范围内', () => {
    const s = game()
    serve(s)
    s.ball.x = 30
    s.ball.y = 300
    s.ball.vx = -400
    s.ball.vy = 0
    for (let i = 0; i < 30; i += 1) {
      step2(s, 1 / 240)
      expect(s.ball.x).toBeGreaterThanOrEqual(14 + BALL_R - 1)
      expect(s.ball.x).toBeLessThanOrEqual(406 - BALL_R + 1)
    }
    expect(s.ball.vx).toBeGreaterThan(0) // 左墙反弹回场内
  })

  it('bumper 得分并外冲，冷却期内不重复得分', () => {
    const s = game()
    serve(s)
    aimAtBumper(s, 0)
    const b = s.bumpers[0]!
    step2(s, 1 / 240)
    expect(s.score).toBe(BUMPER_POINTS)
    expect(s.events.some(e => e.kind === 'bumper')).toBe(true)
    expect(s.ball.vy).toBeGreaterThan(200) // 外冲把球踢离
    // 冷却未过（0.12s），继续贴着也不得分。
    step2(s, 1 / 240)
    step2(s, 1 / 240)
    expect(s.score).toBe(BUMPER_POINTS)
    expect(b.cd).toBeGreaterThan(0)
    expect(b.cd).toBeLessThanOrEqual(BUMPER_COOLDOWN)
  })

  it('连续 bumper 命中按连击倍率累加得分', () => {
    const s = game()
    serve(s)
    aimAtBumper(s, 0)
    step2(s, 1 / 240)
    expect(s.score).toBe(100) // combo=1 → x1
    aimAtBumper(s, 1)
    step2(s, 1 / 240)
    expect(s.score).toBe(300) // combo=2 → +100x2
    expect(s.combo).toBe(2)
  })

  it('按住挡板抬起、松开回落', () => {
    const s = game()
    serve(s)
    const f = s.flippers.left
    const restAngle = f.angle
    setFlipper2(s, 'left', true)
    run(s, 0.3)
    expect(f.angle).toBeLessThan(restAngle - 0.5) // 抬到高位
    setFlipper2(s, 'left', false)
    run(s, 0.3)
    expect(f.angle).toBeCloseTo(restAngle, 4)
  })

  it('球碰挡板即清空连击', () => {
    const s = game()
    serve(s)
    aimAtBumper(s, 0)
    step2(s, 1 / 240)
    aimAtBumper(s, 1)
    step2(s, 1 / 240)
    expect(s.combo).toBe(2)
    // 把球压到左挡板枢轴上方（直接与胶囊接触），连击即被清零。
    const f = s.flippers.left
    s.ball.x = f.px
    s.ball.y = f.py - (BALL_R + 9) + 1
    s.ball.vx = 0
    s.ball.vy = 40
    let sawReset = false
    for (let i = 0; i < 12; i += 1) {
      step2(s, 1 / 240)
      if (s.events.some(e => e.kind === 'comboReset')) sawReset = true
    }
    expect(sawReset).toBe(true)
    expect(s.combo).toBe(0)
  })

  it('落袋扣一球并回到待发球，三球用尽后结束', () => {
    const s = game()
    serve(s)
    s.ball.y = TABLE_H + 40
    step2(s, 1 / 60)
    expect(s.ballsLeft).toBe(BALLS_PER_GAME - 1)
    expect(s.result).toBe('serving')
    expect(s.ball.x).toBe(BALL_SPAWN.x)
    expect(s.events.some(e => e.kind === 'drain')).toBe(true)
    for (let drained = 0; drained < BALLS_PER_GAME - 1; drained += 1) {
      serve(s)
      s.ball.y = DRAIN_Y + 10
      step2(s, 1 / 60)
    }
    expect(s.ballsLeft).toBe(0)
    expect(s.result).toBe('over')
    step2(s, 1 / 60) // 结束后步进是无操作
    expect(s.result).toBe('over')
  })

  it('暂停冻结模拟，继续后恢复', () => {
    const s = game()
    serve(s)
    togglePause2(s)
    expect(s.result).toBe('paused')
    const x = s.ball.x
    const y = s.ball.y
    step2(s, 0.5)
    expect(s.ball.x).toBe(x)
    expect(s.ball.y).toBe(y)
    togglePause2(s)
    expect(s.result).toBe('playing')
    step2(s, 1 / 60)
    expect(Math.hypot(s.ball.x - x, s.ball.y - y)).toBeGreaterThan(0)
  })

  it('同种子同脚本轨迹哈希一致，异种子不同', () => {
    const script: ScriptedInput2[] = [
      { t: 0.1, a: 'serve' },
      { t: 0.8, a: 'leftDown' },
      { t: 1.0, a: 'leftUp' },
      { t: 1.4, a: 'rightDown' },
      { t: 1.6, a: 'rightUp' },
    ]
    const a = hashRun2(11, script, 3)
    const b = hashRun2(11, script, 3)
    expect(a).toBe(b)
    expect(a).not.toBe(hashRun2(12, script, 3))
  })
})
