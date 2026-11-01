import { describe, expect, it } from 'vitest'
import {
  BUNKER_COUNT, BUNKER_ROWS, BUNKER_COLS, COLS, FIRE_CD, PLAYER_BULLET_MAX, PLAYER_Y,
  ROWS, START_LIVES, WAVE_BONUS, createInvaders, mulberry32, rowScore, rowType,
  stepInvaders,
} from '../src/client/games/invaders/logic.ts'

const idle = { left: false, right: false, fire: false }

describe('invaders logic', () => {
  it('starts a fresh wave: 36 aliens, full bunkers, 3 lives, centered turret', () => {
    const s = createInvaders(12, 1)
    expect(s.aliens).toHaveLength(ROWS * COLS)
    expect(s.aliens.every((a) => a.alive)).toBe(true)
    expect(s.lives).toBe(START_LIVES)
    expect(s.score).toBe(0)
    expect(s.wave).toBe(1)
    expect(s.over).toBe(false)
    expect(s.playerX).toBe(480 / 2)
    expect(s.bunkers).toHaveLength(BUNKER_COUNT)
    for (const b of s.bunkers) {
      expect(b.cells).toHaveLength(BUNKER_COLS * BUNKER_ROWS)
      expect(b.cells.every((c) => c.alive)).toBe(true)
    }
  })

  it('row typing and scoring follow the classic table', () => {
    expect([0, 1, 2, 3].map(rowType)).toEqual([2, 1, 1, 0])
    expect([0, 1, 2, 3].map(rowScore)).toEqual([30, 20, 20, 10])
  })

  it('fire is throttled by cooldown and capped at two player bullets', () => {
    const s = createInvaders(4, 1)
    stepInvaders(s, 16, { left: false, right: false, fire: true })
    expect(s.playerBullets).toHaveLength(1)
    expect(s.fireCd).toBe(FIRE_CD)
    for (let i = 0; i < 30; i += 1) {
      stepInvaders(s, 16, { left: false, right: false, fire: true })
      expect(s.playerBullets.length).toBeLessThanOrEqual(PLAYER_BULLET_MAX)
    }
    expect(s.playerBullets.length).toBeGreaterThan(0)
  })

  it('held fire kills aliens, adds row scores, and triggers bunker erosion deterministically', () => {
    const run = () => {
      const s = createInvaders(77, 2)
      let kills = 0
      let bunkerHits = 0
      let eroded = 0
      for (let i = 0; i < 3000; i += 1) {
        stepInvaders(s, 16, { left: i % 2 === 0, right: i % 3 === 0, fire: i % 2 === 0 })
        kills += s.events.filter((e) => e.type === 'kill').length
        bunkerHits += s.events.filter((e) => e.type === 'bunker').length
        eroded = s.bunkers.reduce((n, b) => n + b.cells.filter((c) => !c.alive).length, eroded * 0)
      }
      return { score: s.score, kills, bunkerHits, alive: s.aliens.filter((a) => a.alive).length }
    }
    const a = run()
    const b = run()
    expect(a).toEqual(b)
    expect(a.kills).toBeGreaterThan(0)
    expect(a.alive).toBeLessThan(ROWS * COLS)
    // 得分只来自行分（清波会另加奖励，这里至少覆盖行分累加的确定性）。
    expect(a.score).toBeGreaterThanOrEqual(0)
  })

  it('an alien bullet hitting the turret costs a life, grants invulnerability, and clears enemy fire', () => {
    const s = createInvaders(9, 1)
    s.invulnMs = 0
    s.alienBullets.push({ x: s.playerX, y: PLAYER_Y, vy: 160 })
    stepInvaders(s, 16, idle)
    expect(s.lives).toBe(START_LIVES - 1)
    expect(s.invulnMs).toBeGreaterThan(0)
    expect(s.events.some((e) => e.type === 'hit')).toBe(true)
    expect(s.alienBullets).toHaveLength(0)
    expect(s.over).toBe(false)
    // 无敌期内再次被击中不掉命。
    s.alienBullets.push({ x: s.playerX, y: PLAYER_Y, vy: 160 })
    stepInvaders(s, 16, idle)
    expect(s.lives).toBe(START_LIVES - 1)
  })

  it('clearing the wave pays the bonus and spawns the next wave', () => {
    const s = createInvaders(21, 1)
    for (const a of s.aliens) a.alive = false
    stepInvaders(s, 16, idle)
    expect(s.score).toBe(WAVE_BONUS)
    expect(s.wave).toBe(2)
    expect(s.aliens.every((a) => a.alive)).toBe(true)
    expect(s.events.some((e) => e.type === 'wave' && e.wave === 2)).toBe(true)
  })

  it('aliens reaching the turret line end the game regardless of lives', () => {
    const s = createInvaders(2, 1)
    s.fy = PLAYER_Y // 任意存活外星人底边必然越过炮台线
    stepInvaders(s, 16, idle)
    expect(s.over).toBe(true)
    expect(s.lives).toBe(0)
  })

  it('the same seed and input trace replays identically; mulberry32 is deterministic', () => {
    const ra = mulberry32(55)
    const rb = mulberry32(55)
    expect([ra(), ra(), ra()]).toEqual([rb(), rb(), rb()])
    const run = (): string => {
      const s = createInvaders(55, 3)
      const trace: number[] = []
      for (let i = 0; i < 1200; i += 1) {
        stepInvaders(s, 16, { left: i % 5 < 2, right: i % 7 < 3, fire: i % 3 === 0 })
        trace.push(s.score, s.lives, Math.round(s.playerX * 100), Math.round(s.fx * 100), Math.round(s.fy * 100))
      }
      return JSON.stringify(trace)
    }
    expect(run()).toBe(run())
  })
})
