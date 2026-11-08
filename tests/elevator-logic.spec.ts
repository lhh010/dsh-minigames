import { describe, expect, it } from 'vitest'
import {
  CAPACITY, DOOR_OPEN_S, FLOORS, INITIAL_SATISFACTION, WAIT_TIMEOUT_S,
  createElevatorState, nextSpawnInterval, setTarget, stepElevator, waitingAt,
  type ElevatorState, type Passenger,
} from '../src/client/games/elevator/logic.ts'

/** mulberry32：种子随机源，保证生成序列可复现。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 直接往状态里塞一名等待乘客（绕过随机生成，测试可控）。 */
function addWaiting(state: ElevatorState, from: number, to: number): Passenger {
  const p: Passenger = { id: state.nextId, from, to, waited: 0 }
  state.nextId += 1
  state.waiting.push(p)
  return p
}

/** 推进 seconds 秒（固定 1/60 帧），返回到达目标层时的模拟时刻（若到达）。 */
function runUntilArrival(state: ElevatorState, seconds: number): number | null {
  for (let i = 0; i < seconds * 60; i += 1) {
    const before = state.t
    stepElevator(state, 1 / 60)
    if (state.phase !== 'moving' && state.pos === Math.round(state.pos) && state.target === null) {
      return before === state.t ? state.t : state.t
    }
  }
  return null
}

