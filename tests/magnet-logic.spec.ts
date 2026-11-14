import { describe, expect, it } from 'vitest'
import {
  BALL_R,
  DEAD_MS,
  LEVEL_COUNT,
  MAGNET_LEVELS,
  MAX_SPEED,
  MIN_D2,
  START_LIVES,
  SUBSTEPS,
  WALL_BOUNCE,
  WON_MS,
  createMagnet,
  flipPolarity,
  forceAt,
  levelAt,
  mulberry32,
  stepMagnet,
  type MagnetLevel,
  type Polarity,
} from '../src/client/games/magnet/logic.ts'

/** 物理断言用布局：活动磁铁强度 0，只留一块固定磁铁。 */
const SOLO: MagnetLevel = {
  player: { x: 240, y: 300, strength: 0, polarity: 'N' },
  fixed: [
    { x: 400, y: 300, strength: 8e6, polarity: 'S' },
  ],
  spikes: [],
  goal: { x: 470, y: 300, r: 20 },
  start: { x: 40, y: 300 },
}

describe('magnet logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(11)
    const b = mulberry32(11)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('forceAt: opposite poles attract, same poles repel, near field capped', () => {
    const attract = forceAt(SOLO, 100, 300, 'N')
    // 球在磁铁左侧：吸引力的 fx 为正（指向磁铁）。
    expect(attract.fx).toBeGreaterThan(0)
    expect(attract.fy).toBeCloseTo(0, 6)
    const repel = forceAt(SOLO, 100, 300, 'S')
    // 同极相斥：fx 反号，且大小相同（对称）。
    expect(repel.fx).toBeLessThan(0)
    expect(Math.abs(repel.fx)).toBeCloseTo(Math.abs(attract.fx), 6)
    // 翻转固定磁铁极性同样反转方向（全局反转的根基）。
    const flipped: MagnetLevel = { ...SOLO, fixed: [{ ...SOLO.fixed[0]!, polarity: 'N' }] }
    expect(forceAt(flipped, 100, 300, 'N').fx).toBeLessThan(0)
    // 近场限幅：距磁铁 20px（小于最小距离 40px）时力封顶为强度 / MIN_D2。
    const capped = forceAt(SOLO, 380, 300, 'N')
    expect(capped.fx).toBeCloseTo(8e6 / MIN_D2, 5)
    // 平方反比：距离减半，单磁铁力约增大到 4 倍。
    const far = forceAt(SOLO, 300, 300, 'N')
    const near = forceAt(SOLO, 350, 300, 'N')
    expect(near.fx / far.fx).toBeCloseTo(4, 1)
  })

  it('stepMagnet accelerates the ball toward an attracting magnet', () => {
    // 第 1 关布局：球在固定 S 磁铁正左方，N 极被向右吸引。
    const state = createMagnet(3)
    state.x = 80
    state.y = 320
    state.vx = 0
    state.vy = 0
    state.polarity = 'N'
    const x0 = state.x
    for (let i = 0; i < 10; i += 1) stepMagnet(state, 16)
    expect(state.vx).toBeGreaterThan(50)
    expect(state.x).toBeGreaterThan(x0)
  })

  it('walls clamp and reflect, speed stays capped across a full sim', () => {
    // 贴右墙向右冲：被钳制回边界并反弹为负向速度。
    const state = createMagnet(3)
    state.x = 480 - BALL_R - 0.5
    state.y = 320
    state.vx = MAX_SPEED
    state.vy = 0
    stepMagnet(state, 16)
    expect(state.x).toBeLessThanOrEqual(480 - BALL_R)
    expect(state.vx).toBeLessThan(0)
    // 速度上限与边界不变量：任意关推进 10s 始终成立。
    const s2 = createMagnet(3)
    s2.level = 5
    for (let i = 0; i < 625; i += 1) {
      stepMagnet(s2, 16)
      expect(Math.hypot(s2.vx, s2.vy)).toBeLessThanOrEqual(MAX_SPEED + 1e-6)
      expect(s2.x).toBeGreaterThanOrEqual(BALL_R)
      expect(s2.x).toBeLessThanOrEqual(480 - BALL_R)
      expect(s2.y).toBeGreaterThanOrEqual(BALL_R)
      expect(s2.y).toBeLessThanOrEqual(600 - BALL_R)
    }
    expect(Number.isFinite(s2.x)).toBe(true)
  })

  it('spike hit costs a life, respawns at start after DEAD_MS', () => {
    // 第 2 关起才有尖刺。
    const state = createMagnet(3)
    state.level = 2
    const lv = levelAt(state.level)
    const spike = lv.spikes[0]!
    state.x = spike!.x
    state.y = spike!.y + spike!.r + BALL_R - 1
    state.vx = 0
    state.vy = 0
    stepMagnet(state, 16)
    expect(state.phase).toBe('dead')
    expect(state.lives).toBe(START_LIVES - 1)
    expect(state.events.some(ev => ev.type === 'dead')).toBe(true)
    // 展示期推进物理不生效；期满回到出生点继续飞行。
    state.phase = 'dead'
    state.phaseMs = 1
    stepMagnet(state, 16)
    expect(state.phase).toBe('flying')
    expect(state.x).toBe(lv.start.x)
  })

  it('goal capture scores, advances level, and the last level clears', () => {
    const state = createMagnet(3)
    const lv = levelAt(state.level)
    state.x = lv.goal.x
    state.y = lv.goal.y + lv.goal.r - 1
    state.vx = 0
    state.vy = 0
    stepMagnet(state, 16)
    expect(state.phase).toBe('won')
    expect(state.score).toBe(120 * 1)
    expect(state.events.some(ev => ev.type === 'won')).toBe(true)
    // 过关期满进入第 2 关。
    state.phaseMs = 1
    stepMagnet(state, 16)
    expect(state.level).toBe(2)
    expect(state.phase).toBe('flying')
    // 直接跳到最后一关再进终点 → 全部通关。
    state.level = LEVEL_COUNT
    const last = levelAt(state.level)
    state.x = last.goal.x
    state.y = last.goal.y
    state.vx = 0
    state.vy = 0
    state.phase = 'flying'
    state.phaseMs = 0
    stepMagnet(state, 16)
    expect(state.phase).toBe('won')
    state.phaseMs = 1
    stepMagnet(state, 16)
    expect(state.phase).toBe('cleared')
    expect(state.events.some(ev => ev.type === 'cleared')).toBe(true)
  })

  it('exhausting lives ends the game', () => {
    const state = createMagnet(3)
    state.level = 2
    const lv = levelAt(state.level)
    const spike = lv.spikes[0]!
    for (let hit = 0; hit < START_LIVES; hit += 1) {
      state.x = spike.x
      state.y = spike.y
      state.vx = 0
      state.vy = 0
      state.phase = 'flying'
      state.phaseMs = 0
      stepMagnet(state, 16)
    }
    expect(state.phase).toBe('gameover')
    expect(state.lives).toBe(0)
  })

  it('MAGNET_LEVELS: five levels, magnets 2..5, everything in bounds', () => {
    expect(MAGNET_LEVELS).toHaveLength(5)
    for (let i = 0; i < MAGNET_LEVELS.length; i += 1) {
      const lv = MAGNET_LEVELS[i]!
      // 磁铁总数 2→5 递进（活动 1 + 固定 [1,2,3,4,4]）。
      expect(lv.fixed.length).toBe([1, 2, 3, 4, 4][i])
      const all = [...lv.fixed, lv.player]
      for (const m of all) {
        expect(m.x).toBeGreaterThan(20)
        expect(m.x).toBeLessThan(460)
        expect(m.y).toBeGreaterThan(20)
        expect(m.y).toBeLessThan(580)
        expect(m.strength).toBeGreaterThan(0)
      }
      expect(lv.goal.r).toBeGreaterThan(0)
      expect(lv.start.x).toBeGreaterThan(BALL_R)
      expect(lv.start.y).toBeGreaterThan(BALL_R)
      expect(lv.start.y).toBeLessThan(600 - BALL_R)
      // 固定磁铁沿路线交替极性（弹射链可解的布局特征）。
      for (let j = 1; j < lv.fixed.length; j += 1) {
        expect(lv.fixed[j]!.polarity).not.toBe(lv.fixed[j - 1]!.polarity)
      }
    }
  })

  it('every handcrafted level is solvable and replays deterministically', () => {
    // 「近磁铁且翻转后合力更指向终点即翻转」+ 静止自救的贪心策略。
    const solve = (li: number, maxSec = 30): { solved: boolean, trace: string[] } => {
      const state = createMagnet(42)
      state.level = li + 1
      const lv = MAGNET_LEVELS[li]!
      state.x = lv.start.x
      state.y = lv.start.y
      state.vx = 0
      state.vy = 0
      let cooldown = 0
      let still = 0
      const trace: string[] = []
      let solved = false
      const steps = Math.floor((maxSec * 1000) / 16)
      for (let i = 0; i < steps; i += 1) {
        cooldown = Math.max(0, cooldown - 16)
        if (state.phase === 'flying' && cooldown === 0) {
          const other: Polarity = state.polarity === 'N' ? 'S' : 'N'
          const fNow = forceAt(lv, state.x, state.y, state.polarity)
          const fNew = forceAt(lv, state.x, state.y, other)
          const tgx = lv.goal.x - state.x
          const tgy = lv.goal.y - state.y
          const next = fNew.fx * tgx + fNew.fy * tgy
          const now = fNow.fx * tgx + fNow.fy * tgy
          let near = false
          for (const m of lv.fixed) {
            if (Math.hypot(state.x - m.x, state.y - m.y) < 100) near = true
          }
          if (Math.hypot(state.x - lv.player.x, state.y - lv.player.y) < 100) near = true
          if (near && next > now) {
            flipPolarity(state)
            cooldown = 500
          }
        }
        still = Math.hypot(state.vx, state.vy) < 25 ? still + 16 : 0
        if (state.phase === 'flying' && still > 1000 && cooldown === 0) {
          flipPolarity(state)
          cooldown = 500
          still = 0
        }
        stepMagnet(state, 16)
        if (i % 8 === 0) trace.push(Math.round(state.x) + ':' + Math.round(state.y) + ':' + state.polarity + ':' + state.phase)
        // 撞刺立即重生继续（策略容错）。
        if (state.phase === 'dead') {
          state.phase = 'flying'
          state.x = lv.start.x
          state.y = lv.start.y
          state.vx = 0
          state.vy = 0
          state.phaseMs = 0
        }
        // 过关进入下一关即视为本关可解，终止本关回放。
        if (state.level > li + 1) { solved = true; break }
        if (state.phase === 'cleared') { solved = true; break }
      }
      return { solved, trace }
    }
    for (let li = 0; li < MAGNET_LEVELS.length; li += 1) {
      const once = solve(li)
      expect(once.solved, 'level ' + (li + 1) + ' solvable').toBe(true)
      // 同种子同策略重放完全一致。
      expect(solve(li).trace).toEqual(once.trace)
    }
  })
})
