import { describe, expect, it } from 'vitest'
import {
  AI_COUNT, CX, CY, MIN_BOOST_LENGTH, TICK, WORLD_W, ZONE_GRACE_TICKS, ZONE_START_R,
  createSnakeio, makeSnake, normAngle, placeSnake, playerRank,
  snakeioSnapshot, stepSnakeio, turnRatePerTick, zoneRadiusAt,
  type IoInput, type IoState,
} from '../src/client/games/snakeio/logic.ts'

/** 直行 / 直行加速 / 转向的玩家输入。 */
const drive = (turn: -1 | 0 | 1, boost = false): IoInput => ({ turn, boost })

/** 只留玩家（清空 AI 与光点）的受控局面。 */
function soloState(angle: number): { state: IoState } {
  const state = createSnakeio(7, 1)
  const player = state.snakes[0]!
  placeSnake(player, CX, CY, angle)
  state.snakes = [player]
  state.foods = []
  return { state }
}

describe('snakeio determinism', () => {
  it('same seed + same input sequence -> identical tick snapshots', () => {
    const run = (): string => {
      const state = createSnakeio(42, 1)
      let snap = ''
      for (let i = 0; i < 240; i += 1) {
        const turn: -1 | 0 | 1 = i % 60 < 30 ? 1 : -1
        stepSnakeio(state, drive(turn, i % 40 < 20))
        snap += snakeioSnapshot(state) + ';'
      }
      return snap
    }
    expect(run()).toBe(run())
  })

  it('different seeds diverge, and same seed different rounds diverge', () => {
    const a = createSnakeio(1, 1)
    const b = createSnakeio(2, 1)
    const c = createSnakeio(9, 2)
    for (let i = 0; i < 120; i += 1) {
      stepSnakeio(a, drive(0))
      stepSnakeio(b, drive(0))
      stepSnakeio(c, drive(0))
    }
    expect(snakeioSnapshot(a)).not.toBe(snakeioSnapshot(b))
    expect(snakeioSnapshot(a)).not.toBe(snakeioSnapshot(c))
  })
})

describe('snakeio growth and boost', () => {
  it('eating a pellet in front of the head grows the snake', () => {
    const { state } = soloState(0)
    const player = state.snakes[0]!
    state.foods.push({ x: CX + 40, y: CY, r: 4, value: 20, color: 2 })
    for (let i = 0; i < 12; i += 1) stepSnakeio(state, drive(0))
    expect(player.length).toBeGreaterThan(20)
    expect(player.peak).toBeGreaterThan(20)
  })

  it('boosting consumes length and spits food behind the tail', () => {
    const { state } = soloState(0)
    const player = state.snakes[0]!
    placeSnake(player, CX, CY, 0, 60)
    const before = player.length
    for (let i = 0; i < 90; i += 1) stepSnakeio(state, drive(0, true))
    expect(player.length).toBeLessThan(before - 5)
    expect(state.foods.length).toBeGreaterThan(0)
    expect(player.alive).toBe(true)
  })

  it('cannot boost below the minimum length', () => {
    const { state } = soloState(0)
    const player = state.snakes[0]!
    placeSnake(player, CX, CY, 0, MIN_BOOST_LENGTH - 2)
    for (let i = 0; i < 30; i += 1) stepSnakeio(state, drive(0, true))
    expect(player.boosting).toBe(false)
    expect(player.length).toBeGreaterThanOrEqual(6)
  })
})

describe('snakeio death', () => {
  it('head hits a body -> death, loot dropped, kill credited to the body owner', () => {
    const state = createSnakeio(5, 1)
    const player = state.snakes[0]!
    placeSnake(player, CX, CY - 200, 0)
    // 一条不决策的直线蛇（ai=false 故不转向）横在玩家航线旁：头在
    // (CX+150, CY)，向下行驶，身体在身后向上延伸，恰好盖住玩家航线。
    const wall = makeSnake({
      id: 99, ai: false, name: 'wall', color: 3,
      x: CX + 150, y: CY, angle: Math.PI / 2, length: 80,
    })
    state.snakes = [player, wall]
    state.foods = []
    let died = -1
    for (let i = 0; i < 90 && !state.over; i += 1) {
      stepSnakeio(state, drive(0))
      died = i
    }
    expect(state.over).toBe(true)
    expect(player.alive).toBe(false)
    expect(state.stats).not.toBeNull()
    expect(state.stats!.win).toBe(false)
    expect(state.stats!.seconds).toBeGreaterThan(0)
    expect(state.foods.length).toBeGreaterThan(0)
    expect(wall.kills).toBe(1)
    expect(state.events.some(e => e.type === 'death' && e.victimId === player.id)).toBe(true)
    expect(died).toBeGreaterThan(3)
  })

  it('crossing the rectangular wall kills the player', () => {
    const { state } = soloState(0)
    const player = state.snakes[0]!
    placeSnake(player, WORLD_W - 80, CY, 0)
    for (let i = 0; i < 60 && !state.over; i += 1) stepSnakeio(state, drive(0))
    expect(state.over).toBe(true)
    expect(player.alive).toBe(false)
    expect(state.foods.length).toBeGreaterThan(0)
  })
})

