import { describe, expect, it } from 'vitest'
import {
  BALL_R, BALLS_TOTAL, BANK_BONUS, BUMPER_POINTS, FLIPPER_R, MAX_BALLS_IN_PLAY,
  PLUNGER_MAX_SPEED, PLUNGER_MIN_SPEED, TARGET_POINTS, WALL_E,
  bounceOffPoint, closestPointOnSegment, comboMultiplier, createGame, hashRun,
  laneReady, levelThreshold, mulberry32, nudge, plungerRelease, resolveFlipper,
  step, togglePause, type Ball, type Pinball2State,
} from '../src/client/games/pinball2/logic.ts'

function game(seed = 7, table = 1): Pinball2State {
  return createGame(table, seed)
}

/** 构造一颗在场球（测试直插状态用）。 */
function mkBall(x: number, y: number, vx = 0, vy = 0): Ball {
  return { x, y, vx, vy, trail: [], stuckT: 0, stuckKicks: 0 }
}

describe('pinball2 发射器与双球规则', () => {
  it('充能→初速线性映射；零充能最小力度；在场满 2 颗后发射道关闭', () => {
    const s = game()
    // 零充能：按最小力度弹出。
    expect(plungerRelease(s)).toBeCloseTo(PLUNGER_MIN_SPEED, 6)
    expect(s.balls.length).toBe(1)
    // 蓄力 0.6s = 半槽 → 初速 = 最小 + 0.5 × 区间。
    s.plungerHeld = true
    step(s, 0.6)
    expect(s.plunger).toBeCloseTo(0.5, 6)
    const speed = plungerRelease(s)
    expect(speed).toBeCloseTo(PLUNGER_MIN_SPEED + 0.5 * (PLUNGER_MAX_SPEED - PLUNGER_MIN_SPEED), 6)
    expect(s.balls.length).toBe(MAX_BALLS_IN_PLAY)
    expect(s.balls[1]!.vy).toBeCloseTo(-speed, 6)
    // 在场已满 2 颗：发射作废。
    s.plunger = 1
    expect(plungerRelease(s)).toBe(0)
    expect(laneReady(s)).toBe(false)
  })
})

describe('pinball2 圆球-线段物理', () => {
  it('法向按 0.65 反射、切向不变；低速贴合不微弹', () => {
    const cp = closestPointOnSegment(50, 95, 0, 100, 100, 100)
    expect(cp.x).toBeCloseTo(50, 6)
    expect(cp.y).toBeCloseTo(100, 6)
    const ball = mkBall(50, 95, 10, 100)
    expect(bounceOffPoint(ball, BALL_R, WALL_E, 0, cp.x, cp.y)).toBe(true)
    expect(ball.y).toBeCloseTo(100 - BALL_R, 4)
    expect(ball.vy).toBeCloseTo(-100 * WALL_E, 4)
    expect(ball.vx).toBeCloseTo(10, 6)
    // 低速接近（<REST_SPEED）：法向速度归零、贴面滑行。
    const slow = mkBall(50, 95.5, 0, 20)
    expect(bounceOffPoint(slow, BALL_R, WALL_E, 0, 50, 100)).toBe(true)
    expect(slow.vy).toBe(0)
    expect(slow.y).toBeCloseTo(100 - BALL_R, 4)
  })
})

