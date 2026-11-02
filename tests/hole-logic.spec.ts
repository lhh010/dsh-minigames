import { describe, expect, it } from 'vitest'
import {
  AI_COUNT, BITE_RATIO, DURATION_TICKS, EAT_DIST_FACTOR, EAT_SIZE_FACTOR,
  MILESTONES, SHRINK_TICKS, START_R, WORLD_W, WORLD_H,
  canSwallow, createHole, holeSnapshot, placeObjects, playerRank,
  radiusAfterEat, stepHole,
  type CityObject, type HoleState,
} from '../src/client/games/hole/logic.ts'

/** 构造一件静止物体的快捷方式。 */
function obj(id: number, kind: CityObject['kind'], x: number, y: number, r?: number): CityObject {
  return { id, kind, x, y, r: r ?? (kind === 'building' ? 30 : kind === 'car' ? 14 : 6), angle: 0, sinking: false, sinkTick: 0, sinkX: 0, sinkY: 0, sinkR: 0, eater: -1 }
}

/** 清场并把玩家摆在指定点的受控局面（AI 推到远角）。 */
function sandbox(px: number, py: number): HoleState {
  const state = createHole(7, 1)
  const player = state.holes[0]!
  player.x = px
  player.y = py
  for (let i = 1; i < state.holes.length; i += 1) {
    const ai = state.holes[i]!
    ai.x = i === 1 ? 40 : WORLD_W - 40
    ai.y = i === 1 ? 40 : WORLD_H - 40
  }
  placeObjects(state, [])
  return state
}

/** 让玩家原地不动的输入。 */
const stay = (state: HoleState) => ({ targetX: state.holes[0]!.x, targetY: state.holes[0]!.y })

describe('hole 城市生成', () => {
  it('同 seed 同 round 生成完全一致的城市', () => {
    const a = createHole(42, 1)
    const b = createHole(42, 1)
    expect(holeSnapshot(a)).toBe(holeSnapshot(b))
    expect(a.objects.map(o => o.kind + ':' + o.x.toFixed(3) + ',' + o.y.toFixed(3)).join(';'))
      .toBe(b.objects.map(o => o.kind + ':' + o.x.toFixed(3) + ',' + o.y.toFixed(3)).join(';'))
  })

  it('不同 seed / 不同 round 城市布局发散，且三类物体都出现', () => {
    const a = createHole(1, 1)
    const b = createHole(2, 1)
    const c = createHole(1, 2)
    const layout = (s: HoleState): string => s.objects.map(o => o.x.toFixed(1) + ',' + o.y.toFixed(1)).join(';')
    expect(layout(a)).not.toBe(layout(b))
    expect(layout(a)).not.toBe(layout(c))
    for (const kind of ['tree', 'lamp', 'car', 'building'] as const) {
      expect(a.objects.some(o => o.kind === kind)).toBe(true)
    }
    expect(a.holes).toHaveLength(1 + AI_COUNT)
  })
})

