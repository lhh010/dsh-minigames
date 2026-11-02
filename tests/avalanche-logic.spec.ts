import { describe, expect, it } from 'vitest'
import {
  AVA_BASE_SPEED, AVA_START_GAP, BASE_MAX_SPEED, CRASH_VX_KEEP, IDLE_INPUT, JUMP_V, SEG_W, START_Y, STEP,
  avalancheGap, createAvalanche, generateSegment, groundYAt, maxSpeed, segmentGroundY, stepAvalanche,
  totalScore, type AvaInput, type AvaState,
} from '../src/client/games/avalanche/logic.ts'

/** 快进 n 帧。 */
function run(s: AvaState, frames: number, input: AvaInput = IDLE_INPUT): void {
  for (let i = 0; i < frames; i += 1) stepAvalanche(s, 16, input)
}

/** 跳一帧（本帧按下跳跃）。 */
const jump: AvaInput = { jump: true, left: false, right: false }

/** 找一个带跳台的段并返回 [seed, index, rampX]。 */
function findRamp(): [number, number, number] {
  for (let seed = 1; seed < 60; seed += 1) {
    for (let index = 0; index < 8; index += 1) {
      const startY = index === 0 ? START_Y : 0
      const seg = generateSegment(seed, index, startY)
      if (seg.rampK >= 0) return [seed, index, index * SEG_W + seg.rampK * STEP]
    }
  }
  throw new Error('no ramp found in scanned seeds')
}

