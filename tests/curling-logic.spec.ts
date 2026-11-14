import { describe, expect, it } from 'vitest'
import {
  BASE_FRICTION_K, ENDS_TOTAL, HOUSE_R, HOUSE_X, HOUSE_Y, HACK_X, HACK_Y,
  SHEET_LEN, STONE_R, STONES_PER_SIDE, STONE_RESTITUTION, SWEEP_CHARGES,
  SWEEP_DURATION,
  SWEEP_K_FACTOR, WALL_RESTITUTION, createGame, step, lockAim, lockPower,
  startSweep, endSweep, scoreHouse, aiPlan, beginNext, restartMatch, resolveStoneCollision,
  swingAngle, powerAt,
} from '../src/client/games/curling/logic.ts'
import type { CurlingState, Side, Stone } from '../src/client/games/curling/logic.ts'

/**
 * 构造一枚静止壶（测试放置用）。
 * @param side - 所属方。
 * @param x - x 坐标。
 * @param y - y 坐标。
 */
function mkStone(side: Side, x: number, y: number): Stone {
  return { side, x, y, vx: 0, vy: 0, atRest: true, rot: 0 }
}

/**
 * 以指定角度/力度代表玩家完成一次掷壶（绕过摆针，直接注入锁定值）。
 * @param state - 比赛状态（需处于 aimDir 阶段）。
 * @param angle - 锁定的方向角。
 * @param power - 锁定的力度 0..1。
 */
function playerThrow(state: CurlingState, angle: number, power: number): void {
  state.aimAngle = angle
  expect(lockAim(state)).toBe(true)
  state.power = power
  expect(lockPower(state)).toBe(true)
}

/**
 * 推进直到本回合所有壶静止（AI 自动掷壶会被同一循环消化掉）。
 * @param state - 比赛状态。
 */
function settle(state: CurlingState): void {
  for (let i = 0; i < 5000 && state.phase === 'sliding'; i += 1) {
    step(state, 1 / 60)
  }
  expect(state.phase).not.toBe('sliding')
}

/**
 * 打完一整场（3 局）：玩家始终中线满力附近掷壶，局间确认进入下一局。
 * @param seed - 种子。
 * @returns 每局得分与最终总分。
 */
function playMatch(seed: number): {
  endScores: { p: number; a: number }[]
  playerTotal: number
  aiTotal: number
  lastMsg: string
} {
  const state = createGame(seed)
  for (let end = 1; end <= ENDS_TOTAL; end += 1) {
    let guard = 0
    while (state.phase === 'aimDir' && guard < 20) {
      guard += 1
      playerThrow(state, 0, 0.95)
      settle(state)
    }
    expect(state.phase).toBe('endScore')
    beginNext(state)
  }
  return {
    endScores: state.endScores,
    playerTotal: state.playerTotal,
    aiTotal: state.aiTotal,
    lastMsg: state.msg,
  }
}

