import { describe, expect, it } from 'vitest'
import {
  createGoldmineState, createGoldmineStateAtLevel, moveGoldmine, stepGoldmine,
  mulberry32, boulderAt, exitOpen, LEVELS,
  GOLD_SCORE, GEM_SCORE, LEVEL_SCORE, FALL_ANIM_S,
} from '../src/client/games/goldmine/logic.ts'
import type { Dir, GoldmineState } from '../src/client/games/goldmine/logic.ts'

/** 出生点 / 每次损命后的重生列（第 1 关中央）。 */
const SPAWN_C = 6

/**
 * 重铺一张受控地图：第 0 行地表走廊、1..rows-2 全泥土、末行硬岩 +
 * 出口在第 0 列；清空圆石、金块计数清零，便于逐项验证。
 */
function craftGrid(state: GoldmineState): void {
  for (let r = 1; r < state.rows - 1; r += 1) {
    for (let c = 0; c < state.cols; c += 1) state.grid[r]![c] = 'dirt'
  }
  for (let c = 0; c < state.cols; c += 1) state.grid[state.rows - 1]![c] = 'hard'
  state.grid[state.rows - 1]![0] = 'exit'
  state.exitC = 0
  state.boulders = []
  state.anims = []
  state.goldsLeft = 0
  state.goldsTotal = 0
}

/** 把玩家传到指定格。 */
function place(state: GoldmineState, r: number, c: number): void {
  state.player.r = r
  state.player.c = c
  state.player.dir = 2
}

/** 朝方向连走 n 步（每步走一次 moveGoldmine 触发挖掘与重力）。 */
function walk(state: GoldmineState, dir: Dir, n: number): void {
  for (let i = 0; i < n; i += 1) moveGoldmine(state, dir)
}

