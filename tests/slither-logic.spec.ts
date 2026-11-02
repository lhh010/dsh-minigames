import { describe, expect, it } from 'vitest'
import {
  AI_COUNT, CX, CY, MIN_BOOST_LENGTH, TICK, WORLD_R,
  createSlither, makeSnake, normAngle, placeSnake, playerRank,
  slitherSnapshot, stepSlither, turnRatePerTick,
  type SlitherState,
} from '../src/client/games/slither/logic.ts'

/** 无加速、朝向固定角的玩家输入。 */
const aim = (angle: number, boost = false) => ({ angle, boost })

/** 只留玩家（清空 AI 与光点）的受控局面。 */
function soloState(angle: number): { state: SlitherState } {
  const state = createSlither(7, 1)
  const player = state.snakes[0]!
  placeSnake(player, CX, CY, angle)
  state.snakes = [player]
  state.foods = []
  state.respawns = []
  return { state }
}

describe('slither determinism', () => {
  it('same seed + same input sequence -> identical tick snapshots', () => {
    const run = (): string => {
      const state = createSlither(42, 1)
      let snap = ''
      for (let i = 0; i < 240; i += 1) {
        stepSlither(state, aim(0.3 + i * 0.01, i % 40 < 20))
        snap += slitherSnapshot(state) + ';'
      }
      return snap
    }
    expect(run()).toBe(run())
  })

  it('different seeds diverge', () => {
    const a = createSlither(1, 1)
    const b = createSlither(2, 1)
    for (let i = 0; i < 120; i += 1) {
      stepSlither(a, aim(0))
      stepSlither(b, aim(0))
    }
    expect(slitherSnapshot(a)).not.toBe(slitherSnapshot(b))
  })

  it('same seed, different rounds diverge', () => {
    const a = createSlither(9, 1)
    const b = createSlither(9, 2)
    for (let i = 0; i < 120; i += 1) {
      stepSlither(a, aim(1))
      stepSlither(b, aim(1))
    }
    expect(slitherSnapshot(a)).not.toBe(slitherSnapshot(b))
  })
})

describe('slither boost', () => {
  it('boosting consumes length and spits food behind the tail', () => {
    const { state } = soloState(0)
    const player = state.snakes[0]!
    placeSnake(player, CX, CY, 0, 60)
    const before = player.length
    for (let i = 0; i < 90; i += 1) stepSlither(state, aim(0, true))
    expect(player.length).toBeLessThan(before - 5)
    // 尾部吐出的光点确实落在世界里。
    expect(state.foods.length).toBeGreaterThan(0)
    expect(player.alive).toBe(true)
  })

  it('cannot boost below the minimum length', () => {
    const { state } = soloState(0)
    const player = state.snakes[0]!
    placeSnake(player, CX, CY, 0, 15)
    for (let i = 0; i < 30; i += 1) stepSlither(state, aim(0, true))
    expect(player.boosting).toBe(false)
    expect(player.length).toBeGreaterThanOrEqual(6)
  })
})

describe('slither death and loot', () => {
  it('head hits a body -> death, loot dropped, kill credited to the body owner', () => {
    const state = createSlither(5, 1)
    const player = state.snakes[0]!
    placeSnake(player, CX, CY - 200, 0)
    // 一条不决策的直线蛇（ai:false 故不转向）横在玩家航线旁：头在
    // (CX+150, CY)，向下行驶，身体在身后向上延伸，恰好盖住玩家航线。
    const wall = makeSnake({
      id: 99, ai: false, name: 'wall', color: 3, personality: 'grazer',
      x: CX + 150, y: CY, angle: Math.PI / 2, length: 80,
    })
    state.snakes = [player, wall]
    state.foods = []
    state.respawns = []
    let died = -1
    for (let i = 0; i < 90 && !state.over; i += 1) {
      stepSlither(state, aim(0))
      died = i
    }
    expect(state.over).toBe(true)
    expect(player.alive).toBe(false)
    expect(state.stats).not.toBeNull()
    expect(state.stats!.seconds).toBeGreaterThan(0)
    // 战利品光点按长度散布。
    expect(state.foods.length).toBeGreaterThan(0)
    // 击杀记到被撞蛇身的持有者（wall）头上。
    expect(wall.kills).toBe(1)
    expect(state.events.some(e => e.type === 'death' && e.victimId === player.id)).toBe(true)
    expect(died).toBeGreaterThan(3)
  })

  it('an AI crossing the boundary dies, drops loot and enters the respawn queue', () => {
    const state = createSlither(5, 1)
    const player = state.snakes[0]!
    placeSnake(player, CX, CY, 0)
    const victim = makeSnake({
      id: 98, ai: true, name: 'victim', color: 4, personality: 'grazer',
      x: CX + WORLD_R + 10, y: CY, angle: 0, length: 40,
    })
    state.snakes = [player, victim]
    state.foods = []
    state.respawns = []
    stepSlither(state, aim(0))
    expect(victim.alive).toBe(false)
    expect(state.respawns.length).toBe(1)
    expect(state.foods.length).toBeGreaterThan(0)
    expect(state.over).toBe(false)
    // 复活到期后重回战场（AI 总量恢复）。
    for (let i = 0; i < 120; i += 1) stepSlither(state, aim(0))
    expect(state.snakes.filter(s => s.ai && s.alive).length).toBe(1)
  })

  it('crossing the world boundary kills the player', () => {
    const { state } = soloState(0)
    const player = state.snakes[0]!
    placeSnake(player, CX + WORLD_R - 80, CY, 0)
    for (let i = 0; i < 60 && !state.over; i += 1) stepSlither(state, aim(0))
    expect(state.over).toBe(true)
    expect(state.foods.length).toBeGreaterThan(0)
  })
})

describe('slither AI movement bounds', () => {
  it('AI turn per tick never exceeds its thickness-based turn limit', () => {
    const state = createSlither(123, 1)
    for (let i = 0; i < 600; i += 1) {
      const before = state.snakes.filter(s => s.ai && s.alive).map(s => ({ s, a: s.angle, limit: turnRatePerTick(s) }))
      stepSlither(state, aim(0.2))
      for (const b of before) {
        if (!b.s.alive) continue
        const d = Math.abs(normAngle(b.s.angle - b.a))
        expect(d).toBeLessThanOrEqual(b.limit + 1e-9)
      }
    }
  })

  it('keeps the AI population between 6 and 10 (alive + queued) and ranks the player', () => {
    const state = createSlither(123, 1)
    for (let i = 0; i < 1500; i += 1) stepSlither(state, aim(i * 0.02))
    const alive = state.snakes.filter(s => s.ai && s.alive).length
    expect(alive).toBeLessThanOrEqual(10)
    expect(alive + state.respawns.length).toBe(AI_COUNT)
    const player = state.snakes[0]!
    if (player.alive) expect(playerRank(state)).toBeGreaterThan(0)
    else expect(state.over).toBe(true)
    expect(state.tick).toBeLessThanOrEqual(1500)
  })
})
