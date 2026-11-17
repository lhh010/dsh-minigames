/**
 * 弹珠瀑布 Plinko 逻辑测试：钉阵几何、确定性物理重放、落槽结算、
 * 直方图统计与轮次流程。全部走注入 seed，无真随机。
 */
import { describe, expect, it } from 'vitest'
import {
  BALLS_PER_ROUND, BALL_R, BASE_BET, DROP_COLS, DROP_COOLDOWN,
  PEG_DY, PEG_R, PEG_ROWS, PEG_Y0, ROUNDS, SLOT_COUNT, SLOT_MULTIPLIERS,
  SLOT_W, SLOT_Y, WALL_L, WALL_R, ballSubSeed, buildPegs, colDistribution, createGame,
  dropBall, dropBallAt, dropColX, moveAim, mulberryNext, previewUnlocked,
  slotIndexForX, slotPoints, step,
} from '../src/client/games/plinko/logic.ts'
import type { PlinkoEvent, PlinkoState } from '../src/client/games/plinko/logic.ts'

const DT = 1 / 60
/** 自动试玩投放列序列（固定，保证重放一致）。 */
const PATTERN = [2, 4, 6, 4, 2, 5, 3, 1, 7, 0, 8, 4, 3, 5, 2]

/**
 * 自动试玩：每逢冷却结束按固定列序列投放，直到结束或超时。
 * @param seed - 本局种子。
 * @param keepEvents - true 时保留全部事件（默认每帧清空）。
 * @returns 终态。
 */
function autoplay(seed: number, keepEvents = false): PlinkoState {
  const s = createGame(seed)
  let t = 0
  while (t < 90 && s.phase === 'playing') {
    if (s.cooldown <= 0 && s.ballsLeft > 0) {
      s.aimCol = PATTERN[s.dropped % PATTERN.length]!
      dropBall(s)
    }
    step(s, DT)
    if (!keepEvents) s.events.length = 0
    t += DT
  }
  return s
}

/** 指纹：落槽序列 + 总分 + 直方图展开，用于逐位重放比较。 */
function fingerprint(s: PlinkoState): string {
  return s.landings.map(l => l.slot + ':' + l.points).join('|')
    + '#' + s.score
    + '#' + s.histogram.map(r => r.join(',')).join(';')
}

/** 投出第一颗弹珠并推进固定步数，返回采样到的位置/速度（六位小数）。 */
function firstBallPath(seed: number, col: number, steps: number): string {
  const s = createGame(seed)
  expect(dropBallAt(s, col)).toBe(true)
  for (let i = 0; i < steps; i += 1) step(s, DT)
  const b = s.balls[0]
  if (b === undefined) return 'settled:' + String(s.landings[0]?.slot ?? -1)
  return b.x.toFixed(6) + ',' + b.y.toFixed(6) + ',' + b.vx.toFixed(6) + ',' + b.vy.toFixed(6)
}

