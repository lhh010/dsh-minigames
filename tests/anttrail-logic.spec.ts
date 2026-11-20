/**
 * 蚁群引路逻辑测试：seed 布置与固定子步确定性（含工具操作重放）、
 * 出发拾食/回巢交付计分、障碍石配额与碰撞反弹、糖水信息素注入/扩散/
 * 消退与吸引偏转、瓢虫巡逻/捕食/困困、过关推进与超时/全灭失败。
 */
import { describe, expect, it } from 'vitest'
import {
  mulberry32, createAntTrail, startLevel, stepAntTrail, toggleStone, dropSugar,
  pheromoneAt, cellAt, isBlocked, ladybugWaypoints,
  LEVELS, W, H, SUBSTEP_MS, PICK_R, NEST_R, SUGAR_LIFE_MS,
  SCORE_PER_DELIVERY, WIN_BONUS, WIN_LINGER_MS,
  type AntTrailState,
} from '../src/client/games/anttrail/logic.ts'

/** 快照一个状态的全部可变数值（rng 函数除外），用于逐位比对。 */
function snapshot(st: AntTrailState): string {
  return JSON.stringify({
    levelIndex: st.levelIndex, phase: st.phase, score: st.score, delivered: st.delivered,
    stonesUsed: st.stonesUsed, sugarsUsed: st.sugarsUsed,
    timeLeftMs: st.timeLeftMs, elapsedMs: st.elapsedMs, substeps: st.substeps,
    stones: st.stones, stoneOwner: Array.from(st.stoneOwner), pher: Array.from(st.pher),
    ants: st.ants.map(a => [a.x, a.y, a.heading, a.carrying]),
    drops: st.drops, ladybugs: st.ladybugs,
  })
}

/** 把一只扛食蚂蚁送到蚁巢交付一次。 */
function deliverOnce(st: AntTrailState): void {
  const ant = st.ants[0]!
  ant.x = st.nest.x
  ant.y = st.nest.y
  ant.carrying = true
  stepAntTrail(st, SUBSTEP_MS)
}

