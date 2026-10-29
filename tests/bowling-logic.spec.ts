import { describe, expect, it } from 'vitest'
import {
  BALL_MASS, BALL_PIN_E, BALL_RADIUS, DECK_TOP, FRAMES_PER_LEVEL, KNOCK_DISP, LANE_W,
  MAX_AIM, MAX_THROW_SPEED, PIN_GAP, PIN_MASS, PIN_R, createLevel, currentScore,
  finishRoll, levelThreshold, mulberry32, nextLevel, rackPins, resolveCircleCollision,
  scoreGame, step, throwBall, type BowlingState, type Body,
} from '../src/client/games/bowling/logic.ts'

/** Independent frame-walking scorer (different structure from scoreGame). */
function rescore(rolls: number[], frames = 10): number {
  const framesOfRolls: number[][] = []
  let i = 0
  for (let f = 0; f < frames; f += 1) {
    if (f === frames - 1) {
      framesOfRolls.push(rolls.slice(i))
      break
    }
    if (rolls[i] === 10) {
      framesOfRolls.push([rolls[i]!])
      i += 1
    } else {
      framesOfRolls.push(rolls.slice(i, i + 2))
      i += 2
    }
  }
  let total = 0
  let flat: number[] = []
  for (let f = 0; f < frames; f += 1) {
    flat = flat.concat(framesOfRolls[f] ?? [])
  }
  // Score frame f from its own rolls plus the following rolls (lookahead).
  let idx = 0
  for (let f = 0; f < frames; f += 1) {
    const fr = framesOfRolls[f] ?? []
    const after = flat.slice(idx + fr.length)
    const next1 = after[0] ?? 0
    const next2 = after[1] ?? 0
    if (f === frames - 1) {
      total += fr.slice(0, 3).reduce((a, b) => a + b, 0)
    } else if (fr[0] === 10) {
      total += 10 + next1 + next2
    } else if (fr.length === 2 && fr[0]! + fr[1]! === 10) {
      total += 10 + next1
    } else {
      total += fr.reduce((a, b) => a + b, 0)
    }
    idx += fr.length
  }
  return total
}

function body(x: number, y: number, vx = 0, vy = 0): Body {
  return { x, y, vx, vy }
}

/** Play a full level game from a throw script (aim°, power, spin per roll). */
function playScript(
  seed: number,
  throws: ReadonlyArray<{ aim: number; power: number; spin: number }>,
): BowlingState {
  const state = createLevel(1, seed)
  for (const t of throws) {
    if (state.phase !== 'aiming') break
    state.aimAngle = (t.aim * Math.PI) / 180
    state.power = t.power
    state.spin = t.spin
    if (!throwBall(state)) break
    let guard = 0
    while ((state.phase as string) === 'rolling' && guard < 4000) {
      step(state, 1 / 60)
      guard += 1
    }
  }
  return state
}

describe('bowling ten-pin scoring', () => {
  it('a perfect sheet of 12 strikes scores 300', () => {
    expect(scoreGame([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10])).toBe(300)
  })

  it('alternating open counts score their plain pinfall', () => {
    const rolls = [3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4]
    expect(rolls.reduce((a, b) => a + b, 0)).toBe(70)
    expect(scoreGame(rolls)).toBe(70)
  })

  it('spare then strike: 20 + 10', () => {
    const rolls = [5, 5, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    expect(scoreGame(rolls)).toBe(30)
  })

  it('10th-frame triple strike adds 30', () => {
    const rolls = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 10, 10]
    expect(scoreGame(rolls)).toBe(30)
  })

  it('a gutter game of 20 zeros scores 0', () => {
    expect(scoreGame(new Array(20).fill(0))).toBe(0)
  })

  it('a seeded random sheet matches an independent recompute', () => {
    const rng = mulberry32(1234)
    for (let sheet = 0; sheet < 30; sheet += 1) {
      const rolls: number[] = []
      for (let f = 0; f < 10; f += 1) {
        if (f === 9) {
          const a = Math.floor(rng() * 11)
          rolls.push(a)
          const b = a === 10 ? Math.floor(rng() * 11) : Math.floor(rng() * (10 - a))
          rolls.push(b)
          if (a === 10 || a + b === 10) rolls.push(Math.floor(rng() * 11))
        } else {
          const a = Math.floor(rng() * 11)
          rolls.push(a)
          if (a === 10) continue
          rolls.push(Math.floor(rng() * (10 - a)))
        }
      }
      expect(scoreGame(rolls)).toBe(rescore(rolls))
    }
  })

  it('a perfect 5-frame level game (last frame bonus rolls) scores 150', () => {
    expect(scoreGame([10, 10, 10, 10, 10, 10, 10], FRAMES_PER_LEVEL)).toBe(150)
  })
})

