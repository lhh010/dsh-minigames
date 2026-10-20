/**
 * Typing meteors pure logic: English words fall from the top; typing the
 * first letter of a word locks onto it, matching letters advance, completing
 * the word scores (+10 x letters, x1.5 at streak >= 5) and destroys it. A
 * word crossing the bottom line costs one of 3 lives. Deterministic
 * functions over a plain state object driven by an explicit ms clock.
 */

/** Pool of ~120 common words plus a few spaceless mini-phrases. */
export const WORDS = [
  'cat', 'dog', 'sun', 'map', 'key', 'ice', 'fox', 'owl', 'sky', 'red',
  'blue', 'tree', 'star', 'moon', 'fish', 'bird', 'book', 'rain', 'snow', 'wind',
  'fire', 'gold', 'king', 'queen', 'ship', 'road', 'song', 'time', 'work', 'life',
  'hand', 'head', 'eyes', 'door', 'food', 'game', 'home', 'land', 'name', 'night',
  'play', 'read', 'city', 'farm', 'girl', 'boy', 'walk', 'jump', 'run', 'fast',
  'slow', 'warm', 'cold', 'deep', 'high', 'wide', 'open', 'close', 'light', 'dark',
  'apple', 'grape', 'lemon', 'melon', 'peach', 'berry', 'bread', 'rice', 'soup', 'cake',
  'cloud', 'storm', 'field', 'grass', 'river', 'ocean', 'beach', 'stone', 'metal', 'wood',
  'house', 'tower', 'chair', 'table', 'phone', 'paper', 'music', 'dance', 'smile', 'dream',
  'magic', 'sword', 'shield', 'castle', 'dragon', 'planet', 'rocket', 'puzzle', 'wonder', 'bright',
  'silver', 'shadow', 'winter', 'summer', 'spring', 'friend', 'family', 'school', 'letter', 'number',
  'goforit', 'letsgo', 'comeon', 'hurryup', 'niceone', 'goodjob', 'okgo', 'staycalm', 'hangon', 'yougotit',
] as const

/** Spawn interval at elapsed 0. */
export const START_SPAWN_MS = 2600
/** Spawn interval at RAMP_MS and beyond. */
export const MIN_SPAWN_MS = 1100
/** Elapsed time over which spawn/speed ramp. */
export const RAMP_MS = 100_000
/** Fall speed at elapsed 0 (px/s). */
export const SPEED_START = 22
/** Fall speed at RAMP_MS and beyond (px/s). */
export const SPEED_END = 46
/** Lives per run. */
export const START_LIVES = 3
/** Screen-shake duration after a wrong letter breaks the lock. */
export const SHAKE_MS = 220
/** Logical y of the danger line (px); a word center reaching it costs a life. */
export const FALL_LINE_Y = 520
/** Logical play-field width used for spawn x positions. */
export const FIELD_W = 480
/** Minimum kept-clear margin on both field sides (px). */
export const SIDE_MARGIN = 12
/** Vertical band (px) within which spawns avoid horizontal overlap. */
export const SPAWN_BAND = 30
/** Y where words enter the field (px). */
export const SPAWN_Y = 36
/** Random x candidates tried per spawn before lifting the band. */
const SPAWN_RETRIES = 6

/**
 * Default rendered-width estimate (px) for a word when no font-measured
 * function is injected: monospace advance plus glow/padding allowance.
 */
export function defaultWordWidth(text: string): number {
  return text.length * 11 + 24
}

/** Horizontal overlap width of [ax, ax+aw] and [bx, bx+bw]; 0 when disjoint. */
function overlap(ax: number, aw: number, bx: number, bw: number): number {
  return Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx))
}

export interface FallingWord {
  id: number
  text: string
  x: number
  y: number
}

export interface TypingState {
  words: FallingWord[]
  /** Id of the locked word, or null. */
  lockId: number | null
  /** Matched prefix of the locked word. */
  typed: string
  lives: number
  score: number
  /** Consecutive completed words without a wrong letter. */
  streak: number
  over: boolean
  /** Elapsed play time in ms (drives the ramps). */
  elapsed: number
  /** Ms until the next spawn. */
  spawnT: number
  /** Remaining shake time in ms (render hint). */
  shake: number
  nextId: number
  /** Last spawned word; the spawner never repeats it immediately. */
  lastWord: string | null
  rng: () => number
  /** Rendered width of a word (px); injected from real font metrics. */
  wordWidth: (text: string) => number
}

/** A fresh run: empty field, full lives, first spawn almost due. */
export function createTypingState(
  rng: () => number = Math.random,
  wordWidth: (text: string) => number = defaultWordWidth,
): TypingState {
  return {
    words: [], lockId: null, typed: '', lives: START_LIVES, score: 0, streak: 0,
    over: false, elapsed: 0, spawnT: 600, shake: 0, nextId: 1, lastWord: null, rng,
    wordWidth,
  }
}

/** Linear ramp helper clamped to [0, RAMP_MS]. */
function rampT(elapsedMs: number): number {
  return Math.min(Math.max(elapsedMs, 0), RAMP_MS) / RAMP_MS
}

/** Current spawn interval in ms. */
export function spawnInterval(elapsedMs: number): number {
  return START_SPAWN_MS + rampT(elapsedMs) * (MIN_SPAWN_MS - START_SPAWN_MS)
}

/** Current fall speed in px/s. */
export function fallSpeed(elapsedMs: number): number {
  return SPEED_START + rampT(elapsedMs) * (SPEED_END - SPEED_START)
}