describe('avalanche logic', () => {
  it('terrain segments are deterministic per (seed, index, startY) and chain continuously', () => {
    expect(generateSegment(5, 2, 100)).toEqual(generateSegment(5, 2, 100))
    expect(generateSegment(5, 2, 100)).not.toEqual(generateSegment(6, 2, 100))
    expect(generateSegment(5, 2, 100)).not.toEqual(generateSegment(5, 3, 100))
    const first = generateSegment(11, 0, START_Y)
    const second = generateSegment(11, 1, first.heights[SEG_W / STEP]!)
    // 跨段连续：下一段起点 = 上一段末点。
    expect(second.startY).toBe(first.heights[SEG_W / STEP]!)
    expect(second.heights[0]).toBe(first.heights[SEG_W / STEP]!)
    // 插值落在两端点之间。
    const mid = segmentGroundY(first, SEG_W * 0.5)
    const lo = Math.min(first.heights[4]!, first.heights[5]!)
    const hi = Math.max(first.heights[4]!, first.heights[5]!)
    expect(mid).toBeGreaterThanOrEqual(lo)
    expect(mid).toBeLessThanOrEqual(hi)
    // 障碍避开跳台。
    if (first.rampK >= 0) {
      const rampX = first.rampK * STEP
      for (const o of first.obstacles) expect(Math.abs(o.x - rampX) >= 110).toBe(true)
    }
  })

  it('avalanche advances slower than full speed and catches up after a crash', () => {
    const s = createAvalanche(42)
    // 排除随机障碍撞击的干扰：长无敌宽限让本测试只看速度关系。
    s.crashGraceMs = 1e7
    const gap0 = avalancheGap(s)
    run(s, 240)
    // 满速 > 雪崩速度：正常滑行时安全余量变大。
    expect(s.vx).toBeGreaterThanOrEqual(BASE_MAX_SPEED - 60)
    expect(avalancheGap(s)).toBeGreaterThan(gap0)
    // 强制失速（模拟翻滚后低速）：雪崩追近。
    s.vx = 60
    const gapBefore = avalancheGap(s)
    run(s, 120)
    expect(avalancheGap(s)).toBeLessThan(gapBefore)
    expect(s.avalancheX).toBeGreaterThan(0)
    expect((s.avalancheX + AVA_START_GAP) / (s.t / 1000)).toBeGreaterThan(AVA_BASE_SPEED * 0.9)
  })

  it('jumping from a ramp reaches higher than a flat-ground jump', () => {
    const flat = createAvalanche(3)
    stepAvalanche(flat, 16, jump)
    let flatMin = flat.py
    for (let i = 0; i < 60 && !flat.onGround; i += 1) {
      stepAvalanche(flat, 16, IDLE_INPUT)
      flatMin = Math.min(flatMin, flat.py)
    }
    expect(flat.onGround).toBe(true)

    const [seed, index, rampX] = findRamp()
    const s = createAvalanche(seed)
    // 直接放到跳台中心贴地起跳（地形同 seed 生成，完全确定）。
    s.px = rampX
    s.py = groundYAt(s, rampX)
    s.onGround = true
    s.vx = BASE_MAX_SPEED
    s.avalancheX = s.px - 5000
    stepAvalanche(s, 16, jump)
    expect(s.vy).toBeLessThan(-JUMP_V)
    let rampMin = s.py
    for (let i = 0; i < 90 && !s.onGround; i += 1) {
      stepAvalanche(s, 16, IDLE_INPUT)
      rampMin = Math.min(rampMin, s.py)
    }
    expect(s.onGround).toBe(true)
    // 跳台腾空高度（y 越小事越高）显著高于平地跳。
    expect(rampMin).toBeLessThan(flatMin - 60)
  })

  it('crashing an obstacle tumbles and slows; a mount shield absorbs the hit', () => {
    const s = createAvalanche(7)
    s.avalancheX = s.px - 5000
    const seg = s.segments.get(0)!
    seg.obstacles.length = 0
    seg.obstacles.push({ x: s.px + 40, kind: 'rock', r: 12 })
    const vxBefore = s.vx
    let guard = 0
    while (s.tumbleMs <= 0 && guard < 200) { stepAvalanche(s, 16, IDLE_INPUT); guard += 1 }
    expect(s.tumbleMs).toBeGreaterThan(0)
    expect(s.vx).toBeLessThan(vxBefore * 0.6)
    expect(s.events.some((e) => e.type === 'crash')).toBe(true)

    // 骑企鹅：同撞法免撞一次，不掉速、不失控。
    const p = createAvalanche(7)
    p.avalancheX = p.px - 5000
    p.mount = 'penguin'
    p.shields = 1
    expect(maxSpeed(p)).toBe(BASE_MAX_SPEED + 80)
    const pseg = p.segments.get(0)!
    pseg.obstacles.length = 0
    pseg.obstacles.push({ x: p.px + 40, kind: 'rock', r: 12 }) // 树不再碰撞，用石头验证免撞
    const pvx = p.vx
    guard = 0
    while (!p.events.some((e) => e.type === 'shield') && guard < 200) { stepAvalanche(p, 16, IDLE_INPUT); guard += 1 }
    expect(p.tumbleMs).toBe(0)
    // 免撞不摔：速度只受地形起伏的自然波动，远高于翻滚减速后的量级。
    expect(p.vx).toBeGreaterThan(pvx * 0.8)
    expect(p.mount).toBe('none')
    expect(p.shields).toBe(0)
  })

  it('long airtime scores a trick on landing; a short hop does not', () => {
    const [seed, , rampX] = findRamp()
    const s = createAvalanche(seed)
    s.px = rampX
    s.py = groundYAt(s, rampX)
    s.onGround = true
    s.vx = BASE_MAX_SPEED
    s.avalancheX = s.px - 5000
    stepAvalanche(s, 16, jump)
    let guard = 0
    while (!s.onGround && guard < 200) { stepAvalanche(s, 16, IDLE_INPUT); guard += 1 }
    expect(s.trickScore).toBeGreaterThanOrEqual(50)
    expect(s.floats.some((f) => f.text.startsWith('Trick!'))).toBe(true)
    expect(s.events.some((e) => e.type === 'trick')).toBe(true)

    // 普通短跳不触发特技。
    const hop = createAvalanche(3)
    hop.avalancheX = hop.px - 5000
    stepAvalanche(hop, 16, jump)
    guard = 0
    while (!hop.onGround && guard < 200) { stepAvalanche(hop, 16, IDLE_INPUT); guard += 1 }
    expect(hop.trickScore).toBe(0)
  })

  it('coins on the slope are collected once for +10 each', () => {
    const s = createAvalanche(9)
    s.avalancheX = s.px - 5000
    const seg = s.segments.get(0)!
    seg.coins.length = 0
    for (let i = 0; i < 3; i += 1) {
      seg.coins.push({ x: s.px + 60 + i * 44, y: groundYAt(s, s.px + 60 + i * 44) - 34, taken: false })
    }
    let guard = 0
    while (s.coinScore < 30 && guard < 400) { stepAvalanche(s, 16, IDLE_INPUT); guard += 1 }
    expect(s.coinScore).toBe(30)
    expect(seg.coins.every((c) => c.taken)).toBe(true)
    const score = totalScore(s)
    stepAvalanche(s, 16, IDLE_INPUT)
    // 已拾取的金币不再计分。
    expect(totalScore(s)).toBeGreaterThanOrEqual(score)
  })

  it('avalanche overrun ends the run and freezes the state', () => {
    const s = createAvalanche(13)
    s.avalancheX = s.px + 5
    stepAvalanche(s, 16, IDLE_INPUT)
    expect(s.phase).toBe('over')
    expect(s.events.some((e) => e.type === 'over')).toBe(true)
    const frozen = { px: s.px, avalancheX: s.avalancheX, score: totalScore(s) }
    stepAvalanche(s, 16, jump)
    stepAvalanche(s, 16, IDLE_INPUT)
    expect(s.px).toBe(frozen.px)
    expect(s.avalancheX).toBe(frozen.avalancheX)
    expect(totalScore(s)).toBe(frozen.score)
  })

  it('mounts are picked up on contact and grant shields', () => {
    const s = createAvalanche(15)
    s.avalancheX = s.px - 5000
    const seg = s.segments.get(0)!
    seg.mounts.length = 0
    seg.mounts.push({ x: s.px + 50, kind: 'yeti', taken: false })
    let guard = 0
    while (s.mount === 'none' && guard < 200) { stepAvalanche(s, 16, IDLE_INPUT); guard += 1 }
    expect(s.mount).toBe('yeti')
    expect(s.shields).toBe(2)
    expect(seg.mounts[0]!.taken).toBe(true)
    expect(s.events.some((e) => e.type === 'mount')).toBe(true)
  })

  it('same seed and inputs replay identically', () => {
    const drive = (s: AvaState): void => {
      for (let i = 0; i < 500; i += 1) {
        const input: AvaInput = {
          jump: i % 43 === 0,
          left: i % 17 < 6,
          right: i % 23 < 5,
        }
        stepAvalanche(s, 16, input)
      }
    }
    const a = createAvalanche(2024)
    const b = createAvalanche(2024)
    // 把雪崩放远，驱动期内的随机撞击不至于把对局送进结束。
    a.avalancheX = -20000
    b.avalancheX = -20000
    drive(a)
    drive(b)
    for (const s of [a, b]) {
      // 保证两局都没有在驱动途中结束（结束会让比较退化成平凡）。
      if (s.phase === 'over') throw new Error('replay drove into avalanche overrun')
    }
    expect(b.px).toBe(a.px)
    expect(b.py).toBe(a.py)
    expect(b.vx).toBe(a.vx)
    expect(b.coinScore).toBe(a.coinScore)
    expect(b.trickScore).toBe(a.trickScore)
    expect(b.mount).toBe(a.mount)
    expect(totalScore(b)).toBe(totalScore(a))
    const sa = a.segments.get(4)!
    const sb = b.segments.get(4)!
    expect(sb.heights).toEqual(sa.heights)
    expect(sb.obstacles).toEqual(sa.obstacles)
  })
})
