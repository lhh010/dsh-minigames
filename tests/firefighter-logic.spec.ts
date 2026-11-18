import { describe, expect, it } from 'vitest'
import {
  CLEAR_TIME, CATCH_BUILDING, CATCH_GRASS, FUEL_BUILDING, FUEL_GRASS, INJURE_COOLDOWN,
  LEVELS, LEVELS as LV, WATER_DMG, applyWater, catchChance, createState, fireCount,
  fireTick, fuelOf, levelBonus, movePlayer, mulberry32, restartLevel, sprayCells, step,
  walkable, windMultiplier, type FirefighterState,
} from '../src/client/games/firefighter/logic.ts'

/** 生成后清空全盘火与烧毁标记，手工布置受控火场。 */
function sandbox(state: FirefighterState): void {
  for (const row of state.grid) {
    for (const cell of row) {
      cell.fire = 0
      cell.burnt = false
    }
  }
  state.px = state.startX
  state.py = state.startY
  state.cooldown = 0
  state.phase = 'play'
  state.spraying = false
}

describe('firefighter logic', () => {
  it('generates a deterministic seeded board with the configured fire count', () => {
    for (let level = 1; level <= LV.length; level += 1) {
      const a = createState(7, level)
      const b = createState(7, level)
      expect(a.grid).toEqual(b.grid)
      expect(a.px).toBe(b.px)
      const cfg = LEVELS[level - 1]!
      expect(a.grid.length).toBe(cfg.h)
      expect(a.grid[0]!.length).toBe(cfg.w)
      expect(fireCount(a)).toBe(cfg.fires)
    }
    // 起点是可通行的空地，且不在火里。
    const s = createState(7, 1)
    expect(s.grid[s.py]![s.px]!.kind).toBe('empty')
    expect(s.grid[s.py]![s.px]!.fire).toBe(0)
    // 不同 seed 盘面不同（存在性抽查，避免同布局退化）。
    const other = createState(123456, 1)
    expect(other.grid).not.toEqual(s.grid)
  })

  it('exposes flammability, fuel and wind multipliers', () => {
    expect(catchChance('grass')).toBe(CATCH_GRASS)
    expect(catchChance('building')).toBe(CATCH_BUILDING)
    expect(catchChance('empty')).toBe(0)
    expect(fuelOf('building')).toBe(FUEL_BUILDING)
    expect(fuelOf('grass')).toBe(FUEL_GRASS)
    expect(fuelOf('empty')).toBe(0)
    expect(windMultiplier([1, 0], 1, 0)).toBeGreaterThan(1)
    expect(windMultiplier([1, 0], -1, 0)).toBeLessThan(1)
    expect(windMultiplier([1, 0], 0, 1)).toBe(1)
    expect(windMultiplier([0, 0], 1, 0)).toBe(1)
  })

  it('moves four ways, blocks on buildings and edges, and updates facing', () => {
    const s = createState(3, 1)
    sandbox(s)
    s.px = 4
    s.py = 3
    s.grid[3]![5]!.kind = 'building' // 右侧建筑
    expect(movePlayer(s, 'right')).toBe(false)
    expect(s.px).toBe(4)
    expect(s.facing).toBe('right') // 撞墙也更新朝向
    for (const [x, y] of [[3, 3], [2, 3], [3, 4]] as const) s.grid[y]![x]!.kind = 'grass'
    expect(movePlayer(s, 'left')).toBe(true)
    expect(s.px).toBe(3)
    expect(movePlayer(s, 'down')).toBe(true)
    expect(s.py).toBe(4)
    expect(movePlayer(s, 'up')).toBe(true)
    expect(s.py).toBe(3)
    // 边界外不可走；烧毁建筑（废墟本体）仍不可走，烧毁草地可走。
    s.px = 0
    s.py = 0
    expect(movePlayer(s, 'left')).toBe(false)
    expect(movePlayer(s, 'up')).toBe(false)
    s.grid[0]![1]!.kind = 'building'
    s.grid[0]![1]!.burnt = true
    expect(walkable(s, 1, 0)).toBe(false)
    s.grid[1]![0]!.kind = 'grass'
    s.grid[1]![0]!.burnt = true
    expect(walkable(s, 0, 1)).toBe(true)
  })

  it('computes the 4-tile cone spray cell set', () => {
    const right = sprayCells(5, 5, 'right')
    const key = (x: number, y: number): string => x + ',' + y
    const set = new Set(right.map(c => key(c.x, c.y)))
    expect(right.length).toBe(12)
    expect(set.has(key(6, 5))).toBe(true)
    expect(set.has(key(7, 4))).toBe(true)
    expect(set.has(key(7, 6))).toBe(true)
    expect(set.has(key(8, 4))).toBe(true)
    expect(set.has(key(9, 3))).toBe(true)
    expect(set.has(key(9, 7))).toBe(true)
    expect(set.has(key(10, 5))).toBe(false)
    // 朝上时是横向锥的转置。
    const up = sprayCells(5, 5, 'up')
    expect(up.some(c => c.x === 4 && c.y === 3)).toBe(true)
    expect(up.some(c => c.x === 5 && c.y === 4)).toBe(true)
    expect(up.some(c => c.x === 3 && c.y === 1)).toBe(true)
    // 短射程截断。
    expect(sprayCells(0, 0, 'down', 2).length).toBe(4)
  })

  it('sprays water: -3 per hit, extinguish at zero, cone-respecting, blocked when hurt', () => {
    const s = createState(5, 1)
    sandbox(s)
    s.px = 4
    s.py = 3
    s.facing = 'right'
    s.grid[3]![6]!.kind = 'building'
    s.grid[3]![6]!.fire = 6
    s.grid[4]![7]!.kind = 'grass'
    s.grid[4]![7]!.fire = 2
    const out = applyWater(s)
    expect(out).toBe(1)
    expect(s.grid[3]![6]!.fire).toBe(6 - WATER_DMG)
    expect(s.grid[4]![7]!.fire).toBe(0)
    expect(s.phase).toBe('play') // 建筑火仍剩 3 点，未全灭
    expect(applyWater(s)).toBe(1)
    expect(s.grid[3]![6]!.fire).toBe(0)
    expect(s.phase).toBe('clear') // 场上火点全部扑灭即过关
    // 冷却中喷水无效。
    const h = createState(5, 1)
    sandbox(h)
    h.px = 4
    h.py = 3
    h.facing = 'right'
    h.grid[3]![5]!.kind = 'grass'
    h.grid[3]![5]!.fire = 3
    h.cooldown = 1
    expect(applyWater(h)).toBe(0)
    expect(h.grid[3]![5]!.fire).toBe(3)
  })

  it('fire ticks grow intensity and burn buildings to lossy ruins, grass to lossless ash', () => {
    const s = createState(9, 1)
    sandbox(s)
    s.grid[2]![2]!.kind = 'building'
    s.grid[2]![2]!.fire = 5
    s.grid[2]![4]!.kind = 'grass'
    s.grid[2]![4]!.fire = 2
    // rng 极大值：蔓延恒不触发，隔离增长/燃尽路径。
    s.rng = () => 0.999
    fireTick(s)
    const ruin = s.grid[2]![2]!
    expect(ruin.fire).toBe(0)
    expect(ruin.burnt).toBe(true)
    expect(ruin.kind).toBe('building')
    expect(s.levelLoss).toBe(1)
    expect(s.totalLoss).toBe(1)
    const ash = s.grid[2]![4]!
    expect(ash.burnt).toBe(true)
    // 强度增长但未达燃值：火仍在，不新增损失。
    s.grid[2]![6]!.kind = 'building'
    s.grid[2]![6]!.fire = 2
    s.phase = 'play' // 上一 tick 已全灭进入过关展示，手工回到战斗相位
    fireTick(s)
    expect(s.grid[2]![6]!.fire).toBe(3)
    expect(s.levelLoss).toBe(1)
    expect(s.phase).toBe('play')
  })

  it('spreads through the seeded probability flow with wind bias', () => {
    const s = createState(21, 2) // 第 2 关：风向东 [1, 0]
    sandbox(s)
    const rolls: number[] = [0.2, 0.2]
    let i = 0
    s.rng = () => rolls[Math.min(i, rolls.length - 1)]!
    s.grid[0]![0]!.kind = 'grass'
    s.grid[0]![0]!.fire = 1
    s.grid[0]![1]!.kind = 'building' // 东侧下风：0.18 × 1.8 = 0.324
    s.grid[1]![0]!.kind = 'building' // 南侧侧风：0.18 × 1 = 0.18
    fireTick(s)
    expect(s.grid[0]![1]!.fire).toBe(1) // 0.2 < 0.324：下风被引燃
    expect(s.grid[1]![0]!.fire).toBe(0) // 0.2 > 0.18：侧风未被引燃
    // 极端 rng：0 恒燃、1 恒不燃。
    const a = createState(21, 1)
    sandbox(a)
    a.px = a.startX
    a.grid[3]![3]!.kind = 'grass'
    a.grid[3]![3]!.fire = 1
    a.grid[3]![4]!.kind = 'grass'
    a.grid[4]![3]!.kind = 'grass'
    a.grid[2]![3]!.kind = 'building'
    a.rng = () => 0
    fireTick(a)
    expect(a.grid[3]![4]!.fire).toBe(1)
    expect(a.grid[4]![3]!.fire).toBe(1)
    expect(a.grid[2]![3]!.fire).toBe(1)
    const b = createState(21, 1)
    sandbox(b)
    b.grid[3]![3]!.kind = 'grass'
    b.grid[3]![3]!.fire = 1
    b.grid[3]![4]!.kind = 'grass'
    b.rng = () => 1
    fireTick(b)
    expect(b.grid[3]![4]!.fire).toBe(0)
  })

  it('injures the firefighter touching fire: pulled back to start with a 3s cooldown', () => {
    const s = createState(31, 1)
    sandbox(s)
    s.px = 4
    s.py = 3
    s.grid[3]![4]!.kind = 'empty'
    s.grid[2]![4]!.kind = 'grass'
    s.grid[2]![4]!.fire = 1
    s.spraying = true
    expect(movePlayer(s, 'up')).toBe(true)
    expect(s.px).toBe(s.startX)
    expect(s.py).toBe(s.startY)
    expect(s.cooldown).toBe(INJURE_COOLDOWN)
    expect(s.spraying).toBe(false)
    // 冷却中不能移动，随时间衰减后恢复（先清掉火源避免火势 tick 全灭跳相位）。
    expect(movePlayer(s, 'left')).toBe(false)
    // 冷却期间让该格转成高燃值建筑火并保持 1 点：火势 tick 只增长到 4，
// 不燃尽也就不会全灭跳相位，冷却得以完整衰减。
    s.grid[2]![4]!.kind = 'building'
    s.grid[2]![4]!.fire = 1
    s.rng = () => 0.999 // 冻结蔓延，隔离冷却衰减
    for (let i = 0; i < 6; i += 1) step(s, 0.5)
    expect(s.cooldown).toBe(0)
    // 冷却结束恢复移动：起点四邻中至少一格可走（盘面保证存在）。
    const dirs = ['up', 'down', 'left', 'right'] as const
    expect(dirs.some(d => walkable(s, s.px + (d === 'left' ? -1 : d === 'right' ? 1 : 0), s.py + (d === 'up' ? -1 : d === 'down' ? 1 : 0)))).toBe(true)
    for (const d of dirs) {
      if (movePlayer(s, d)) break
    }
    expect(s.cooldown).toBe(0)
  })

  it('clears a level, advances the bigger/windier board, and wins after level 5', () => {
    const s = createState(41, 1)
    sandbox(s)
    s.px = 4
    s.py = 3
    s.facing = 'right'
    s.grid[3]![5]!.kind = 'grass'
    s.grid[3]![5]!.fire = 3
    applyWater(s)
    expect(s.phase).toBe('clear')
    expect(s.score).toBe(levelBonus(0))
    expect(s.clearTimer).toBe(CLEAR_TIME)
    step(s, CLEAR_TIME + 0.01)
    expect(s.phase).toBe('play')
    expect(s.level).toBe(2)
    expect(s.grid.length).toBe(LEVELS[1]!.h)
    expect(s.scoreAtLevelStart).toBe(s.score)
    // 直通最终关：扑灭后进入整局通关。
    const last = createState(41, 5)
    sandbox(last)
    last.px = 6
    last.py = 4
    last.facing = 'right'
    last.grid[4]![7]!.kind = 'grass'
    last.grid[4]![7]!.fire = 1
    applyWater(last)
    expect(last.phase).toBe('clear')
    step(last, CLEAR_TIME + 0.01)
    expect(last.phase).toBe('won')
    expect(last.level).toBe(5)
  })

  it('scores level bonuses with a loss penalty and a floor, and restart rolls back', () => {
    expect(levelBonus(0)).toBe(900)
    expect(levelBonus(1)).toBe(750)
    expect(levelBonus(6)).toBe(100)
    const s = createState(51, 1)
    const before = s.scoreAtLevelStart
    sandbox(s)
    s.grid[2]![2]!.kind = 'building'
    s.grid[2]![2]!.fire = 5
    s.grid[2]![4]!.kind = 'grass'
    s.grid[2]![4]!.fire = 2
    s.rng = () => 0.999
    fireTick(s) // 建筑烧毁 +1 损失
    s.px = 2
    s.py = 3
    s.facing = 'up'
    s.grid[1]![2]!.kind = 'grass'
    s.grid[1]![2]!.fire = 1
    applyWater(s) // 扑灭余火过关
    expect(s.phase).toBe('clear')
    expect(s.score).toBe(levelBonus(1))
    restartLevel(s)
    expect(s.score).toBe(before)
    expect(s.level).toBe(1)
    expect(s.totalLoss).toBe(0)
    expect(fireCount(s)).toBe(LEVELS[0]!.fires) // 同 seed 重生成同布局
  })

  it('replays a whole game identically from one seed', () => {
    const run = (): string => {
      const s = createState(4242, 1)
      const dirs = ['up', 'right', 'down', 'left'] as const
      for (let i = 0; i < 60; i += 1) {
        if (i % 5 !== 4) movePlayer(s, dirs[i % 4]!)
        s.spraying = i % 3 === 0
        step(s, 0.05)
        if (s.phase !== 'play') break
      }
      return JSON.stringify({ grid: s.grid, px: s.px, py: s.py, score: s.score, loss: s.totalLoss, cd: s.cooldown })
    }
    expect(run()).toBe(run())
    // mulberry32 本身确定且分布均匀。
    const rng = mulberry32(99)
    const a = [rng(), rng(), rng(), rng()]
    const rng2 = mulberry32(99)
    expect([rng2(), rng2(), rng2(), rng2()]).toEqual(a)
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})