describe('snakeio zone', () => {
  it('zone holds during grace, then shrinks linearly to the floor', () => {
    expect(zoneRadiusAt(0)).toBe(ZONE_START_R)
    expect(zoneRadiusAt(ZONE_GRACE_TICKS)).toBe(ZONE_START_R)
    expect(zoneRadiusAt(ZONE_GRACE_TICKS + 100)).toBeCloseTo(ZONE_START_R - 90, 6)
    const late = zoneRadiusAt(ZONE_GRACE_TICKS + 100000)
    expect(late).toBeGreaterThan(0)
    expect(zoneRadiusAt(ZONE_GRACE_TICKS + 100001) - late).toBeLessThanOrEqual(0)
  })

  it('staying outside the shrinking zone drains length and eventually kills', () => {
    const { state } = soloState(0)
    const player = state.snakes[0]!
    placeSnake(player, 100, 100, 0, 40)
    state.tick = ZONE_GRACE_TICKS + 600
    const r = zoneRadiusAt(state.tick)
    expect(Math.hypot(100 - CX, 100 - CY)).toBeGreaterThan(r)
    let lenAtSomePoint = -1
    for (let i = 0; i < 300 && !state.over; i += 1) {
      stepSnakeio(state, drive(0))
      if (i === 50) lenAtSomePoint = player.length
    }
    expect(lenAtSomePoint).toBeLessThan(40)
    expect(state.over).toBe(true)
    expect(player.alive).toBe(false)
  })
})

describe('snakeio AI and victory', () => {
  it('AI turn per tick never exceeds its thickness-based turn limit', () => {
    const state = createSnakeio(123, 1)
    for (let i = 0; i < 600; i += 1) {
      const before = state.snakes.filter(s => s.ai && s.alive).map(s => ({ s, a: s.angle, limit: turnRatePerTick(s) }))
      stepSnakeio(state, drive(1))
      for (const b of before) {
        if (!b.s.alive) continue
        const d = Math.abs(normAngle(b.s.angle - b.a))
        expect(d).toBeLessThanOrEqual(b.limit + 1e-9)
      }
    }
  })

  it('when every AI is dead the surviving player wins (chicken dinner)', () => {
    const state = createSnakeio(5, 1)
    const player = state.snakes[0]!
    placeSnake(player, CX, CY, 0)
    // 一条出生即撞出毒墙的 AI：第一步内死亡，玩家随即吃鸡。
    const doomed = makeSnake({
      id: 98, ai: true, name: 'doomed', color: 4,
      x: WORLD_W + 50, y: CY, angle: 0, length: 40,
    })
    state.snakes = [player, doomed]
    state.foods = []
    for (const s of state.snakes) if (s.ai) s.nextThink = 2
    expect(state.snakes.filter(s => s.ai).length).toBe(1)
    stepSnakeio(state, drive(0))
    expect(doomed.alive).toBe(false)
    expect(state.over).toBe(true)
    expect(state.stats).not.toBeNull()
    expect(state.stats!.win).toBe(true)
    expect(state.stats!.rank).toBe(1)
    expect(player.alive).toBe(true)
  })

  it('long runs keep AI population non-respawning and rank consistent', () => {
    const state = createSnakeio(123, 1)
    for (let i = 0; i < 1500 && !state.over; i += 1) stepSnakeio(state, drive(i % 90 < 45 ? 1 : -1))
    const aliveAi = state.snakes.filter(s => s.ai && s.alive).length
    const everAi = state.snakes.filter(s => s.ai).length
    expect(everAi).toBe(AI_COUNT)
    expect(aliveAi).toBeLessThanOrEqual(AI_COUNT)
    const player = state.snakes[0]!
    if (state.over && state.stats !== null) {
      expect(state.stats.win).toBe(player.alive)
      expect(state.stats.rank).toBeGreaterThan(0)
      expect(state.stats.seconds).toBeGreaterThan(0)
      expect(state.tick * TICK).toBeGreaterThanOrEqual(state.stats.seconds - 1e-9)
    } else {
      // 一局未决：玩家仍存活且名次有效。
      expect(player.alive).toBe(true)
      expect(playerRank(state)).toBeGreaterThan(0)
    }
    // 名次在玩家死亡时必然结算。
    expect(state.stats!.rank).toBeGreaterThan(0)
    expect(state.stats!.seconds).toBeGreaterThan(0)
    expect(state.tick * TICK).toBeGreaterThanOrEqual(state.stats!.seconds - 1e-9)
  })
})