describe('hole 吞噬门槛与成长', () => {
  it('口径门槛：小物体可吞，车/楼按半径与距离双门槛拒绝', () => {
    expect(canSwallow(START_R, 6, 5)).toBe(true)
    // r14 车：14 < 14*0.8=11.2 不成立 -> 吞不了。
    expect(canSwallow(START_R, 14, 5)).toBe(false)
    expect(canSwallow(18, 14, 5)).toBe(true)
    // 距离门槛：超出 r*0.85 吞不到。
    expect(canSwallow(START_R, 6, START_R * EAT_DIST_FACTOR + 0.1)).toBe(false)
    expect(canSwallow(START_R, 6, START_R * EAT_DIST_FACTOR - 0.1)).toBe(true)
    // 大楼需要 r > 37.5。
    expect(canSwallow(37, 30, 5)).toBe(false)
    expect(canSwallow(38, 30, 5)).toBe(true)
    // 出生口径刚好能吞小物体（r6 < 14x0.8）。
    expect(6).toBeLessThan(START_R * EAT_SIZE_FACTOR)
  })

  it('吞下物体面积成长，沉没 SHRINK_TICKS 后消失并计吞数', () => {
    const state = sandbox(500, 500)
    const player = state.holes[0]!
    placeObjects(state, [obj(1, 'tree', 500, 500)])
    const before = player.r
    stepHole(state, stay(state))
    expect(player.eaten).toBe(1)
    expect(player.r).toBeCloseTo(radiusAfterEat(before, 6), 6)
    // 沉没动画期间物体仍在场上且在收缩。
    expect(state.objects).toHaveLength(1)
    expect(state.objects[0]!.sinking).toBe(true)
    // 第二个 tick 起收缩插值生效。
    stepHole(state, stay(state))
    expect(state.objects[0]!.r).toBeLessThan(6)
    for (let i = 0; i < SHRINK_TICKS; i += 1) stepHole(state, stay(state))
    expect(state.objects).toHaveLength(0)
  })

  it('连续吞噬触发口径里程碑浮字事件', () => {
    const state = sandbox(500, 500)
    const player = state.holes[0]!
    // 在玩家脚下摆一圈树，原地连吞到跨过第一个里程碑。
    const trees: CityObject[] = []
    for (let i = 0; i < 400; i += 1) trees.push(obj(i + 1, 'tree', 500 + (i % 20) * 2, 500 + Math.floor(i / 20) * 2))
    placeObjects(state, trees)
    let sawMilestone = false
    for (let i = 0; i < 60 && !sawMilestone; i += 1) {
      stepHole(state, stay(state))
      sawMilestone = state.events.some(e => e.type === 'milestone')
    }
    expect(sawMilestone).toBe(true)
    expect(player.r).toBeGreaterThanOrEqual(MILESTONES[0]!.r)
    // 里程碑后车也能吞了。
    expect(canSwallow(player.r, 14, 5)).toBe(true)
  })
})

describe('hole AI 与吞并', () => {
  it('AI 朝最近可吞物体移动并吃掉它', () => {
    const state = sandbox(200, 200)
    const ai = state.holes[1]!
    ai.x = 300
    ai.y = 300
    placeObjects(state, [obj(1, 'tree', 300, 400)])
    const distBefore = Math.hypot(300 - ai.x, 400 - ai.y)
    for (let i = 0; i < 30; i += 1) stepHole(state, stay(state))
    const distAfter = Math.hypot(300 - ai.x, 400 - ai.y)
    expect(distAfter).toBeLessThan(distBefore)
    expect(ai.eaten).toBe(1)
    expect(ai.r).toBeGreaterThan(START_R)
  })

  it('口径差超 BITE_RATIO 的大洞咬小洞一口：小洞变小、大洞变大', () => {
    const state = sandbox(500, 500)
    const player = state.holes[0]!
    const ai = state.holes[1]!
    ai.x = 505
    ai.y = 505
    ai.r = START_R * BITE_RATIO + 1
    const pBefore = player.r
    const aBefore = ai.r
    stepHole(state, stay(state))
    const bite = state.events.find(e => e.type === 'bite')
    expect(bite).toBeDefined()
    expect(player.r).toBeLessThan(pBefore)
    expect(ai.r).toBeGreaterThan(aBefore)
    // 冷却期内不会连环咬。
    stepHole(state, stay(state))
    expect(state.events.some(e => e.type === 'bite')).toBe(false)
  })
})

describe('hole 限时与重放', () => {
  it('DURATION_TICKS 后结束并给出按口径排序的结算', () => {
    const state = createHole(11, 1)
    placeObjects(state, []) // 清场加速快进
    const ai = state.holes[1]!
    ai.r = 40
    for (let i = 0; i < DURATION_TICKS; i += 1) stepHole(state, stay(state))
    expect(state.over).toBe(true)
    expect(state.stats).not.toBeNull()
    expect(state.stats![0]!.rank).toBe(1)
    expect(state.stats!.some(row => row.ai && !row.ai)).toBe(false)
    expect(playerRank(state)).toBe(2)
  })

  it('同 seed 同输入序列逐 tick 快照一致（重放确定性）', () => {
    const run = (): string => {
      const state = createHole(99, 3)
      let snap = ''
      for (let i = 0; i < 300; i += 1) {
        stepHole(state, { targetX: 400 + i * 9, targetY: 300 + (i % 40) * 7 })
        snap += holeSnapshot(state) + ';'
      }
      return snap
    }
    expect(run()).toBe(run())
  })
})