describe('bowling collisions', () => {
  it('ball-pin head-on: the light pin gains much more speed', () => {
    const ball = body(100, 500, 0, -200)
    const pin = body(100, 500 - BALL_RADIUS - PIN_R + 0.01)
    expect(resolveCircleCollision(ball, pin, BALL_RADIUS, PIN_R, BALL_MASS, PIN_MASS, BALL_PIN_E)).toBe(true)
    const pinSpeed = Math.hypot(pin.vx, pin.vy)
    expect(pinSpeed).toBeGreaterThan(200) // faster than the ball ever was
    expect(Math.hypot(ball.vx, ball.vy)).toBeLessThan(200)
    // Momentum is conserved along the normal.
    const pBefore = BALL_MASS * 200
    const pAfter = BALL_MASS * -ball.vy + PIN_MASS * -pin.vy
    expect(pAfter).toBeCloseTo(pBefore, 6)
  })

  it('equal-mass pin-pin head-on keeps 10% / hands 90% at e=0.8', () => {
    const a = body(50, 50, 0, -100)
    const b = body(50, 50 - PIN_R * 2 + 0.01)
    expect(resolveCircleCollision(a, b, PIN_R, PIN_R, PIN_MASS, PIN_MASS, 0.8)).toBe(true)
    expect(a.vy).toBeCloseTo(-10, 5)
    expect(b.vy).toBeCloseTo(-90, 5)
  })

  it('separating circles do not collide', () => {
    const a = body(50, 50, 0, -10)
    const b = body(50, 50 - PIN_R * 2 + 0.01, 0, -20)
    expect(resolveCircleCollision(a, b, PIN_R, PIN_R, PIN_MASS, PIN_MASS, 0.8)).toBe(false)
    expect(a.vy).toBe(-10)
  })
})

