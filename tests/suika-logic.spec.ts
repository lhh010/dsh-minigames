import { describe, expect, it } from 'vitest'
import {
  DROP_COOLDOWN_MS, DROP_Y, FLOAT_MS, FLOOR_Y, FRUIT_NAMES, FRUIT_RADII, GRACE_MS, MAX_LEVEL,
  MERGE_POINTS, NEXT_LEVEL_MAX, OVER_MS, SETTLE_SPEED2, WALL_L, WALL_R, WARN_Y, WATERMELON_BONUS,
  clampDropX, createSuika, dropFruit, fruitRadius, moveDrop, stepSuika, type Fruit, type SuikaState,
} from '../src/client/games/suika/logic.ts'

/** 快进 n 帧。 */
function run(s: SuikaState, frames: number): void {
  for (let i = 0; i < frames; i += 1) stepSuika(s, 16)
}

/** 造一只可控水果。 */
function fruit(id: number, x: number, y: number, level: number, born = -1e6): Fruit {
  return { id, x, y, vx: 0, vy: 0, level, born }
}

describe('suika logic', () => {
  it('the fruit tables are consistent and clampDropX keeps drops inside the walls', () => {
    expect(FRUIT_RADII.length).toBe(MAX_LEVEL + 1)
    expect(FRUIT_NAMES.length).toBe(MAX_LEVEL + 1)
    expect(MERGE_POINTS.length).toBe(MAX_LEVEL + 1)
    expect(FRUIT_RADII[0]).toBeLessThan(FRUIT_RADII[MAX_LEVEL]!)
    for (let l = 0; l <= MAX_LEVEL; l += 1) expect(fruitRadius(l)).toBe(FRUIT_RADII[l]!)
    const r = fruitRadius(2)
    expect(clampDropX(-1000, 2)).toBe(WALL_L + r)
    expect(clampDropX(10000, 2)).toBe(WALL_R - r)
    expect(clampDropX(240, 2)).toBe(240)
    // 越级索引回退到最大级（fruitRadius 兜底）。
    expect(fruitRadius(99)).toBe(FRUIT_RADII[MAX_LEVEL]!)
  })

  it('dropFruit obeys the cooldown, rolls only low levels, and queues next/nextNext', () => {
    const s = createSuika(30)
    expect(s.next).toBeGreaterThanOrEqual(0)
    expect(s.next).toBeLessThanOrEqual(NEXT_LEVEL_MAX)
    expect(s.nextNext).toBeGreaterThanOrEqual(0)
    expect(s.nextNext).toBeLessThanOrEqual(NEXT_LEVEL_MAX)
    const first = s.next
    const second = s.nextNext
    moveDrop(s, 200)
    expect(s.dropX).toBe(200)
    expect(dropFruit(s)).toBe(true)
    expect(s.fruits.length).toBe(1)
    expect(s.fruits[0]!.x).toBe(200)
    expect(s.fruits[0]!.y).toBe(DROP_Y)
    expect(s.fruits[0]!.level).toBe(first)
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'drop', x: 200, level: first }))
    expect(s.next).toBe(second)
    expect(s.cooldownMs).toBe(DROP_COOLDOWN_MS)
    // 冷却中不可再投。
    expect(dropFruit(s)).toBe(false)
    expect(s.fruits.length).toBe(1)
    run(s, Math.ceil(DROP_COOLDOWN_MS / 16))
    expect(s.cooldownMs).toBe(0)
    expect(dropFruit(s)).toBe(true)
    expect(s.fruits.length).toBe(2)
  })

  it('a dropped fruit falls under gravity and settles on the floor inside the walls', () => {
    const s = createSuika(1)
    s.next = 0
    dropFruit(s)
    run(s, 400) // 6.4s，远超落底时间
    const f = s.fruits[0]!
    expect(f.level).toBe(0)
    expect(f.y + fruitRadius(0)).toBeGreaterThanOrEqual(FLOOR_Y - 1)
    expect(Math.abs(f.y - (FLOOR_Y - fruitRadius(0)))).toBeLessThan(1)
    expect(f.x).toBeGreaterThan(WALL_L)
    expect(f.x).toBeLessThan(WALL_R)
    expect(f.vx * f.vx + f.vy * f.vy).toBeLessThan(SETTLE_SPEED2)
    expect(s.phase).toBe('play') // 单果静置不触发警戒线
  })

  it('two touching same-level fruits merge into the next level and pay MERGE_POINTS once', () => {
    const s = createSuika(2)
    s.fruits = [fruit(1, 200, FLOOR_Y - 15, 0), fruit(2, 225, FLOOR_Y - 15, 0)]
    stepSuika(s, 16)
    expect(s.fruits.length).toBe(1)
    const merged = s.fruits[0]!
    expect(merged.level).toBe(1)
    expect(merged.x).toBeCloseTo(212.5, 0)
    expect(s.score).toBe(MERGE_POINTS[1])
    expect(s.topLevel).toBe(1)
    const ev = s.events.find((e) => e.type === 'merge')!
    expect(ev.type === 'merge' && ev.gained).toBe(MERGE_POINTS[1])
    expect(ev.type === 'merge' && ev.bonus).toBe(false)
    expect(s.floats.some((f) => f.text === '+' + MERGE_POINTS[1])).toBe(true)
    // 不同级不合成：仅碰撞分离。
    const diff = createSuika(2)
    diff.fruits = [fruit(1, 200, FLOOR_Y - 15, 0), fruit(2, 230, FLOOR_Y - 15, 1)]
    stepSuika(diff, 16)
    expect(diff.fruits.length).toBe(2)
    expect(diff.score).toBe(0)
    // 两个西瓜（最高级）不合成。
    const maxed = createSuika(2)
    maxed.fruits = [fruit(1, 200, 500, MAX_LEVEL), fruit(2, 300, 500, MAX_LEVEL)]
    stepSuika(maxed, 16)
    expect(maxed.fruits.length).toBe(2)
    expect(maxed.score).toBe(0)
  })

  it('merging into the watermelon pays the triangle points plus the bonus', () => {
    const s = createSuika(3)
    s.fruits = [fruit(1, 200, FLOOR_Y - 97, MAX_LEVEL - 1), fruit(2, 300, FLOOR_Y - 97, MAX_LEVEL - 1)]
    stepSuika(s, 16)
    expect(s.fruits.length).toBe(1)
    expect(s.fruits[0]!.level).toBe(MAX_LEVEL)
    expect(s.score).toBe(MERGE_POINTS[MAX_LEVEL] + WATERMELON_BONUS)
    expect(s.topLevel).toBe(MAX_LEVEL)
    const ev = s.events.find((e) => e.type === 'merge')!
    expect(ev.type === 'merge' && ev.bonus).toBe(true)
    expect(s.floats.some((f) => f.text === '大西瓜 +500')).toBe(true)
  })

  it('a fruit resting above the warn line ends the game only after the grace period', () => {
    // 新鲜投放、压线但处于豁免期：短时间内不判负。
    const fresh = createSuika(4)
    fresh.fruits = [fruit(1, 240, WARN_Y - 5, 3, 0)]
    fresh.t = 1
    run(fresh, Math.floor((GRACE_MS - 200) / 16))
    expect(fresh.phase).toBe('play')
    // 豁免期满后压线静置 → 累计 OVER_MS 判负。构造：把水果顶出画布顶部（y-r<-4 分支，
    // 不看豁免与速度），持续超 900ms。
    const buried = createSuika(4)
    buried.fruits = [fruit(1, 240, -2000, 3)]
    run(buried, Math.ceil((OVER_MS + 200) / 16))
    expect(buried.phase).toBe('over')
    // 结束后浮字仍会飘完、冷却仍递减，但不接受新投放。
    buried.floats.push({ x: 10, y: 10, text: 'x', life: 0 })
    run(buried, Math.ceil(FLOAT_MS / 16))
    expect(buried.floats.length).toBe(0)
    expect(dropFruit(buried)).toBe(false)
  })

  it('the same seed and drop schedule replays identical physics', () => {
    const trace = (): string => {
      const s = createSuika(9527)
      const xs = [100, 380, 240, 60, 420, 200, 300, 150]
      const marks: number[] = []
      for (const x of xs) {
        moveDrop(s, x)
        if (!dropFruit(s)) throw new Error('cooldown mismatch in script')
        run(s, 30) // 480ms > 冷却 400ms
        marks.push(s.score, s.fruits.length, s.topLevel, s.phase === 'play' ? 0 : 1)
        for (const f of s.fruits) marks.push(Math.round(f.x * 100), Math.round(f.y * 100), f.level)
      }
      return JSON.stringify([marks, s.next, s.nextNext, s.nextId])
    }
    expect(trace()).toBe(trace())
  })
})
