import { describe, expect, it } from 'vitest'
import {
  GRAB_TOL, LAND_TOL, LEVELS, SWING_AMP, SWING_MID, TARGET, TOWER_X,
  boxWidth, createCrane, isColorGrouped, isLevelWon, isStackOrdered,
  mulberry32, pressCrane, stepCrane,
  type Box, type CraneState,
} from '../src/client/games/crane/logic.ts'

/** 步进直到 cond 为真或步数用尽（每步 dtMs）。 */
function runUntil(state: CraneState, cond: (s: CraneState) => boolean, steps = 3000, dtMs = 33): boolean {
  for (let i = 0; i < steps; i += 1) {
    if (cond(state)) return true
    stepCrane(state, dtMs)
  }
  return cond(state)
}

/** 直接摆好吊钩（不经 step，测试专用）：设相位与位置。 */
function setHook(state: CraneState, x: number, vx = 0): void {
  state.hookX = x
  state.hookVx = vx
  state.hookPhase = Math.asin(Math.max(-1, Math.min(1, (x - SWING_MID) / SWING_AMP)))
}

/** 抓取指定柱顶箱并把吊钩移到 x 处抛下（水平速度 vx）。 */
function grabAndThrow(state: CraneState, fromTower: number, x: number, vx = 0): void {
  setHook(state, TOWER_X[fromTower]!)
  pressCrane(state)
  expect(state.carried).not.toBeNull()
  setHook(state, x, vx)
  pressCrane(state)
}

/** 造一只测试箱（颜色统一 0，宽度按大小序号）。 */
function mkBox(size: number, color = 0): Box {
  return { id: 900 + size, size, w: boxWidth(size), color }
}

/** 把当前关摆成"只差最小箱封顶"的终局并完成最后一抛。 */
function winCurrentLevel(state: CraneState): void {
  const cfg = LEVELS[state.level]!
  state.towers = [[mkBox(cfg.boxes - 1)], [], []]
  for (let i = 0; i < cfg.boxes - 1; i += 1) state.towers[TARGET]!.push(mkBox(i))
  state.carried = null
  state.fall = null
  state.phase = 'swing'
  grabAndThrow(state, 0, TOWER_X[TARGET]!)
}

