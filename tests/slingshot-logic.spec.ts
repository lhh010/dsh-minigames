import { describe, expect, it } from 'vitest'
import {
  GRAVITY, LEVELS, MATERIALS, MAX_DRAG, MAX_SPEED, PIG_R, SLING,
  createSlingshot, dragToVelocity, launch, starsFor, stepAndJudge,
  type Block, type Pig, type SlingshotState,
} from '../src/client/games/slingshot/logic.ts'

/** 以 240Hz 固定子步推进若干秒。 */
function sim(state: SlingshotState, seconds: number): void {
  for (let i = 0, n = Math.round(seconds * 240); i < n; i += 1) stepAndJudge(state, 1000 / 240)
}

/** 反解直射某点所需的发射初速（与逻辑同一弹道积分）。 */
function aimAt(x: number, y: number, vx: number): { vx: number, vy: number } {
  const t = (x - SLING.x) / vx
  return { vx, vy: (y - SLING.y - 0.5 * GRAVITY * t * t) / t }
}

/** 用最少字段搭一个测试用块/猪。 */
function makeBlock(x: number, y: number, w: number, h: number, mat: keyof typeof MATERIALS = 'stone'): Block {
  return { x, y, w, h, mat, hp: MATERIALS[mat].hp, vx: 0, vy: 0, angle: 0, av: 0, broken: false, asleep: false, still: 0 }
}
function makePig(x: number, y: number): Pig {
  return { x, y, vx: 0, vy: 0, dead: false, asleep: false, still: 0, pressed: false, crushMs: 0 }
}

