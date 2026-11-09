import { describe, expect, it } from 'vitest'
import {
  BELT_LEFT, COLOR_COUNT, COMBO_WINDOW_MS, DIVERT_X, FLOAT_MS, MAX_MISSES, PACKAGE_COLORS,
  SUBSTEP_MS, beltSpeed, createSorter, levelOf, laneY, poissonInterval, spawnMeanMs, stepSorter,
  mulberry32, type SorterEvent, type SorterState,
} from '../src/client/games/sorter/logic.ts'

const idle = { flap: null }

/** 推进直到条件满足，跨帧收集事件（events 每帧开头被清空）。 */
function runUntil(s: SorterState, done: () => boolean, frames = 60): SorterEvent[] {
  const seen: SorterEvent[] = []
  for (let i = 0; i < frames && !done(); i += 1) {
    stepSorter(s, 16, idle)
    seen.push(...s.events)
  }
  return seen
}

/** 压制自然生成，注入可控的包裹。 */
function quiet(s: SorterState): void {
  for (const belt of s.belts) {
    belt.packages.length = 0
    belt.nextSpawnAt = Number.MAX_SAFE_INTEGER
  }
}

function run(s: SorterState, frames: number, flap: 0 | 1 | 2 | 3 | null = null): void {
  for (let i = 0; i < frames; i += 1) stepSorter(s, 16, { flap })
}