describe('bowling lane physics', () => {
  /** Run one throw with all pins removed and return the ball x at deck top. */
  function hookRun(spin: number): number {
    const state = createLevel(1, 7)
    for (const p of state.pins) { p.swept = true }
    state.power = 0.7
    state.spin = spin
    throwBall(state)
    let xAtDeck = Number.NaN
    let guard = 0
    while ((state.phase as string) === 'rolling' && guard < 4000) {
      step(state, 1 / 120)
      guard += 1
      if (state.ball.live && state.ball.y < DECK_TOP) xAtDeck = state.ball.x
    }
    expect(Number.isFinite(xAtDeck)).toBe(true)
    return xAtDeck
  }

  it('hook: positive spin curves right, negative spins left', () => {
    const right = hookRun(0.9)
    const left = hookRun(-0.9)
    const straight = hookRun(0)
    expect(straight).toBeCloseTo(LANE_W / 2, 5)
    expect(right).toBeGreaterThan(straight + 5)
    expect(left).toBeLessThan(straight - 5)
  })

  it('straight ball with 0 spin has ~0 lateral drift', () => {
    const state = createLevel(1, 7)
    for (const p of state.pins) { p.swept = true }
    state.power = 0.7
    state.spin = 0
    throwBall(state)
    let drift = 0
    let guard = 0
    while ((state.phase as string) === 'rolling' && guard < 4000) {
      step(state, 1 / 120)
      guard += 1
      drift = Math.max(drift, Math.abs(state.ball.x - LANE_W / 2))
    }
    expect(drift).toBeLessThan(0.001)
  })

  it('mid power reaches the pins and knocks wood (no stall)', () => {
    const state = playScript(99, [{ aim: 0, power: 0.5, spin: 0 }])
    expect(state.rolls.length).toBeGreaterThan(0)
    expect(state.rolls[0]).toBeGreaterThanOrEqual(1)
  })

  it('a maximum-aim throw finds the gutter and scores 0', () => {
    const state = createLevel(1, 5)
    state.aimAngle = MAX_AIM
    state.power = 0.7
    throwBall(state)
    let guard = 0
    while ((state.phase as string) === 'rolling' && guard < 4000) {
      step(state, 1 / 60)
      guard += 1
    }
    expect(state.rolls).toEqual([0])
    expect(state.events.some(e => e.kind === 'gutter')).toBe(true)
  })

  it('a displaced pin counts as knocked; a small jiggle stays standing', () => {
    // Slide at 20 u/s: friction 3.2 stops it after ~6.3u > KNOCK_DISP.
    const displaced = createLevel(1, 3)
    for (const p of displaced.pins) p.swept = true
    const slider = displaced.pins[0]!
    slider.swept = false
    slider.vx = 20
    displaced.phase = 'rolling'
    displaced.ball.live = false
    let guard = 0
    while (displaced.phase === 'rolling' && guard < 2000) {
      step(displaced, 1 / 60)
      guard += 1
    }
    expect(slider.knocked).toBe(true)

    // Jiggle at 8 u/s: displacement ~2.5u < KNOCK_DISP, speed < threshold.
    const jiggle = createLevel(1, 3)
    for (const p of jiggle.pins) p.swept = true
    const pin = jiggle.pins[0]!
    pin.swept = false
    pin.vx = 8
    jiggle.phase = 'rolling'
    jiggle.ball.live = false
    guard = 0
    while (jiggle.phase === 'rolling' && guard < 2000) {
      step(jiggle, 1 / 60)
      guard += 1
    }
    expect(pin.knocked).toBe(false)
  })
})

