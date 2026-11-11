import { describe, expect, it } from 'vitest'
import {
  BULL_INNER, BULL_OUTER, DARTS_PER_TURN, DOUBLE_INNER, DOUBLE_OUTER, MAX_ROUNDS,
  START_SCORE, TRIPLE_OUTER, aiAim, checkoutHint, createDartsState, driftAt,
  mulberry32, runAiTurn, scoreAt, sectorPoint, throwDart,
} from '../src/client/games/darts/logic.ts'

describe('darts 501 logic', () => {
  it('角度命中正确分区：正上方 20、正右方 6、左下 3', () => {
    const top = scoreAt(0, -DOUBLE_INNER - 0.01)
    expect(top.sector).toBe(20)
    expect(top.ring).toBe('double')
    // 正右方 = 顺时针 90° = SECTORS[5] = 6。
    const east = scoreAt(TRIPLE_OUTER + 0.05, 0)
    expect(east.sector).toBe(6)
    // 正下方（顺时针 180°）= SECTORS[10] = 3。
    const down = scoreAt(0, 0.8)
    expect(down.sector).toBe(3)
    expect(down.ring).toBe('single')
    // 顺时针 220° = SECTORS[12] = 7。
    const sw = scoreAt(Math.sin(220 * Math.PI / 180) * 0.8, -Math.cos(220 * Math.PI / 180) * 0.8)
    expect(sw.sector).toBe(7)
  })

  it('环型判定：双倍 / 三倍 / 外靶心 25 / 红心 50 / 脱靶', () => {
    expect(scoreAt(0.98, 0).ring).toBe('double')
    expect(scoreAt(0.6, 0).ring).toBe('triple')
    const t20 = scoreAt(0, -0.6)
    expect(t20.sector).toBe(20)
    expect(t20.points).toBe(60) // T20
    const bull = scoreAt(BULL_OUTER / 2, 0)
    expect(bull.points).toBe(25)
    const inner = scoreAt(BULL_INNER / 2, 0)
    expect(inner.points).toBe(50)
    expect(inner.ring).toBe('bull50')
    expect(scoreAt(DOUBLE_OUTER + 0.05, 0).ring).toBe('miss')
    expect(scoreAt(DOUBLE_OUTER + 0.05, 0).points).toBe(0)
  })

  it('恰好归零且末镖双倍 = 结账获胜', () => {
    const s = createDartsState(7, false)
    s.human.remaining = 40
    s.human.turnStart = 40
    const aim = sectorPoint(20, 'double')
    const res = throwDart(s, aim.x, aim.y, 0)!
    // 漂移极小但存在：直接断言 checkout 路径——用 t=0 且贴近双倍中心。
    if (res.points === 40) {
      expect(res.checkout).toBe(true)
      expect(s.human.remaining).toBe(0)
      expect(s.winner).toBe('human')
    } else {
      // 漂移导致落点偏移时本镖不结账，但也绝不能负数获胜。
      expect(res.checkout).toBe(false)
      expect(s.winner).toBeNull()
    }
  })

  it('红心 50 也算双倍收尾', () => {
    const s = createDartsState(11, false)
    s.human.remaining = 50
    s.human.turnStart = 50
    const res = throwDart(s, 0, 0, 0)!
    expect(res.ring).toBe('bull50')
    expect(res.points).toBe(50)
    expect(res.checkout).toBe(true)
    expect(s.winner).toBe('human')
  })

  it('爆分三种情形都回退到本回合起点', () => {
    // 扣成负数：剩 20 打 T20（漂移带内仍是 60 或单区 20，均爆分）。
    const a = createDartsState(3, false)
    a.human.remaining = 20
    a.human.turnStart = 20
    const ta = sectorPoint(20, 'triple')
    const ra = throwDart(a, ta.x, ta.y, 0)!
    expect(ra.bust).toBe(true)
    expect(a.human.remaining).toBe(20)
    // 归零但末镖非双倍：剩 20 打单区 20。
    const b = createDartsState(3, false)
    b.human.remaining = 20
    b.human.turnStart = 20
    const sb = sectorPoint(20, 'single')
    const rb = throwDart(b, sb.x, sb.y, 0)!
    expect(rb.points).toBe(20)
    expect(rb.bust).toBe(true)
    expect(b.human.remaining).toBe(20)
    // 剩 1 分：21 - 单区 20 = 1，同样爆分。
    const c = createDartsState(3, false)
    c.human.remaining = 21
    c.human.turnStart = 21
    const rc = throwDart(c, sb.x, sb.y, 0)!
    expect(rc.bust).toBe(true)
    expect(c.human.remaining).toBe(21)
  })

  it('普通扣减累计三镖后进入下一轮，满 5 轮按剩余分结算', () => {
    const s = createDartsState(42, false)
    // 用远离盘面的大偏移打出脱靶（0 分）：aim 超界 + 漂移仍在界外。
    for (let round = 1; round <= MAX_ROUNDS; round += 1) {
      expect(s.round).toBe(round)
      for (let d = 0; d < DARTS_PER_TURN; d += 1) {
        const res = throwDart(s, 0, 1.14, 0)!
        expect(res.points).toBe(0)
        expect(res.bust).toBe(false)
      }
      expect(s.marks).toHaveLength(0) // turn 结束清空
    }
    expect(s.winner).toBe('draw') // 双方都 501 未动
    expect(throwDart(s, 0, 0, 0)).toBeNull() // 对局已结束
  })

  it('AI 掷镖同种子完全确定且计分合法', () => {
    const run = (): { remaining: number; results: number[] } => {
      const s = createDartsState(99, true)
      s.turn = 'ai'
      s.ai.turnStart = s.ai.remaining
      const out = runAiTurn(s)
      return { remaining: s.ai.remaining, results: out.map(r => r.points) }
    }
    const first = run()
    const second = run()
    expect(first.results).toEqual(second.results)
    expect(first.remaining).toBe(second.remaining)
    expect(first.results).toHaveLength(DARTS_PER_TURN)
    for (const p of first.results) {
      expect([0, 25, 50].includes(p) || (p >= 2 && p <= 60)).toBe(true)
    }
    // 结束后轮到 human，进入第 2 轮。
    const s = createDartsState(99, true)
    s.turn = 'ai'
    runAiTurn(s)
    expect(s.turn).toBe('human')
    expect(s.round).toBe(2)
  })

  it('AI 剩 40 时偏好 D20 瞄准点', () => {
    const rng = mulberry32(5)
    const aim = aiAim(40, rng)
    const dbl = sectorPoint(20, 'double')
    expect(aim.x).toBeCloseTo(dbl.x, 6)
    expect(aim.y).toBeCloseTo(dbl.y, 6)
    const bull = aiAim(50, rng)
    expect(bull.x).toBe(0)
    expect(bull.y).toBe(0)
  })

  it('漂移与投掷同种子确定性；169/168 等分无固定结账路线', () => {
    const a = createDartsState(1234, false)
    const b = createDartsState(1234, false)
    const da = driftAt(a, 12.5)
    const db = driftAt(b, 12.5)
    expect(da).toEqual(db)
    expect(Math.hypot(da.dx, da.dy)).toBeLessThanOrEqual(0.05)
    const ra = throwDart(a, 0.2, -0.3, 7.25)!
    const rb = throwDart(b, 0.2, -0.3, 7.25)!
    expect({ x: ra.x, y: ra.y, points: ra.points }).toEqual({ x: rb.x, y: rb.y, points: rb.points })
    expect(checkoutHint(170)).toBe('T20 T20 红心')
    expect(checkoutHint(40)).toBe('D20')
    expect(checkoutHint(50)).toBe('红心')
    expect(checkoutHint(169)).toBeNull()
    expect(checkoutHint(168)).toBeNull()
    expect(checkoutHint(171)).toBeNull()
    expect(START_SCORE).toBe(501)
  })
})