describe('pinball2 bumpers 与连击倍率', () => {
  it('bumper 命中得分、外弹并进入冷却不重复计分', () => {
    const s = game(7)
    const b = s.bumpers[0]!
    s.balls = [mkBall(b.x, b.y + b.r + BALL_R - 2, 0, -120)]
    step(s, 1 / 240)
    expect(s.score).toBe(BUMPER_POINTS)
    expect(s.events.some(e => e.kind === 'bumper')).toBe(true)
    expect(s.balls[0]!.vy).toBeGreaterThan(200)
    // 冷却 0.12s 内紧邻的三步只记一次分。
    step(s, 1 / 240)
    step(s, 1 / 240)
    expect(s.score).toBe(BUMPER_POINTS)
  })

  it('连击倍率：3 秒窗口内每 5 次计分命中 +1 倍率并作用于得分', () => {
    expect(comboMultiplier(0)).toBe(1)
    expect(comboMultiplier(4)).toBe(1)
    expect(comboMultiplier(5)).toBe(2)
    expect(comboMultiplier(12)).toBe(3)
    expect(comboMultiplier(99)).toBe(5)
    const s = game(7)
    // 只留一个 bumper，隔离计分源。
    s.bumpers = [{ ...s.bumpers[0]!, cd: 0 }]
    s.slings = []
    s.targets = []
    s.magnet = null
    s.balls = [mkBall(0, 0)]
    const b = s.bumpers[0]!
    for (let k = 0; k < 5; k += 1) {
      const ball = s.balls[0]!
      ball.x = b.x
      ball.y = b.y + b.r + BALL_R - 2
      ball.vx = 0
      ball.vy = -120
      step(s, 0.2)
    }
    // 5 次命中（间隔 0.2s < 3s 都在窗口内）：前 4 次 x1、第 5 次 x2。
    expect(s.combo).toBe(5)
    expect(s.score).toBe(BUMPER_POINTS * 4 + BUMPER_POINTS * 2)
  })
})

describe('pinball2 挡板速度传递', () => {
  it('上摆挡板把接触点表面速度的一半传给球（0.4 反弹 + 0.5×660 向上）', () => {
    const s = game()
    const f = s.flippers.left
    f.rest = 0
    f.active = 0
    f.angle = 0
    f.omega = -22
    // 球放在挡板中点上方 17px（略压入 17.5px 的胶囊表面）。
    const ball = mkBall(f.px + 30, f.py - 17)
    expect(resolveFlipper(ball, f)).toBe(true)
    expect(ball.y).toBeCloseTo(f.py - (BALL_R + FLIPPER_R), 4)
    expect(ball.vx).toBeCloseTo(0, 4)
    // ω×r = 22×30 = 660 的表面法向速度：反射 0.4×660 + 传递 0.5×660。
    expect(ball.vy).toBeCloseTo(-(0.4 * 660 + 0.5 * 660), 2)
    expect(ball.vy).toBeLessThan(-400)
  })
})

describe('pinball2 nudge 与 TILT', () => {
  it('每球 3 次 nudge 内有效，第 4 次 TILT 没收在场球；无球时无效', () => {
    const s = game(5)
    expect(nudge(s)).toBe(false)
    expect(s.nudgesUsed).toBe(0)
    s.plunger = 1
    plungerRelease(s)
    expect(nudge(s)).toBe(true)
    expect(nudge(s)).toBe(true)
    expect(nudge(s)).toBe(true)
    expect(s.nudgesUsed).toBe(3)
    expect(s.balls.length).toBe(1)
    expect(s.ballsLeft).toBe(BALLS_TOTAL)
    // 第 4 次：TILT，没收在场球。
    expect(nudge(s)).toBe(true)
    expect(s.events.some(e => e.kind === 'tilt')).toBe(true)
    expect(s.balls.length).toBe(0)
    expect(s.ballsLeft).toBe(BALLS_TOTAL - 1)
    expect(s.result).toBe('playing')
  })
})

describe('pinball2 双球互撞', () => {
  it('两球对撞：交换法向速度并弹开，触发 hit 事件', () => {
    const s = game(3)
    s.balls = [mkBall(200, 300, 200, 0), mkBall(260, 300, -200, 0)]
    step(s, 0.3)
    const a = s.balls[0]!
    const b = s.balls[1]!
    expect(a.vx).toBeLessThan(0)
    expect(b.vx).toBeGreaterThan(0)
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(2 * BALL_R - 0.01)
    expect(s.events.some(e => e.kind === 'hit')).toBe(true)
  })
})

describe('pinball2 丢球与终局', () => {
  it('落沟扣球并重置 nudge；5 球全失 → gameOver', () => {
    const s = game(5)
    let guard = 0
    while (s.result === 'playing' && guard < 50) {
      guard += 1
      if (laneReady(s)) { s.plunger = 1; plungerRelease(s) }
      for (const b of s.balls) b.y = 780
      step(s, 1 / 60)
    }
    expect(s.ballsLeft).toBe(0)
    expect(s.balls.length).toBe(0)
    expect(s.result).toBe('gameOver')
  })
})

