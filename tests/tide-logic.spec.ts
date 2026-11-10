import { describe, expect, it } from 'vitest'
import {
  COLS, ROWS, LOW_ROW, MAX_FLOOD_ROW, RETREAT_MS, LULL_MS, FLOOD_MS, ROUND_MS,
  ROUNDS, LIVES, ITEMS_PER_ROUND, START_COL, START_ROW, ITEM_KINDS,
  bandOf, createTide, exposeMsAt, isSubmerged, itemAtPlayer, moveTide, mulberry32,
  stepTide, tidePhaseAt, waterLineAt,
} from '../src/client/games/tide/logic.ts'

/** 把轮内时钟推进到目标时刻（安全带内玩家不会被淹）。 */
function advanceTo(s: ReturnType<typeof createTide>, t: number): void {
  while (s.t < t && s.phase === 'playing') stepTide(s, Math.min(1000, t - s.t))
}

describe('tide logic', () => {
  it('starts a fresh run on the shore with deterministic flat-only items', () => {
    const s = createTide(7, 1)
    expect(s.phase).toBe('playing')
    expect(s.t).toBe(0)
    expect(s.round).toBe(1)
    expect(s.score).toBe(0)
    expect(s.lives).toBe(LIVES)
    expect(s.playerCol).toBe(START_COL)
    expect(s.playerRow).toBe(START_ROW)
    expect(s.items).toHaveLength(ITEMS_PER_ROUND)
    for (const it of s.items) {
      expect(it.row).toBeGreaterThanOrEqual(LOW_ROW)
      expect(it.row).toBeLessThan(MAX_FLOOD_ROW)
      expect(it.col).toBeGreaterThanOrEqual(0)
      expect(it.col).toBeLessThan(COLS)
      expect(it.value).toBe(ITEM_KINDS[it.kind]!.value * bandOf(it.row))
      expect(it.appearAt).toBe(exposeMsAt(it.row))
      expect(it.taken).toBe(false)
    }
  })

  it('follows the fixed tide schedule: retreat, lull, fixed-speed flood', () => {
    expect(waterLineAt(0)).toBe(MAX_FLOOD_ROW)
    expect(waterLineAt(RETREAT_MS / 2)).toBeCloseTo(4, 9)
    expect(waterLineAt(RETREAT_MS)).toBe(LOW_ROW)
    expect(waterLineAt(RETREAT_MS + LULL_MS / 2)).toBe(LOW_ROW)
    // 涨潮固定速度：4 行 / FLOOD_MS。
    expect(waterLineAt(RETREAT_MS + LULL_MS + FLOOD_MS / 2)).toBeCloseTo(4, 9)
    expect(waterLineAt(ROUND_MS)).toBe(MAX_FLOOD_ROW)
    expect(tidePhaseAt(0)).toBe('ebb')
    expect(tidePhaseAt(RETREAT_MS - 1)).toBe('ebb')
    expect(tidePhaseAt(RETREAT_MS)).toBe('lull')
    expect(tidePhaseAt(RETREAT_MS + LULL_MS - 1)).toBe('lull')
    expect(tidePhaseAt(RETREAT_MS + LULL_MS)).toBe('flood')
  })

  it('prices depth: exposure times and band multipliers grow toward the sea', () => {
    expect(exposeMsAt(5)).toBe(6000)
    expect(exposeMsAt(4)).toBe(12000)
    expect(exposeMsAt(3)).toBe(18000)
    expect(exposeMsAt(2)).toBe(24000)
    expect(bandOf(5)).toBe(1)
    expect(bandOf(4)).toBe(2)
    expect(bandOf(3)).toBe(3)
    expect(bandOf(2)).toBe(4)
    // 最深珍珠 10 × 4 = 40，且暴露窗口最短（涨潮最先重新淹没第 2 行）。
    expect(ITEM_KINDS[2]!.value * bandOf(2)).toBe(40)
  })

  it('moves on the grid, refuses out-of-bounds steps, and picks up exposed items', () => {
    const s = createTide(3, 1)
    const item = s.items.find((it) => it.row === 5 && it.kind === 1)!
    // 只保留目标物品，路径上的拾取断言才精确。
    s.items = [item]
    advanceTo(s, item.appearAt + 1)
    // 走到物品格：先水平对齐，再向上走到第 5 行。
    for (let g = 0; g < 30 && s.playerCol !== item.col && s.phase === 'playing'; g += 1) {
      expect(moveTide(s, Math.sign(item.col - s.playerCol), 0)).toBe(true)
    }
    for (let g = 0; g < 30 && s.playerRow !== item.row && s.phase === 'playing'; g += 1) {
      expect(moveTide(s, 0, -1)).toBe(true)
    }
    expect(s.phase).toBe('playing')
    expect(item.taken).toBe(true)
    expect(s.score).toBe(item.value)
    expect(s.events.some((e) => e.type === 'pickup' && e.value === item.value)).toBe(true)
    // 边界拒绝：在边角朝外走原地不动。
    for (let c = 0; c < COLS; c += 1) moveTide(s, -1, 0)
    expect(s.playerCol).toBe(0)
    expect(moveTide(s, -1, 0)).toBe(false)
  })

  it('cannot collect an item before its row is exposed by the ebb', () => {
    const s = createTide(11, 1)
    const item = s.items.reduce((a, b) => (b.appearAt > a.appearAt ? b : a))
    expect(item.appearAt).toBe(24000)
    s.items = [item]
    advanceTo(s, 20000)
    for (let g = 0; g < 30 && (s.playerCol !== item.col || s.playerRow !== item.row) && s.phase === 'playing'; g += 1) {
      if (s.playerCol !== item.col) moveTide(s, Math.sign(item.col - s.playerCol), 0)
      else moveTide(s, 0, Math.sign(item.row - s.playerRow))
    }
    expect(itemAtPlayer(s)).toBeNull()
    expect(item.taken).toBe(false)
    expect(s.score).toBe(0)
    // 退潮露出行后，离开再回来即拾取。
    advanceTo(s, item.appearAt + 1)
    expect(itemAtPlayer(s)).not.toBeNull()
    moveTide(s, 0, 1)
    moveTide(s, 0, -1)
    expect(s.score).toBe(item.value)
  })

  it('sweeps the player who stays below the rising waterline, costing all lives', () => {
    const s = createTide(5, 1)
    // 涨潮晚期：第 5 行已淹（水线 > 5），第 6/7 行仍是安全带。
    advanceTo(s, RETREAT_MS + LULL_MS + 15001) // 过边界 1ms：水线 5.0002 严格越过第 5 行
    expect(isSubmerged(s, 5)).toBe(true)
    expect(isSubmerged(s, 6)).toBe(false)
    // 每条命：向海走到第 5 行立即被卷走并回到出生点。
    for (let life = 1; life <= LIVES; life += 1) {
      expect(s.playerRow).toBe(START_ROW)
      expect(moveTide(s, 0, -1)).toBe(true)
      expect(s.playerRow).toBe(START_ROW - 1)
      moveTide(s, 0, -1)
      expect(s.lives).toBe(LIVES - life)
      expect(s.playerRow).toBe(START_ROW)
      expect(s.events.some((e) => e.type === 'swept')).toBe(true)
    }
    expect(s.phase).toBe('over')
    expect(s.events.some((e) => e.type === 'over')).toBe(true)
    expect(moveTide(s, 0, -1)).toBe(false)
  })

  it('washes away items the flood covers and advances rounds on schedule', () => {
    const s = createTide(9, 1)
    const floodItem = s.items.find((it) => it.row === 2)!
    advanceTo(s, RETREAT_MS + LULL_MS + 6000)
    // 水线已重新越过第 2 行：物品被冲走。
    expect(floodItem.taken).toBe(true)
    // 推完本轮：进入第 2 轮，时钟结转余量，物品重生成。
    advanceTo(s, ROUND_MS - 1)
    expect(s.round).toBe(1)
    stepTide(s, 2)
    expect(s.round).toBe(2)
    expect(s.t).toBe(1)
    expect(s.playerRow).toBe(START_ROW)
    expect(s.items).toHaveLength(ITEMS_PER_ROUND)
    expect(s.events.some((e) => e.type === 'round' && e.round === 2)).toBe(true)
    // 一路推到第 5 轮结束：收工。
    for (let g = 0; g < 2000 && s.phase === 'playing'; g += 1) stepTide(s, 2000)
    expect(s.phase).toBe('over')
    expect(s.round).toBe(ROUNDS)
    expect(s.lives).toBe(LIVES)
  })

  it('replays identically per seed and varies layouts across seeds', () => {
    const ra = mulberry32(23)
    const rb = mulberry32(23)
    expect([ra(), ra(), ra()]).toEqual([rb(), rb(), rb()])
    const run = (): { trace: number[], layout: string } => {
      const s = createTide(42, 2)
      const trace: number[] = []
      const dirs: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]
      for (let i = 0; i < 4000 && s.phase === 'playing'; i += 1) {
        stepTide(s, 30)
        if (i % 5 === 0) moveTide(s, ...dirs[i % 4]!)
        trace.push(s.score, s.lives, s.round, s.playerCol, s.playerRow, Math.round(waterLineAt(Math.min(s.t, ROUND_MS - 1)) * 1000))
      }
      return { trace, layout: s.items.map((it) => it.col + ':' + it.row + ':' + it.kind).join(',') }
    }
    expect(run()).toEqual(run())
    const a = createTide(1, 1)
    const b = createTide(2, 1)
    const layout = (s: ReturnType<typeof createTide>): string => s.items.map((it) => it.col + ':' + it.row + ':' + it.kind).join(',')
    expect(layout(a)).not.toBe(layout(b))
    expect(ROWS).toBe(8)
  })
})
