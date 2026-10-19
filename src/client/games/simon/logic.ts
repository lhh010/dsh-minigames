/**
 * Simon pure logic: a growing pad sequence is shown by flashing, then the
 * player repeats it. Correct full repeat scores the round number and grows
 * the sequence by one; a wrong pad ends the game. Deterministic functions
 * over a plain state object — no DOM, no timers.
 */

export const PAD_COUNT = 4
/** Keyboard codes for pads 0..3 (also drawn on the pads). */
export const PAD_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF'] as const
/** How long one pad glows during the show phase. */
export const FLASH_MS = 350
/** Flash spacing at round 1. */
export const START_INTERVAL_MS = 600
/** Flash spacing at round RAMP_ROUND and beyond. */
export const MIN_INTERVAL_MS = 300
/** Round at which the ramp bottoms out. */
export const RAMP_ROUND = 10

export type SimonPhase = 'idle' | 'showing' | 'input' | 'over'

export interface SimonState {
  phase: SimonPhase
  /** The full sequence to repeat; length === round. */
  sequence: number[]
  /** Player input position during 'input'. */
  inputIndex: number
  /** Which flash is currently showing during 'showing'. */
  showIndex: number
  round: number
  score: number
  rng: () => number
}

export function createSimonState(rng: () => number = Math.random): SimonState {
  return { phase: 'idle', sequence: [], inputIndex: 0, showIndex: 0, round: 0, score: 0, rng }
}

/** Flash spacing for a round: linear ramp from START_INTERVAL_MS at round 1 to MIN_INTERVAL_MS at RAMP_ROUND. */
export function flashInterval(round: number): number {
  const t = (Math.min(Math.max(round, 1), RAMP_ROUND) - 1) / (RAMP_ROUND - 1)
  return START_INTERVAL_MS + t * (MIN_INTERVAL_MS - START_INTERVAL_MS)
}

/** Begin a round: append one pad and (re)start the show phase from the first flash. */
export function startRound(state: SimonState): void {
  state.sequence.push(Math.floor(state.rng() * PAD_COUNT))
  state.round = state.sequence.length
  state.phase = 'showing'
  state.showIndex = 0
  state.inputIndex = 0
}

/**
 * Advance the show phase by one flash.
 * @returns true when the whole sequence has been shown and the phase is now 'input'.
 */
export function advanceShow(state: SimonState): boolean {
  if (state.phase !== 'showing') return false
  state.showIndex += 1
  if (state.showIndex >= state.sequence.length) {
    state.phase = 'input'
    state.inputIndex = 0
    return true
  }
  return false
}

/** The pad currently flashing (during 'showing'), or null. */
export function showingPad(state: SimonState): number | null {
  if (state.phase !== 'showing') return null
  return state.sequence[state.showIndex] ?? null
}

/**
 * Press a pad during the input phase.
 * @returns 'ignored' outside 'input'; 'correct' for a continuing match;
 *   'round-clear' when the full sequence was repeated; 'wrong' on game over.
 */
export function press(state: SimonState, pad: number): 'ignored' | 'correct' | 'round-clear' | 'wrong' {
  if (state.phase !== 'input') return 'ignored'
  if (state.sequence[state.inputIndex] !== pad) {
    state.phase = 'over'
    return 'wrong'
  }
  state.inputIndex += 1
  if (state.inputIndex >= state.sequence.length) {
    state.score += state.round
    state.phase = 'idle'
    return 'round-clear'
  }
  return 'correct'
}
