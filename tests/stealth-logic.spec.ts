import { describe, expect, it } from 'vitest'
import {
  ALERT_MAX, ALERT_RANGE_BONUS, CAUGHT_FLASH_MS, DIAMOND_SCORE, CLEAR_BASE, CLEAR_LIFE_BONUS,
  HEARING_RADIUS, LEVEL_COUNT, START_LIVES,
  createStealthState, doBeat, effectiveRange, generateRoom, guardSees, hasLineOfSight,
  isWall, levelConfig, movePlayer, spotPlayer, stepGuard, tickStealth,
  type Cell, type Facing, type GuardRoute, type GuardState, type StealthState,
} from '../src/client/games/stealth/logic.ts'

const SEEDS = [1, 42, 0x9e3779b9, 123456789, 20261121]

/** 手工搭一个 9×9 全地板（仅边框墙）测试态，守卫与玩家按需摆放。 */
function openState(level = 1): StealthState {
  const state = createStealthState(SEEDS[0]!, level)
  const cols = 9
  const rows = 9
  const walls = new Uint8Array(cols * rows)
  for (let x = 0; x < cols; x += 1) { walls[x] = 1; walls[(rows - 1) * cols + x] = 1 }
  for (let y = 0; y < rows; y += 1) { walls[y * cols] = 1; walls[y * cols + cols - 1] = 1 }
  state.cols = cols
  state.rows = rows
  state.walls = walls
  state.start = { x: 1, y: 1 }
  state.safe = { x: 7, y: 7 }
  state.player = { x: 1, y: 1 }
  state.diamonds = []
  state.guards = []
  return state
}

/** 造一个测试守卫。 */
function makeGuard(x: number, y: number, facing: Facing, range: number, cells?: Cell[], loop = false): GuardState {
  const route: GuardRoute = {
    cells: cells ?? [{ x, y }, { x: x + 1, y }],
    loop, cadence: 1, phase: 0, startIndex: 0, startSign: 1,
  }
  return {
    x, y, facing, cells: route.cells, loop, index: 0, sign: 1,
    cadence: 1, phase: 0, startIndex: 0, startSign: 1,
    range, alert: 0, lastAlertBeat: -999, alertedUntilBeat: -1,
  }
}

