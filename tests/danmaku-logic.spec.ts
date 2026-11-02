import { describe, expect, it } from 'vitest'
import {
  BOSS_ENTER_MS, FIRE_CD, GRAZE_R, GRAZE_SCORE, HIT_R_FOCUS, HIT_R_NORMAL, INVULN_MS,
  MAX_ENEMY_BULLETS, PHASE_BONUS, START_LIVES, bossBonus, createDanmaku, fanAngles,
  hitRadius, mulberry32, petalAngles, ringAngles, stepDanmaku, type DanmakuInput,
} from '../src/client/games/danmaku/logic.ts'
import { AI_BANDWIDTH_PER_FRAME, DWELL_MS, GRID_SIZE, candidateAt, createBossBrain } from '../src/client/games/danmaku/ai.ts'

const idle: DanmakuInput = { left: false, right: false, up: false, down: false, fire: false, focus: false }
const shooting: DanmakuInput = { ...idle, fire: true }

/** 跳到 Boss 就位可战（入场结束、横幅结束、停火结束）；期间保持无敌避免被弹干扰。 */
function settle(state: ReturnType<typeof createDanmaku>): void {
  for (let i = 0; i < 200; i += 1) {
    state.invulnMs = 9999
    stepDanmaku(state, 16, idle)
  }
  state.invulnMs = 0
}

