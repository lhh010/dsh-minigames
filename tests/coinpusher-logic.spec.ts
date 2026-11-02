
import { describe, expect, it } from 'vitest'
import {
  COOLDOWN_MS, DROP_COLS, PUSH_TRAVEL, PUSH_X_BACK, ROUND_MS, START_COINS,
  colX, createGame, dropCoin, moveAim, pusherXAt, step,
} from '../src/client/games/coinpusher/logic.ts'

/** 模拟脚本：每 0.4s 投一枚（在瞄准列循环），共 simSec 秒，返回状态便于断言。 */
function autoplay(seed: number, simSec: number, dropEvery = 0.42): ReturnType<typeof createGame> {
  const s = createGame(seed)
  let t = 0
  let nextDrop = 0.2
  let col = 0
  const dt = 1 / 60
  while (t < simSec && s.result === 'playing') {
    if (t >= nextDrop) {
      s.aimCol = col % DROP_COLS
      dropCoin(s)
      col += 1
      nextDrop += dropEvery
    }
    step(s, dt)
    s.events.length = 0
    t += dt
  }
  return s
}

/** 状态指纹：按 id 排序的币位置 + 分数，用于确定性比较。 */
function fingerprint(s: ReturnType<typeof createGame>): string {
  const coins = [...s.coins].sort((a, b) => a.id - b.id)
    .map(c => c.id + ':' + c.x.toFixed(3) + ',' + c.y.toFixed(3) + ',' + c.type + ',' + c.state)
    .join('|')
  return coins + '#' + s.score + '#' + s.coinsLeft + '#' + s.pusherX.toFixed(4)
}

describe('coinpusher logic', () => {
  it('初始台面：静态币堆在台面内、状态可玩、瞄准列合法', () => {
    const s = createGame(7)
    expect(s.result).toBe('playing')
    expect(s.coinsLeft).toBe(START_COINS)
    expect(s.aimCol).toBeGreaterThanOrEqual(0)
    expect(s.aimCol).toBeLessThan(DROP_COLS)
    expect(s.coins.length).toBeGreaterThan(0)
    for (const c of s.coins) {
      expect(c.x).toBeGreaterThan(0)
      expect(c.x).toBeLessThan(600)
    }
  })

  it('dropCoin 受冷却限制并消耗币量', () => {
    const s = createGame(3)
    expect(dropCoin(s)).toBe(true)
    expect(s.coinsLeft).toBe(START_COINS - 1)
    expect(dropCoin(s)).toBe(false) // 冷却中
    for (let t = 0; t < COOLDOWN_MS / 1000 + 0.05; t += 1 / 60) step(s, 1 / 60)
    expect(dropCoin(s)).toBe(true)
  })

  it('moveAim 钳制在 [0, DROP_COLS)', () => {
    const s = createGame(3)
    for (let i = 0; i < 20; i += 1) moveAim(s, 1)
    expect(s.aimCol).toBe(DROP_COLS - 1)
    for (let i = 0; i < 20; i += 1) moveAim(s, -1)
    expect(s.aimCol).toBe(0)
    expect(colX(0)).toBeLessThan(colX(DROP_COLS - 1))
  })

  it('pusherXAt 余弦往复且在行程内', () => {
    expect(pusherXAt(0)).toBeCloseTo(PUSH_X_BACK, 5)
    expect(pusherXAt(0.5)).toBeCloseTo(PUSH_X_BACK + PUSH_TRAVEL, 5)
    expect(pusherXAt(1)).toBeCloseTo(PUSH_X_BACK, 5)
    for (let p = 0; p < 1; p += 0.01) {
      expect(pusherXAt(p)).toBeGreaterThanOrEqual(PUSH_X_BACK - 0.001)
      expect(pusherXAt(p)).toBeLessThanOrEqual(PUSH_X_BACK + PUSH_TRAVEL + 0.001)
    }
  })

  it('自动试玩确定性：同 seed 重放指纹一致，且分数累积', () => {
    const a = autoplay(42, 10)
    const b = autoplay(42, 10)
    expect(fingerprint(a)).toEqual(fingerprint(b))
    expect(a.coinsLeft).toBeLessThan(START_COINS)
    expect(a.score).toBeGreaterThanOrEqual(0)
  })

  it('时限到（约 60 秒）结算结束', () => {
    const s = autoplay(9, 75)
    expect(s.result).toBe('ended')
    void ROUND_MS
  })
})
