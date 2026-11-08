import { describe, expect, it } from 'vitest'
import {
  CENTER,
  ALL_RED_S, CAR_LEN, CONGEST_LIMIT, LANE_LEN, MIN_GREEN_S, STOP_LINE,
  YELLOW_S, carRect, createTrafficState, followAccel, intersectionClear,
  mulberry32, queueLen, rectOverlap, requestSwitch, signalOpen, snapshot,
  spawnGap, stepTraffic, trafficRate,
  type TrafficCar,
} from '../src/client/games/traffic/logic.ts'

/** 推进 state 共 seconds 秒（固定 dt=0.05，确定性）。 */
function run(state: ReturnType<typeof createTrafficState>, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.05) stepTraffic(state, 0.05)
}

function car(pos: number, v: number): TrafficCar {
  return { pos, v, hue: 0, committed: false }
}

describe('traffic logic', () => {
  it('mulberry32 与泊松间隔：同 seed 确定，间隔恒正，速率随时间上升封顶', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    const rng = mulberry32(11)
    for (let i = 0; i < 50; i += 1) {
      expect(spawnGap(trafficRate(10), rng)).toBeGreaterThan(0)
    }
    expect(trafficRate(0)).toBeLessThan(trafficRate(30))
    expect(trafficRate(99999)).toBe(0.7)
  })

  it('信号状态机：最短绿灯前拒绝，绿→黄→全红→换轴，黄灯期间锁定', () => {
    const state = createTrafficState(1)
    expect(state.phase).toBe('NS')
    expect(requestSwitch(state)).toBe(false)
    state.greenElapsed = MIN_GREEN_S
    expect(requestSwitch(state)).toBe(true)
    expect(state.light).toBe('yellow')
    expect(state.phaseTimer).toBeCloseTo(YELLOW_S, 10)
    expect(requestSwitch(state)).toBe(false)
    run(state, YELLOW_S + 0.01)
    expect(state.light).toBe('allred')
    expect(signalOpen(state, 0)).toBe('red')
    expect(signalOpen(state, 2)).toBe('red')
    run(state, ALL_RED_S + 0.01)
    expect(state.light).toBe('green')
    expect(state.phase).toBe('EW')
    expect(signalOpen(state, 2)).toBe('green')
    expect(signalOpen(state, 0)).toBe('red')
  })

  it('跟车模型：停着不动、远处自由加速、近处按运动学减速', () => {
    expect(followAccel(0, 0.5)).toBe(0)
    expect(followAccel(0, 10)).toBeGreaterThan(0) // 有空间静止车蠕行补位（旧语义堵死=死锁 bug）
    expect(followAccel(20, Infinity)).toBeGreaterThan(0)
    expect(followAccel(50, 5)).toBeLessThan(0)
    expect(followAccel(50, 200)).toBeGreaterThan(0)
    expect(followAccel(70, Infinity)).toBe(0)
  })

  it('红灯排队：车在停止线前刹停且不越线', () => {
    const state = createTrafficState(2)
    state.nextSpawn = [999, 999, 999, 999]
    state.phase = 'NS' // EW 方向（dir 2）红灯
    state.cars[2] = [car(60, 50)]
    run(state, 12)
    const stopped = state.cars[2][0]!
    expect(stopped).toBeDefined()
    expect(stopped.v).toBe(0)
    expect(stopped.pos).toBeLessThanOrEqual(STOP_LINE + 0.01)
    expect(stopped.pos).toBeGreaterThan(STOP_LINE - 2)
    expect(queueLen(state, 2)).toBe(1)
  })

  it('路口净空判定：占箱时不清空，驶离后清空', () => {
    const state = createTrafficState(3)
    state.nextSpawn = [999, 999, 999, 999]
    state.cars[0] = [car(CENTER, 60)] // NS 车在路口正中
    expect(intersectionClear(state, 'NS')).toBe(false)
    expect(intersectionClear(state, 'EW')).toBe(true)
    run(state, 4)
    expect(intersectionClear(state, 'NS')).toBe(true)
  })

  it('碰撞检测：异轴两车在路口重叠即结束并记录事故点', () => {
    const state = createTrafficState(4)
    state.nextSpawn = [999, 999, 999, 999]
    // 右侧通行车道有横向偏移：两车分别取到对方车道带上才重叠。
    state.cars[0] = [car(CENTER + 20, 60)]
    state.cars[2] = [car(CENTER - 10, 60)]
    expect(rectOverlap(carRect(state.cars[0][0]!, 0), carRect(state.cars[2][0]!, 2))).toBe(true)
    stepTraffic(state, 0.05)
    expect(state.over).toBe('crash')
    expect(state.crashAt).not.toBeNull()
  })

  it('拥堵判定：单方向排队超过阈值即结束', () => {
    const state = createTrafficState(5)
    state.nextSpawn = [999, 999, 999, 999]
    state.phase = 'NS'
    state.greenElapsed = MIN_GREEN_S
    // EW 方向排起 8 辆静止车队。
    state.cars[3] = Array.from({ length: CONGEST_LIMIT + 1 }, (_, i) => ({
      pos: STOP_LINE - 10 - i * (CAR_LEN + 2), v: 0, hue: i, committed: false,
    }))
    stepTraffic(state, 0.05)
    expect(queueLen(state, 3)).toBeGreaterThan(CONGEST_LIMIT)
    expect(state.over).toBe('congestion')
  })

  it('计分：车辆驶出车道计通过数，得分 = 10*通过 + 存活秒数', () => {
    const state = createTrafficState(6)
    state.nextSpawn = [999, 999, 999, 999]
    state.cars[0] = [car(LANE_LEN - CAR_LEN - 1, 60)]
    run(state, 1)
    expect(state.cars[0]).toHaveLength(0)
    expect(state.passed).toBe(1)
    expect(state.score).toBe(10 + Math.floor(state.time))
  })

  it('确定性重放：同 seed 同操作序列得到完全一致的状态', () => {
    const play = (): string => {
      const state = createTrafficState(0xfeed)
      let greenWait = 0
      for (let t = 0; t < 40; t += 0.05) {
        greenWait += 0.05
        if (greenWait > 6) {
          if (requestSwitch(state)) greenWait = 0
        }
        stepTraffic(state, 0.05)
        if (state.over !== null) break
      }
      return snapshot(state)
    }
    expect(play()).toBe(play())
  })

  it('谨慎切换可存活：净空且无临近车辆才切换的玩家 90 秒内不发生碰撞', () => {
    const state = createTrafficState(0xbeef)
    let greenWait = 0
    for (let t = 0; t < 90 && state.over === null; t += 0.05) {
      greenWait += 0.05
      if (greenWait > 4 && state.light === 'green' && state.greenElapsed >= MIN_GREEN_S
        && intersectionClear(state, 'NS') && intersectionClear(state, 'EW')) {
        const mine = state.phase === 'NS' ? [0, 1] : [2, 3]
        const approaching = mine.some(d =>
          state.cars[d]!.some(c => c.pos > STOP_LINE - 95 && c.pos < STOP_LINE),
        )
        if (!approaching && requestSwitch(state)) greenWait = 0
      }
      stepTraffic(state, 0.05)
    }
    expect(state.over).not.toBe('crash')
  })
})

describe('followAccel standstill & braking fix', () => {
  it('a stopped car accelerates (v=0 no longer returns 0)', () => {
    expect(followAccel(0, Infinity)).toBeGreaterThan(0)
    expect(followAccel(0, 500)).toBeGreaterThan(0)
  })
  it('a fast car close to an obstacle brakes', () => {
    expect(followAccel(60, 15)).toBeLessThan(0)
  })
  it('a car with ample stopping distance cruises or accelerates', () => {
    expect(followAccel(30, 400)).toBeGreaterThanOrEqual(0)
  })
})