describe('curling logic', () => {
  it('同种子两场比赛完全一致（AI 与摆针时序确定）', () => {
    const a = playMatch(42)
    const b = playMatch(42)
    expect(b.endScores).toEqual(a.endScores)
    expect(b.playerTotal).toBe(a.playerTotal)
    expect(b.aiTotal).toBe(a.aiTotal)
    expect(a.endScores.length).toBe(ENDS_TOTAL)
  })

  it('瞄准/力度锁定推进阶段并掷壶', () => {
    const state = createGame(7)
    expect(state.phase).toBe('aimDir')
    step(state, 0.5)
    expect(state.aimAngle).toBeCloseTo(swingAngle(state.aimT), 12)
    expect(state.aimT).toBeCloseTo(0.5, 12)
    expect(lockAim(state)).toBe(true)
    expect(state.phase).toBe('aimPower')
    expect(state.power).toBe(0)
    step(state, 0.3)
    expect(state.power).toBeCloseTo(powerAt(state.powerT), 12)
    expect(state.power).toBeGreaterThanOrEqual(0)
    expect(state.power).toBeLessThanOrEqual(1)
    // 阶段不符时锁定失败
    expect(lockAim(state)).toBe(false)
    expect(lockPower(state)).toBe(true)
    expect(state.phase).toBe('sliding')
    expect(state.stones.length).toBe(1)
    expect(state.thrownP).toBe(1)
    expect(state.thrownStone?.side).toBe('P')
    expect(state.events.some(e => e.kind === 'throw' && e.side === 'P')).toBe(true)
    // 已不在 aimPower，再锁力度无效
    expect(lockPower(state)).toBe(false)
  })

  it('摩擦指数滑行并按停止阈值归零', () => {
    const state = createGame(3)
    state.phase = 'sliding'
    const v0 = 30
    const stone = mkStone('P', 50, 30)
    stone.atRest = false
    stone.vx = v0
    state.stones.push(stone)
    // 单步衰减符合 v *= exp(-BASE_FRICTION_K * h)
    step(state, 1 / 60)
    expect(stone.vx).toBeCloseTo(v0 * Math.exp(-BASE_FRICTION_K / 60), 6)
    // 继续推进直到静止：速度清零、位移不超过理论滑距 (v0 - STOP)/k
    for (let i = 0; i < 5000 && !stone.atRest; i += 1) step(state, 1 / 60)
    expect(stone.atRest).toBe(true)
    expect(stone.vx).toBe(0)
    expect(stone.vy).toBe(0)
    expect(stone.x - 50).toBeLessThanOrEqual(v0 / BASE_FRICTION_K)
    expect(state.phase).not.toBe('sliding')
  })

  it('擦冰降低摩擦且受次数限制', () => {
    const plain = createGame(5)
    plain.phase = 'sliding'
    const p = mkStone('P', 60, 30)
    p.atRest = false
    p.vx = 40
    plain.stones.push(p)
    const swept = createGame(5)
    swept.phase = 'sliding'
    const q = mkStone('P', 60, 30)
    q.atRest = false
    q.vx = 40
    swept.stones.push(q)
    swept.thrownStone = q
    swept.sweepActive = true
    swept.sweepTimer = 99
    step(plain, 0.5)
    step(swept, 0.5)
    // 擦冰摩擦为 BASE_FRICTION_K * SWEEP_K_FACTOR，保留更多速度
    expect(q.vx).toBeCloseTo(40 * Math.exp(-BASE_FRICTION_K * SWEEP_K_FACTOR * 0.5), 4)
    expect(q.vx).toBeGreaterThan(p.vx)
    expect(p.vx).toBeCloseTo(40 * Math.exp(-BASE_FRICTION_K * 0.5), 4)
    // 次数限制：SWEEP_CHARGES 次后不可再擦；松开不返还
    const s = createGame(9)
    s.phase = 'sliding'
    const mine = mkStone('P', 80, 30)
    mine.atRest = false
    mine.vx = 45
    s.stones.push(mine)
    s.thrownStone = mine
    expect(startSweep(s)).toBe(true)
    expect(s.sweepCharges).toBe(SWEEP_CHARGES - 1)
    step(s, SWEEP_DURATION + 0.1) // 等本次擦冰自然结束
    expect(s.sweepActive).toBe(false)
    expect(startSweep(s)).toBe(true)
    endSweep(s) // 提前松开，不返还次数
    expect(startSweep(s)).toBe(true)
    expect(s.sweepCharges).toBe(0)
    expect(startSweep(s)).toBe(false)
    // 无本回合玩家壶时不可擦
    s.thrownStone = null
    s.phase = 'sliding'
    expect(startSweep(s)).toBe(false)
  })

  it('双壶弹性碰撞：法向动量交换并分离', () => {
    // 正碰 e=1：等质量完全交换法向速度
    const a = mkStone('P', 30, 30)
    const b = mkStone('A', 34.9, 30)
    a.atRest = false
    a.vx = 10
    expect(resolveStoneCollision(a, b, 1)).toBe(true)
    expect(a.vx).toBeCloseTo(0, 8)
    expect(b.vx).toBeCloseTo(10, 8)
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(STONE_R * 2, 8)
    // 游戏恢复系数：法向动量守恒（等质量和恒定）
    const c = mkStone('P', 60, 30)
    const d = mkStone('A', 64, 30)
    c.atRest = false
    c.vx = 12
    d.vx = -2
    expect(resolveStoneCollision(c, d, STONE_RESTITUTION)).toBe(true)
    expect(c.vx + d.vx).toBeCloseTo(10, 8)
    expect(Math.hypot(d.x - c.x, d.y - c.y)).toBeGreaterThanOrEqual(STONE_R * 2 - 1e-9)
    // 已在分离的接触对不处理
    const e = mkStone('P', 100, 30)
    const f = mkStone('A', 104.9, 30)
    e.vx = -3
    f.vx = 2
    expect(resolveStoneCollision(e, f, STONE_RESTITUTION)).toBe(false)
    expect(e.vx).toBe(-3)
  })

  it('出界反弹按挡板恢复系数处理', () => {
    const state = createGame(11)
    state.phase = 'sliding'
    const wall = mkStone('P', 100, STONE_R - 1)
    wall.atRest = false
    wall.vx = 5
    wall.vy = -10
    state.stones.push(wall)
    state.thrownStone = wall
    step(state, 1 / 60)
    expect(wall.y).toBeCloseTo(STONE_R, 8)
    expect(wall.vy).toBeCloseTo(10 * WALL_RESTITUTION, 1)
    // 后挡板近乎吸能
    const state2 = createGame(11)
    state2.phase = 'sliding'
    const back = mkStone('P', 209, 30)
    back.atRest = false
    back.vx = 50
    state2.stones.push(back)
    state2.thrownStone = back
    step(state2, 1 / 60)
    expect(back.x).toBeCloseTo(SHEET_LEN - STONE_R, 8)
    expect(back.vx).toBeCloseTo(-(50 * 0.12) * Math.exp(-BASE_FRICTION_K / 60), 2)
    expect(back.vx).toBeLessThan(0)
  })

  it('scoreHouse 按距圆心最近一方计分', () => {
    const d = (r: number) => ({ x: HOUSE_X + r, y: HOUSE_Y })
    // 空营 0:0
    expect(scoreHouse([mkStone('P', 0, 0), mkStone('A', HOUSE_X - HOUSE_R - 1, HOUSE_Y)])
      ).toEqual({ p: 0, a: 0 })
    // 玩家最近，且在对方最近壶前有 2 枚 → 2 分
    expect(scoreHouse([
      mkStone('A', d(14).x, HOUSE_Y),
      mkStone('P', d(6).x, HOUSE_Y),
      mkStone('P', d(3).x, HOUSE_Y),
      mkStone('P', HOUSE_X - HOUSE_R - 1, HOUSE_Y), // 营外不计
    ])).toEqual({ p: 2, a: 0 })
    // AI 最近 → AI 得分
    expect(scoreHouse([
      mkStone('P', d(8).x, HOUSE_Y),
      mkStone('A', d(2).x, HOUSE_Y),
      mkStone('A', d(9).x, HOUSE_Y),
    ])).toEqual({ p: 0, a: 1 }) // 对方最近壶之前的营内壶数才计分
  })

  it('AI 计划同种子确定并按局势选模式', () => {
    const target = mkStone('P', HOUSE_X + 2, HOUSE_Y + 1)
    const plan1 = aiPlan([target], createGame(21).rng)
    const plan2 = aiPlan([target], createGame(21).rng)
    expect(plan2).toEqual(plan1)
    expect(plan1.mode).toBe('takeout')
    const expected = Math.atan2(target.y - HACK_Y, target.x - HACK_X)
    expect(Math.abs(plan1.angle - expected)).toBeLessThanOrEqual(0.05)
    expect(plan1.power).toBeGreaterThan(0.78)
    expect(plan1.power).toBeLessThanOrEqual(1)
    // 无对方营内壶 → draw 模式，小角度中低力
    const draw1 = aiPlan([], createGame(33).rng)
    const draw2 = aiPlan([], createGame(33).rng)
    expect(draw2).toEqual(draw1)
    expect(draw1.mode).toBe('draw')
    expect(Math.abs(draw1.angle)).toBeLessThanOrEqual(0.14)
    expect(draw1.power).toBeGreaterThan(0.78)
    // 不同种子产生（允许）不同计划，但均为合法区间
    const other = aiPlan([], createGame(34).rng)
    expect(other.power).toBeGreaterThan(0.78)
    expect(other.power).toBeLessThanOrEqual(1)
  })

  it('整场流程：逐局计分、局间推进、3 局后结束', () => {
    const state = createGame(100)
    const totals: { p: number; a: number }[] = []
    for (let end = 1; end <= ENDS_TOTAL; end += 1) {
      let guard = 0
      while (state.phase === 'aimDir' && guard < 20) {
        guard += 1
        playerThrow(state, 0, 0.95)
        settle(state)
      }
      expect(state.phase).toBe('endScore')
      expect(state.thrownP).toBe(STONES_PER_SIDE)
      expect(state.thrownA).toBe(STONES_PER_SIDE)
      const sc = state.endScores[end - 1]!
      expect(sc).toBeDefined()
      expect(state.events.some(e => e.kind === 'end')).toBe(true)
      totals.push(sc)
      beginNext(state)
      if (end < ENDS_TOTAL) {
        expect(state.phase).toBe('aimDir')
        expect(state.end).toBe(end + 1)
        expect(state.stones.length).toBe(0)
        expect(state.thrownP).toBe(0)
      } else {
        expect(state.phase).toBe('gameOver')
        expect(state.events.some(e => e.kind === 'game')).toBe(true)
      }
    }
    const sumP = totals.reduce((acc, s) => acc + s.p, 0)
    const sumA = totals.reduce((acc, s) => acc + s.a, 0)
    expect(state.playerTotal).toBe(sumP)
    expect(state.aiTotal).toBe(sumA)
    expect(state.playerTotal + state.aiTotal).toBeGreaterThan(0) // 满力掷壶必有营内壶
    // 结束后 step 不再推进，beginNext 无效
    step(state, 1)
    expect(state.phase).toBe('gameOver')
    // restartMatch 重置整场（含局数、壶面与已掷计数）
    restartMatch(state, 100)
    expect(state.phase).toBe('aimDir')
    expect(state.stones).toEqual([])
    expect(state.end).toBe(1)
    expect(state.playerTotal).toBe(0)
    expect(state.thrownP).toBe(0)
  })
})