describe('danmaku emitter geometry', () => {
  it('ring volleys split the full circle into equal steps', () => {
    const angles = ringAngles(8, 0)
    expect(angles).toHaveLength(8)
    for (let i = 0; i < 8; i += 1) {
      expect(angles[i]).toBeCloseTo((Math.PI * 2 * i) / 8, 10)
    }
    // 带基准角时整体旋转。
    const shifted = ringAngles(4, 0.5)
    expect(shifted[0]).toBeCloseTo(0.5, 10)
    expect(shifted[1]).toBeCloseTo(0.5 + Math.PI / 2, 10)
  })

  it('fan volleys spread symmetrically around the center', () => {
    expect(fanAngles(1, 1.2, 0.8)).toEqual([1.2])
    const angles = fanAngles(5, Math.PI / 2, 1.0)
    expect(angles).toHaveLength(5)
    expect(angles[0]).toBeCloseTo(Math.PI / 2 - 0.5, 10)
    expect(angles[4]).toBeCloseTo(Math.PI / 2 + 0.5, 10)
    expect(angles[2]).toBeCloseTo(Math.PI / 2, 10)
  })

  it('petal layers interleave with a half-step offset on odd volleys', () => {
    const even = petalAngles(6, 0, 0)
    const odd = petalAngles(6, 0, 1)
    expect(even[1]).toBeCloseTo((Math.PI * 2) / 6, 10)
    expect(odd[0]).toBeCloseTo(Math.PI / 6, 10)
    expect(odd[1]).toBeCloseTo(Math.PI / 6 + (Math.PI * 2) / 6, 10)
  })

  it('hit radius shrinks in focus mode; mulberry32 is deterministic', () => {
    expect(hitRadius(false)).toBe(HIT_R_NORMAL)
    expect(hitRadius(true)).toBe(HIT_R_FOCUS)
    expect(HIT_R_FOCUS).toBeLessThan(HIT_R_NORMAL)
    const a = mulberry32(7)
    const b = mulberry32(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})

describe('danmaku logic', () => {
  it('starts a fresh run: boss entering, banner up, 3 lives, no bullets yet', () => {
    const s = createDanmaku(12, 1)
    expect(s.lives).toBe(START_LIVES)
    expect(s.score).toBe(0)
    expect(s.over).toBe(false)
    expect(s.bossIndex).toBe(0)
    expect(s.phase).toBe(0)
    expect(s.bossEnterMs).toBeGreaterThan(0)
    expect(s.enemyBullets).toHaveLength(0)
    expect(s.events.some((e) => e.type === 'banner' && e.boss === 1)).toBe(true)
  })

  it('boss enters, emitters fire on schedule, and the bullet cap holds', () => {
    const s = createDanmaku(3, 1)
    // 入场期不发射。
    stepDanmaku(s, 100, idle)
    expect(s.enemyBullets).toHaveLength(0)
    settle(s)
    expect(s.bossEnterMs).toBe(0)
    expect(s.enemyBullets.length).toBeGreaterThan(0)
    expect(s.enemyBullets.length).toBeLessThanOrEqual(MAX_ENEMY_BULLETS)
  })

  it('fire is throttled by the short cooldown and shoots twin shots', () => {
    const s = createDanmaku(4, 1)
    const before = s.playerShots.length
    stepDanmaku(s, 16, shooting)
    expect(s.playerShots.length).toBe(before + 2)
    expect(s.fireCd).toBe(FIRE_CD)
    // 冷却内按住不再发射。
    stepDanmaku(s, 16, shooting)
    expect(s.playerShots.length).toBe(before + 2)
    // 冷却结束再次齐发。
    stepDanmaku(s, FIRE_CD, shooting)
    expect(s.playerShots.length).toBe(before + 4)
  })

  it('enemy bullet hitting the hitbox costs a life, grants invulnerability, and clears the screen', () => {
    const s = createDanmaku(9, 1)
    settle(s)
    s.invulnMs = 0
    s.enemyBullets.length = 0
    s.enemyBullets.push({ x: s.playerX + 2, y: s.playerY + 2, vx: 0, vy: 0, r: 5, color: 'red', grazed: false })
    stepDanmaku(s, 16, idle)
    expect(s.lives).toBe(START_LIVES - 1)
    expect(s.invulnMs).toBeGreaterThan(0)
    expect(s.events.some((e) => e.type === 'hit')).toBe(true)
    expect(s.enemyBullets).toHaveLength(0)
    expect(s.over).toBe(false)
    // 无敌期内贴脸弹不掉命。
    s.enemyBullets.push({ x: s.playerX, y: s.playerY, vx: 0, vy: 0, r: 5, color: 'purple', grazed: false })
    stepDanmaku(s, 16, idle)
    expect(s.lives).toBe(START_LIVES - 1)
  })

  it('the third hit ends the run', () => {
    const s = createDanmaku(9, 1)
    settle(s)
    for (let i = 0; i < 3; i += 1) {
      s.invulnMs = 0
      s.enemyBullets.length = 0
      s.enemyBullets.push({ x: s.playerX, y: s.playerY, vx: 0, vy: 0, r: 5, color: 'red', grazed: false })
      stepDanmaku(s, 16, idle)
    }
    expect(s.over).toBe(true)
    expect(s.lives).toBe(0)
  })

  it('grazing a near-miss bullet scores once per bullet', () => {
    const s = createDanmaku(5, 1)
    settle(s)
    s.enemyBullets.length = 0
    // 静止弹在擦弹圈内、命中圈外。
    s.enemyBullets.push({ x: s.playerX + 12, y: s.playerY, vx: 0, vy: 0, r: 5, color: 'red', grazed: false })
    stepDanmaku(s, 16, idle)
    expect(s.graze).toBe(1)
    expect(s.score).toBe(GRAZE_SCORE)
    expect(s.events.some((e) => e.type === 'graze')).toBe(true)
    expect(s.lives).toBe(START_LIVES)
    // 同一颗弹不再重复计分。
    stepDanmaku(s, 16, idle)
    expect(s.graze).toBe(1)
    // 圈外弹不擦。
    s.enemyBullets.push({ x: s.playerX, y: s.playerY - GRAZE_R - 20, vx: 0, vy: 0, r: 5, color: 'red', grazed: false })
    stepDanmaku(s, 16, idle)
    expect(s.graze).toBe(1)
  })

  it('phase transitions pay the bonus and clear all bullets', () => {
    const s = createDanmaku(21, 1)
    settle(s)
    s.bossHp = 1
    s.enemyBullets.length = 0
    s.enemyBullets.push({ x: 100, y: 300, vx: 0, vy: 50, r: 5, color: 'red', grazed: false })
    const scoreBefore = s.score
    // 持续射击直到阶段被打穿（子弹需要飞行时间到达 Boss）。
    let switched = false
    for (let j = 0; j < 900 && !switched; j += 1) {
      s.invulnMs = 9999
      stepDanmaku(s, 16, shooting)
      switched = s.events.some((e) => e.type === 'phase')
    }
    expect(switched).toBe(true)
    expect(s.phase).toBe(1)
    expect(s.score).toBeGreaterThan(scoreBefore + PHASE_BONUS)
    expect(s.enemyBullets).toHaveLength(0)
    expect(s.bossHp).toBe(s.bossMaxHp)
    expect(s.events.some((e) => e.type === 'phase' && e.phase === 2)).toBe(true)
  })

  it('defeating all nine phases wins the run', () => {
    const s = createDanmaku(2, 1)
    settle(s)
    let sawWin = false
    for (let stage = 0; stage < 12 && !s.over; stage += 1) {
      s.bossHp = 1
      // 持续射击直到本阶段被打穿（子弹需要飞行时间到达 Boss）。
      let advanced = false
      for (let j = 0; j < 900 && !advanced && !s.over; j += 1) {
        s.invulnMs = 9999
        stepDanmaku(s, 16, shooting)
        advanced = s.events.some((e) => e.type === 'phase' || e.type === 'bossDown' || e.type === 'win')
        sawWin = sawWin || s.events.some((e) => e.type === 'win')
      }
      expect(advanced).toBe(true)
      // 停火期 / 入场期快速跳过。
      for (let j = 0; j < 200; j += 1) {
        s.invulnMs = 9999
        stepDanmaku(s, 16, idle)
      }
    }
    expect(s.over).toBe(true)
    expect(s.win).toBe(true)
    expect(s.bossIndex).toBe(2)
    expect(s.score).toBeGreaterThanOrEqual(6 * PHASE_BONUS + bossBonus(0) + bossBonus(1) + bossBonus(2))
    expect(sawWin).toBe(true)
  })

  it('the same seed and input trace replays identically', () => {
    const run = () => {
      const s = createDanmaku(77, 2)
      const trace: number[] = []
      for (let i = 0; i < 2000; i += 1) {
        stepDanmaku(s, 16, {
          left: i % 3 === 0, right: i % 4 === 0, up: i % 5 === 0, down: i % 7 === 0,
          fire: i % 2 === 0, focus: i % 11 === 0,
        })
        trace.push(s.score, s.graze, s.enemyBullets.length, s.bossIndex, s.phase, Math.round(s.playerX), Math.round(s.bossX))
      }
      return { trace, over: s.over, win: s.win, lives: s.lives }
    }
    expect(run()).toEqual(run())
  })
})

describe('danmaku boss brain', () => {
  it('evaluates the grid across frames within the per-frame budget', () => {
    const s = createDanmaku(6, 1)
    settle(s)
    const brain = createBossBrain()
    let frames = 0
    while (brain.scanning && frames < 50) {
      brain.step(s, 16)
      frames += 1
    }
    expect(brain.scanning).toBe(false)
    expect(brain.evaluated).toBe(GRID_SIZE)
    expect(frames).toBe(Math.ceil(GRID_SIZE / AI_BANDWIDTH_PER_FRAME))
    const target = candidateAt(brain.bestIndex)
    expect(brain.targetX).toBeCloseTo(target.x, 6)
    expect(brain.targetY).toBeCloseTo(target.y, 6)
    // 驻留期内目标保持不变。
    const x = brain.targetX
    brain.step(s, 16)
    expect(brain.targetX).toBe(x)
    expect(brain.dwellMs).toBeGreaterThan(0)
    expect(brain.dwellMs).toBeLessThanOrEqual(DWELL_MS)
  })

  it('candidate grid covers distinct points and stays in bounds', () => {
    const seen = new Set<string>()
    for (let i = 0; i < GRID_SIZE; i += 1) {
      const c = candidateAt(i)
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.x).toBeLessThanOrEqual(480)
      expect(c.y).toBeGreaterThan(0)
      expect(c.y).toBeLessThan(240)
      seen.add(c.x.toFixed(1) + ',' + c.y.toFixed(1))
    }
    expect(seen.size).toBe(GRID_SIZE)
  })

  it('the default brain integrates into the full simulation deterministically', () => {
    const run = () => {
      const s = createDanmaku(31, 1)
      for (let i = 0; i < 1200; i += 1) {
        s.invulnMs = 9999
        stepDanmaku(s, 16, idle)
      }
      return { bossX: s.bossX, bossY: s.bossY, bullets: s.enemyBullets.length, enter: s.bossEnterMs }
    }
    const a = run()
    const b = run()
    expect(a).toEqual(b)
    expect(a.enter).toBe(0)
  })
})