describe('plinko logic', () => {
  it('钉阵几何：9 行交错（偶 10 / 奇 9 钉）、行距槽宽对齐、全部在墙内', () => {
    const pegs = buildPegs()
    expect(pegs.length).toBe(5 * 10 + 4 * 9)
    const rows = new Map<number, number>()
    for (const p of pegs) rows.set(p.row, (rows.get(p.row) ?? 0) + 1)
    expect(rows.size).toBe(PEG_ROWS)
    for (let r = 0; r < PEG_ROWS; r += 1) {
      expect(rows.get(r)).toBe(r % 2 === 0 ? 10 : 9)
      const rowPegs = pegs.filter(p => p.row === r)
      for (const p of rowPegs) {
        expect(p.y).toBeCloseTo(PEG_Y0 + r * PEG_DY, 6)
        expect(p.x).toBeGreaterThan(WALL_L)
        expect(p.x).toBeLessThan(WALL_R)
      }
      const sorted = rowPegs.map(p => p.x).sort((a, b) => a - b)
      for (let i = 1; i < sorted.length; i += 1) {
        expect(sorted[i]! - sorted[i - 1]!).toBeCloseTo(SLOT_W, 5)
      }
    }
    const even0 = pegs.find(p => p.row === 0)!.x
    const odd0 = pegs.find(p => p.row === 1)!.x
    expect(odd0 - even0).toBeCloseTo(SLOT_W / 2, 5)
  })

  it('倍率槽：11 槽对称、边缘低中央高；slotIndexForX 含钳制；结算 = 底注×倍率', () => {
    expect(SLOT_COUNT).toBe(11)
    expect(SLOT_MULTIPLIERS).toEqual([0.2, 0.5, 1, 2, 5, 10, 5, 2, 1, 0.5, 0.2])
    for (let i = 0; i < SLOT_COUNT; i += 1) {
      expect(SLOT_MULTIPLIERS[i]).toBe(SLOT_MULTIPLIERS[SLOT_COUNT - 1 - i])
    }
    expect(slotIndexForX(WALL_L + SLOT_W * 0.5)).toBe(0)
    expect(slotIndexForX(WALL_L + SLOT_W * 5.5)).toBe(5)
    expect(slotIndexForX(WALL_L - 50)).toBe(0)
    expect(slotIndexForX(WALL_R + 50)).toBe(SLOT_COUNT - 1)
    expect(slotPoints(0)).toBe(2)
    expect(slotPoints(5)).toBe(BASE_BET * 10)
    expect(slotPoints(10)).toBe(2)
  })

  it('投放：受冷却限制、消耗弹珠余量、moveAim 钳制、dropColX 单调', () => {
    const s = createGame(7)
    expect(s.aimCol).toBe(4)
    expect(dropBall(s)).toBe(true)
    expect(s.ballsLeft).toBe(BALLS_PER_ROUND - 1)
    expect(dropBall(s)).toBe(false)
    for (let t = 0; t < DROP_COOLDOWN + 0.05; t += DT) step(s, DT)
    expect(dropBall(s)).toBe(true)
    for (let i = 0; i < 30; i += 1) moveAim(s, 1)
    expect(s.aimCol).toBe(DROP_COLS - 1)
    for (let i = 0; i < 30; i += 1) moveAim(s, -1)
    expect(s.aimCol).toBe(0)
    expect(dropColX(0)).toBeLessThan(dropColX(DROP_COLS - 1))
  })

  it('整局自动试玩：15 珠全部落槽、落点在墙内、每颗结算与槽倍率一致', () => {
    const s = autoplay(42, true)
    expect(s.phase).toBe('ended')
    expect(s.landings.length).toBe(ROUNDS * BALLS_PER_ROUND)
    const lands = s.events.filter((e): e is Extract<PlinkoEvent, { kind: 'land' }> => e.kind === 'land')
    expect(lands.length).toBe(ROUNDS * BALLS_PER_ROUND)
    for (const ev of lands) {
      expect(ev.points).toBe(slotPoints(ev.slot))
      expect(ev.x).toBeGreaterThanOrEqual(WALL_L + BALL_R)
      expect(ev.x).toBeLessThanOrEqual(WALL_R - BALL_R)
      expect(ev.y).toBeLessThan(SLOT_Y + 60)
    }
  })

  it('确定性：同种子同投放序列重放，指纹逐位一致；异种子轨迹不同', () => {
    const a = autoplay(1234)
    const b = autoplay(1234)
    expect(fingerprint(a)).toEqual(fingerprint(b))
    expect(a.score).toBe(b.score)
    expect(fingerprint(autoplay(1235))).not.toEqual(fingerprint(a))
  })

  it('同投放点 + 同子 seed 逐位重放；改投放点或换子 seed 轨迹不同', () => {
    expect(firstBallPath(99, 3, 240)).toEqual(firstBallPath(99, 3, 240))
    expect(firstBallPath(99, 3, 240)).not.toEqual(firstBallPath(99, 5, 240))
    expect(ballSubSeed(99, 0)).not.toBe(ballSubSeed(99, 1))
    const s0 = createGame(99)
    expect(dropBallAt(s0, 3)).toBe(true)
    expect(dropBallAt(s0, 3)).toBe(false)
    for (let t = 0; t < DROP_COOLDOWN + 0.05; t += DT) step(s0, DT)
    expect(dropBallAt(s0, 3)).toBe(true)
    expect(s0.balls[0]!.rngState).not.toBe(s0.balls[1]!.rngState)
    const s1 = createGame(100)
    dropBallAt(s1, 3)
    expect(s1.balls[0]!.rngState).not.toBe(s0.balls[0]!.rngState)
  })

  it('mulberry32 流：确定性、落在 [0,1)、状态推进且铺满值域', () => {
    const a = mulberryNext(123)
    const b = mulberryNext(123)
    expect(a.value).toBe(b.value)
    expect(a.next).toBe(b.next)
    expect(a.value).toBeGreaterThanOrEqual(0)
    expect(a.value).toBeLessThan(1)
    expect(mulberryNext(a.next).next).not.toBe(a.next)
    let st = 1
    let min = 1
    let max = 0
    for (let i = 0; i < 2000; i += 1) {
      const d = mulberryNext(st)
      st = d.next
      min = Math.min(min, d.value)
      max = Math.max(max, d.value)
    }
    expect(min).toBeGreaterThanOrEqual(0)
    expect(max).toBeLessThan(1)
    expect(max - min).toBeGreaterThan(0.9)
  })

  it('直方图：按投放列累计落槽分布，第 1 轮结束解锁预览', () => {
    const s = createGame(5)
    expect(previewUnlocked(s)).toBe(false)
    for (let i = 0; i < BALLS_PER_ROUND; i += 1) {
      dropBallAt(s, 2)
      while (s.balls.length > 0) step(s, DT)
    }
    expect(s.completedRounds).toBe(1)
    expect(previewUnlocked(s)).toBe(true)
    expect(s.round).toBe(2)
    expect(s.ballsLeft).toBe(BALLS_PER_ROUND)
    const dist = colDistribution(s, 2)
    expect(dist.reduce((a, b) => a + b, 0)).toBe(BALLS_PER_ROUND)
    expect(colDistribution(s, 0).reduce((a, b) => a + b, 0)).toBe(0)
    expect(dist).toEqual(s.histogram[2]!)
  })

  it('轮次流程：3 轮各 5 珠，roundEnd(1..3) 与 ended 事件齐备、轮分非负', () => {
    const s = autoplay(77, true)
    expect(s.phase).toBe('ended')
    expect(s.completedRounds).toBe(ROUNDS)
    const roundEnds = s.events.filter(
      (e): e is Extract<PlinkoEvent, { kind: 'roundEnd' }> => e.kind === 'roundEnd',
    )
    expect(roundEnds.map(e => e.round)).toEqual([1, 2, 3])
    for (const e of roundEnds) expect(e.roundScore).toBeGreaterThanOrEqual(0)
    const ended = s.events.filter(
      (e): e is Extract<PlinkoEvent, { kind: 'ended' }> => e.kind === 'ended',
    )
    expect(ended.length).toBe(1)
    expect(ended[0]!.score).toBe(s.score)
    expect(roundEnds.reduce((a, e) => a + e.roundScore, 0)).toBe(s.score)
  })

  it('总分 = 全部落槽得分之和', () => {
    const s = autoplay(2024)
    expect(s.score).toBe(s.landings.reduce((a, l) => a + l.points, 0))
  })

  it('碰撞不变量：任意帧弹珠与钉保持分离，且不出墙', () => {
    const s = createGame(31337)
    dropBallAt(s, 4)
    const pegs = buildPegs()
    for (let i = 0; i < 600; i += 1) {
      step(s, DT)
      for (const b of s.balls) {
        expect(b.x).toBeGreaterThanOrEqual(WALL_L + BALL_R - 0.01)
        expect(b.x).toBeLessThanOrEqual(WALL_R - BALL_R + 0.01)
        for (const p of pegs) {
          expect(Math.hypot(b.x - p.x, b.y - p.y)).toBeGreaterThanOrEqual(BALL_R + PEG_R - 0.01)
        }
      }
      if (s.balls.length === 0 && i > 60) break
    }
  })
})