/** Pick a pool word, never the same as `last` immediately (pool > 1). */
export function pickWord(rng: () => number, last: string | null): string {
  let index = Math.floor(rng() * WORDS.length)
  if (WORDS[index] === last) index = (index + 1) % WORDS.length
  return WORDS[index]!
}

/**
 * Total horizontal overlap (px) a candidate word at (`x`, `y`) would have
 * with live words whose vertical band is within SPAWN_BAND.
 */
function spawnClash(state: TypingState, text: string, x: number, y: number): number {
  let sum = 0
  for (const word of state.words) {
    if (Math.abs(word.y - y) >= SPAWN_BAND) continue
    sum += overlap(x, state.wordWidth(text), word.x, state.wordWidth(word.text))
  }
  return sum
}

/**
 * Pick a spawn position for `text`: keep the word fully inside the side
 * margins and try random x values clear of in-band live words; if every
 * candidate clashes, retry one band higher so the word enters later, and on
 * a still-crowded field accept the least-overlapping x.
 * @returns position with x as the word's left edge.
 */
export function pickSpawn(state: TypingState, text: string): { x: number; y: number } {
  const maxX = Math.max(0, FIELD_W - SIDE_MARGIN * 2 - state.wordWidth(text))
  let x = SIDE_MARGIN
  for (let band = 0; band < 3; band += 1) {
    const y = SPAWN_Y - band * SPAWN_BAND
    x = SIDE_MARGIN + state.rng() * maxX
    let bestX = x
    let bestClash = spawnClash(state, text, bestX, y)
    for (let i = 1; i < SPAWN_RETRIES && bestClash > 0; i += 1) {
      const candidate = SIDE_MARGIN + state.rng() * maxX
      const clash = spawnClash(state, text, candidate, y)
      if (clash < bestClash) {
        bestX = candidate
        bestClash = clash
      }
    }
    if (bestClash === 0) return { x: bestX, y }
    x = bestX
  }
  return { x, y: SPAWN_Y - 2 * SPAWN_BAND }
}

/**
 * Advance the field by `dtMs`: shake decay, fall, bottom-line life loss,
 * game over, and spawning (no immediate word repeats).
 */
export function tickTyping(state: TypingState, dtMs: number): void {
  if (state.over) return
  state.elapsed += dtMs
  state.shake = Math.max(0, state.shake - dtMs)
  const vy = fallSpeed(state.elapsed) * (dtMs / 1000)
  for (const word of state.words) word.y += vy
  // Words reaching the line cost a life and vanish.
  for (let i = state.words.length - 1; i >= 0; i -= 1) {
    const word = state.words[i]!
    if (word.y < FALL_LINE_Y) continue
    state.words.splice(i, 1)
    state.lives -= 1
    if (state.lockId === word.id) {
      state.lockId = null
      state.typed = ''
    }
  }
  if (state.lives <= 0) {
    state.lives = 0
    state.over = true
    state.words = []
    state.lockId = null
    state.typed = ''
    return
  }
  while (state.spawnT <= 0 && !state.over) {
    state.spawnT += spawnInterval(state.elapsed)
    if (state.words.length >= 8) continue
    const text = pickWord(state.rng, state.lastWord)
    state.lastWord = text
    const spawn = pickSpawn(state, text)
    state.words.push({
      id: state.nextId,
      text,
      x: spawn.x,
      y: spawn.y,
    })
    state.nextId += 1
  }
  state.spawnT -= dtMs
}

export type TypeResult = 'ignored' | 'miss' | 'lock' | 'match' | 'break' | 'complete'

/**
 * Type one letter [a-z].
 * @returns 'ignored' when over or not a letter; 'miss' when no word starts
 *   with it (no penalty); 'lock' when a word was just locked; 'match' for a
 *   continuing match; 'break' when a wrong letter broke the lock (streak
 *   resets, small shake); 'complete' when the locked word was finished.
 */
export function typeLetter(state: TypingState, ch: string): TypeResult {
  if (state.over) return 'ignored'
  const letter = ch.toLowerCase()
  if (!/^[a-z]$/.test(letter)) return 'ignored'
  if (state.lockId === null) {
    // Lock the lowest (closest to the line) word starting with the letter.
    let best: FallingWord | null = null
    for (const word of state.words) {
      if (word.text[0] === letter && (best === null || word.y > best.y)) best = word
    }
    if (best === null) return 'miss'
    state.lockId = best.id
    state.typed = letter
    return 'lock'
  }
  const locked = state.words.find(word => word.id === state.lockId)
  if (locked === undefined) {
    state.lockId = null
    state.typed = ''
    return 'ignored'
  }
  if (locked.text[state.typed.length] === letter) {
    state.typed += letter
    if (state.typed.length === locked.text.length) {
      state.streak += 1
      const multiplier = state.streak >= 5 ? 1.5 : 1
      state.score += Math.round(10 * locked.text.length * multiplier)
      state.words.splice(state.words.indexOf(locked), 1)
      state.lockId = null
      state.typed = ''
      return 'complete'
    }
    return 'match'
  }
  // Wrong letter: break the lock, reset streak, brief shake.
  state.lockId = null
  state.typed = ''
  state.streak = 0
  state.shake = SHAKE_MS
  return 'break'
}

/** ESC: release the lock without a streak penalty. */
export function escapeLock(state: TypingState): void {
  state.lockId = null
  state.typed = ''
}
