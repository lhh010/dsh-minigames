/**
 * Piano Tiles game definition: wires the pure state machine into a
 * {@link MiniGameInstance} — D F J K (or touch lanes) tap the lane when its
 * tile reaches the bottom hit zone; wrong lane or a missed tile ends the
 * run (classic rules). Enter starts, R restarts the SAME seed, P pauses.
 * WebAudio hits ascend a pentatonic scale (pure oscillator synthesis, no
 * assets), initialized on the first user gesture.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  LANE_COUNT, attractStep, createState, pressLane, releaseLane, startRun, step, togglePause,
  type PianoState,
} from './logic.ts'
import { LOGICAL_W, LOGICAL_H, renderPiano } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, accent, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const BEST_KEY = 'dsh-minigames:best:piano'

function loadBest(): number {
  try {
    const v = Number(window.localStorage.getItem(BEST_KEY))
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
  } catch { return 0 }
}

function saveBest(v: number): void {
  try { window.localStorage.setItem(BEST_KEY, String(Math.floor(v))) } catch { /* storage unavailable */ }
}

/** C-major pentatonic across two octaves; hits ascend and wrap. */
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 784.0, 880.0] as const

function createPianoGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: piano needs a 2d canvas context')
  const ctx = fit.ctx

  let state: PianoState = createState((Date.now() ^ 0x51a301e5) >>> 0)
  let running = false
  let best = loadBest()
  let lastScore = -1
  const particles = createParticles()

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
    if (state.score > best) { best = state.score; saveBest(best) }
  }

  // --- audio (WebAudio synth, initialized on the first start gesture) ---
  let actx: AudioContext | null = null
  /** Lane held by the current touch (for touch holds); null when released. */
  let pointerLane: number | null = null
  const initAudio = (): void => {
    if (actx !== null) { if (actx.state === 'suspended') void actx.resume(); return }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor === undefined) return
      actx = new Ctor()
    } catch { actx = null }
  }
  const note = (freq: number, dur: number, vol: number): void => {
    if (actx === null) return
    try {
      const o = actx.createOscillator()
      const o2 = actx.createOscillator()
      const g = actx.createGain()
      const now = actx.currentTime
      o.type = 'triangle'
      o2.type = 'sine'
      o.frequency.value = freq
      o2.frequency.value = freq * 2 // soft octave partial
      g.gain.setValueAtTime(vol, now)
      g.gain.exponentialRampToValueAtTime(0.001, now + dur)
      o.connect(g)
      const g2 = actx.createGain()
      g2.gain.value = 0.3
      o2.connect(g2)
      g2.connect(g)
      g.connect(actx.destination)
      o.start(now)
      o2.start(now)
      o.stop(now + dur + 0.02)
      o2.stop(now + dur + 0.02)
    } catch { /* audio unavailable */ }
  }
  const failSound = (): void => {
    if (actx === null) return
    note(130.81, 0.5, 0.16)
    note(98.0, 0.7, 0.12)
  }

  const handleEvents = (): void => {
    for (const ev of state.events) {
      if (ev.kind === 'hit') {
        note(SCALE[(ev.note - 1) % SCALE.length]!, 0.28, 0.12)
        particles.burst((LOGICAL_W / LANE_COUNT) * (ev.lane + 0.5), LOGICAL_H - 30, accent(ev.lane), 8, 160)
      } else if (ev.kind === 'hold-start') {
        note(SCALE[(state.hits) % SCALE.length]!, 0.15, 0.1)
      } else if (ev.kind === 'hold-done') {
        note(SCALE[(state.hits + 2) % SCALE.length]!, 0.3, 0.12)
        particles.burst((LOGICAL_W / LANE_COUNT) * (ev.lane + 0.5), LOGICAL_H - 30, THEME.gold, 10, 180)
      } else if (ev.kind === 'miss-life') {
        // A spent life: brief failure sting (full fanfare only on game over).
        failSound()
        particles.burst((LOGICAL_W / LANE_COUNT) * (ev.lane + 0.5), LOGICAL_H - 30, THEME.bad, 12, 200)
      } else if (ev.kind === 'over') {
        reportScore()
      }
    }
  }

  const restart = (): void => {
    startRun(state) // same seed → identical run
    lastScore = -1
    reportScore()
  }

  const laneForCode = (code: string): number => {
    switch (code) {
      case 'KeyD': return 0
      case 'KeyF': return 1
      case 'KeyJ': return 2
      case 'KeyK': return 3
      default: return -1
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const lane = laneForCode(event.code)
    if (lane >= 0) {
      event.preventDefault()
      if (!event.repeat && state.result === 'playing') pressLane(state, lane)
      return
    }
    switch (event.code) {
      case 'Enter': case 'NumpadEnter': case 'Space':
        event.preventDefault()
        if (!event.repeat) {
          if (state.result === 'ready' || state.result === 'over') { initAudio(); restart() }
          else if (state.result === 'paused') togglePauseLocal()
        }
        break
      case 'KeyR':
        event.preventDefault()
        if (!event.repeat && (state.result === 'playing' || state.result === 'over' || state.result === 'paused')) {
          if (state.result === 'paused') resume()
          initAudio()
          restart()
        }
        break
      case 'KeyP': case 'Escape':
        event.preventDefault()
        if (!event.repeat && (state.result === 'playing' || state.result === 'paused')) togglePauseLocal()
        break
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    const lane = laneForCode(event.code)
    if (lane >= 0 && state.result === 'playing') releaseLane(state, lane)
  }

  const laneAtPointer = (event: PointerEvent): number => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    return Math.min(LANE_COUNT - 1, Math.max(0, Math.floor(x / (LOGICAL_W / LANE_COUNT))))
  }

  const onPointerDown = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    void rect
    if (state.result === 'ready' || state.result === 'over') {
      initAudio()
      restart()
      return
    }
    if (state.result === 'paused') { togglePauseLocal(); return }
    initAudio()
    pointerLane = laneAtPointer(event)
    pressLane(state, pointerLane)
  }

  const onPointerUp = (): void => {
    if (pointerLane !== null && state.result === 'playing') {
      releaseLane(state, pointerLane)
    }
    pointerLane = null
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    step(state, f.dt)
    attractStep(state, f.dt) // no-op unless ready
    handleEvents()
    if (state.result === 'playing' || state.result === 'over') reportScore()
    if (f.render) {
      renderPiano(ctx, { state, paused: false, best })
      particles.tick(ctx, f.dt * 1000)
    }
  }

  const loop = createFrameLoop(frame)

  const pause = (): void => {
    if (!running) return
    running = false
    renderPiano(ctx, { state, paused: true, best }) // final paused frame
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.markDirty()
  }
  function togglePauseLocal(): void {
    togglePause(state)
    if (state.result === 'paused') pause()
    else resume()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (actx !== null) { try { void actx.close() } catch { /* ignore */ } }
      fit.dispose()
    },
  }
}

export const pianoGame: MiniGameDefinition = {
  id: 'piano',
  title: '钢琴块',
  icon: '🎹',
  description: '四轨钢琴块：块压住判定线时按 D F J K 或点击轨道，长块需要按住；空按免罚，失误 5 次才结束。',
  controls: [
    'D F J K / 点击轨道：击打判定线的块',
    '长块：按住直到块尾过线',
    'Enter：开始 · R：同种子重开 · P：暂停',
  ],
  create: createPianoGame,
}
