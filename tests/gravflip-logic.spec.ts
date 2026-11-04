import { describe, expect, it } from 'vitest'
import {
  BARRIER_W, CEIL_BOT, FLOOR_TOP, H, LASER_FIRE_MS, LASER_PERIOD, MIN_WINDOW,
  PLAYER_HH, PLAYER_X, SEG_LEN, SPEED_BASE, SPEED_MAX, TRACK, createGravFlip,
  genSegment, laserFiring, laserWarn, playerWorldX, speedOf, stepGravFlip,
  type GravFlipState,
} from '../src/client/games/gravflip/logic.ts'

/** 无障碍状态：关闭段生成并清空障碍，便于注入构造障碍。 */
function bare(seed = 5): GravFlipState {
  const s = createGravFlip(seed)
  s.genIndex = 1 << 30
  s.obstacles.length = 0
  return s
}

describe('gravflip logic', () => {
  it('segment generation is deterministic, starts empty, and barriers stay passable', () => {
    expect(genSegment(42, 7)).toEqual(genSegment(42, 7))
    expect(genSegment(42, 7)).not.toEqual(genSegment(43, 7))
    expect(genSegment(42, 0)).toEqual([])
    expect(genSegment(42, 1)).toEqual([])
    for (let seed = 1; seed <= 12; seed += 1) {
      for (let index = 2; index <= 40; index += 1) {
        for (const ob of genSegment(seed, index)) {
          if (ob.type !== 'barrier') continue
          const height = ob.oy2 - ob.oy1
          expect(height).toBeGreaterThanOrEqual(MIN_WINDOW)
          const center = (ob.oy1 + ob.oy2) / 2
          expect(center).toBeGreaterThan(TRACK + 40)
          expect(center).toBeLessThan(H - TRACK - 40)
          expect(ob.oy1).toBeGreaterThan(CEIL_BOT)
          expect(ob.oy2).toBeLessThan(FLOOR_TOP)
        }
      }
    }
  })

  it('flipping gravity lands and attaches to the opposite rail', () => {
    const s = bare(9)
    stepGravFlip(s, 1000, false)
    expect(s.phase).toBe('running')
    expect(s.dir).toBe(1)
    expect(s.y).toBeCloseTo(FLOOR_TOP - PLAYER_HH, 6)
    expect(s.vy).toBe(0)
    stepGravFlip(s, 16, true)
    expect(s.dir).toBe(-1)
    stepGravFlip(s, 2000, false)
    expect(s.phase).toBe('running')
    expect(s.y).toBeCloseTo(CEIL_BOT + PLAYER_HH, 6)
    expect(s.vy).toBe(0)
    // 再翻回地板：对称贴附。
    stepGravFlip(s, 16, true)
    stepGravFlip(s, 2000, false)
    expect(s.dir).toBe(1)
    expect(s.y).toBeCloseTo(FLOOR_TOP - PLAYER_HH, 6)
    expect(s.vy).toBe(0)
  })

  it('floor spikes kill a floor-running player; ceiling spikes do not', () => {
    const dead = bare(3)
    dead.obstacles.push({ type: 'spikes', side: 'bottom', x1: playerWorldX(dead) - 10, x2: playerWorldX(dead) + 10 })
    stepGravFlip(dead, 16, false)
    expect(dead.phase).toBe('dead')
    expect(dead.cause).toBe('spikes')

    const safe = bare(3)
    safe.obstacles.push({ type: 'spikes', side: 'top', x1: playerWorldX(safe) - 10, x2: playerWorldX(safe) + 10 })
    stepGravFlip(safe, 400, false)
    expect(safe.phase).toBe('running')
  })

  it('lasers follow a fixed phase cycle and kill only while firing', () => {
    expect(laserFiring(0, 0)).toBe(true)
    expect(laserFiring(LASER_FIRE_MS - 1, 0)).toBe(true)
    expect(laserFiring(LASER_FIRE_MS, 0)).toBe(false)
    expect(laserFiring(LASER_PERIOD, 0)).toBe(true)
    expect(laserWarn(1600, 0)).toBe(true)
    expect(laserWarn(1000, 0)).toBe(false)

    const hit = bare(4)
    hit.obstacles.push({ type: 'laser', x: playerWorldX(hit), side: 'bottom', phase: 0 })
    stepGravFlip(hit, 16, false)
    expect(hit.phase).toBe('dead')
    expect(hit.cause).toBe('laser')

    // 相位错开：角色穿过时光束未发射 → 存活。
    const miss = bare(4)
    miss.obstacles.push({ type: 'laser', x: playerWorldX(miss), side: 'bottom', phase: 1000 })
    stepGravFlip(miss, 500, false)
    expect(miss.phase).toBe('running')
  })

  it('a well-timed two-flip sequence threads a barrier window', () => {
    const make = (): GravFlipState => {
      const s = bare(7)
      s.obstacles.push({ type: 'barrier', x: playerWorldX(s) + 150, oy1: 116, oy2: 204 })
      return s
    }
    // 模拟：在指定时刻（ms）各执行一次翻转，最多两次。
    const run = (t1: number | null, t2: number | null): GravFlipState => {
      const s = make()
      let elapsed = 0
      let done1 = false
      let done2 = false
      while (elapsed < 1400) {
        const flip = (t1 !== null && !done1 && elapsed >= t1) || (t2 !== null && !done2 && elapsed >= t2)
        if (t1 !== null && !done1 && elapsed >= t1) done1 = true
        if (t2 !== null && !done2 && elapsed >= t2) done2 = true
        stepGravFlip(s, 16, flip)
        elapsed += 16
        if (s.phase === 'dead') break
      }
      return s
    }
    // 从不翻转 / 翻得太晚都撞墙；存在一对二连翻时机穿窗而过。
    expect(run(null, null).phase).toBe('dead')
    expect(run(900, null).phase).toBe('dead')
    let passed = false
    for (let t1 = 0; t1 <= 600 && !passed; t1 += 20) {
      for (let t2 = t1 + 40; t2 <= 1100; t2 += 20) {
        const s = run(t1, t2)
        if (s.phase === 'running' && playerWorldX(s) > 150 + 150 + BARRIER_W + 20) {
          passed = true
          break
        }
      }
    }
    expect(passed).toBe(true)
  })

  it('speed grows with distance and is capped', () => {
    expect(speedOf(0)).toBe(SPEED_BASE)
    expect(speedOf(10000)).toBeGreaterThan(speedOf(0))
    expect(speedOf(1e7)).toBe(SPEED_MAX)
    expect(SPEED_BASE).toBe(250)
    expect(SPEED_MAX).toBe(540)
    const s = bare(2)
    stepGravFlip(s, 2000, false)
    expect(speedOf(s.dist)).toBeGreaterThan(SPEED_BASE)
  })

  it('deterministic replay: same seed and flip script give identical states', () => {
    const script = [3, 7, 8, 40, 41, 60, 61, 90]
    const run = (): string[] => {
      const s = createGravFlip(1234)
      const snaps: string[] = []
      for (let frame = 0; frame < 400; frame += 1) {
        stepGravFlip(s, 16, script.includes(frame))
        if (frame % 10 === 0) {
          snaps.push([s.t, s.dist.toFixed(6), s.y.toFixed(6), s.vy.toFixed(6), s.score, s.dir, s.genIndex].join('|'))
        }
      }
      return snaps
    }
    expect(run()).toEqual(run())
    // 种子不同 → 世界不同（生成序列不同）。
    const a = createGravFlip(1234)
    const b = createGravFlip(5678)
    stepGravFlip(a, 1500, false)
    stepGravFlip(b, 1500, false)
    expect(a.obstacles).not.toEqual(b.obstacles)
  })

  it('score tracks distance and freezes on death', () => {
    const s = bare(6)
    stepGravFlip(s, 1000, false)
    expect(s.score).toBe(Math.floor(s.dist / 10))
    expect(s.score).toBeGreaterThan(0)
    const frozen = s.score
    s.obstacles.push({ type: 'spikes', side: 'bottom', x1: playerWorldX(s) - 5, x2: playerWorldX(s) + 5 })
    stepGravFlip(s, 500, false)
    expect(s.phase).toBe('dead')
    expect(s.score).toBe(frozen)
  })

  it('segment stream stays ahead of the player and prunes behind', () => {
    const s = createGravFlip(77)
    stepGravFlip(s, 6000, false)
    expect(s.phase === 'dead' || s.phase === 'running').toBe(true)
    if (s.phase === 'running') {
      // 前方总有至少一个尚未越过的障碍段。
      const ahead = s.obstacles.some((ob) => {
        const endX = ob.type === 'spikes' ? ob.x2 : ob.type === 'barrier' ? ob.x + BARRIER_W : ob.x + 7
        return endX > playerWorldX(s) + SEG_LEN
      })
      expect(ahead).toBe(true)
    }
  })
})
