import { describe, expect, it } from 'vitest'
import {
  WORDS, createTypingState, tickTyping, typeLetter, escapeLock, pickWord,
  spawnInterval, fallSpeed, FALL_LINE_Y, START_SPAWN_MS, MIN_SPAWN_MS,
  SPEED_START, SPEED_END, type TypingState,
  SIDE_MARGIN, SPAWN_BAND, FIELD_W, defaultWordWidth,
} from '../src/client/games/typing/logic.ts'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function putWord(state: TypingState, text: string, y = 100, x = 50): number {
  const id = state.nextId
  state.nextId += 1
  state.words.push({ id, text, x, y })
  return id
}

/** Type a whole word letter by letter and return the results. */
function typeWord(state: TypingState, text: string): string[] {
  return [...text].map(ch => typeLetter(state, ch))
}

describe('typing logic', () => {
  it('locks onto a word by first letter and completes it', () => {
    const state = createTypingState(lcg(1))
    const id = putWord(state, 'star')
    expect(typeLetter(state, 's')).toBe('lock')
    expect(state.lockId).toBe(id)
    expect(state.typed).toBe('s')
    expect(typeLetter(state, 't')).toBe('match')
    expect(typeLetter(state, 'a')).toBe('match')
    expect(typeLetter(state, 'r')).toBe('complete')
    expect(state.words).toEqual([])
    expect(state.score).toBe(40) // 10 x 4 letters
    expect(state.lockId).toBeNull()
  })

  it('a wrong letter breaks the lock and resets the streak with a shake', () => {
    const state = createTypingState(lcg(1))
    putWord(state, 'moon')
    state.streak = 3
    expect(typeLetter(state, 'm')).toBe('lock')
    expect(typeLetter(state, 'x')).toBe('break')
    expect(state.lockId).toBeNull()
    expect(state.typed).toBe('')
    expect(state.streak).toBe(0)
    expect(state.shake).toBeGreaterThan(0)
    expect(state.lives).toBe(3) // no life penalty
  })

  it('ESC clears the lock without touching score or streak', () => {
    const state = createTypingState(lcg(1))
    putWord(state, 'fish')
    typeLetter(state, 'f')
    escapeLock(state)
    expect(state.lockId).toBeNull()
    expect(state.typed).toBe('')
    expect(state.streak).toBe(0)
    expect(state.score).toBe(0)
  })

  it('a letter matching no word is a harmless miss', () => {
    const state = createTypingState(lcg(1))
    putWord(state, 'cat')
    expect(typeLetter(state, 'z')).toBe('miss')
    expect(state.lockId).toBeNull()
    expect(state.score).toBe(0)
  })

  it('applies the x1.5 multiplier once the streak reaches 5', () => {
    const state = createTypingState(lcg(1))
    for (const text of ['cat', 'dog', 'sun', 'star']) {
      putWord(state, text)
      typeWord(state, text)
    }
    expect(state.streak).toBe(4)
    expect(state.score).toBe(130) // 3+3+3+4 = 13 letters x10
    putWord(state, 'puzzle')
    typeWord(state, 'puzzle') // streak becomes 5 -> multiplier
    expect(state.streak).toBe(5)
    expect(state.score).toBe(130 + Math.round(60 * 1.5)) // 220
  })

  it('loses a life when a word crosses the bottom line, then game over', () => {
    const state = createTypingState(lcg(1))
    putWord(state, 'slow', FALL_LINE_Y - 1)
    tickTyping(state, 100) // 22 px/s * 0.1s > 1 px
    expect(state.lives).toBe(2)
    expect(state.words).toEqual([])
    putWord(state, 'fast', FALL_LINE_Y - 1)
    tickTyping(state, 100)
    expect(state.lives).toBe(1)
    expect(state.over).toBe(false)
    putWord(state, 'last', FALL_LINE_Y - 1)
    tickTyping(state, 100)
    expect(state.over).toBe(true)
    expect(state.lives).toBe(0)
    expect(state.words).toEqual([])
    expect(typeLetter(state, 'l')).toBe('ignored')
  })

  it('a locked word hitting the line clears the lock too', () => {
    const state = createTypingState(lcg(1))
    const id = putWord(state, 'door', FALL_LINE_Y - 1)
    typeLetter(state, 'd')
    expect(state.lockId).toBe(id)
    tickTyping(state, 100)
    expect(state.lives).toBe(2)
    expect(state.lockId).toBeNull()
  })

  it('ramps spawn interval 2.6s -> 1.1s and speed 22 -> 46 px/s over 100s', () => {
    expect(spawnInterval(0)).toBe(START_SPAWN_MS)
    expect(spawnInterval(50_000)).toBeCloseTo((START_SPAWN_MS + MIN_SPAWN_MS) / 2, 5)
    expect(spawnInterval(100_000)).toBe(MIN_SPAWN_MS)
    expect(spawnInterval(500_000)).toBe(MIN_SPAWN_MS) // clamped
    expect(fallSpeed(0)).toBe(SPEED_START)
    expect(fallSpeed(100_000)).toBe(SPEED_END)
    // Words fall faster later: same dt moves a late word farther.
    const early = createTypingState(lcg(2))
    early.words = [{ id: 1, text: 'cat', x: 10, y: 100 }]
    tickTyping(early, 1000)
    const earlyDrop = early.words[0]!.y - 100
    const late = createTypingState(lcg(2))
    late.elapsed = 100_000
    late.words = [{ id: 1, text: 'cat', x: 10, y: 100 }]
    tickTyping(late, 1000)
    const lateDrop = late.words[0]!.y - 100
    // The 1s tick advances elapsed first, so drops sit just above the ramp
    // endpoint speeds; assert ranges instead of exact equality.
    expect(earlyDrop).toBeGreaterThan(SPEED_START)
    expect(earlyDrop).toBeLessThanOrEqual(SPEED_START + 0.5)
    expect(lateDrop).toBeGreaterThan(SPEED_END - 0.5)
    expect(lateDrop).toBeLessThanOrEqual(SPEED_END)
    expect(lateDrop).toBeGreaterThan(earlyDrop)
  })

  it('spawns words over time without immediate repeats', () => {
    const state = createTypingState(lcg(9))
    const spawned: string[] = []
    let known = new Set<number>()
    for (let i = 0; i < 4000 && spawned.length < 10 && !state.over; i += 1) {
      tickTyping(state, 16)
      for (const word of state.words) {
        if (!known.has(word.id)) spawned.push(word.text)
      }
      known = new Set(state.words.map(w => w.id))
    }
    expect(spawned.length).toBeGreaterThanOrEqual(8)
    const pool = new Set<string>(WORDS)
    for (const [i, text] of spawned.entries()) {
      expect(pool.has(text)).toBe(true)
      if (i > 0) expect(text).not.toBe(spawned[i - 1])
    }
    expect(state.words.length).toBeLessThanOrEqual(8)
  })

  it('pickWord never returns the previous word immediately', () => {
    const rng = lcg(5)
    for (const last of ['cat', 'puzzle', 'staycalm', 'zzz']) {
      for (let i = 0; i < 50; i += 1) {
        expect(pickWord(rng, last)).not.toBe(last)
      }
    }
  })

  it('identical seeds produce identical runs', () => {
    const run = (): string => {
      const state = createTypingState(lcg(42))
      for (let i = 0; i < 1500; i += 1) tickTyping(state, 16)
      const fields = state.words.map(w => `${w.id}:${w.text}:${w.x.toFixed(2)}:${w.y.toFixed(2)}`)
      return `${state.score}|${state.streak}|${state.lives}|${fields.join(',')}`
    }
    expect(run()).toBe(run())
  })

  it('keeps every spawned word fully visible with >=12px side margins', () => {
    // Injected width fn wider than the default proves clamping uses it.
    const width = (text: string): number => text.length * 20 + 30
    for (const seed of [1, 7, 123]) {
      const state = createTypingState(lcg(seed), width)
      for (let i = 0; i < 4000 && !state.over; i += 1) {
        tickTyping(state, 16)
        for (const word of state.words) {
          expect(word.x).toBeGreaterThanOrEqual(SIDE_MARGIN)
          expect(word.x + width(word.text)).toBeLessThanOrEqual(FIELD_W - SIDE_MARGIN)
        }
      }
    }
  })

  it('never horizontally overlaps words within one spawn band over seeded runs', () => {
    for (const seed of [3, 11, 42, 99]) {
      const state = createTypingState(lcg(seed))
      for (let i = 0; i < 6000 && !state.over; i += 1) {
        tickTyping(state, 16)
        for (let a = 0; a < state.words.length; a += 1) {
          for (let b = a + 1; b < state.words.length; b += 1) {
            const wa = state.words[a]!
            const wb = state.words[b]!
            if (Math.abs(wa.y - wb.y) >= SPAWN_BAND) continue
            const overlap = Math.min(wa.x + defaultWordWidth(wa.text), wb.x + defaultWordWidth(wb.text))
              - Math.max(wa.x, wb.x)
            expect(overlap).toBeLessThanOrEqual(0)
          }
        }
      }
    }
  })
})