describe('anttrail logic', () => {
  it('mulberry32 与 seed 初始布置确定性：同 seed 逐位相同，异 seed 布置不同', () => {
    const r1 = mulberry32(42)
    const r2 = mulberry32(42)
    const a = Array.from({ length: 8 }, () => r1())
    const b = Array.from({ length: 8 }, () => r2())
    expect(a).toEqual(b)
    expect(Array.from({ length: 8 }, () => mulberry32(43)())).not.toEqual(a)

    const s1 = createAntTrail(42)
    const s2 = createAntTrail(42)
    expect(s1.ants.map(x => [x.x, x.y, x.heading])).toEqual(s2.ants.map(x => [x.x, x.y, x.heading]))
    expect(createAntTrail(7).ants.map(x => [x.x, x.y])).not.toEqual(s1.ants.map(x => [x.x, x.y]))

    // 蚂蚁出生在食物源近旁（拾取半径内）、未扛食；第 1 关无瓢虫。
    expect(s1.ants.length).toBe(LEVELS[0]!.antCount)
    for (const ant of s1.ants) {
      expect(Math.hypot(ant.x - s1.food.x, ant.y - s1.food.y)).toBeLessThan(PICK_R)
      expect(ant.carrying).toBe(false)
    }
    expect(s1.ladybugs.length).toBe(0)
    // 第 4/5 关有瓢虫，锚在巡逻环角点上。
    const s4 = createAntTrail(11)
    s4.levelIndex = 3
    startLevel(s4)
    expect(s4.ladybugs.length).toBe(LEVELS[3]!.ladybugs)
    const wps = ladybugWaypoints(s4)
    for (const bug of s4.ladybugs) {
      expect(wps.some(wp => wp.x === bug.x && wp.y === bug.y)).toBe(true)
    }
  })

  it('固定子步确定性：任意 dt 切分跑满同一总时长逐位一致，且整局（含工具操作）可重放', () => {
    const a = createAntTrail(99)
    const b = createAntTrail(99)
    for (let i = 0; i < 4; i += 1) stepAntTrail(a, 16)
    for (let i = 0; i < 2; i += 1) stepAntTrail(b, 32)
    expect(snapshot(a)).toBe(snapshot(b))
    for (const dt of [7, 13, 5, 25, 50, 40, 37, 23]) {
      stepAntTrail(a, dt)
      stepAntTrail(b, dt)
    }
    expect(snapshot(a)).toBe(snapshot(b))

    // 工具脚本重放：放两块石 + 滴一滴糖 + 再推 2 秒，同 seed 两次逐位一致。
    const run = (): string => {
      const st = createAntTrail(77)
      toggleStone(st, 200, 120)
      toggleStone(st, 260, 120)
      dropSugar(st, 320, 200)
      for (let i = 0; i < 125; i += 1) stepAntTrail(st, 16)
      toggleStone(st, 200, 120)
      for (let i = 0; i < 125; i += 1) stepAntTrail(st, 16)
      return snapshot(st)
    }
    expect(run()).toBe(run())
  })

  it('出发拾食与回巢交付：出生即拾食；扛食到巢 delivered+1 得分并放下食物', () => {
    const st = createAntTrail(9)
    stepAntTrail(st, SUBSTEP_MS)
    for (const ant of st.ants) expect(ant.carrying).toBe(true)

    const ant = st.ants[0]!
    ant.x = st.nest.x
    ant.y = st.nest.y
    ant.carrying = true
    const score0 = st.score
    stepAntTrail(st, SUBSTEP_MS)
    expect(st.delivered).toBe(1)
    expect(st.score).toBe(score0 + SCORE_PER_DELIVERY)
    expect(ant.carrying).toBe(false)
  })

  it('障碍石配额：放满拒绝、撤除返还；食物/蚁巢近旁与场地外拒绝；预设关不计配额', () => {
    const st = createAntTrail(5)
    const quota = LEVELS[0]!.stoneQuota
    for (let i = 0; i < quota; i += 1) {
      expect(toggleStone(st, 150 + i * 20, 110)).toBe(true)
    }
    expect(st.stonesUsed).toBe(quota)
    expect(toggleStone(st, 380, 110)).toBe(false) // 超配额
    expect(toggleStone(st, 150, 110)).toBe(true) // 撤除
    expect(st.stonesUsed).toBe(quota - 1) // 返还
    expect(toggleStone(st, 380, 110)).toBe(true) // 重新放回
    expect(toggleStone(st, st.food.x + 10, st.food.y)).toBe(false) // 食物近旁
    expect(toggleStone(st, st.nest.x, st.nest.y + 8)).toBe(false) // 蚁巢近旁
    expect(toggleStone(st, 5, 5)).toBe(false) // 场地外
    expect(toggleStone(st, -20, 300)).toBe(false)

    // 预设关：开局有预设石但不占玩家配额；撤预设石也不计费。
    const s2 = createAntTrail(6)
    s2.levelIndex = 1
    startLevel(s2)
    expect(s2.stonesUsed).toBe(0)
    const presetIndex = s2.stones.findIndex(v => v === true)
    expect(presetIndex).toBeGreaterThanOrEqual(0)
    const cx = s2.field.x + (presetIndex % s2.cols) * 20 + 10
    const cy = s2.field.y + Math.floor(presetIndex / s2.cols) * 20 + 10
    expect(toggleStone(s2, cx, cy)).toBe(true)
    expect(s2.stonesUsed).toBe(0)
  })

  it('障碍碰撞：石墙挡路，蚂蚁永不进入石格并被反弹改道', () => {
    const st = createAntTrail(3)
    // 在蚂蚁前进方向竖一堵石墙（col 13，x∈[300,320)，rows 8..15）。
    for (let row = 8; row <= 15; row += 1) st.stones[13 + row * st.cols] = true
    const ant = st.ants[0]!
    ant.x = 250
    ant.y = 300
    ant.heading = 0 // 向右直冲石墙
    for (let i = 0; i < 100; i += 1) {
      stepAntTrail(st, SUBSTEP_MS)
      expect(isBlocked(st, ant.x, ant.y)).toBe(false) // 永不在石格/墙内
      expect(ant.x).toBeLessThan(300) // 墙左边缘之前
    }
    // 场地边界同样挡住（贴 HUD 与四边）。
    for (const ant2 of st.ants) {
      expect(ant2.x).toBeGreaterThan(st.field.x)
      expect(ant2.x).toBeLessThan(st.field.x + st.field.w)
      expect(ant2.y).toBeGreaterThan(st.field.y)
      expect(ant2.y).toBeLessThan(st.field.y + st.field.h)
    }
  })

  it('糖水信息素：滴注后所在格浓度抬升，并向四邻格扩散', () => {
    const st = createAntTrail(4)
    expect(dropSugar(st, 200, 200)).toBe(true)
    expect(st.sugarsUsed).toBe(1)
    expect(st.drops.length).toBe(1)
    const idx = cellAt(st, 200, 200)
    expect(idx).toBeGreaterThanOrEqual(0)
    stepAntTrail(st, 100)
    expect(pheromoneAt(st, 200, 200)).toBeGreaterThan(0.5)
    // 250ms = 5 次扩散，邻格已收到份额。
    stepAntTrail(st, 150)
    expect(pheromoneAt(st, 200 + 20, 200)).toBeGreaterThan(0.02)
    expect(pheromoneAt(st, 200, 200 + 20)).toBeGreaterThan(0.02)
    // 障碍格不接收：先看石格浓度仍为 0。
    const st2 = createAntTrail(4)
    st2.stones[cellAt(st2, 240, 200)!] = true
    dropSugar(st2, 200, 200)
    stepAntTrail(st2, 250)
    expect(pheromoneAt(st2, 240, 200)).toBe(0)
  })

  it('糖水吸引偏转：左/右传感器读到更强信息素时蚂蚁朝该侧转向', () => {
    // 关掉随机扰动，让转向完全由信息素梯度决定。
    const make = (): AntTrailState => {
      const st = createAntTrail(1)
      st.rng = () => 0.5
      st.ants = [{ x: 200, y: 200, heading: 0, carrying: true }]
      return st
    }
    // 右侧信息素：heading 应增大（向右转）。
    const right = make()
    right.pher[cellAt(right, 200 + Math.cos(0.9) * 16, 200 + Math.sin(0.9) * 16)!] = 3
    for (let i = 0; i < 10; i += 1) stepAntTrail(right, SUBSTEP_MS)
    expect(right.ants[0]!.heading).toBeGreaterThan(0.25)
    // 左侧信息素：heading 应减小（向左转）。
    const left = make()
    left.pher[cellAt(left, 200 + Math.cos(-0.9) * 16, 200 + Math.sin(-0.9) * 16)!] = 3
    for (let i = 0; i < 10; i += 1) stepAntTrail(left, SUBSTEP_MS)
    expect(left.ants[0]!.heading).toBeLessThan(-0.25)
    // 两侧同浓：不偏转，只受零扰动，heading 不变。
    const flat = make()
    flat.pher.fill(3)
    for (let i = 0; i < 10; i += 1) stepAntTrail(flat, SUBSTEP_MS)
    expect(flat.ants[0]!.heading).toBe(0)
  })

  it('糖水消退：到期后 drops 清空，信息素随时间衰减至近零', () => {
    const st = createAntTrail(8)
    dropSugar(st, 200, 200)
    stepAntTrail(st, SUGAR_LIFE_MS)
    expect(st.drops.length).toBe(0)
    expect(pheromoneAt(st, 200, 200)).toBeGreaterThan(0.2)
    stepAntTrail(st, 4000)
    expect(pheromoneAt(st, 200, 200)).toBeLessThan(0.1)
  })

  it('瓢虫：巡逻移动、碰到蚂蚁吃掉、被障碍石围困后原地不动', () => {
    const st = createAntTrail(2)
    st.levelIndex = 3
    startLevel(st)
    st.rng = () => 0.5
    expect(st.ladybugs.length).toBe(1)
    const bug = st.ladybugs[0]!
    const x0 = bug.x
    const y0 = bug.y
    stepAntTrail(st, 300)
    expect(Math.hypot(bug.x - x0, bug.y - y0)).toBeGreaterThan(1) // 沿环巡逻

    // 捕食：把一只蚂蚁放到瓢虫嘴边，一步内被吃掉。
    const before = st.ants.length
    st.ants.push({ x: bug.x, y: bug.y, heading: 0, carrying: true })
    stepAntTrail(st, SUBSTEP_MS)
    expect(st.ants.length).toBe(before)

    // 困困：堵死瓢虫周围 3x3 格，之后位置不再变化。
    const col = Math.floor((bug.x - st.field.x) / 20)
    const row = Math.floor((bug.y - st.field.y) / 20)
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const c = col + dc
        const r = row + dr
        if (c >= 0 && r >= 0 && c < st.cols && r < st.rows) st.stones[c + r * st.cols] = true
      }
    }
    const tx = bug.x
    const ty = bug.y
    stepAntTrail(st, 500)
    expect(bug.x).toBe(tx)
    expect(bug.y).toBe(ty)
  })

  it('过关推进：达标 won 加 WIN_BONUS，linger 后进下一关并清零；最终关通关为 campaign-won', () => {
    const st = createAntTrail(5)
    const level = LEVELS[0]!
    for (let i = 0; i < level.need - 1; i += 1) deliverOnce(st)
    expect(st.phase).toBe('playing')
    const scoreBefore = st.score
    deliverOnce(st)
    expect(st.phase).toBe('won')
    expect(st.score).toBe(scoreBefore + SCORE_PER_DELIVERY + WIN_BONUS)
    stepAntTrail(st, WIN_LINGER_MS)
    expect(st.levelIndex).toBe(1)
    expect(st.phase).toBe('playing')
    expect(st.delivered).toBe(0)

    // 最终关：取胜后 linger 进入 campaign-won，模拟冻结。
    const last = createAntTrail(5)
    last.levelIndex = LEVELS.length - 1
    startLevel(last)
    for (let i = 0; i < LEVELS[LEVELS.length - 1]!.need; i += 1) deliverOnce(last)
    expect(last.phase).toBe('won')
    stepAntTrail(last, WIN_LINGER_MS)
    expect(last.phase).toBe('campaign-won')
    const frozen = snapshot(last)
    stepAntTrail(last, 500)
    expect(snapshot(last)).toBe(frozen)
  })

  it('失败：超时或蚁群被吃光进入 lost；lost 后冻结不再变化', () => {
    const st = createAntTrail(10)
    st.timeLeftMs = 3
    stepAntTrail(st, 100)
    expect(st.phase).toBe('lost')
    const frozen = snapshot(st)
    stepAntTrail(st, 1000)
    expect(snapshot(st)).toBe(frozen)

    const st2 = createAntTrail(10)
    st2.ants = []
    stepAntTrail(st2, SUBSTEP_MS)
    expect(st2.phase).toBe('lost')
    // 场地尺寸与常量健全性。
    expect(W).toBe(480)
    expect(H).toBe(600)
    expect(NEST_R).toBeGreaterThan(0)
  })
})
