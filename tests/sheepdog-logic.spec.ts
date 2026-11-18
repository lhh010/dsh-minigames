/**
 * 牧羊犬逻辑测试：boids 三力 + 斥力、固定子步确定性、入栏判定、
 * 狼-羊-犬交互、计时/过关推进、seed 初始布置确定性与整局重放。
 */
import { describe, expect, it } from 'vitest'
import {
  mulberry32, createSheepdog, startLevel, stepSheepdog, sheepForces,
  LEVELS, fieldRect, penOpening, penRect, PEN_OPEN_R, DOG_R, DOG_SPEED,
  WIN_LINGER_MS, SCORE_PER_SHEEP, SCORE_PER_SECOND_LEFT, WOLF_FEAR_R, SUBSTEP_MS,
  type SheepdogState, type SheepdogInput,
} from '../src/client/games/sheepdog/logic.ts'

const NO_INPUT: SheepdogInput = { up: false, down: false, left: false, right: true }

/** 快照一个状态的全部可变数值，用于逐位比对。 */
function snapshot(st: SheepdogState): string {
  return JSON.stringify({
    levelIndex: st.levelIndex, phase: st.phase, score: st.score, pennedCount: st.pennedCount,
    timeLeftMs: st.timeLeftMs, elapsedMs: st.elapsedMs, winTimerMs: st.winTimerMs,
    dog: st.dog,
    sheep: st.sheep.map(s => [s.x, s.y, s.vx, s.vy, s.panic, s.penned]),
    wolves: st.wolves,
  })
}

/** 按 (seed, 输入序列) 完整跑一局的脚本：每步 [dtMs, input]。 */
function runScript(seed: number, script: Array<[number, SheepdogInput]>): SheepdogState {
  const st = createSheepdog(seed)
  for (const [dt, input] of script) stepSheepdog(st, dt, input)
  return st
}

