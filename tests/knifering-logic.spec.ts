import { describe, expect, it } from 'vitest'
import {
  FAIL_SHAKE_MS, KNIFE_SCORE, LEVEL_BREAK_MS, LEVEL_SCORE, START_LIVES, THROW_MS,
  beginNextLevel, buildSpeedCurve, createKnifeRing, hasObstacles, knivesFor,
  minGapFor, mulberry32, stepKnifeRing, throwKnife,
} from '../src/client/games/knifering/logic.ts'

describe('knife ring logic', () => {
  it('level helpers: knife count grows to a cap, gap shrinks to a floor, obstacles every third level', () => {
    expect(knivesFor(1)).toBe(4)
    expect(knivesFor(2)).toBe(5)
    expect(knivesFor(20)).toBe(12)
    expect(minGapFor(1)).toBe(0.52)
    expect(minGapFor(2)).toBeLessThan(minGapFor(1))
    expect(minGapFor(20)).toBe(0.30)
    expect(hasObstacles(1)).toBe(false)
    expect(hasObstacles(3)).toBe(true)
    expect(hasObstacles(6)).toBe(true)
    expect(hasObstacles(4)).toBe(false)
  })

  it('a fresh game starts at level 1 with a deterministic speed curve and no knives', () => {
    const s = createKnifeRing(8, 1)
    expect(s.level).toBe(1)
    expect(s.lives).toBe(START_LIVES)
    expect(s.remaining).toBe(knivesFor(1))
    expect(s.knives).toHaveLength(0) // 第 1 关无障碍刀
    expect(s.curve.length).toBeGreaterThanOrEqual(3)
    for (const seg of s.curve) {
      expect(seg.durMs).toBeGreaterThan(0)
      expect(Number.isFinite(seg.omega)).toBe(true)
    }
    expect(s.over).toBe(false)
    const rngA = mulberry32(8)
    const rngB = mulberry32(8)
    expect(buildSpeedCurve(rngA, 3)).toEqual(buildSpeedCurve(rngB, 3))
  })

  it('throwKnife locks in the current landing angle and is ignored mid-animation or during a break', () => {
    const s = createKnifeRing(15, 1)
    throwKnife(s)
    expect(s.throwing).not.toBeNull()
    expect(s.throwing!.targetAngle).toBeCloseTo(-s.ringAngle, 12)
    // 动画期间不接受新的插刀。
    const first = s.throwing
    throwKnife(s)
    expect(s.throwing).toBe(first)
    stepKnifeRing(s, 10)
    throwKnife(s)
    expect(s.throwing).toBe(first)
    // 过关停顿期间同样忽略。
    stepKnifeRing(s, 500)
    expect(s.throwing).toBeNull()
    s.breakMs = LEVEL_BREAK_MS
    throwKnife(s)
    expect(s.throwing).toBeNull()
  })

  it('a clean stick pins the knife, scores +10, and emits a stick event', () => {
    const s = createKnifeRing(4, 1)
    throwKnife(s)
    stepKnifeRing(s, THROW_MS)
    expect(s.throwing).toBeNull()
    expect(s.knives).toHaveLength(1)
    expect(s.knives[0]!.obstacle).toBe(false)
    expect(s.score).toBe(KNIFE_SCORE)
    expect(s.remaining).toBe(knivesFor(1) - 1)
    expect(s.lives).toBe(START_LIVES)
    expect(s.events.some((e) => e.type === 'stick')).toBe(true)
  })

  it('landing on an existing knife costs a life and shakes without pinning', () => {
    const s = createKnifeRing(6, 1)
    s.ringAngle = 0
    s.knives = [{ angle: 0, obstacle: true }] // 落点必与障碍刀重合
    throwKnife(s)
    stepKnifeRing(s, THROW_MS + 10)
    expect(s.lives).toBe(START_LIVES - 1)
    expect(s.shakeMs).toBeGreaterThan(0)
    expect(s.knives).toHaveLength(1) // 未新增
    expect(s.remaining).toBe(knivesFor(1))
    expect(s.score).toBe(0)
    expect(s.events.some((e) => e.type === 'hit')).toBe(true)
    expect(s.over).toBe(false)
    // 三次连续碰刀后结束。
    s.shakeMs = 0
    s.ringAngle = 0
    throwKnife(s)
    stepKnifeRing(s, THROW_MS + 10)
    s.shakeMs = 0
    s.ringAngle = 0
    throwKnife(s)
    stepKnifeRing(s, THROW_MS + 10)
    expect(s.over).toBe(true)
    expect(s.lives).toBe(0)
    throwKnife(s) // 结束后插刀无效
    expect(s.throwing).toBeNull()
  })

  it('finishing a level pays the bonus, pauses, and beginNextLevel arms the next one', () => {
    const s = createKnifeRing(10, 1)
    s.remaining = 1
    s.knives = []
    throwKnife(s)
    stepKnifeRing(s, THROW_MS)
    expect(s.score).toBe(KNIFE_SCORE + LEVEL_SCORE)
    expect(s.level).toBe(2)
    expect(s.breakMs).toBeGreaterThan(0)
    expect(s.events.some((e) => e.type === 'level' && e.level === 1)).toBe(true)
    // 停顿期间转盘与刀盘冻结。
    const frozenAngle = s.ringAngle
    stepKnifeRing(s, 100)
    expect(s.ringAngle).toBe(frozenAngle)
    s.breakMs = 0
    beginNextLevel(s, 10)
    expect(s.remaining).toBe(knivesFor(2))
    expect(s.knives).toHaveLength(0) // 第 2 关无障碍刀
    expect(s.curve.length).toBeGreaterThan(0)
  })

  it('the same seed and throw schedule replays an identical trace', () => {
    const run = (): string => {
      const s = createKnifeRing(99, 2)
      const trace: number[] = []
      for (let i = 0; i < 2000; i += 1) {
        if (i % 23 === 0) throwKnife(s)
        stepKnifeRing(s, 16)
        trace.push(
          s.score, s.lives, s.level, s.remaining,
          Math.round(s.ringAngle * 1000), s.knives.length,
        )
      }
      return JSON.stringify(trace)
    }
    expect(run()).toBe(run())
  })
})