describe('sorter logic', () => {
  it('difficulty tables: level ramps by 12s, belt speed and spawn mean tighten with caps', () => {
    expect(levelOf(0)).toBe(1)
    expect(levelOf(11_999)).toBe(1)
    expect(levelOf(12_000)).toBe(2)
    expect(beltSpeed(1)).toBe(90)
    expect(beltSpeed(4)).toBe(90 + 3 * 18)
    expect(beltSpeed(20)).toBe(250)
    expect(spawnMeanMs(1)).toBe(1900)
    expect(spawnMeanMs(3)).toBe(1600)
    expect(spawnMeanMs(20)).toBe(650)
    expect(SUBSTEP_MS).toBeGreaterThan(0)
    expect(PACKAGE_COLORS.length).toBe(COLOR_COUNT)
  })

  it('packages spawn per belt from the seed with valid colors, distributed over time', () => {
    const s = createSorter(7)
    run(s, 1200) // 约 19 秒
    const total = s.belts.reduce((n, b) => n + b.packages.length, 0)
    expect(total).toBeGreaterThan(0)
    const spawnedColors = new Set<number>()
    for (const belt of s.belts) {
      expect(belt.packages.length).toBeGreaterThan(0)
      for (const p of belt.packages) {
        expect(p.color).toBeGreaterThanOrEqual(0)
        expect(p.color).toBeLessThan(COLOR_COUNT)
        expect(p.x).toBeGreaterThanOrEqual(BELT_LEFT - 20)
        expect(p.x).toBeLessThan(DIVERT_X)
        spawnedColors.add(p.color)
      }
    }
    expect(spawnedColors.size).toBeGreaterThanOrEqual(2)
  })

  it('flap input switches every belt flap; a matching package at the divert loads its wagon', () => {
    const s = createSorter(1)
    quiet(s)
    stepSorter(s, 16, { flap: 2 })
    for (const belt of s.belts) expect(belt.flap).toBe(2)
    s.belts[0]!.packages.push({ color: 2, x: DIVERT_X - 6 })
    const seen = runUntil(s, () => s.wagons[2] === 1)
    expect(s.belts[0]!.packages.length).toBe(0)
    expect(s.wagons[2]).toBe(1)
    expect(s.score).toBe(2)
    expect(s.combo).toBe(1)
    expect(seen.some((e) => e.type === 'sort' && e.color === 2)).toBe(true)
  })

  it('a wrong flap drops the package, costs a miss, resets combo; 3 misses end the game', () => {
    const s = createSorter(2)
    quiet(s)
    stepSorter(s, 16, { flap: 1 })
    s.combo = 4
    s.comboExpire = s.t + 9999
    s.belts[1]!.packages.push({ color: 3, x: DIVERT_X - 6 })
    const seen = runUntil(s, () => s.misses === 1)
    expect(s.combo).toBe(0)
    expect(s.wagons[3]).toBe(0)
    expect(seen.some((e) => e.type === 'miss' && e.lane === 1)).toBe(true)
    expect(s.over).toBe(false)

    s.belts[0]!.packages.push({ color: 0, x: DIVERT_X - 6 }) // 挡板为 1，错色
    runUntil(s, () => s.misses === 2)
    expect(s.over).toBe(false)
    s.belts[2]!.packages.push({ color: 2, x: DIVERT_X - 6 })
    runUntil(s, () => s.over)
    expect(s.misses).toBe(MAX_MISSES)
    expect(s.over).toBe(true)
    // 结束后冻结：不再推进与结算。
    const t = s.t
    const score = s.score
    s.belts[0]!.packages.push({ color: 0, x: DIVERT_X - 6 })
    run(s, 20)
    expect(s.t).toBe(t)
    expect(s.score).toBe(score)
    expect(s.belts[0]!.packages.length).toBe(1)
  })

  it('consecutive sorts inside the combo window pay base plus combo bonus', () => {
    const s = createSorter(3)
    quiet(s)
    stepSorter(s, 16, { flap: 0 })
    const sortOne = (): void => {
      s.belts[0]!.packages.push({ color: 0, x: DIVERT_X - 6 })
      let guard = 0
      while (s.belts[0]!.packages.length > 0 && guard < 50) { stepSorter(s, 16, idle); guard += 1 }
      expect(s.belts[0]!.packages.length).toBe(0)
    }
    sortOne()
    expect(s.score).toBe(2)
    sortOne() // 窗口内：combo=2，加成 +1
    expect(s.combo).toBe(2)
    expect(s.score).toBe(2 + 2 + 1)
    // 连击窗口过期后再分拣：combo 归 1，无加成。
    s.t += COMBO_WINDOW_MS + 1
    s.comboExpire = 0
    sortOne()
    expect(s.combo).toBe(1)
    expect(s.score).toBe(5 + 2)
    expect(s.floats.some((f) => f.text === '失误')).toBe(false)
  })

  it('fixed substepping: the same total time in different frame slices yields the identical rng trace', () => {
    const seedTrace = (slices: number[]): string => {
      const s = createSorter(55)
      const marks: number[] = []
      for (const dt of slices) stepSorter(s, dt, idle)
      for (const belt of s.belts) {
        marks.push(belt.lane, belt.flap, belt.nextSpawnAt, belt.packages.length)
        for (const p of belt.packages) marks.push(p.color, Math.round(p.x * 1000))
      }
      marks.push(s.t, s.score, s.misses, s.combo, ...s.wagons)
      return JSON.stringify(marks)
    }
    const even: number[] = []
    for (let i = 0; i < 80; i += 1) even.push(10)
    // 乱序切片，累计到恰好 800ms 后截断（与 even 序列总时长一致）。
    const burst: number[] = []
    let burstTotal = 0
    for (const dt of [70, 5, 25, 100, 40, 20, 80, 15, 55, 90, 30, 50, 60, 10, 45, 65, 35, 75, 25, 55]) {
      if (burstTotal + dt > 800) { burst.push(800 - burstTotal); burstTotal = 800; break }
      burst.push(dt)
      burstTotal += dt
    }
    if (burstTotal < 800) { burst.push(800 - burstTotal); burstTotal = 800 }
    expect(burstTotal).toBe(800)
    expect(seedTrace(even)).toBe(seedTrace(even))
    expect(seedTrace(even)).toBe(seedTrace(burst))
  })

  it('floats rise and expire after FLOAT_MS', () => {
    const s = createSorter(5)
    quiet(s)
    s.floats.push({ x: 100, y: 300, text: '+2', life: FLOAT_MS })
    const y0 = s.floats[0]!.y
    run(s, 10)
    expect(s.floats.length).toBe(1)
    expect(s.floats[0]!.y).toBeLessThan(y0)
    run(s, Math.ceil(FLOAT_MS / 16))
    expect(s.floats.length).toBe(0)
  })

  it('poisson intervals are seeded-deterministic and bounded around the mean', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const xs: number[] = []
    for (let i = 0; i < 200; i += 1) xs.push(poissonInterval(a, 1000))
    for (let i = 0; i < 200; i += 1) expect(poissonInterval(b, 1000)).toBe(xs[i])
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(350)
      expect(x).toBeLessThanOrEqual(2200)
    }
    const avg = xs.reduce((p, q) => p + q, 0) / xs.length
    expect(avg).toBeGreaterThan(600)
    expect(avg).toBeLessThan(1800)
  })

  it('the same seed and input script replay identically; a different round diverges', () => {
    const trace = (seed: number, round: number): string => {
      const s = createSorter(seed, round)
      const marks: number[] = []
      for (let frame = 0; frame < 2500; frame += 1) {
        const flap = (frame % 5 === 0 ? (frame / 5) % 4 : null) as 0 | 1 | 2 | 3 | null
        stepSorter(s, 16, { flap })
        marks.push(s.score, s.misses, s.combo, s.t, ...s.wagons)
        for (const belt of s.belts) {
          marks.push(belt.flap, belt.nextSpawnAt, belt.packages.length)
          for (const p of belt.packages) marks.push(p.color, Math.round(p.x))
        }
      }
      return JSON.stringify(marks)
    }
    expect(laneY(0)).toBeLessThan(laneY(2))
    expect(trace(888, 1)).toBe(trace(888, 1))
    expect(trace(888, 1)).not.toBe(trace(888, 2))
  })
})
