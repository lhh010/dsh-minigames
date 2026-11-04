import { describe, expect, it } from 'vitest'
import {
  ANCHOR_R,
  DEAD_MS,
  CLEAR_MS,
  GRAVITY,
  HOOK_RANGE,
  LEVELS,
  createGrapple,
  forceAttach,
  generateWorld,
  grappleScore,
  mulberry32,
  pendulumEnergy,
  stepGrapple,
} from '../src/client/games/grapple/logic.ts'

describe('grapple logic', () => {
  it('mulberry32 and world generation are deterministic per seed+level', () => {
    const a = mulberry32(21)
    const b = mulberry32(21)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    const wa = generateWorld(42, 1)
    const wb = generateWorld(42, 1)
    expect(wa).toEqual(wb)
    expect(wa.goalX).toBeGreaterThan(0)
    expect(wa.anchors.length).toBeGreaterThan(5)
    // 关卡越高锚点越稀、尖刺越多。
    const w5 = generateWorld(42, 5)
    expect(w5.spikes.length).toBeGreaterThan(wa.spikes.length)
    expect(w5.goalX).toBeGreaterThan(wa.goalX)
    // 锚点都在画面上部（L1 是 86~186px 低锚带，L2 起天花板锚点群）。
    for (const an of wa.anchors) expect(an.y).toBeLessThan(187)
  })

  it('grapple attaches only to an up-forward anchor within HOOK_RANGE', () => {
    const s = createGrapple(7)
    // 用一个受控锚点：上前方恰好 200px。
    s.world.anchors = [{ x: 220, y: 40 }]
    s.x = 100
    s.y = 200
    s.vx = 0
    s.vy = 0
    stepGrapple(s, 40, { hold: true })
    expect(s.anchorIdx).toBe(0)
    // 发射在子步内发生，此前自由落体已移动几毫秒：距离 ≈ 200。
    expect(s.ropeLen).toBeCloseTo(200, 0)
    // 超出半径：不吸附。
    const far = createGrapple(7)
    far.world.anchors = [{ x: 900, y: 40 }]
    far.x = 60
    far.y = 200
    stepGrapple(far, 40, { hold: true })
    expect(far.anchorIdx).toBe(-1)
    // 锚点在玩家下方：不吸附（角度必须朝上前方）。
    const below = createGrapple(7)
    below.world.anchors = [{ x: 100, y: 300 }]
    below.x = 60
    below.y = 200
    stepGrapple(below, 40, { hold: true })
    expect(below.anchorIdx).toBe(-1)
  })

  it('pendulum swing conserves energy approximately (no external work)', () => {
    const s = createGrapple(7)
    s.world.spikes = []
    s.world.goalX = 100000
    forceAttach(s, 300, 60, -1.2, 0)
    const e0 = pendulumEnergy(s)
    // 摆过多个周期后能量漂移 < 5%（半隐式欧拉 + 5ms 固定子步，长期有界）。
    for (let i = 0; i < 4000; i += 1) stepGrapple(s, 40, { hold: true })
    expect(s.anchorIdx).not.toBe(-1)
    const drift = Math.abs(pendulumEnergy(s) - e0) / Math.abs(e0)
    expect(drift).toBeLessThan(0.05)
  })

  it('release turns the swing into an inertia parabola (vx constant, vy integrates g)', () => {
    const s = createGrapple(7)
    s.world.spikes = []
    s.world.goalX = 100000
    forceAttach(s, 300, 60, -0.6, 2.2)
    stepGrapple(s, 40, { hold: false })
    expect(s.anchorIdx).toBe(-1)
    const vx0 = s.vx
    const vy0 = s.vy
    const x0 = s.x
    const frames = 8
    for (let i = 0; i < frames; i += 1) stepGrapple(s, 40, { hold: false })
    // 每帧 40ms 恰好 8 个 5ms 子步：vy 增量 = g * 总时间。
    expect(s.vx).toBeCloseTo(vx0, 6)
    expect(s.vy).toBeCloseTo(vy0 + GRAVITY * frames * 0.04, 5)
    // 位移符合抛物线：x 匀速直线。
    expect(s.x).toBeCloseTo(x0 + vx0 * frames * 0.04, 4)
  })

  it('falling below the screen bottom kills and respawns at the segment start', () => {
    const s = createGrapple(7)
    s.world.spikes = []
    s.world.goalX = 100000
    s.x = 1750
    s.y = 500
    stepGrapple(s, 40, { hold: false })
    expect(s.phase).toBe('dead')
    expect(s.deaths).toBe(1)
    // 距离分保留（死亡不清零）。
    expect(s.maxX).toBeGreaterThanOrEqual(1750)
    // 推过 DEAD_MS 后回段首：第 2 段起点 2*800+40。
    for (let i = 0; i < DEAD_MS / 40 + 2; i += 1) stepGrapple(s, 40, { hold: false })
    expect(s.phase).toBe('flying')
    // 重生当帧剩余子步还会前进一点：落在段首附近。
    expect(s.x).toBeGreaterThanOrEqual(2 * 800 + 40)
    expect(s.x).toBeLessThan(2 * 800 + 120)
    expect(s.y).toBeLessThan(400)
  })

  it('spike collision kills the ninja', () => {
    const s = createGrapple(7)
    s.world.goalX = 100000
    // 人为放一根尖刺在正前方路线上。
    s.world.spikes = [{ x: 100, y: 220, w: 60, h: 140 }]
    s.x = 120
    s.y = 280
    s.vx = 0
    s.vy = 0
    stepGrapple(s, 40, { hold: false })
    expect(s.phase).toBe('dead')
  })

  it('reaching the goal flag clears each of the LEVELS levels then wins', () => {
    const s = createGrapple(7)
    for (let lvl = 1; lvl <= LEVELS; lvl += 1) {
      expect(s.level).toBe(lvl)
      s.world.spikes = []
      s.x = s.world.goalX + 1
      s.y = 100
      stepGrapple(s, 40, { hold: false })
      expect(s.phase).toBe('clear')
      for (let i = 0; i < CLEAR_MS / 40 + 2; i += 1) stepGrapple(s, 40, { hold: false })
      if (lvl < LEVELS) {
        expect(s.phase).toBe('flying')
        expect(s.level).toBe(lvl + 1)
        // 新关距离从段首重新起算（重生当帧剩余子步的前进量很小）。
        expect(s.maxX).toBeLessThan(60)
      } else {
        expect(s.phase).toBe('win')
      }
    }
    // 过关距离计入总分。
    expect(grappleScore(s)).toBeGreaterThan(0)
  })

  it('score is forward distance in meters and never decreases', () => {
    const s = createGrapple(7)
    s.world.spikes = []
    s.world.goalX = 100000
    s.x = 500
    s.y = 100
    stepGrapple(s, 40, { hold: false })
    expect(grappleScore(s)).toBe(50)
    const before = grappleScore(s)
    s.x = 300
    stepGrapple(s, 40, { hold: false })
    expect(grappleScore(s)).toBe(before)
  })

  it('stepping is deterministic: same seed and inputs replay identically', () => {
    const run = (): number[] => {
      const s = createGrapple(9)
      const out: number[] = []
      for (let i = 0; i < 600; i += 1) {
        stepGrapple(s, 16, { hold: i % 7 < 3 })
        if (i % 10 === 0) out.push(Math.round(s.x * 100), Math.round(s.y * 100), s.anchorIdx)
      }
      return out
    }
    expect(run()).toEqual(run())
  })
})
