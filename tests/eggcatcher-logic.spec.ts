import { describe, expect, it } from 'vitest'
import {
  BASKET_SPEED, BASKET_W, BASKET_Y, COMBO_WINDOW_MS, EGG_R, FLOAT_MS, GOLD_CHANCE, H, W,
  basketBounds, createEggCatcher, dropInterval, fallSpeed, levelOf, rottenChance, stepEggCatcher,
  type EggCatcherState, type EggInput,
} from '../src/client/games/eggcatcher/logic.ts'

const idle: EggInput = { dir: 0, pointerX: null }

/** 压制自然下蛋，注入可控的蛋。 */
function quiet(s: EggCatcherState): void {
  s.eggs.length = 0
  s.nextDropAt = Number.MAX_SAFE_INTEGER
}

function run(s: EggCatcherState, frames: number, input: EggInput = idle): void {
  for (let i = 0; i < frames; i += 1) stepEggCatcher(s, 16, input)
}

describe('egg catcher logic', () => {
  it('difficulty tables: level ramps by 12s, drop interval and speed tighten, rotten chance caps', () => {
    expect(levelOf(0)).toBe(1)
    expect(levelOf(11_999)).toBe(1)
    expect(levelOf(12_000)).toBe(2)
    expect(levelOf(120_000)).toBe(11)
    expect(dropInterval(1)).toBe(1400)
    expect(dropInterval(2)).toBe(1270)
    expect(dropInterval(9)).toBe(360)
    expect(dropInterval(50)).toBe(360)
    expect(fallSpeed(1)).toBe(130)
    expect(fallSpeed(4)).toBe(130 + 3 * 26)
    expect(rottenChance(1)).toBeCloseTo(0.06, 10)
    expect(rottenChance(11)).toBeCloseTo(0.06 + 10 * 0.015, 10)
    expect(rottenChance(12)).toBeCloseTo(0.22, 10)
    expect(rottenChance(100)).toBe(0.22)
    expect(GOLD_CHANCE).toBeGreaterThan(0)
    const [minX, maxX] = basketBounds()
    expect(minX).toBe(BASKET_W / 2 + 6)
    expect(maxX).toBe(W - BASKET_W / 2 - 6)
  })

  it('the basket moves by keyboard and chases the pointer, clamped to its bounds', () => {
    const key = createEggCatcher(1)
    quiet(key)
    stepEggCatcher(key, 16, { dir: 1, pointerX: null })
    expect(key.basketX).toBeCloseTo(W / 2 + BASKET_SPEED * 0.016, 5)
    run(key, 300, { dir: 1, pointerX: null })
    const [, maxX] = basketBounds()
    expect(key.basketX).toBe(maxX)

    const ptr = createEggCatcher(1)
    quiet(ptr)
    const [minX] = basketBounds()
    run(ptr, 300, { dir: 0, pointerX: minX })
    expect(ptr.basketX).toBeCloseTo(minX, 5)
    run(ptr, 30, { dir: 0, pointerX: null })
    expect(ptr.basketX).toBeCloseTo(minX, 5)
  })

  it('catching eggs builds combo inside the window and pays score plus combo bonus', () => {
    const s = createEggCatcher(2)
    quiet(s)
    const catchOne = (kind: 0 | 1 | 2): void => {
      s.eggs.push({ kind, x: s.basketX, y: BASKET_Y - 30, vy: 400, vx: 0 })
      let guard = 0
      while (s.eggs.length > 0 && guard < 100) { stepEggCatcher(s, 16, idle); guard += 1 }
      expect(s.eggs.length).toBe(0)
    }
    catchOne(0)
    expect(s.score).toBe(1)
    expect(s.combo).toBe(1)
    expect(s.events.some((e) => e.type === 'catch' && e.kind === 0)).toBe(true)
    expect(s.squashMs).toBeGreaterThan(0)
    catchOne(0) // 窗口内第二颗：combo=2，加成 +1。
    expect(s.combo).toBe(2)
    expect(s.score).toBe(1 + 2)
    expect(s.floats.some((f) => f.text === 'x2 连击')).toBe(false)
    // 连击窗口过期后再接：combo 归 1。
    s.t += COMBO_WINDOW_MS + 1
    s.comboExpire = 0
    catchOne(0)
    expect(s.combo).toBe(1)
    expect(s.score).toBe(3 + 1)
    // 金蛋基础 5 分。
    catchOne(1)
    expect(s.combo).toBe(2)
    expect(s.score).toBe(4 + 5 + 1)
  })

  it('a rotten egg costs a life and resets combo; missing a normal egg also costs a life', () => {
    const s = createEggCatcher(3)
    quiet(s)
    s.combo = 3
    s.comboExpire = s.t + 9999
    s.eggs.push({ kind: 2, x: s.basketX, y: BASKET_Y - 30, vy: 400, vx: 0 })
    let guard = 0
    while (s.lives === 5 && guard < 100) { stepEggCatcher(s, 16, idle); guard += 1 }
    expect(s.lives).toBe(4)
    expect(s.combo).toBe(0)
    expect(s.events.some((e) => e.type === 'rotten')).toBe(true)
    expect(s.score).toBe(0)

    const miss = createEggCatcher(3)
    quiet(miss)
    miss.basketX = W / 2
    miss.eggs.push({ kind: 0, x: 20, y: H - 60, vy: 300, vx: 0 }) // 远离篮子
    guard = 0
    while (miss.eggs.length > 0 && guard < 100) { stepEggCatcher(miss, 16, idle); guard += 1 }
    expect(miss.eggs.length).toBe(0)
    expect(miss.missed).toBe(1)
    expect(miss.events.some((ev) => ev.type === 'miss' && ev.kind === 0)).toBe(true)
    expect(miss.lives).toBe(4)
    // 漏掉臭蛋不扣命。
    miss.eggs.push({ kind: 2, x: 20, y: H - 60, vy: 300, vx: 0 })
    guard = 0
    while (miss.eggs.length > 0 && guard < 100) { stepEggCatcher(miss, 16, idle); guard += 1 }
    expect(miss.missed).toBe(1)
    expect(miss.lives).toBe(4)
  })

  it('losing the last life ends the game and freezes the clock and score', () => {
    const s = createEggCatcher(4)
    quiet(s)
    s.lives = 1
    s.basketX = W / 2
    s.eggs.push({ kind: 0, x: 20, y: H - 60, vy: 300, vx: 0 })
    run(s, 60)
    expect(s.over).toBe(true)
    expect(s.lives).toBe(0)
    const t = s.t
    const score = s.score
    s.eggs.push({ kind: 0, x: s.basketX, y: BASKET_Y - 10, vy: 400, vx: 0 })
    run(s, 30)
    expect(s.eggs.length).toBe(1) // 结束后不再结算
    expect(s.t).toBe(t)
    expect(s.score).toBe(score)
  })

  it('floats rise and expire after FLOAT_MS', () => {
    const s = createEggCatcher(5)
    quiet(s)
    s.floats.push({ x: 100, y: 500, text: '+1', life: FLOAT_MS })
    const y0 = s.floats[0]!.y
    run(s, 10)
    expect(s.floats.length).toBe(1)
    expect(s.floats[0]!.y).toBeLessThan(y0)
    run(s, Math.ceil(FLOAT_MS / 16))
    expect(s.floats.length).toBe(0)
  })

  it('the same seed and input script replay identically; a different round diverges', () => {
    const trace = (seed: number, round: number): string => {
      const s = createEggCatcher(seed, round)
      const marks: number[] = []
      for (let frame = 0; frame < 1500; frame += 1) {
        const input: EggInput = frame % 4 === 0
          ? { dir: (frame % 8 === 0 ? -1 : 1) as -1 | 1, pointerX: null }
          : { dir: 0, pointerX: 60 + (frame % 11) * 35 }
        stepEggCatcher(s, 16, input)
        marks.push(s.score, s.lives, s.missed, s.combo, s.eggs.length, Math.round(s.hen.x))
        for (const e of s.eggs) marks.push(e.kind, Math.round(e.x), Math.round(e.y))
      }
      return JSON.stringify(marks)
    }
    expect(trace(888, 1)).toBe(trace(888, 1))
    expect(trace(888, 1)).not.toBe(trace(888, 2))
  })
})