describe('pinball2 drop targets', () => {
  it('击中计分；整排击落得清台奖励并立即复位', () => {
    const s = game(7)
    s.bumpers = []
    s.slings = []
    s.magnet = null
    s.balls = [mkBall(260, 440 - BALL_R + 2, 0, 100)]
    s.targets[0]!.down = true
    s.targets[1]!.down = true
    step(s, 1 / 240)
    expect(s.score).toBe(TARGET_POINTS + BANK_BONUS)
    expect(s.events.some(e => e.kind === 'bank')).toBe(true)
    // 清台后整排复位为立起。
    expect(s.targets.every(t => !t.down)).toBe(true)
  })
})

describe('pinball2 台面递进与磁力洞', () => {
  it('bumbers 随台面递增、漏斗更宽、第 3 台磁力洞吸球、分数达阈值升台', () => {
    const s1 = game(9, 1)
    const s3 = game(9, 3)
    expect(s1.bumpers.length).toBe(3)
    expect(s3.bumpers.length).toBe(5)
    expect(s1.magnet).toBeNull()
    expect(s3.magnet).not.toBeNull()
    // 底部左漏斗内端（ax=14 且下端 y=602 的斜墙）：第 3 台右移 24px。
    const slant = (s: Pinball2State) => s.walls.find(w => w.ax === 14 && w.by === 602)!
    expect(slant(s3).bx - slant(s1).bx).toBeCloseTo(24, 6)
    // 升台阈值。
    expect(levelThreshold(1)).toBe(2500)
    const s = game(7)
    s.score = levelThreshold(1) - 1
    step(s, 1 / 240)
    expect(s.table).toBe(1)
    s.score = levelThreshold(1)
    step(s, 1 / 240)
    expect(s.table).toBe(2)
    expect(s.bumpers.length).toBe(4)
    expect(s.events.some(e => e.kind === 'tableUp')).toBe(true)
    // 磁力洞：吸引范围内的静止球向洞心加速靠近（清掉计分件只留磁力+重力）。
    const sm = game(9, 3)
    sm.bumpers = []
    sm.slings = []
    sm.targets = []
    const m = sm.magnet!
    sm.balls = [mkBall(m.x, m.y - 60, 0, 0)]
    const before = Math.hypot(sm.balls[0]!.x - m.x, sm.balls[0]!.y - m.y)
    step(sm, 0.08)
    expect(Math.hypot(sm.balls[0]!.x - m.x, sm.balls[0]!.y - m.y)).toBeLessThan(before - 3)
  })
})

describe('pinball2 确定性与重放', () => {
  it('同 seed 布局一致；hashRun 同 seed 同脚本同哈希；暂停冻结状态', () => {
    const a = createGame(1, 42)
    const b = createGame(1, 42)
    const c = createGame(1, 43)
    const key = (s: Pinball2State): string =>
      s.bumpers.map(p => p.x.toFixed(3) + ',' + p.y.toFixed(3)).join(';')
    expect(key(a)).toBe(key(b))
    expect(key(a)).not.toBe(key(c))
    expect(mulberry32(42)()).toBe(mulberry32(42)())
    const script = [
      { t: 0.1, a: 'plungerDown' as const },
      { t: 0.9, a: 'plungerRelease' as const },
      { t: 1.2, a: 'leftDown' as const },
      { t: 1.5, a: 'leftUp' as const },
      { t: 2.0, a: 'nudge' as const },
    ]
    const h1 = hashRun(11, script, 3)
    expect(h1).toBe(hashRun(11, script, 3))
    expect(h1).not.toBe(hashRun(12, script, 3))
    expect(h1).not.toBe(hashRun(11, [], 3))
    // 暂停期间 step 不推进，恢复后分数保持。
    const s = game(7)
    s.score = 1234
    togglePause(s)
    expect(s.result).toBe('paused')
    step(s, 1)
    expect(s.time).toBe(0)
    togglePause(s)
    expect(s.result).toBe('playing')
    expect(s.score).toBe(1234)
  })
})
