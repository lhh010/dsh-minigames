import { describe, expect, it } from 'vitest'
import {
  CELL_GEM,
  CELL_SPIKE,
  CELL_WALL,
  CLEAR_BONUS,
  GEM_SCORE,
  LEVELS,
  LEVEL_COUNT,
  advanceLevel,
  applySlide,
  createIceState,
  generateLevel,
  iceScore,
  makeLevel,
  mulberry32,
  resetLevel,
  undoSlide,
} from '../src/client/games/iceslide/logic.ts'

describe('iceslide logic', () => {
  it('mulberry32 is deterministic and seeded', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = [a(), a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b(), b()]
    expect(seqA).toEqual(seqB)
    const c = mulberry32(43)
    expect(c()).not.toBe(seqA[0])
    for (let i = 0; i < 100; i += 1) {
      const v = mulberry32(i)()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('generateLevel is deterministic and structurally valid', () => {
    const l1 = generateLevel(777, 9, 7, 5, 3, 2, 2)
    const l2 = generateLevel(777, 9, 7, 5, 3, 2, 2)
    expect([...l1.cells]).toEqual([...l2.cells])
    expect(l1.solution).toEqual(l2.solution)
    expect(l1.start).toBe(l2.start)
    expect(l1.exit).toBe(l2.exit)
    expect(l1.solution).toHaveLength(5)
    expect(l1.gemTotal).toBeGreaterThanOrEqual(1)
    expect(l1.gemTotal).toBeLessThanOrEqual(3)
    expect(l1.start).not.toBe(l1.exit)
    let walls = 0
    let spikes = 0
    let gems = 0
    for (let i = 0; i < l1.cells.length; i += 1) {
      const bits = l1.cells[i]!
      if ((bits & CELL_WALL) !== 0) walls += 1
      if ((bits & CELL_SPIKE) !== 0) {
        spikes += 1
        // 尖刺不与墙/宝石同格。
        expect((bits & CELL_WALL) === 0 && (bits & CELL_GEM) === 0).toBe(true)
      }
      if ((bits & CELL_GEM) !== 0) gems += 1
    }
    expect(walls).toBeGreaterThanOrEqual(5) // 每段滑行至少配一堵墙
    expect(spikes).toBeGreaterThanOrEqual(1)
    expect(gems).toBe(l1.gemTotal)
    // 宝石不占起终点。
    expect((l1.cells[l1.start]! & CELL_GEM) === 0).toBe(true)
    expect((l1.cells[l1.exit]! & CELL_GEM) === 0).toBe(true)
  })

  it('ships 5 levels of increasing size, walls and gems', () => {
    expect(LEVEL_COUNT).toBe(5)
    expect(LEVELS).toHaveLength(5)
    const areas = LEVELS.map(l => l.w * l.h)
    for (let i = 1; i < areas.length; i += 1) {
      expect(areas[i]!).toBeGreaterThan(areas[i - 1]!)
    }
    const wallsOf = (l: (typeof LEVELS)[number]): number => {
      let n = 0
      for (const c of l.cells) if ((c & CELL_WALL) !== 0) n += 1
      return n
    }
    for (let i = 1; i < LEVELS.length; i += 1) {
      expect(wallsOf(LEVELS[i]!)).toBeGreaterThanOrEqual(wallsOf(LEVELS[i - 1]!))
      expect(LEVELS[i]!.gemTotal).toBeGreaterThan(LEVELS[i - 1]!.gemTotal)
    }
  })

  it('every level is solvable by replaying its recorded solution', () => {
    let expectedScore = 0
    for (let i = 0; i < LEVEL_COUNT; i += 1) {
      const state = createIceState(i)
      for (const dir of state.level.solution) {
        const r = applySlide(state, dir)
        expect(r).not.toBeNull()
        expect(r!.outcome).toBe('wall')
        expect(r!.path.length).toBeGreaterThan(0)
      }
      expect(state.moves).toBe(state.level.solution.length)
      expect(state.status).toBe('cleared')
      expect(state.collected.size).toBe(state.level.gemTotal)
      // 按解路径步数 = par，拿满档过关奖励。
      expect(state.score).toBe(state.level.gemTotal * GEM_SCORE + CLEAR_BONUS[0])
      expectedScore += state.level.gemTotal * GEM_SCORE + CLEAR_BONUS[0]
    }
    // 整役：逐关过关并推进，最终通关且分数可复现。
    const campaign = createIceState()
    const replay = createIceState()
    for (let i = 0; i < LEVEL_COUNT; i += 1) {
      for (const dir of campaign.level.solution) applySlide(campaign, dir)
      advanceLevel(campaign)
    }
    expect(campaign.finished).toBe(true)
    expect(campaign.score).toBe(expectedScore)
    // 确定性：同一初始状态重放第 1 关解，结果与整役第 1 步完全一致。
    for (const dir of replay.level.solution) applySlide(replay, dir)
    expect(replay.pos).toBe(replay.level.exit)
    expect(iceScore(campaign)).toBe(campaign.score)
  })

  it('slides until a wall and collects gems en route', () => {
    // 5x3：起点 1，宝石 2，出口在远处；墙在 4 → 滑两格停在 3。
    const level = makeLevel(5, 3, { walls: [4], gems: [2], start: 1, exit: 11, solution: ['right'] })
    const state = createIceState()
    Object.assign(state, { level, pos: level.start })
    const r = applySlide(state, 'right')
    expect(r).not.toBeNull()
    expect(r!.path).toEqual([2, 3])
    expect(r!.to).toBe(3)
    expect(r!.outcome).toBe('wall')
    expect(r!.gems).toEqual([2])
    expect(state.pos).toBe(3)
    expect(state.moves).toBe(1)
    expect(state.collected.has(2)).toBe(true)
    expect(iceScore(state)).toBe(GEM_SCORE)
    // 紧贴墙按方向 = 原地不动，不计步。
    expect(applySlide(state, 'right')).toBeNull()
    expect(state.moves).toBe(1)
  })

  it('spikes and falling off kill the run; resetLevel restores the level', () => {
    // 尖刺在滑行途中：滑到 3 踩刺死亡。
    const spikeLevel = makeLevel(5, 3, { walls: [4], spikes: [3], gems: [2], start: 1, exit: 11 })
    const s = createIceState()
    Object.assign(s, { level: spikeLevel, pos: spikeLevel.start })
    const r = applySlide(s, 'right')
    expect(r!.outcome).toBe('spike')
    expect(s.status).toBe('dead')
    expect(s.deathCause).toBe('spike')
    expect(s.pos).toBe(3)
    expect(s.collected.has(2)).toBe(true)
    expect(applySlide(s, 'right')).toBeNull() // 死亡状态不再滑行
    resetLevel(s)
    expect(s.status).toBe('playing')
    expect(s.pos).toBe(1)
    expect(s.collected.size).toBe(0)
    expect(s.moves).toBe(0)
    expect(s.retries).toBe(1)
    expect(iceScore(s)).toBe(0)
    // 无墙滑出边界：跌落死亡，位置停在最后一张界内格。
    const openLevel = makeLevel(4, 2, { gems: [6], start: 1, exit: 2 })
    const f = createIceState()
    Object.assign(f, { level: openLevel, pos: openLevel.start })
    const rf = applySlide(f, 'right')
    expect(rf!.outcome).toBe('fell')
    expect(rf!.to).toBe(-1)
    expect(rf!.path).toEqual([2, 3])
    expect(f.status).toBe('dead')
    expect(f.deathCause).toBe('fell')
    expect(f.pos).toBe(3)
  })

  it('the exit only clears when every gem is held at rest', () => {
    // 集齐后停在出口 → 过关（步数 1 ≤ par 1，拿满档奖励）。
    const win = makeLevel(5, 1, { walls: [3], gems: [1], start: 0, exit: 2, solution: ['right'] })
    const s = createIceState()
    Object.assign(s, { level: win, pos: win.start })
    const r = applySlide(s, 'right')
    expect(r!.path).toEqual([1, 2])
    expect(r!.cleared).toBe(true)
    expect(s.status).toBe('cleared')
    expect(s.score).toBe(GEM_SCORE + CLEAR_BONUS[0])
    // 停在出口但宝石未集齐 → 不算过关。
    const missing = makeLevel(5, 1, { walls: [2, 4], gems: [3], start: 0, exit: 1 })
    const m = createIceState()
    Object.assign(m, { level: missing, pos: missing.start })
    const rm = applySlide(m, 'right')
    expect(rm!.to).toBe(missing.exit)
    expect(rm!.cleared).toBe(false)
    expect(m.status).toBe('playing')
    // 途经出口（未停）同样不触发。
    const passing = makeLevel(5, 1, { walls: [4], gems: [3], start: 1, exit: 2 })
    const p = createIceState()
    Object.assign(p, { level: passing, pos: passing.start })
    const rp = applySlide(p, 'right')
    expect(rp!.path).toEqual([2, 3])
    expect(rp!.cleared).toBe(false)
    expect(p.status).toBe('playing')
  })

  it('undo restores position, moves and gems exactly', () => {
    // 墙 0/5 夹住第一行：从 1 向右吃到宝石 2 停在 4。
    const level = makeLevel(6, 2, { walls: [0, 5], gems: [2], start: 1, exit: 10 })
    const s = createIceState()
    Object.assign(s, { level: level, pos: level.start })
    expect(undoSlide(s)).toBe(false) // 起点无步可撤
    applySlide(s, 'right')
    expect(s.pos).toBe(4)
    expect(s.moves).toBe(1)
    expect(s.collected.has(2)).toBe(true)
    expect(iceScore(s)).toBe(GEM_SCORE)
    expect(undoSlide(s)).toBe(true)
    expect(s.pos).toBe(1)
    expect(s.moves).toBe(0)
    expect(s.collected.size).toBe(0)
    expect(iceScore(s)).toBe(0)
    expect(undoSlide(s)).toBe(false)
    // 死亡后不可撤销，须重来。
    applySlide(s, 'right') // 回到 4
    applySlide(s, 'down') // 4 → 10 → 滑出下边界死亡
    expect(s.status).toBe('dead')
    expect(undoSlide(s)).toBe(false)
  })
})