describe('crane logic', () => {
  it('seeds level 0 with a big-to-small stack on the start tower and a deterministic swing', () => {
    const s = createCrane(7)
    expect(s.phase).toBe('swing')
    expect(s.level).toBe(0)
    expect(s.steps).toBe(0)
    expect(s.towers[1]).toHaveLength(0)
    expect(s.towers[2]).toHaveLength(0)
    expect(isStackOrdered(s.towers[0]!)).toBe(true)
    expect(s.towers[0]).toHaveLength(LEVELS[0]!.boxes)
    // 吊钩初值由相位决定，始终在摆幅内。
    for (let i = 0; i < 30; i += 1) {
      stepCrane(s, 40)
      expect(s.hookX).toBeGreaterThanOrEqual(SWING_MID - SWING_AMP - 0.01)
      expect(s.hookX).toBeLessThanOrEqual(SWING_MID + SWING_AMP + 0.01)
    }
    // 同种子完全重放：箱色、初相、钩位序列一致。
    const other = createCrane(7)
    expect(other.towers).toEqual(s.towers)
  })

  it('integrates the swing phase deterministically from the seed', () => {
    const a = createCrane(42)
    const b = createCrane(42)
    const xsA: number[] = []
    for (let i = 0; i < 80; i += 1) {
      stepCrane(a, 33)
      stepCrane(b, 33)
      xsA.push(a.hookX)
      expect(b.hookX).toBe(a.hookX)
    }
    expect(new Set(xsA.map((x) => Math.round(x))).size).toBeGreaterThan(10)
    // 换种子初相不同，轨迹必然分离。
    const c = createCrane(43)
    let diverged = false
    for (let i = 0; i < 80; i += 1) {
      stepCrane(c, 33)
      if (Math.abs(c.hookX - xsA[i]!) > 1) diverged = true
    }
    expect(diverged).toBe(true)
  })

  it('grabs the top (smallest) box within tolerance and ignores empty towers', () => {
    const s = createCrane(3)
    setHook(s, TOWER_X[0]!)
    pressCrane(s)
    expect(s.phase).toBe('carry')
    expect(s.carried).not.toBeNull()
    expect(s.carried!.size).toBe(LEVELS[0]!.boxes - 1)
    expect(s.towers[0]).toHaveLength(LEVELS[0]!.boxes - 1)
    // 放回过程未发生：步数只在抛下时计。
    expect(s.steps).toBe(0)
    // 目标柱为空：吊钩悬在其上抓不到任何箱。
    const t = createCrane(3)
    setHook(t, TOWER_X[TARGET]!)
    pressCrane(t)
    expect(t.phase).toBe('swing')
    expect(t.carried).toBeNull()
  })

  it('refuses to grab when the hook is outside the grab tolerance', () => {
    const s = createCrane(5)
    setHook(s, TOWER_X[0]! + GRAB_TOL + 4)
    pressCrane(s)
    expect(s.phase).toBe('swing')
    expect(s.carried).toBeNull()
    expect(s.towers[0]).toHaveLength(LEVELS[0]!.boxes)
    // 恰好在容差边缘仍可抓。
    setHook(s, TOWER_X[0]! + GRAB_TOL - 2)
    pressCrane(s)
    expect(s.phase).toBe('carry')
  })

  it('drops a centered box straight onto the empty target tower with full precision bonus', () => {
    const s = createCrane(11)
    grabAndThrow(s, 0, TOWER_X[TARGET]!)
    expect(s.phase).toBe('falling')
    expect(s.fall).not.toBeNull()
    expect(s.steps).toBe(1)
    expect(runUntil(s, (st) => st.phase === 'settle')).toBe(true)
    expect(s.towers[TARGET]).toHaveLength(1)
    expect(s.towers[TARGET]![0]!.size).toBe(LEVELS[0]!.boxes - 1)
    expect(s.fails).toBe(0)
    // 正中柱心：精准度 = 容差满值，加成 = 2×精准度。
    expect(s.lastPrecision).toBeCloseTo(LAND_TOL, 5)
    expect(s.bonusTotal).toBe(Math.round(LAND_TOL * 2))
    expect(s.events.some((e) => e.type === 'land')).toBe(true)
  })

  it('topples when a bigger box lands on a smaller one: fail +1 and the box returns', () => {
    const s = createCrane(11)
    // 先把最小箱正中放上目标柱。
    grabAndThrow(s, 0, TOWER_X[TARGET]!)
    expect(runUntil(s, (st) => st.phase === 'settle')).toBe(true)
    expect(runUntil(s, (st) => st.phase === 'swing')).toBe(true)
    // 再抓次小箱（更大）砸上去：大上小下 → 倒塔。
    const topBefore = s.towers[TARGET]!.length
    grabAndThrow(s, 0, TOWER_X[TARGET]!)
    expect(runUntil(s, (st) => st.phase === 'settle')).toBe(true)
    expect(s.fails).toBe(1)
    expect(s.towers[TARGET]).toHaveLength(topBefore)
    // 箱退回抓取来源柱（起始柱）顶部，栈仍合法。
    expect(s.towers[0]!.at(-1)!.size).toBe(LEVELS[0]!.boxes - 2)
    expect(isStackOrdered(s.towers[0]!)).toBe(true)
    expect(s.events.some((e) => e.type === 'topple')).toBe(true)
  })

  it('splashes a box that falls between towers: fail +1 and the box returns', () => {
    const s = createCrane(13)
    grabAndThrow(s, 0, TOWER_X[1]!)
    // 把抛落箱直接摆到两柱之间的空档，垂直坠地。
    s.fall!.x = (TOWER_X[0]!! + TOWER_X[1]!!) / 2 - s.fall!.box.w / 2
    s.fall!.vx = 0
    expect(runUntil(s, (st) => st.phase === 'settle')).toBe(true)
    expect(s.fails).toBe(1)
    expect(s.towers[0]).toHaveLength(LEVELS[0]!.boxes)
    expect(isStackOrdered(s.towers[0]!)).toBe(true)
    expect(s.events.some((e) => e.type === 'splash')).toBe(true)
  })

  it('wins level 0 with the seven-move Hanoi solution and advances with the score formula', () => {
    const s = createCrane(17)
    // 3 箱汉诺塔最优解：最小箱借柱倒腾，最大箱最后落空目标柱。
    const moves: [number, number][] = [
      [0, 2], [0, 1], [2, 1], [0, 2], [1, 0], [1, 2], [0, 2],
    ]
    for (const [from, to] of moves.slice(0, 6)) {
      grabAndThrow(s, from, TOWER_X[to]!)
      expect(runUntil(s, (st) => st.phase === 'swing')).toBe(true)
      expect(s.fails).toBe(0)
    }
    grabAndThrow(s, moves[6]![0], TOWER_X[moves[6]![1]]!)
    expect(runUntil(s, (st) => st.phase === 'between')).toBe(true)
    // 七抛正中柱心：1000 + 7×92 - 7×20。
    expect(s.steps).toBe(7)
    expect(s.towers[TARGET]!.map((b) => b.size)).toEqual([0, 1, 2])
    expect(s.score).toBe(1000 + 7 * Math.round(LAND_TOL * 2) - 7 * 20)
    expect(s.events.some((e) => e.type === 'win')).toBe(true)
    // 过关切换后进入第 1 关（4 箱、更快的摆）。
    expect(runUntil(s, (st) => st.level === 1 && st.phase === 'swing')).toBe(true)
    expect(s.towers[0]).toHaveLength(LEVELS[1]!.boxes)
    expect(isStackOrdered(s.towers[0]!)).toBe(true)
    expect(s.steps).toBe(0)
  })

  it('enforces color grouping on later levels via pure stack predicates', () => {
    const s = createCrane(19)
    s.level = 3
    // 大下小上、全同色（天然相邻）→ 过关。
    s.towers = [[], [], [mkBox(0), mkBox(1), mkBox(2), mkBox(3), mkBox(4)]]
    expect(isStackOrdered(s.towers[TARGET]!)).toBe(true)
    expect(isColorGrouped(s.towers[TARGET]!)).toBe(true)
    expect(isLevelWon(s)).toBe(true)
    // 大下小上但颜色交错（0/1/0/1/0）→ 不满足分组。
    const mixed: Box[] = [
      { ...mkBox(0, 0) }, { ...mkBox(1, 1) }, { ...mkBox(2, 0) }, { ...mkBox(3, 1) }, { ...mkBox(4, 0) },
    ]
    expect(isStackOrdered(mixed)).toBe(true)
    expect(isColorGrouped(mixed)).toBe(false)
    s.towers[TARGET] = mixed
    expect(isLevelWon(s)).toBe(false)
    // 同色相邻但大小乱序 → 不满足顺序。
    const grouped: Box[] = [
      { ...mkBox(2, 1) }, { ...mkBox(3, 1) }, { ...mkBox(0, 0) }, { ...mkBox(1, 0) }, { ...mkBox(4, 0) },
    ]
    expect(isColorGrouped(grouped)).toBe(true)
    expect(isStackOrdered(grouped)).toBe(false)
    // 前三关不要求分组：交错的同栈直接过关。
    s.level = 0
    s.towers = [[], [], [mixed[0]!, mixed[1]!, mixed[2]!]]
    expect(isLevelWon(s)).toBe(true)
  })

  it('clears all five levels to the finished phase with per-level stacking', () => {
    const s = createCrane(23)
    for (let lv = 0; lv < LEVELS.length; lv += 1) {
      expect(s.level).toBe(lv)
      winCurrentLevel(s)
      expect(runUntil(s, (st) => st.level > lv || st.phase === 'over')).toBe(true)
      expect(s.score).toBeGreaterThan(0)
    }
    expect(s.phase).toBe('over')
    expect(s.events.some((e) => e.type === 'over')).toBe(true)
    // 每关得分 = 1000 + 满精准加成 - 1 步（最小箱封顶一抛正中柱心）。
    const perLevel = 1000 + Math.round(LAND_TOL * 2) - 20
    expect(s.score).toBe(perLevel * LEVELS.length)
  })

  it('replays a scripted session identically under the same seed', () => {
    const play = (state: CraneState): void => {
      grabAndThrow(state, 0, TOWER_X[TARGET]! + 10, 60)
      runUntil(state, (st) => st.phase === 'swing')
      grabAndThrow(state, 0, TOWER_X[0]! - 20, -120)
      runUntil(state, (st) => st.phase === 'swing')
      grabAndThrow(state, 0, TOWER_X[1]!)
      runUntil(state, (st) => st.phase === 'settle' || st.phase === 'swing')
    }
    const a = createCrane(99)
    const b = createCrane(99)
    play(a)
    play(b)
    const strip = (state: CraneState): object => ({
      phase: state.phase, steps: state.steps, fails: state.fails,
      bonus: state.bonusTotal, towers: state.towers.map((t) => t.map((x) => x.size)),
    })
    expect(strip(b)).toEqual(strip(a))
    // mulberry32 本身：同种子同序列。
    const r1 = mulberry32(5)
    const r2 = mulberry32(5)
    for (let i = 0; i < 8; i += 1) expect(r2()).toBe(r1())
  })
})