describe('elevator logic', () => {
  it('初始状态：电梯停在 1 层待命，满意度满值，无乘客', () => {
    const state = createElevatorState(mulberry32(42))
    expect(state.pos).toBe(1)
    expect(state.phase).toBe('idle')
    expect(state.target).toBeNull()
    expect(state.satisfaction).toBe(INITIAL_SATISFACTION)
    expect(state.delivered).toBe(0)
    expect(state.inside).toHaveLength(0)
    expect(state.over).toBe(false)
  })

  it('层间行进时间确定性：1→2 与 5→6 用时相同且精确停靠', () => {
    const a = createElevatorState(mulberry32(1))
    setTarget(a, 2)
    const tA = runUntilArrival(a, 10)
    expect(tA).not.toBeNull()
    expect(a.pos).toBe(2)
    expect(a.vel).toBe(0)

    const b = createElevatorState(mulberry32(1))
    b.pos = 5
    setTarget(b, 6)
    const tB = runUntilArrival(b, 10)
    expect(tB).not.toBeNull()
    expect(b.pos).toBe(6)
    // 梯形曲线只取决于距离：等距行程用时完全一致。
    expect(tB).toBe(tA)

    // 更远的行程用时长于单层。
    const c = createElevatorState(mulberry32(1))
    setTarget(c, 4)
    const tC = runUntilArrival(c, 20)
    expect(tC!).toBeGreaterThan(tA!)
  })

  it('到站下客：送达 +1 分且满意度 +1', () => {
    const state = createElevatorState(mulberry32(7))
    state.spawnIn = 1e9 // 冻结随机生成，保证测试乘客可控
    addWaiting(state, 1, 3)
    setTarget(state, 1) // 原地开门上客（无方向，双向可上）
    expect(state.inside).toHaveLength(1)
    // 等门关（1s + 冗余）再出发。
    for (let i = 0; i < 90; i += 1) stepElevator(state, 1 / 60)
    setTarget(state, 3)
    runUntilArrival(state, 20)
    expect(state.pos).toBe(3)
    expect(state.delivered).toBe(1)
    expect(state.satisfaction).toBe(INITIAL_SATISFACTION + 1)
    expect(state.inside).toHaveLength(0)
    expect(state.phase).toBe('doors') // 有下客动作则开门
    expect(state.doorTimer).toBeGreaterThan(0)
    expect(state.doorTimer).toBeLessThanOrEqual(DOOR_OPEN_S)
  })

  it('上客判定：只上同方向乘客，反方向的继续等待', () => {
    const state = createElevatorState(mulberry32(3))
    // 电梯 6 层下行到 3 层；3 层一名下行（去 1）一名上行（去 8）。
    state.spawnIn = 1e9
    state.pos = 6
    const down = addWaiting(state, 3, 1)
    addWaiting(state, 3, 8)
    setTarget(state, 3)
    runUntilArrival(state, 20)
    expect(state.pos).toBe(3)
    const insideIds = state.inside.map((p) => p.id)
    expect(insideIds).toContain(down.id)
    expect(state.inside).toHaveLength(1)
    expect(waitingAt(state, 3).map((p) => p.to)).toEqual([8])
  })

  it('容量上限：候梯人数超过 8 时只装满 8 人', () => {
    const state = createElevatorState(mulberry32(5))
    state.spawnIn = 1e9
    for (let i = 0; i < 12; i += 1) addWaiting(state, 1, 5 + (i % 3))
    setTarget(state, 1) // 原地开门（双向可上）
    expect(state.inside).toHaveLength(CAPACITY)
    expect(state.waiting).toHaveLength(12 - CAPACITY)
    expect(state.phase).toBe('doors')
  })

  it('等待超时：30 秒未接走的乘客离开并 -2 满意度', () => {
    const state = createElevatorState(mulberry32(9))
    state.spawnIn = 1e9
    addWaiting(state, 4, 9)
    // 不派梯，原地推 31 秒。
    for (let i = 0; i < 31 * 60; i += 1) stepElevator(state, 1 / 60)
    expect(state.waiting).toHaveLength(0)
    expect(state.lost).toBe(1)
    expect(state.satisfaction).toBe(INITIAL_SATISFACTION - 2)
    expect(state.over).toBe(false)
    expect(WAIT_TIMEOUT_S).toBe(30)
  })

  it('满意度归零即游戏结束，结束逻辑与输入冻结', () => {
    const state = createElevatorState(mulberry32(11))
    state.satisfaction = 2
    addWaiting(state, 2, 7)
    for (let i = 0; i < 31 * 60; i += 1) stepElevator(state, 1 / 60)
    expect(state.satisfaction).toBe(0)
    expect(state.over).toBe(true)
    const t = state.t
    setTarget(state, 5) // 结束后输入被忽略
    stepElevator(state, 1 / 60)
    expect(state.target).toBeNull()
    expect(state.t).toBe(t)
  })

  it('生成密度随时间上升：间隔均值收缩且产出合法乘客', () => {
    const early = nextSpawnInterval(0, mulberry32(2))
    const late = nextSpawnInterval(180, mulberry32(2))
    expect(late).toBeLessThan(early)
    // 跑 120 秒：等待乘客的楼层与目标层总在 1..FLOORS 且互不相同。
    const state = createElevatorState(mulberry32(2024))
    for (let i = 0; i < 120 * 60; i += 1) stepElevator(state, 1 / 60)
    expect(state.waiting.length + state.lost + state.delivered).toBeGreaterThan(0)
    for (const p of [...state.waiting, ...state.inside]) {
      expect(p.from).toBeGreaterThanOrEqual(1)
      expect(p.to).toBeLessThanOrEqual(FLOORS)
      expect(p.to).not.toBe(p.from)
    }
  })

  it('确定性：同一种子逐帧推进得到完全一致的状态', () => {
    const snapshot = (seed: number): string => {
      const s = createElevatorState(mulberry32(seed))
      for (let i = 0; i < 60 * 60; i += 1) {
        if (i === 300) setTarget(s, 7)
        if (i === 1800) setTarget(s, 2)
        stepElevator(s, 1 / 60)
      }
      return JSON.stringify({
        t: s.t, pos: s.pos, vel: s.vel, satisfaction: s.satisfaction,
        delivered: s.delivered, lost: s.lost,
        waiting: s.waiting.map((p) => [p.id, p.waited]),
        inside: s.inside.map((p) => p.id),
      })
    }
    expect(snapshot(99)).toBe(snapshot(99))
    expect(snapshot(99)).not.toBe(snapshot(100))
  })
})
