import { describe, expect, it } from 'vitest'
import {
  createDigState, stepDig, mulberry32,
  CELL, COLS, ROWS, GEM_SCORE, CRUSH_SCORE, LEVEL_SCORE, LEVELS,
} from '../src/client/games/dig/logic.ts'
import type { DigState } from '../src/client/games/dig/logic.ts'

function centre(rc: number): number {
  return rc * CELL + CELL / 2
}

/** 把玩家传到指定格心。 */
function place(state: DigState, r: number, c: number): void {
  state.player.x = centre(c)
  state.player.y = centre(r)
  state.player.dir = 2
  state.player.intent = 2
}

/**
 * 重铺一张受控地图：第 0 行地表、1..ROWS-2 全泥土、末行全硬石，
 * 出口固定在第 0 列；清空敌人与落石、宝石计数清零，便于逐项验证。
 */
function craftGrid(state: DigState): void {
  for (let r = 1; r < ROWS - 1; r += 1) {
    for (let c = 0; c < COLS; c += 1) state.grid[r]![c] = 'dirt'
  }
  for (let c = 0; c < COLS; c += 1) state.grid[ROWS - 1]![c] = 'hard'
  state.grid[ROWS - 1]![0] = 'exit'
  state.exitCol = 0
  state.enemies = []
  state.boulders = []
  state.gemsLeft = 0
  state.gemsTotal = 0
}

/** 把第 c 列 r0..r1 段挖成竖井（空地道）。 */
function shaft(state: DigState, c: number, r0: number, r1: number): void {
  for (let r = r0; r <= r1; r += 1) state.grid[r]![c] = 'empty'
}