describe('stealth logic', () => {
  it('同 seed 重放生成完全一致的盘面', () => {
    for (const seed of SEEDS) {
      for (const level of [1, 3, 5]) {
        const a = generateRoom(seed, level)
        const b = generateRoom(seed, level)
        expect([...a.walls]).toEqual([...b.walls])
        expect(a.start).toEqual(b.start)
        expect(a.safe).toEqual(b.safe)
        expect(a.diamonds).toEqual(b.diamonds)
        expect(a.routes).toEqual(b.routes)
      }
    }
  })

  it('生成的盘面满足布局约束：地板、可达、出生点不被照到', () => {
    for (const seed of SEEDS) {
      for (let level = 1; level <= LEVEL_COUNT; level += 1) {
        const cfg = levelConfig(level)
        const state = createStealthState(seed, level)
        expect(isWall(state, state.start.x, state.start.y)).toBe(false)
        expect(isWall(state, state.safe.x, state.safe.y)).toBe(false)
        expect(state.guards.length).toBe(cfg.guards)
        expect(state.diamonds.length).toBe(cfg.diamonds)
        // 可达性：BFS 验证起点能到保险柜与每颗钻石。
        const seen = new Set<number>([state.start.y * state.cols + state.start.x])
        const queue: Cell[] = [state.start]
        while (queue.length > 0) {
          const c = queue.shift()!
          for (const d of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
            const nx = c.x + d[0]
            const ny = c.y + d[1]
            const key = ny * state.cols + nx
            if (seen.has(key) || isWall(state, nx, ny)) continue
            seen.add(key)
            queue.push({ x: nx, y: ny })
          }
        }
        expect(seen.has(state.safe.y * state.cols + state.safe.x)).toBe(true)
        for (const gem of state.diamonds) expect(seen.has(gem.y * state.cols + gem.x)).toBe(true)
        // 出生点安全：初始无守卫照到起点；路线全在地板上。
        state.player = { ...state.start }
        expect(spotPlayer(state)).toBe(false)
        for (const g of state.guards) {
          for (const c of g.cells) expect(isWall(state, c.x, c.y)).toBe(false)
        }
      }
    }
  })

  it('关卡递进：守卫数与视野不降、节拍不减、听觉仅第 4 关起', () => {
    for (let level = 2; level <= LEVEL_COUNT; level += 1) {
      const prev = levelConfig(level - 1)
      const cur = levelConfig(level)
      expect(cur.guards).toBeGreaterThanOrEqual(prev.guards)
      expect(cur.range).toBeGreaterThanOrEqual(prev.range)
      expect(cur.beatMs).toBeLessThanOrEqual(prev.beatMs)
    }
    expect(levelConfig(3).hearing).toBe(false)
    expect(levelConfig(4).hearing).toBe(true)
    expect(levelConfig(5).hearing).toBe(true)
  })

  it('玩家移动：撞墙不动、可走格移动、吃钻石加分', () => {
    const state = openState()
    state.player = { x: 3, y: 3 }
    state.walls[2 * 9 + 3] = 1 // (3,2) 立墙
    const blocked = movePlayer(state, 'up')
    expect(blocked.moved).toBe(false)
    expect(state.player).toEqual({ x: 3, y: 3 })
    state.walls[2 * 9 + 3] = 0
    state.diamonds = [{ x: 3, y: 4, taken: false }]
    const pick = movePlayer(state, 'down')
    expect(pick.moved).toBe(true)
    expect(pick.diamond).toBe(true)
    expect(state.diamonds[0]!.taken).toBe(true)
    expect(state.score).toBe(DIAMOND_SCORE)
    state.player = { x: 1, y: 4 }
    expect(movePlayer(state, 'left').moved).toBe(false) // 边框墙
  })

  it('守卫节拍巡逻：折返与环形路线按 cadence 步进且朝向跟随', () => {
    const patrol = makeGuard(2, 2, { dx: 1, dy: 0 }, 3,
      [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }])
    stepGuard(patrol)
    expect(patrol.x).toBe(3)
    expect(patrol.facing).toEqual({ dx: 1, dy: 0 })
    stepGuard(patrol)
    expect(patrol.x).toBe(4)
    stepGuard(patrol)
    expect(patrol.x).toBe(3) // 端点折返
    expect(patrol.facing).toEqual({ dx: -1, dy: 0 })
    const loop = makeGuard(2, 5, { dx: 1, dy: 0 }, 3,
      [{ x: 2, y: 5 }, { x: 3, y: 5 }, { x: 3, y: 6 }, { x: 2, y: 6 }], true)
    for (let i = 0; i < 4; i += 1) stepGuard(loop)
    expect({ x: loop.x, y: loop.y }).toEqual({ x: 2, y: 5 }) // 环形回到起点
    // cadence=2：隔拍才走。
    const slow = makeGuard(2, 7, { dx: 1, dy: 0 }, 3, [{ x: 2, y: 7 }, { x: 3, y: 7 }, { x: 4, y: 7 }])
    slow.cadence = 2
    const state = openState()
    state.guards = [slow]
    state.player = { x: 7, y: 1 }
    doBeat(state)
    expect(slow.x).toBe(2) // 第 1 拍不动
    doBeat(state)
    expect(slow.x).toBe(3) // 第 2 拍走
  })

  it('视野锥判定：距离、扇形张角与朝向', () => {
    const state = openState()
    const guard = makeGuard(4, 4, { dx: 1, dy: 0 }, 5)
    state.guards = [guard]
    state.player = { x: 6, y: 4 }
    expect(guardSees(state, guard, state.player)).toBe(true) // 正前方
    state.player = { x: 3, y: 4 }
    expect(guardSees(state, guard, state.player)).toBe(false) // 背后
    state.player = { x: 6, y: 6 }
    expect(guardSees(state, guard, state.player)).toBe(true) // 恰好 45° 边界
    state.player = { x: 5, y: 7 }
    expect(guardSees(state, guard, state.player)).toBe(false) // 超出张角
    guard.range = 2
    state.player = { x: 7, y: 4 }
    expect(guardSees(state, guard, state.player)).toBe(false) // 超出距离
  })

  it('墙遮挡：视线 raycast 被墙格截断', () => {
    const state = openState()
    state.walls[4 * 9 + 5] = 1 // (5,4) 立墙
    const guard = makeGuard(4, 4, { dx: 1, dy: 0 }, 5)
    state.guards = [guard]
    expect(isWall(state, 5, 4)).toBe(true)
    expect(hasLineOfSight(state, { x: 4, y: 4 }, { x: 6, y: 4 })).toBe(false)
    state.player = { x: 6, y: 4 }
    expect(guardSees(state, guard, state.player)).toBe(false) // 墙后盲区
    state.player = { x: 6, y: 6 }
    expect(guardSees(state, guard, state.player)).toBe(true) // 45° 斜视线经 (5,5) 绕过墙
  })

  it('被抓：扣命回起点、守卫复位、红闪期间禁止移动、命尽 gameover', () => {
    const state = openState()
    const guard = makeGuard(1, 3, { dx: 0, dy: -1 }, 5,
      [{ x: 1, y: 5 }, { x: 1, y: 4 }, { x: 1, y: 3 }])
    guard.index = 2
    guard.x = 1
    guard.y = 3
    guard.startIndex = 2
    guard.cadence = 99 // 本拍不走，隔离「步进改变视野」的影响
    state.guards = [guard]
    state.player = { x: 1, y: 1 }
    expect(spotPlayer(state)).toBe(true)
    expect(doBeat(state)).toBe(true) // 节拍末判定被抓
    expect(state.lives).toBe(START_LIVES - 1)
    expect(state.player).toEqual(state.start)
    expect(state.caughtFlashMs).toBe(CAUGHT_FLASH_MS)
    expect(guard.index).toBe(guard.startIndex) // 守卫同步复位
    const stunned = movePlayer(state, 'right')
    expect(stunned.moved).toBe(false) // 红闪击晕
    state.caughtFlashMs = 0
    state.lives = 1
    state.player = { x: 1, y: 2 }
    state.guards = [makeGuard(1, 4, { dx: 0, dy: -1 }, 5)]
    expect(movePlayer(state, 'down').moved).toBe(true)
    expect(state.status).toBe('gameover') // 最后一条命耗尽
  })

  it('过关：踏上保险柜即 cleared 并按公式加分', () => {
    const state = openState()
    state.lives = 2
    state.score = 30
    state.player = { x: 7, y: 6 }
    const res = movePlayer(state, 'down')
    expect(res.moved).toBe(true)
    expect(res.cleared).toBe(true)
    expect(state.status).toBe('cleared')
    expect(state.score).toBe(30 + CLEAR_BASE + 2 * CLEAR_LIFE_BONUS)
  })

  it('听觉警觉：连续快速移动累积警觉、满格扩锥、随节拍衰减', () => {
    const state = openState(4)
    // 守卫背对玩家朝上，测试期间玩家始终在其锥外。
    const guard = makeGuard(3, 3, { dx: 0, dy: -1 }, 3)
    state.guards = [guard]
    state.player = { x: 3 + HEARING_RADIUS, y: 4 }
    // 同拍内连续移动 = 加速：交替下/上 6 次把警觉推满。
    for (let i = 0; i < 6; i += 1) {
      const r = movePlayer(state, i % 2 === 0 ? 'down' : 'up')
      expect(r.moved).toBe(true)
      expect(r.caught).toBe(false)
    }
    expect(guard.alert).toBe(ALERT_MAX)
    expect(effectiveRange(state, guard)).toBe(guard.range + ALERT_RANGE_BONUS)
    // 无增益节拍流逝：扩锥到期且警觉逐步衰减到 0。
    for (let i = 0; i < 30; i += 1) {
      state.player = { x: 8, y: 1 }
      doBeat(state)
    }
    expect(guard.alert).toBe(0)
    expect(effectiveRange(state, guard)).toBe(guard.range)
    // 第 3 关（无听觉）同样连移不涨警觉。
    const quiet = openState(3)
    const g2 = makeGuard(3, 3, { dx: 1, dy: 0 }, 3)
    quiet.guards = [g2]
    quiet.player = { x: 5, y: 3 }
    movePlayer(quiet, 'up')
    movePlayer(quiet, 'down')
    expect(g2.alert).toBe(0)
  })

  it('tickStealth：按关卡节拍间隔确定性推进守卫', () => {
    const state = openState(1)
    const guard = makeGuard(2, 4, { dx: 1, dy: 0 }, 2,
      [{ x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }])
    state.guards = [guard]
    state.player = { x: 7, y: 7 }
    const interval = levelConfig(1).beatMs
    tickStealth(state, interval - 1)
    expect(state.beats).toBe(0)
    tickStealth(state, 1)
    expect(state.beats).toBe(1)
    expect(guard.x).toBe(3)
    // 一次性大 dt（多拍累积）也按拍推进且不瞬移穿墙。
    tickStealth(state, interval * 2 + 5)
    expect(state.beats).toBe(3)
    // 红闪随时间衰减到 0。
    state.caughtFlashMs = 100
    tickStealth(state, 150)
    expect(state.caughtFlashMs).toBe(0)
  })
})
