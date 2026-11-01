import { describe, expect, it } from 'vitest'
import {
  BASE_Y, BOUNCE_VY, GAP, GRAVITY, H, LATERAL_ACC, MAX_VX, PLAYER_HALF, W, createJumper,
  heightScore, indexRangeFor, platformAt, platformX, stepJumper, type JumperInput,
  type JumperState, type Platform,
} from '../src/client/games/jumper/logic.ts'

const idle: JumperInput = { left: false, right: false }

function run(s: JumperState, frames: number, input: JumperInput = idle): void {
  for (let i = 0; i < frames; i += 1) stepJumper(s, 16, input)
}

/** 在某个 seed 的平台上找到第一个指定种类的段号。 */
function findKind(kind: Platform['kind'], seed: number, maxIndex = 60): number {
  for (let i = 2; i <= maxIndex; i += 1) {
    if (platformAt(seed, i).kind === kind) return i
  }
  throw new Error('no ' + kind + ' platform for seed ' + seed)
}

describe('jumper logic', () => {
  it('platformAt is deterministic and well-formed; segments 0 and 1 are the normal spawn ledges', () => {
    for (const seed of [1, 42, 777]) {
      for (const i of [0, 1, 2, 5, 13, 30]) {
        expect(platformAt(seed, i)).toEqual(platformAt(seed, i))
      }
      const p0 = platformAt(seed, 0)
      const p1 = platformAt(seed, 1)
      expect(p0.kind).toBe('normal')
      expect(p1.kind).toBe('normal')
      expect(p0.w).toBe(150)
      expect(p0.y).toBe(BASE_Y)
      expect(p1.y).toBe(BASE_Y - GAP)
    }
    for (let i = 0; i <= 40; i += 1) {
      const p = platformAt(9, i)
      expect(p.y).toBe(BASE_Y - i * GAP)
      expect(p.x).toBeGreaterThanOrEqual(8 - 1e-9)
      expect(p.x + p.w).toBeLessThanOrEqual(W - 8 + 1e-9)
      if (p.kind === 'moving') expect(p.speed).toBeGreaterThan(0)
      else expect(p.speed).toBe(0)
    }
  })

  it('platformX: static platforms never move; moving platforms sweep inside the walls periodically', () => {
    const seed = 3
    const normal = platformAt(seed, findKind('normal', seed))
    expect(platformX(normal, 0)).toBe(normal.x)
    expect(platformX(normal, 12345)).toBe(normal.x)
    const mover = platformAt(seed, findKind('moving', seed))
    const margin = 8
    for (let t = 0; t <= 20000; t += 100) {
      const x = platformX(mover, t)
      expect(x).toBeGreaterThanOrEqual(margin)
      expect(x + mover.w).toBeLessThanOrEqual(W - margin)
    }
    // 正弦周期闭合：相位转 2π 后回到同一位置。
    const period = (Math.PI * 2 / mover.speed) * 1000
    expect(platformX(mover, 5000 + period)).toBeCloseTo(platformX(mover, 5000), 6)
  })

  it('the idle player keeps bouncing on the spawn ledge forever with camera never scrolling down', () => {
    const s = createJumper(11)
    let bounces = 0
    let camera = s.cameraY
    for (let frame = 0; frame < 1000; frame += 1) {
      stepJumper(s, 16, idle)
      expect(s.phase).toBe('playing')
      expect(s.cameraY).toBeLessThanOrEqual(camera)
      camera = s.cameraY
      if (s.events.some((e) => e.type === 'bounce')) {
        bounces += 1
        expect(s.vy).toBe(-BOUNCE_VY)
        expect(s.lastBounceT).toBe(s.t)
      }
    }
    expect(bounces).toBeGreaterThan(10)
    expect(heightScore(s)).toBeGreaterThanOrEqual(0)
    // BOUNCE_VY 提到 700 后弹跳可跨越两格平台：闲置玩家可能自动落到
    // 正上方平台上链式攀升（doodle-jump 语义），只断言单跳高度上界。
    expect(heightScore(s)).toBeLessThanOrEqual((1000 / 16) * 10)
  })

  it('lateral input accelerates to the cap and side walls stop the player dead', () => {
    const s = createJumper(12)
    run(s, 12, { left: false, right: true }) // 192ms > 280/1600
    expect(s.vx).toBe(MAX_VX)
    // 撞墙夹停：清空平台做无碰撞飞行，两次短程飞行各赶在坠落判死前完成。
    const flight = (x: number, vx: number, input: JumperInput): JumperState => {
      const fly = createJumper(12)
      for (let i = 0; i <= 60; i += 1) fly.broken.add(i)
      fly.x = x
      fly.vx = vx
      fly.y = 250
      fly.vy = -BOUNCE_VY
      fly.cameraY = 250 - H * 0.62
      run(fly, 36, input)
      expect(fly.phase).toBe('playing')
      return fly
    }
    const right = flight(340, 0, { left: false, right: true })
    expect(right.x).toBe(W - PLAYER_HALF)
    expect(right.vx).toBe(0)
    const left = flight(70, -MAX_VX, { left: true, right: false })
    expect(left.x).toBe(PLAYER_HALF)
    expect(left.vx).toBe(0)
    // 单帧 16ms 的加速度增量。
    const one = createJumper(12)
    stepJumper(one, 16, { left: false, right: true })
    expect(one.vx).toBeCloseTo(LATERAL_ACC * 0.016, 5)
    // 松手阻尼滑行。
    stepJumper(one, 100, idle)
    expect(one.vx).toBeGreaterThan(0)
    expect(one.vx).toBeLessThan(LATERAL_ACC * 0.016)
  })

  it('touching a spiky platform from above kills instantly with a spike event', () => {
    const seed = 1
    const idx = findKind('spiky', seed)
    const plat = platformAt(seed, idx)
    const s = createJumper(seed)
    s.x = plat.x + plat.w / 2
    s.y = plat.y - PLAYER_HALF - 1
    s.vy = 100
    s.vx = 0
    stepJumper(s, 16, idle)
    expect(s.phase).toBe('dead')
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'spike', y: plat.y }))
  })

  it('a crumbly platform bounces once, breaks, and no longer holds the player', () => {
    const seed = 1
    const idx = findKind('crumbly', seed)
    const plat = platformAt(seed, idx)
    const s = createJumper(seed)
    s.x = plat.x + plat.w / 2
    s.y = plat.y - PLAYER_HALF - 20
    s.vy = 0
    s.vx = 0
    let guard = 0
    while (!s.broken.has(idx) && guard < 100) { stepJumper(s, 16, idle); guard += 1 }
    expect(s.broken.has(idx)).toBe(true)
    expect(s.events.some((e) => e.type === 'break' && e.y === plat.y)).toBe(true)
    expect(s.vy).toBe(-BOUNCE_VY)
    // 再次落到同一平台：已碎裂，直接穿过（vy 保持向下）。
    s.y = plat.y - PLAYER_HALF - 10
    s.vy = 50
    guard = 0
    while (s.y < plat.y && guard < 100) { stepJumper(s, 16, idle); guard += 1 }
    expect(s.y).toBeGreaterThan(plat.y)
    expect(s.vy).toBeGreaterThan(0)
    expect(s.events.some((e) => e.type === 'bounce' && e.y === plat.y)).toBe(false)
  })

  it('falling off the bottom of the screen ends the run with a fall event', () => {
    const s = createJumper(5)
    // 把附近平台全部标记为碎裂，保证自由落体。
    const [lo, hi] = indexRangeFor(s.y - 100, s.y + 800)
    for (let i = lo; i <= hi + 5; i += 1) s.broken.add(i)
    s.vy = 400
    let guard = 0
    while (s.phase === 'playing' && guard < 400) { stepJumper(s, 16, idle); guard += 1 }
    expect(s.phase).toBe('dead')
    expect(s.events.some((e) => e.type === 'fall')).toBe(true)
    const t = s.t
    const score = heightScore(s)
    stepJumper(s, 16, idle)
    expect(s.t).toBe(t)
    expect(heightScore(s)).toBe(score)
  })
})
