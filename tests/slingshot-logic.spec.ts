import { describe, expect, it } from 'vitest'
import {
  BALL_R, LEVELS, MAX_DRAG, MAX_SPEED, MATERIALS, SLING, createSlingshot,
  dragToVelocity, launch, starsFor, stepAndJudge,
} from '../src/client/games/slingshot/logic.ts'

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
      return s.blocks.map(b => b.hp.toFixed(3) + (b.broken ? 'x' : '')).join(',') + '|' + s.pigs.map(p => (p.dead ? 'd' : 'a')).join(',')
    }
    expect(run()).toEqual(run())
  })

  it('a direct fast hit kills a pig', () => {
    const s = createSlingshot(1, 1)
    // 第一关唯一的猪在塔基（TOWER_X, GROUND_Y-PIG_R）；直射塔基。
    const pig = s.pigs[0]!
    // 反解：t = 330/900s 时到达猪所在列，竖直落差 107px → vy≈126（略向下掷）。
    launch(s, 900, (pig.y - SLING.y - 450 * (330 / 900) ** 2 * 1) / (330 / 900))
    for (let i = 0; i < 6000 && !s.pigs.every(p => p.dead); i += 1) stepAndJudge(s, 4)
    expect(s.pigs.every(p => p.dead)).toBe(true)
    expect(s.phase).toBe('won')
    expect(s.stars).toBeGreaterThanOrEqual(1)
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
})