describe('goldmine logic', () => {
  it('seed 生成确定性：mulberry32 序列稳定，同种子地形一致，异种子不同', () => {
    const r1 = mulberry32(11)
    const r2 = mulberry32(11)
    for (let i = 0; i < 100; i += 1) {
      const v = r1()
      expect(v).toBe(r2())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(mulberry32(11)()).not.toBe(mulberry32(12)())
    const a1 = createGoldmineState(42)
    const a2 = createGoldmineState(42)
    const b = createGoldmineState(43)
    expect(JSON.stringify(a1.grid)).toBe(JSON.stringify(a2.grid))
    expect(JSON.stringify(a1.boulders)).toBe(JSON.stringify(a2.boulders))
    expect(a1.goldsTotal).toBe(a2.goldsTotal)
    expect(a1.gemsTotal).toBe(a2.gemsTotal)
    expect(JSON.stringify(a1.grid)).not.toBe(JSON.stringify(b.grid))
  })

  it('生成保证可解：5 关多种子下全部金块与出口均从出生点可达（硬岩不隔断）', () => {
    for (const cfg of LEVELS) {
      const level = LEVELS.indexOf(cfg) + 1
      for (const seed of [1, 7, 99, 2024]) {
        const state = createGoldmineStateAtLevel(seed, level)
        expect(state.cols).toBe(cfg.cols)
        expect(state.rows).toBe(cfg.rows)
        expect(state.goldsTotal).toBe(cfg.golds)
        expect(state.boulders).toHaveLength(cfg.boulders)
        // 玩家视角 BFS：泥土 / 空腔 / 金块 / 宝石 / 出口皆可通行。
        const seen: boolean[][] = []
        for (let r = 0; r < state.rows; r += 1) seen.push(new Array<boolean>(state.cols).fill(false))
        const queue: Array<[number, number]> = [[0, state.spawnC]]
        seen[0]![state.spawnC] = true
        while (queue.length > 0) {
          const [r, c] = queue.shift()!
          for (const [dr, dc] of [[-1, 0], [0, 1], [1, 0], [0, -1]] as const) {
            const nr = r + dr
            const nc = c + dc
            if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue
            if (seen[nr]![nc]) continue
            if (state.grid[nr]![nc] === 'hard') continue
            seen[nr]![nc] = true
            queue.push([nr, nc])
          }
        }
        expect(seen[state.rows - 1]![state.exitC]).toBe(true)
        for (let r = 0; r < state.rows; r += 1) {
          for (let c = 0; c < state.cols; c += 1) {
            if (state.grid[r]![c] === 'gold') expect(seen[r]![c]).toBe(true)
          }
        }
      }
    }
  })

  it('移动挖掘：走进泥土即挖开，金块宝石被收集计分', () => {
    const state = createGoldmineState(1)
    craftGrid(state)
    state.grid[2]![7] = 'gold'
    state.grid[3]![7] = 'gem'
    state.goldsLeft = 1
    state.goldsTotal = 1
    place(state, 0, 7)
    walk(state, 2, 3)
    expect(state.player.r).toBe(3)
    expect(state.grid[1]![7]).toBe('empty')
    expect(state.grid[2]![7]).toBe('empty')
    expect(state.grid[3]![7]).toBe('empty')
    expect(state.goldsLeft).toBe(0)
    expect(state.score).toBe(GOLD_SCORE + GEM_SCORE)
    expect(exitOpen(state)).toBe(true)
  })

  it('硬岩不可挖也不可入，把玩家挡在原格', () => {
    const state = createGoldmineState(2)
    craftGrid(state)
    state.grid[1]![7] = 'hard'
    place(state, 0, 7)
    walk(state, 2, 5)
    expect(state.player.r).toBe(0)
    expect(state.grid[1]![7]).toBe('hard')
  })

  it('金块重力：下方被掏空后逐格下落到底并记入动画', () => {
    const state = createGoldmineState(3)
    craftGrid(state)
    for (let r = 3; r <= 5; r += 1) state.grid[r]![5] = 'empty'
    state.grid[2]![5] = 'gold'
    place(state, 0, 0)
    moveGoldmine(state, 2) // 被泥土挡住，但任何行动都会触发沉降
    expect(state.grid[5]![5]).toBe('gold')
    expect(state.grid[2]![5]).toBe('empty')
    expect(state.grid[3]![5]).toBe('empty')
    expect(state.grid[4]![5]).toBe('empty')
    expect(state.anims.length).toBeGreaterThanOrEqual(3)
    // 动画随 step 推进消耗完毕。
    for (let i = 0; i < 40; i += 1) stepGoldmine(state, FALL_ANIM_S)
    expect(state.anims).toHaveLength(0)
  })

  it('金块不砸玩家：落到玩家头顶即停驻等待', () => {
    const state = createGoldmineState(4)
    craftGrid(state)
    for (let r = 3; r <= 4; r += 1) state.grid[r]![5] = 'empty'
    state.grid[2]![5] = 'gold'
    place(state, 4, 5)
    moveGoldmine(state, 2) // 向下挖一格，随后金块逐格追落到头顶停驻
    expect(state.player.r).toBe(5)
    expect(state.grid[4]![5]).toBe('gold')
    expect(state.grid[3]![5]).toBe('empty')
    expect(state.lives).toBe(3)
  })

  it('圆石重力砸中玩家：损命重生，圆石占其格停驻', () => {
    const state = createGoldmineState(5)
    craftGrid(state)
    for (let r = 1; r <= 5; r += 1) state.grid[r]![5] = 'empty'
    state.grid[6]![5] = 'dirt'
    state.boulders = [{ r: 1, c: 5, dist: 0 }]
    place(state, 4, 5)
    moveGoldmine(state, 0)
    expect(state.lives).toBe(2)
    expect(boulderAt(state, 5, 5)).toBe(true) // 砸中玩家后继续坠到支撑面停驻
    const b = state.boulders[0]!
    expect(b.r).toBe(5)
    expect(b.dist).toBe(0)
    expect(state.player.r).toBe(0)
    expect(state.player.c).toBe(SPAWN_C)
  })

  it('圆石侧推：身后为空可推走一格，身后是墙推不动，竖直方向不可推', () => {
    const state = createGoldmineState(6)
    craftGrid(state)
    state.grid[2]![4] = 'empty'
    state.grid[2]![5] = 'empty'
    state.grid[2]![6] = 'empty'
    state.boulders = [{ r: 2, c: 5, dist: 0 }]
    place(state, 2, 4)
    expect(moveGoldmine(state, 1)).toBe(true)
    expect(state.player.c).toBe(5)
    expect(state.boulders[0]!.c).toBe(6)
    // 身后是泥土：推不动，玩家原地。
    state.grid[2]![6] = 'dirt'
    place(state, 2, 4)
    state.boulders = [{ r: 2, c: 5, dist: 0 }]
    moveGoldmine(state, 1)
    expect(state.player.c).toBe(4)
    expect(state.boulders[0]!.c).toBe(5)
    // 竖直方向（下）不可推。
    place(state, 1, 5)
    state.grid[1]![5] = 'empty'
    moveGoldmine(state, 2)
    expect(state.player.r).toBe(1)
    expect(state.boulders[0]!.r).toBe(2)
  })

  it('圆石连锁砸开硬岩：连续坠落两格后把硬岩砸成空腔并沉入', () => {
    const state = createGoldmineState(7)
    craftGrid(state)
    state.grid[1]![4] = 'empty'
    state.grid[2]![4] = 'empty'
    state.grid[3]![4] = 'empty'
    state.grid[4]![4] = 'hard'
    state.grid[5]![4] = 'dirt'
    state.boulders = [{ r: 1, c: 4, dist: 0 }]
    place(state, 0, 0)
    moveGoldmine(state, 2)
    const b = state.boulders[0]!
    expect(state.grid[4]![4]).toBe('empty') // 硬岩被砸开
    expect(b.r).toBe(4) // 圆石沉入原硬岩格
    expect(boulderAt(state, 4, 4)).toBe(true)
  })

  it('出口判定：金块未收齐踩门无效，收齐后过关进下一关，第 5 关完成通关', () => {
    const state = createGoldmineState(8)
    craftGrid(state)
    place(state, state.rows - 1, 0)
    state.goldsLeft = 1
    moveGoldmine(state, 2)
    expect(state.level).toBe(1)
    expect(state.won).toBe(false)
    state.goldsLeft = 0
    moveGoldmine(state, 2)
    expect(state.level).toBe(2)
    expect(state.score).toBeGreaterThanOrEqual(LEVEL_SCORE)
    // 直送第 5 关终局。
    const final = createGoldmineStateAtLevel(9, LEVELS.length)
    craftGrid(final)
    place(final, final.rows - 1, 0)
    final.goldsLeft = 0
    moveGoldmine(final, 2)
    expect(final.won).toBe(true)
    expect(final.over).toBe(false)
  })

  it('限时耗尽损命并重置计时，生命归零终局', () => {
    const state = createGoldmineState(10)
    craftGrid(state)
    const total = LEVELS[0]!.time
    expect(state.timeLeft).toBe(total)
    for (let i = 0; i < Math.ceil(total / 10); i += 1) stepGoldmine(state, 10)
    expect(state.lives).toBe(2)
    expect(state.timeLeft).toBe(total) // 重置本关计时
    state.lives = 1
    state.timeLeft = 0.5
    expect(stepGoldmine(state, 1)).toBe(true)
    expect(state.over).toBe(true)
    expect(state.lives).toBe(0)
  })

  it('确定性重放：同种子同输入序列状态完全一致', () => {
    const run = (): string => {
      const state = createGoldmineState(123)
      const cycle: Dir[] = [2, 2, 1, 2, 3, 2, 0, 1]
      for (let i = 0; i < 600; i += 1) {
        moveGoldmine(state, cycle[i % cycle.length]!)
        stepGoldmine(state, 1 / 60)
      }
      return JSON.stringify({
        grid: state.grid, boulders: state.boulders, player: state.player,
        score: state.score, lives: state.lives, level: state.level,
        goldsLeft: state.goldsLeft, over: state.over, won: state.won,
      })
    }
    expect(run()).toBe(run())
  })
})