describe('dig logic', () => {
  it('seed 生成确定性：mulberry32 序列稳定，同种子地形一致，异种子不同', () => {
    const r1 = mulberry32(7)
    const r2 = mulberry32(7)
    for (let i = 0; i < 100; i += 1) {
      const v = r1()
      expect(v).toBe(r2())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(mulberry32(7)()).not.toBe(mulberry32(8)())
    const a1 = createDigState(42)
    const a2 = createDigState(42)
    const b = createDigState(43)
    expect(JSON.stringify(a1.grid)).toBe(JSON.stringify(a2.grid))
    expect(JSON.stringify(a1.boulders)).toBe(JSON.stringify(a2.boulders))
    expect(a1.gemsTotal).toBe(a2.gemsTotal)
    expect(a1.enemies.length).toBe(a2.enemies.length)
    expect(JSON.stringify(a1.grid)).not.toBe(JSON.stringify(b.grid))
  })

  it('走进泥土即挖开，宝石被收集并计分', () => {
    const state = createDigState(1)
    craftGrid(state)
    state.grid[2]![7] = 'gem'
    state.gemsLeft = 1
    state.gemsTotal = 1
    place(state, 0, 7)
    for (let i = 0; i < 200; i += 1) stepDig(state, 1 / 60)
    expect(state.grid[1]![7]).toBe('empty')
    expect(state.grid[2]![7]).toBe('empty')
    expect(state.gemsLeft).toBe(0)
    expect(state.score).toBe(GEM_SCORE)
  })

  it('硬石不可挖，把玩家挡在原格', () => {
    const state = createDigState(2)
    craftGrid(state)
    state.grid[1]![7] = 'hard'
    place(state, 0, 7)
    for (let i = 0; i < 120; i += 1) stepDig(state, 1 / 60)
    expect(state.player.y).toBeLessThan(CELL) // 仍停留在地表行
    expect(state.grid[1]![7]).toBe('hard')
  })

  it('落石状态机：下方掏空 → 抖动 0.5s → 坠落 → 落地归位', () => {
    const state = createDigState(3)
    craftGrid(state)
    shaft(state, 3, 5, 8)
    state.boulders = [{ c: 3, y: 4 * CELL, state: 'rest', timer: 0 }]
    place(state, 0, 0)
    stepDig(state, 1 / 60)
    expect(state.boulders[0]!.state).toBe('shake')
    for (let i = 0; i < 10; i += 1) stepDig(state, 1 / 60)
    expect(state.boulders[0]!.state).toBe('shake') // 预警期内未坠落
    for (let i = 0; i < 200; i += 1) stepDig(state, 1 / 60)
    const boulder = state.boulders[0]!
    expect(boulder.state).toBe('rest')
    expect(boulder.y).toBe(8 * CELL) // 落在竖井底（第 9 行泥土）之上
  })

  it('坠落落石压死玩家损命、压死敌人得分', () => {
    const state = createDigState(4)
    craftGrid(state)
    shaft(state, 5, 1, 6)
    state.boulders = [{ c: 5, y: 1 * CELL, state: 'rest', timer: 0 }]
    state.enemies = [{ x: centre(5), y: centre(5), dir: 2, homeX: centre(5), homeY: centre(5) }]
    place(state, 3, 5)
    for (let i = 0; i < 200; i += 1) stepDig(state, 1 / 60)
    expect(state.lives).toBe(2) // 玩家被压损一命
    // 损命后玩家回出生列重新下挖（后续子步会继续掘进），只断言离开竖井。
    expect(Math.floor(state.player.x / CELL)).toBe(Math.floor(COLS / 2))
    expect(Math.floor(state.player.x / CELL)).not.toBe(5)
    expect(state.enemies).toHaveLength(0) // 敌人被压死
    expect(state.score).toBe(CRUSH_SCORE)
  })

  it('落石坠入出口即滚出矿坑，不再挡路', () => {
    const state = createDigState(5)
    craftGrid(state)
    state.grid[ROWS - 2]![0] = 'empty'
    state.boulders = [{ c: 0, y: (ROWS - 2) * CELL, state: 'rest', timer: 0 }]
    place(state, 0, 7)
    for (let i = 0; i < 200; i += 1) stepDig(state, 1 / 60)
    expect(state.boulders).toHaveLength(0)
  })

  it('敌人在地道游荡追击玩家，贴身碰撞损命', () => {
    const state = createDigState(6)
    craftGrid(state)
    for (let c = 2; c <= 12; c += 1) state.grid[3]![c] = 'empty'
    state.grid[4]![12] = 'hard' // 把玩家钉死在走廊右端
    state.enemies = [{ x: centre(2), y: centre(3), dir: 1, homeX: centre(2), homeY: centre(3) }]
    place(state, 3, 12)
    state.enemyDelay = 0
    let lives = state.lives
    for (let i = 0; i < 900 && lives === state.lives; i += 1) stepDig(state, 1 / 60)
    expect(state.lives).toBe(2)
  })

  it('出口判定：缺宝石不过关，收齐过关，第 5 关完成通关', () => {
    const state = createDigState(7)
    craftGrid(state)
    place(state, ROWS - 1, 0)
    state.gemsLeft = 1
    stepDig(state, 1 / 60)
    expect(state.level).toBe(1) // 宝石未收齐：踩出口无效
    state.gemsLeft = 0
    stepDig(state, 1 / 60)
    expect(state.level).toBe(2) // 收齐：过关进入下一关
    expect(state.score).toBeGreaterThanOrEqual(LEVEL_SCORE)
    // 直送第 5 关终局。
    state.level = LEVELS.length
    craftGrid(state)
    place(state, ROWS - 1, 0)
    stepDig(state, 1 / 60)
    expect(state.won).toBe(true)
    expect(state.over).toBe(false)
  })

  it('确定性重放：同种子同输入序列状态完全一致', () => {
    const run = (): string => {
      const state = createDigState(123)
      const cycle = [2, 2, 1, 2, 0, 2]
      for (let i = 0; i < 800; i += 1) {
        if (i % 40 === 0) state.player.intent = cycle[(i / 40) % cycle.length] as 0 | 1 | 2 | 3
        stepDig(state, 1 / 60)
      }
      return JSON.stringify({
        grid: state.grid, player: state.player, enemies: state.enemies,
        boulders: state.boulders, score: state.score, lives: state.lives,
        level: state.level, gemsLeft: state.gemsLeft, over: state.over, won: state.won,
      })
    }
    expect(run()).toBe(run())
  })
})