describe('sheepdog logic', () => {
  it('mulberry32 与 seed 初始布置确定性：同 seed 逐位相同，异 seed 布置不同', () => {
    const r1 = mulberry32(42)
    const r2 = mulberry32(42)
    const a = Array.from({ length: 8 }, () => r1())
    const b = Array.from({ length: 8 }, () => r2())
    expect(a).toEqual(b)
    const other = mulberry32(43)
    expect(Array.from({ length: 8 }, () => other())).not.toEqual(a)

    const s1 = createSheepdog(42)
    const s2 = createSheepdog(42)
    expect(s1.sheep.map(s => [s.x, s.y])).toEqual(s2.sheep.map(s => [s.x, s.y]))
    const s3 = createSheepdog(7)
    expect(s3.sheep.map(s => [s.x, s.y])).not.toEqual(s1.sheep.map(s => [s.x, s.y]))
    // 初始布置都在场地左 2/3（远离围栏），且没有羊已入栏。
    const f = fieldRect(LEVELS[0]!)
    for (const s of s1.sheep) {
      expect(s.x).toBeLessThan(f.x + f.w * 0.62 + 1)
      expect(s.x).toBeGreaterThanOrEqual(f.x)
      expect(s.y).toBeGreaterThanOrEqual(f.y)
      expect(s.y).toBeLessThanOrEqual(f.y + f.h)
      expect(s.penned).toBe(false)
    }
  })

  it('分离力：两只羊过近时互相推开（方向背离邻居）', () => {
    const st = createSheepdog(1)
    st.sheep = [
      { x: 100, y: 100, vx: 0, vy: 0, heading: 0, panic: 0, legPhase: 0, penned: false, slotIndex: -1 },
      { x: 112, y: 100, vx: 0, vy: 0, heading: 0, panic: 0, legPhase: 0, penned: false, slotIndex: -1 },
    ]
    st.dog = { x: 400, y: 500, vx: 0, vy: 0, heading: 0, legPhase: 0 }
    st.wolves = []
    const f0 = sheepForces(st, 0)
    const f1 = sheepForces(st, 1)
    // 羊 0 在左：分离力指向左；羊 1 相反。
    expect(f0.ax).toBeLessThan(0)
    expect(f1.ax).toBeGreaterThan(0)
    // 距离很近时垂直分量几乎为零。
    expect(Math.abs(f0.ay)).toBeLessThan(1)
  })

  it('聚合与对齐：视野内远距羊互相靠近并转向邻居速度', () => {
    const st = createSheepdog(1)
    st.sheep = [
      { x: 100, y: 100, vx: 0, vy: 0, heading: 0, panic: 0, legPhase: 0, penned: false, slotIndex: -1 },
      { x: 160, y: 100, vx: 40, vy: 0, heading: 0, panic: 0, legPhase: 0, penned: false, slotIndex: -1 },
    ]
    st.dog = { x: 40, y: 450, vx: 0, vy: 0, heading: 0, legPhase: 0 }
    st.wolves = []
    const f0 = sheepForces(st, 0)
    // 聚合：指向右侧邻居。
    expect(f0.ax).toBeGreaterThan(0)
    // 对齐：邻居向右跑，羊 0 获得向右的转向分量。
    expect(f0.ax).toBeGreaterThan(0.1)
    const f1 = sheepForces(st, 1)
    expect(f1.ax).toBeLessThan(0)
  })

  it('犬斥力：半径内指向远离犬的方向，且越近越强、半径外为零', () => {
    const st = createSheepdog(1)
    st.sheep = [{ x: 200, y: 300, vx: 0, vy: 0, heading: 0, panic: 0, legPhase: 0, penned: false, slotIndex: -1 }]
    st.wolves = []
    st.dog = { x: 260, y: 300, vx: 0, vy: 0, heading: 0, legPhase: 0 } // 犬在右 60px
    const near = sheepForces(st, 0)
    expect(near.ax).toBeLessThan(0) // 斥力向左
    st.dog.x = 230 // 更近（距 30px）
    const closer = sheepForces(st, 0)
    expect(closer.ax).toBeLessThan(near.ax) // 更强的向左推力
    st.dog.x = 200 + DOG_R + 30 // 出半径
    const far = sheepForces(st, 0)
    expect(Math.abs(far.ax)).toBeLessThan(20) // 只剩轻微游荡
  })

  it('固定子步积分确定性：任意 dt 切分跑满同一总时长结果逐位一致', () => {
    const a = createSheepdog(99)
    const b = createSheepdog(99)
    // 4×16ms 与 2×32ms：总模拟 64ms = 6 个子步，余量同留 4ms。
    for (let i = 0; i < 4; i += 1) stepSheepdog(a, 16, NO_INPUT)
    for (let i = 0; i < 2; i += 1) stepSheepdog(b, 32, NO_INPUT)
    expect(snapshot(a)).toBe(snapshot(b))
    // 再叠一段不规则切分（合计 200ms）。
    for (const dt of [7, 13, 5, 25, 50, 40, 37, 23]) {
      stepSheepdog(a, dt, NO_INPUT)
      stepSheepdog(b, dt, NO_INPUT)
    }
    expect(snapshot(a)).toBe(snapshot(b))
    expect(a.stepAccumulatorMs).toBe(b.stepAccumulatorMs)
  })

  it('入栏判定：羊进入开口半径即锁定，之后不再受犬力、也不会出栏', () => {
    const st = createSheepdog(3)
    const level = LEVELS[st.levelIndex]!
    const open = penOpening(level)
    const pen = penRect(level)
    const s = st.sheep[0]!
    s.x = open.x
    s.y = open.y - 4 // 半径内
    st.dog.x = open.x
    st.dog.y = open.y - DOG_R + 10 // 犬就贴在旁边吓它
    const before = st.score
    stepSheepdog(st, 20, NO_INPUT)
    expect(s.penned).toBe(true)
    expect(st.pennedCount).toBe(1)
    expect(st.score).toBe(before + SCORE_PER_SHEEP)
    // 之后犬继续逼近：羊向栏内站位滑行并保持栏内。
    for (let i = 0; i < 200; i += 1) stepSheepdog(st, 20, { up: false, down: true, left: false, right: false })
    expect(s.penned).toBe(true)
    expect(s.x).toBeGreaterThanOrEqual(pen.x)
    expect(s.x).toBeLessThanOrEqual(pen.x + pen.w)
    expect(s.y).toBeGreaterThanOrEqual(pen.y)
    expect(s.y).toBeLessThanOrEqual(pen.y + pen.h)
    expect(Math.hypot(s.vx, s.vy)).toBe(0)
  })

  it('狼-羊-犬交互：狼追最近的羊；犬靠近则狼掉头逃离', () => {
    const st = createSheepdog(11)
    st.levelIndex = 2
    startLevel(st)
    expect(st.wolves.length).toBe(1)
    const wolf = st.wolves[0]!
    const sheep = st.sheep[0]!
    // 摆位：目标羊在狼右侧且超出羊的狼斥力半径（不被推着逃），其余羊
    // 全部移到远处右上角，狼只会选它。
    wolf.x = 100; wolf.y = 400; wolf.vx = 0; wolf.vy = 0
    sheep.x = 260; sheep.y = 400
    for (let i = 1; i < st.sheep.length; i += 1) {
      st.sheep[i]!.x = 400
      st.sheep[i]!.y = 80 + i * 8
    }
    st.dog.x = 60; st.dog.y = 520
    for (let i = 0; i < 10; i += 1) stepSheepdog(st, 20, NO_INPUT)
    // 狼向右追过目标。
    expect(wolf.x - 100).toBeGreaterThan(15)
    // 犬贴到狼身边：狼开始逃离（与犬的距离拉大）。
    st.dog.x = wolf.x - 10
    st.dog.y = wolf.y
    // 犬原地不动（空输入），狼持续逃离并把距离拉开到恐惧半径附近。
    const still: SheepdogInput = { up: false, down: false, left: false, right: false }
    for (let i = 0; i < 8; i += 1) stepSheepdog(st, 100, still)
    const dAfter = Math.hypot(wolf.x - st.dog.x, wolf.y - st.dog.y)
    expect(dAfter).toBeGreaterThan(WOLF_FEAR_R * 0.7)
    // 逃离速度仍指向远离犬的一侧。
    const dot = wolf.vx * (wolf.x - st.dog.x) + wolf.vy * (wolf.y - st.dog.y)
    expect(dot).toBeGreaterThanOrEqual(0)
  })

  it('计时与失败：时间耗尽进入 lost，剩余时间钳制为 0 且状态冻结', () => {
    const st = createSheepdog(13)
    st.timeLeftMs = 45
    stepSheepdog(st, 60, NO_INPUT)
    expect(st.phase).toBe('lost')
    expect(st.timeLeftMs).toBe(0)
    const frozen = snapshot(st)
    stepSheepdog(st, 500, NO_INPUT)
    expect(snapshot(st)).toBe(frozen)
  })

  it('过关与计分：全入栏触发 won，得分含剩余秒加成；停留后自动进下一关', () => {
    const st = createSheepdog(21)
    const level = LEVELS[0]!
    const open = penOpening(level)
    st.dog.x = 60 // 犬离得远远的，别把羊吓跑
    st.dog.y = 520
    for (const s of st.sheep) { s.x = open.x; s.y = open.y - 2 }
    const before = st.score
    stepSheepdog(st, 20, NO_INPUT)
    expect(st.pennedCount).toBe(st.sheep.length)
    expect(st.phase).toBe('won')
    const expected = before + st.sheep.length * SCORE_PER_SHEEP
      + Math.ceil(st.timeLeftMs / 1000) * SCORE_PER_SECOND_LEFT
    expect(st.score).toBe(expected)
    // won 期间不再扣时（拆帧喂 400ms）。
    const t = st.timeLeftMs
    for (let i = 0; i < 4; i += 1) stepSheepdog(st, 100, NO_INPUT)
    expect(st.timeLeftMs).toBe(t)
    // 停留结束：自动进入第 2 关（7 只羊、重置计时）。dt 钳制 100ms/帧。
    for (let i = 0; i <= Math.ceil(WIN_LINGER_MS / 100); i += 1) stepSheepdog(st, 100, NO_INPUT)
    expect(st.levelIndex).toBe(1)
    expect(st.phase).toBe('playing')
    expect(st.sheep.length).toBe(7)
    // 新关计时重置（进关后多喂的整帧会走一点表）。
    expect(st.timeLeftMs).toBeLessThanOrEqual(LEVELS[1]!.timeLimitMs)
    expect(st.timeLeftMs).toBeGreaterThan(55_000)
    expect(st.score).toBe(expected) // 分数跨关累计
  })

  it('最后一关通关进入 campaign-won；关卡配置 5 关递进且犬速占优', () => {
    // 犬按方向键连续移动（dt 每帧钳制 100ms：拆 10 帧喂满 1 秒）。
    const moveSt = createSheepdog(5)
    moveSt.dog.x = 100
    moveSt.dog.y = 300
    const startX = moveSt.dog.x
    for (let i = 0; i < 10; i += 1) stepSheepdog(moveSt, 100, { up: false, down: false, left: false, right: true })
    expect(moveSt.dog.x - startX).toBeCloseTo(DOG_SPEED, 0)
    for (const level of LEVELS) expect(DOG_SPEED).toBeGreaterThan(level.sheepMaxSpeed * 1.35)
    expect(LEVELS).toHaveLength(5)
    expect(LEVELS.map(l => l.sheepCount)).toEqual([5, 7, 9, 11, 12])
    expect(LEVELS.slice(2).every(l => l.wolves >= 1)).toBe(true)
    // 场地随关变大（inset 递减）。
    for (let i = 1; i < LEVELS.length; i += 1) expect(LEVELS[i]!.inset).toBeLessThan(LEVELS[i - 1]!.inset)

    const st = createSheepdog(21)
    st.levelIndex = LEVELS.length - 1
    startLevel(st)
    const open = penOpening(LEVELS[st.levelIndex]!)
    st.dog.x = 60; st.dog.y = 520
    for (const s of st.sheep) { s.x = open.x; s.y = open.y - 2 }
    stepSheepdog(st, 20, NO_INPUT)
    expect(st.phase).toBe('won')
    for (let i = 0; i <= Math.ceil((WIN_LINGER_MS + 50) / 100); i += 1) stepSheepdog(st, 100, NO_INPUT)
    expect(st.phase).toBe('campaign-won')
  })

  it('整局重放：同 seed 同输入脚本得到逐位一致的终局状态', () => {
    const script: Array<[number, SheepdogInput]> = []
    for (let i = 0; i < 120; i += 1) {
      script.push([16, { up: false, down: i % 7 < 3, left: false, right: i % 5 < 2 }])
      script.push([17, { up: i % 3 === 0, down: false, left: i % 11 < 5, right: false }])
    }
    const a = runScript(2024, script)
    const b = runScript(2024, script)
    expect(snapshot(a)).toBe(snapshot(b))
    const c = runScript(2025, script)
    expect(snapshot(c)).not.toEqual(snapshot(a))
    // 子步守恒：累加器永远落在 [0, SUBSTEP_MS)。
    expect(a.stepAccumulatorMs).toBeGreaterThanOrEqual(0)
    expect(a.stepAccumulatorMs).toBeLessThan(SUBSTEP_MS)
  })
})