describe('slingshot logic', () => {
  it('has six valid levels with pigs, blocks and birds', () => {
    expect(LEVELS.length).toBe(6)
    for (const lv of LEVELS) {
      expect(lv.pigs.length).toBeGreaterThanOrEqual(1)
      expect(lv.blocks.length).toBeGreaterThanOrEqual(3)
      expect(lv.birds).toBeGreaterThanOrEqual(3)
      for (const b of lv.blocks) {
        expect(MATERIALS[b.mat]).toBeDefined()
        expect(b.w).toBeGreaterThan(0)
        expect(b.h).toBeGreaterThan(0)
      }
    }
  })

  it('dragToVelocity maps slingshot drags with a cap', () => {
    // 弹弓约定：参数 = 起点减当前点（拖向左下 → 向量朝右上）。
    const v = dragToVelocity(100, -100)!
    expect(v.vx).toBeGreaterThan(0)
    expect(v.vy).toBeLessThan(0)
    const len = Math.hypot(v.vx, v.vy)
    expect(len).toBeCloseTo((Math.hypot(100, -100) / MAX_DRAG) * MAX_SPEED, 5)
    const capped = dragToVelocity(400, -400)!
    expect(Math.hypot(capped.vx, capped.vy)).toBeCloseTo(MAX_SPEED, 5)
    expect(dragToVelocity(3, -3)).toBeNull()
  })

  it('launch consumes a bird only from aim phase', () => {
    const s = createSlingshot(1, 1)
    expect(launch(s, 800, -300)).toBe(true)
    expect(s.used).toBe(1)
    expect(launch(s, 800, -300)).toBe(false) // flying 中不能再发
  })

  it('physics is deterministic: same launch replays identically', () => {
    const run = (): string => {
      const s = createSlingshot(7, 3)
      launch(s, 900, -250)
      for (let i = 0; i < 4000; i += 1) stepAndJudge(s, 4)
      return s.blocks.map(b => [b.x, b.y, b.angle, b.hp].map(v => v.toFixed(3)).join('/') + (b.broken ? 'x' : '')).join(',')
        + '|' + s.pigs.map(p => (p.dead ? 'd' : 'a') + p.x.toFixed(3) + ',' + p.y.toFixed(3)).join(',')
    }
    expect(run()).toEqual(run())
  })

  it('initial stacks rest: 10s of idling moves nothing and breaks nothing', () => {
    for (let lv = 1; lv <= LEVELS.length; lv += 1) {
      const s = createSlingshot(1, lv)
      const snap = s.blocks.map(b => ({ x: b.x, y: b.y, a: b.angle }))
      const pigSnap = s.pigs.map(p => ({ x: p.x, y: p.y }))
      sim(s, 10)
      s.blocks.forEach((b, i) => {
        const q = snap[i]!
        expect(Math.hypot(b.x - q.x, b.y - q.y)).toBeLessThan(0.5)
        expect(Math.abs(b.angle - q.a)).toBeLessThan(0.01)
        expect(b.broken).toBe(false)
        expect(b.hp).toBe(MATERIALS[b.mat].hp)
      })
      s.pigs.forEach((p, i) => {
        expect(p.dead).toBe(false)
        expect(Math.hypot(p.x - pigSnap[i]!.x, p.y - pigSnap[i]!.y)).toBeLessThan(0.5)
      })
      expect(s.phase).toBe('aim')
    }
  })

  it('a direct fast hit kills a pig and wins the level', () => {
    const s = createSlingshot(1, 1)
    const pig = s.pigs[0]!
    const v = aimAt(pig.x, pig.y, 900)
    launch(s, v.vx, v.vy)
    for (let i = 0; i < 6000 && !s.pigs.every(p => p.dead); i += 1) stepAndJudge(s, 4)
    expect(s.pigs.every(p => p.dead)).toBe(true)
    expect(s.phase).toBe('won')
    expect(s.stars).toBeGreaterThanOrEqual(1)
  })

  it('a hard hit topples blocks: rotation and damage kick in', () => {
    const s = createSlingshot(1, 1)
    // 侧击塔身：至少有块获得明显旋转或碎裂。
    const v = aimAt(s.blocks[2]!.x - 20, s.blocks[2]!.y, 800)
    launch(s, v.vx, v.vy)
    sim(s, 4)
    const rotated = s.blocks.some(b => !b.broken && Math.abs(b.angle) > 0.2)
    const broke = s.blocks.some(b => b.broken)
    expect(rotated || broke).toBe(true)
  })

  it('breaking the support drops the tower: upper blocks fall and settle, nothing floats', () => {
    const s = createSlingshot(1, 1)
    const base = s.blocks.reduce((m, b) => (b.y > m.y ? b : m), s.blocks[0]!)
    base.hp = 1
    const v = aimAt(base.x, base.y, 850)
    launch(s, v.vx, v.vy)
    sim(s, 10)
    expect(base.broken).toBe(true)
    // 上层块失去支撑后必须下落，并最终趋于静止（速度近零）。
    const upper = s.blocks.filter(b => !b.broken && b !== base)
    expect(upper.length).toBeGreaterThan(0)
    for (const b of upper) {
      expect(Math.hypot(b.vx, b.vy)).toBeLessThan(25)
      expect(Math.abs(b.av)).toBeLessThan(0.3)
    }
    // 无悬空：每个未碎块要么贴地，要么正下方 4px 内有其它块或地面支撑。
    for (const b of s.blocks) {
      if (b.broken) continue
      const bottom = b.y + b.h / 2 * Math.cos(b.angle) + b.w / 2 * Math.abs(Math.sin(b.angle))
      const onGround = bottom > 380 - 60
      const supported = s.blocks.some(o => !o.broken && o !== b
        && Math.abs(o.x - b.x) < (o.w + b.w) / 2
        && o.y - b.y > 0 && o.y - b.y < (o.h + b.h) / 2 + 8)
      expect(onGround || supported).toBe(true)
    }
  })

  it('a falling block crushes a pig', () => {
    const s = createSlingshot(1, 1)
    s.blocks = [makeBlock(300, 100, 40, 40)]
    s.pigs = [makePig(300, 380 - PIG_R)]
    sim(s, 3)
    expect(s.pigs[0]!.dead).toBe(true)
    expect(s.events.some(e => e.type === 'pig')).toBe(true)
  })

  it('a pig falling to the ground dies', () => {
    const s = createSlingshot(1, 1)
    s.blocks = []
    s.pigs = [makePig(200, 100)]
    sim(s, 3)
    expect(s.pigs[0]!.dead).toBe(true)
    expect(s.events.some(e => e.type === 'pig')).toBe(true)
  })

  it('stars scale with birds left', () => {
    const s = createSlingshot(1, 1)
    s.used = s.birds - 2
    expect(starsFor(s)).toBe(3)
    s.used = s.birds - 1
    expect(starsFor(s)).toBe(2)
    s.used = s.birds
    expect(starsFor(s)).toBe(1)
  })

  it('running out of birds with pigs alive loses', () => {
    const s = createSlingshot(1, 1)
    while (s.used < s.birds) launch(s, -300, -300) || stepAndJudge(s, 4)
    for (let i = 0; i < 20000 && s.phase === 'flying'; i += 1) stepAndJudge(s, 4)
    expect(s.phase).toBe('lost')
  })

  it('a slowly settling block resting on a pig crushes it (awake press)', () => {
    const s = createSlingshot(5, 1)
    const pig = s.pigs[0]!
    const b = s.blocks[0]!
    b.x = pig.x
    b.y = pig.y - 40
    b.asleep = false
    b.vy = 0
    for (let i = 0; i < 2400 && !pig.dead; i += 1) stepAndJudge(s, 1000 / 240)
    expect(pig.dead).toBe(true)
    expect(s.events.some((e) => e.type === 'pig')).toBe(true)
  })
})
