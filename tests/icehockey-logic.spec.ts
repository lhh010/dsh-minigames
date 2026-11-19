import { describe, expect, it } from 'vitest'
import {
  createState, step, mulberry32, mulberry32Step, clampMallet, aiDecide, aiParams,
  collideMalletPuck, resolveEdges,
  W, H, TOP, BOT, CENTER_Y, PUCK_R, MALLET_R, GOAL_HALF, WALL_E, MALLET_E, FRICTION,
  MAX_PUCK_SPEED, PLAYER_SPEED, WIN_SCORE, GAMES_TO_WIN, SERVE_MS,
  type IceHockeyState, type Puck,
} from '../src/client/games/icehockey/logic.ts'

const FRAME = 1000 / 60
const idle: { x?: number; y?: number } = {}

/** 一份已开球（倒计时耗尽、球在场上飞行）的状态。 */
function playState(overwrites: Partial<IceHockeyState> = {}): IceHockeyState {
  const s = createState(42)
  s.serveCd = 0
  Object.assign(s, overwrites)
  return s
}

describe('icehockey logic', () => {
  it('mulberry32 与显式状态字单步一致，同种子同序列', () => {
    const rng = mulberry32(123)
    let word = 123 >>> 0
    for (let i = 0; i < 100; i += 1) {
      const stepped = mulberry32Step(word)
      expect(stepped.value).toBe(rng())
      expect(stepped.value).toBeGreaterThanOrEqual(0)
      expect(stepped.value).toBeLessThan(1)
      word = stepped.next
    }
    expect(mulberry32(7)()).toBe(mulberry32(7)())
  })

  it('初始状态几何合法：推杆各守半区、球停在发球方半区', () => {
    const s = createState(9)
    expect(s.player.y).toBeGreaterThan(CENTER_Y)
    expect(s.ai.y).toBeLessThan(CENTER_Y)
    expect(s.playerTarget).toEqual(s.player)
    expect(s.serveCd).toBe(SERVE_MS)
    expect(s.serveSide).toBe('player')
    expect(s.puck.vx).toBe(0)
    expect(s.puck.vy).toBe(0)
    expect(s.puck.y).toBeGreaterThan(CENTER_Y)
    expect(s.over).toBeNull()
    expect(s.level).toBe(1)
  })

  it('推杆-冰球弹性碰撞：静止推杆按恢复系数反弹，运动推杆传入速度', () => {
    // 静止推杆正碰：法向反弹按 MALLET_E 衰减，并分离到接触距离。
    const puck: Puck = { x: W / 2, y: 400, vx: 0, vy: 300 }
    const malletY = 400 + PUCK_R + MALLET_R - 5 // 重叠 5px
    const hit = collideMalletPuck(puck, { x: W / 2, y: malletY, vx: 0, vy: 0 })
    expect(hit).toBe(true)
    expect(puck.vy).toBeCloseTo(-300 * MALLET_E, 5)
    expect(puck.vx).toBeCloseTo(0, 5)
    expect(puck.y).toBeCloseTo(malletY - (PUCK_R + MALLET_R), 5)
    // 未接触不碰撞。
    const far: Puck = { x: 0, y: 0, vx: 5, vy: 5 }
    expect(collideMalletPuck(far, { x: 400, y: 400, vx: 0, vy: 0 })).toBe(false)
    expect(far.vx).toBe(5)
    // 运动推杆自下方以 500px/s 顶击静止球：出速 = (1+e) × 推杆法向速度。
    const mY = 400 + PUCK_R + MALLET_R - 6
    const struck: Puck = { x: W / 2, y: 400, vx: 0, vy: 0 }
    const hit2 = collideMalletPuck(struck, { x: W / 2, y: mY, vx: 0, vy: -500 })
    expect(hit2).toBe(true)
    expect(struck.vy).toBeCloseTo(-(1 + MALLET_E) * 500, 5)
    expect(struck.vx).toBeCloseTo(0, 5)
  })

  it('边墙 0.85 反弹并夹回场内；球门开口外的上下边也反弹', () => {
    const side: Puck = { x: PUCK_R - 6, y: 400, vx: -200, vy: 0 }
    expect(resolveEdges(side)).toBeNull()
    expect(side.vx).toBeCloseTo(200 * WALL_E, 5)
    expect(side.x).toBeGreaterThanOrEqual(PUCK_R)
    const topWall: Puck = { x: 30, y: TOP - PUCK_R + 4, vx: 0, vy: -260 }
    expect(resolveEdges(topWall)).toBeNull()
    expect(topWall.vy).toBeCloseTo(260 * WALL_E, 5)
    const botWall: Puck = { x: 30, y: BOT + PUCK_R - 4, vx: 0, vy: 260 }
    expect(resolveEdges(botWall)).toBeNull()
    expect(botWall.vy).toBeLessThan(0)
  })

  it('clampMallet 把推杆限制在己方半区与左右墙内', () => {
    const p = clampMallet(-100, 10, 'player')
    expect(p.x).toBe(MALLET_R)
    expect(p.y).toBe(CENTER_Y + MALLET_R) // 上越界拉回中线以下
    const p2 = clampMallet(W + 50, H + 50, 'player')
    expect(p2.x).toBe(W - MALLET_R)
    expect(p2.y).toBe(BOT - MALLET_R)
    const a = clampMallet(W / 2, -20, 'ai')
    expect(a.y).toBe(TOP + MALLET_R)
    const a2 = clampMallet(W / 2, CENTER_Y, 'ai')
    expect(a2.y).toBe(CENTER_Y - MALLET_R)
  })

  it('进球判定：整球越过门线得分、得分方发球并重摆冰球', () => {
    // 玩家攻破上球门。
    const s = playState({ puck: { x: W / 2, y: TOP - PUCK_R - 2, vx: 0, vy: -400 } })
    const next = step(s, FRAME, idle)
    expect(next.playerScore).toBe(1)
    expect(next.playerGoals).toBe(1)
    expect(next.serveSide).toBe('player')
    expect(next.serveCd).toBe(SERVE_MS)
    expect(next.puck.vx).toBe(0)
    expect(next.puck.y).toBeGreaterThan(CENTER_Y)
    // 对方攻破下球门。
    const s2 = playState({ puck: { x: W / 2, y: BOT + PUCK_R + 2, vx: 0, vy: 400 } })
    const next2 = step(s2, FRAME, idle)
    expect(next2.aiScore).toBe(1)
    expect(next2.serveSide).toBe('ai')
    expect(next2.puck.y).toBeLessThan(CENTER_Y)
    // 门柱外侧越线不进球（反弹）。
    const s3 = playState({ puck: { x: 20, y: BOT + PUCK_R + 3, vx: 0, vy: 400 } })
    const next3 = step(s3, FRAME, idle)
    expect(next3.aiScore).toBe(0)
  })

  it('AI 决策确定且随难度提升：慢球进攻、快球或远球回防', () => {
    // 球在 AI 半区且慢 → 进攻，目标在球身后（更远离对方球门一侧）。
    const atk = aiDecide(W / 2, TOP + 160, 0, 1)
    expect(atk.attack).toBe(true)
    expect(atk.y).toBeLessThan(TOP + 160) // 目标点在球的上方（身后）
    // 球速过快 → 回防球门前。
    const def = aiDecide(W / 2, TOP + 160, 9999, 1)
    expect(def.attack).toBe(false)
    expect(def.y).toBeCloseTo(TOP + 74, 5)
    expect(def.x).toBeCloseTo(W / 2, 5)
    // 球在玩家半区 → 回防并横向盯球。
    const def2 = aiDecide(W - 60, BOT - 100, 0, 1)
    expect(def2.attack).toBe(false)
    expect(def2.x).toBe(W / 2 + GOAL_HALF * 1.5) // 盯球但被拦在防区宽度内
    // 难度参数单调：反应更快、更快更狠。
    const l1 = aiParams(1)
    const l3 = aiParams(3)
    expect(l3.reactionMs).toBeLessThan(l1.reactionMs)
    expect(l3.speed).toBeGreaterThan(l1.speed)
    expect(l3.attackSpeed).toBeGreaterThan(l1.attackSpeed)
    expect(l3.jitter).toBeLessThan(l1.jitter)
  })

  it('推杆追球限速：一帧内位移不超过 PLAYER_SPEED × dt', () => {
    const s = playState({ player: { x: W / 2, y: BOT - 80 }, playerTarget: { x: W / 2, y: BOT - 80 } })
    const next = step(s, FRAME, { x: 40, y: CENTER_Y + MALLET_R + 10 })
    const moved = Math.hypot(next.player.x - s.player.x, next.player.y - s.player.y)
    expect(moved).toBeGreaterThan(0)
    expect(moved).toBeLessThanOrEqual(PLAYER_SPEED * (FRAME / 1000) + 1e-9)
    expect(next.player.y).toBeGreaterThanOrEqual(CENTER_Y + MALLET_R)
  })

  it('局与场流程：先得 7 分胜一局，3 局 2 胜，终场冻结', () => {
    // 6:0 时攻破上门 → 拿下第 1 局，进入第 2 局（关卡 2、比分清零、败方发球）。
    const s = playState({
      playerScore: WIN_SCORE - 1, aiScore: 0, playerGames: 0, aiGames: 0,
      puck: { x: W / 2, y: TOP - PUCK_R - 2, vx: 0, vy: -400 },
    })
    const next = step(s, FRAME, idle)
    expect(next.playerGames).toBe(1)
    expect(next.over).toBeNull()
    expect(next.playerScore).toBe(0)
    expect(next.level).toBe(2)
    expect(next.serveSide).toBe('ai')
    // 第 2 局再拿下 → 终场。
    const s2 = playState({
      playerScore: WIN_SCORE - 1, playerGames: 1, aiGames: 0, level: 2,
      puck: { x: W / 2, y: TOP - PUCK_R - 2, vx: 0, vy: -400 },
    })
    const final = step(s2, FRAME, idle)
    expect(final.over).toBe('player')
    expect(final.playerGames).toBe(GAMES_TO_WIN)
    expect(final.serveCd).toBe(0)
    expect(step(final, FRAME, idle)).toBe(final) // 终场冻结
    // 对方 2 局获胜镜像。
    const s3 = playState({
      aiScore: WIN_SCORE - 1, playerGames: 0, aiGames: 1,
      puck: { x: W / 2, y: BOT + PUCK_R + 2, vx: 0, vy: 400 },
    })
    expect(step(s3, FRAME, idle).over).toBe('ai')
  })

  it('摩擦衰减与球速上限生效', () => {
    // 无推杆干扰、沿中线下方平飞 2 秒：速度按指数摩擦衰减。
    let s = playState({ puck: { x: 100, y: CENTER_Y + 90, vx: 600, vy: 0 } })
    for (let f = 0; f < Math.round(2000 / FRAME); f += 1) s = step(s, FRAME, idle)
    expect(Math.abs(s.puck.vx)).toBeLessThan(600)
    expect(Math.abs(s.puck.vx)).toBeGreaterThan(0)
    // 直接构造超限球速，一步后被夹到上限。
    const fast = playState({ puck: { x: W / 2, y: CENTER_Y + 90, vx: 0, vy: MAX_PUCK_SPEED * 3 } })
    const capped = step(fast, FRAME, idle)
    expect(Math.hypot(capped.puck.vx, capped.puck.vy)).toBeLessThanOrEqual(MAX_PUCK_SPEED + 1e-6)
    expect(FRICTION).toBeGreaterThan(0)
  })

  it('固定子步重放确定性：同种子同输入序列必得同一终态', () => {
    const run = (): IceHockeyState => {
      let s = createState(2026)
      for (let f = 0; f < Math.round(12000 / FRAME); f += 1) {
        const input = f % 2 === 0
          ? { x: W / 2 + Math.sin(f * 0.05) * 160, y: BOT - 60 - (f % 90) }
          : {}
        s = step(s, FRAME, input)
      }
      return s
    }
    const a = run()
    const b = run()
    expect(a).toEqual(b) // 含 rngState 的深相等
    expect(H).toBeGreaterThan(W) // 竖直球台
  })
})