describe('bowling rack and sweep', () => {
  it('racks 10 pins in a 1-2-3-4 triangle with standard spacing, no overlap', () => {
    const pins = rackPins(42)
    expect(pins).toHaveLength(10)
    const rows = new Map<number, number>()
    for (const p of pins) rows.set(p.spotY, (rows.get(p.spotY) ?? 0) + 1)
    expect([...rows.values()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
    for (let i = 0; i < pins.length; i += 1) {
      for (let k = i + 1; k < pins.length; k += 1) {
        const d = Math.hypot(pins[i]!.x - pins[k]!.x, pins[i]!.y - pins[k]!.y)
        expect(d).toBeGreaterThanOrEqual(PIN_R * 2)
      }
    }
    // Row spacing check on a two-pin row (row 1: pins[1] and pins[2]).
    const row1 = pins.filter(p => p.spotY === pins[1]!.spotY)
    expect(row1).toHaveLength(2)
    expect(Math.abs(row1[1]!.spotX - row1[0]!.spotX)).toBeCloseTo(PIN_GAP, 5)
  })

  it('rack jitter is deterministic per seed', () => {
    const a = rackPins(42)
    const b = rackPins(42)
    expect(a).toEqual(b)
    const c = rackPins(43)
    expect(a).not.toEqual(c)
  })

  it('knocked pins are swept after the ball passes; survivors play the next roll', () => {
    const state = playScript(31337, [{ aim: 0, power: 0.75, spin: 0 }])
    const first = state.rolls[0]!
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(10) // not a strike: frame continues
    const standing = state.pins.filter(p => !p.knocked).length
    expect(standing).toBe(10 - first)
    // Every knocked pin is out of the simulation.
    for (const p of state.pins) {
      if (p.knocked) expect(p.swept).toBe(true)
    }
    expect(state.phase).toBe('aiming')
    // Second roll of the same frame plays the survivors.
    state.power = 0.75
    expect(throwBall(state)).toBe(true)
    let guard = 0
    while ((state.phase as string) === 'rolling' && guard < 4000) {
      step(state, 1 / 60)
      guard += 1
    }
    expect(state.rolls).toHaveLength(2)
    expect(state.rolls[0]! + state.rolls[1]!).toBeLessThanOrEqual(10)
  })

  it('a strike finishes the frame and the next frame gets a full rack', () => {
    const state = createLevel(1, 8)
    state.rollKnocked = 10
    for (const p of state.pins) p.knocked = true
    state.phase = 'rolling'
    state.ball.live = false
    finishRoll(state)
    expect(state.rolls).toEqual([10])
    expect(state.frame).toBe(1)
    expect(state.pins.filter(p => !p.knocked)).toHaveLength(10)
    expect(state.phase).toBe('aiming')
  })
})

describe('bowling levels and determinism', () => {
  it('thresholds advance 60/80/100/120/150 and wrap', () => {
    expect(levelThreshold(1)).toBe(60)
    expect(levelThreshold(2)).toBe(80)
    expect(levelThreshold(3)).toBe(100)
    expect(levelThreshold(4)).toBe(120)
    expect(levelThreshold(5)).toBe(150)
    expect(levelThreshold(6)).toBe(60)
  })

  it('a perfect level grades levelWon and advances; a weak one grades gameOver', () => {
    const won = createLevel(1, 11)
    won.rolls = [10, 10, 10, 10, 10, 10, 10]
    won.frame = FRAMES_PER_LEVEL
    won.frameRolls = [10, 10, 10]
    won.rollKnocked = 0
    won.phase = 'rolling'
    finishRoll(won)
    expect(won.phase).toBe('levelWon')
    expect(won.events.some(e => e.kind === 'levelWon' && e.score === 150)).toBe(true)
    nextLevel(won)
    expect(won.level).toBe(2)
    expect(won.rolls).toEqual([])
    expect(won.pins.filter(p => !p.knocked)).toHaveLength(10)

    const lost = createLevel(5, 11)
    lost.rolls = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    lost.frame = FRAMES_PER_LEVEL
    lost.phase = 'rolling'
    lost.ball.live = false
    finishRoll(lost)
    expect(lost.phase).toBe('gameOver')
    expect(currentScore(lost)).toBe(0)
  })

  it('same seed + throw script → identical pinfall', () => {
    const script = [
      { aim: 0, power: 0.85, spin: 0 },
      { aim: 3, power: 0.7, spin: 0.5 },
      { aim: -4, power: 0.6, spin: -0.4 },
      { aim: 0, power: 0.9, spin: 0 },
      { aim: 6, power: 0.65, spin: 0.8 },
      { aim: -8, power: 0.8, spin: -0.9 },
      { aim: 0, power: 0.75, spin: 0 },
      { aim: 2, power: 0.7, spin: 0.2 },
    ]
    const a = playScript(2026, script)
    const b = playScript(2026, script)
    expect(a.rolls).toEqual(b.rolls)
    expect(a.pins.map(p => p.x)).toEqual(b.pins.map(p => p.x))
    // Different seed can differ: the jitter stream is seed-dependent.
    const c = playScript(2027, script)
    expect(c.rolls.length).toBeGreaterThan(0)
  })

  it('full-power throws are physically bounded (speed cap)', () => {
    const state = createLevel(1, 1)
    state.power = 1
    throwBall(state)
    expect(Math.hypot(state.ball.vx, state.ball.vy)).toBeCloseTo(MAX_THROW_SPEED, 6)
    state.power = 2 // overcharge clamps
    throwBall(state)
    expect(Math.hypot(state.ball.vx, state.ball.vy)).toBeCloseTo(MAX_THROW_SPEED, 6)
  })

  it('KNOCK_DISP is below the smallest center spacing so rack jitter never self-knocks', () => {
    const pins = rackPins(777)
    for (const p of pins) {
      const disp = Math.hypot(p.x - p.spotX, p.y - p.spotY)
      expect(disp).toBeLessThan(KNOCK_DISP)
      expect(p.knocked).toBe(false)
    }
  })
})
