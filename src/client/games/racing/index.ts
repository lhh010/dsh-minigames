/**
 * Neon Racing game definition: wires the pure state machine into a
 * {@link MiniGameInstance} — arrow keys / AD change lanes, W/S or arrows
 * accelerate and brake, Enter starts, P pauses (panel pause works too),
 * touch taps the left/right half to change lanes. WebAudio engine hum and
 * crash/near-miss sounds are synthesized (no assets).
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  MAX_SPEED, attractStep, changeLane, createState, startRun, step, togglePause,
  type LaneInput, type RacingState,
} from './logic.ts'
import { renderRacing, LOGICAL_W, LOGICAL_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'

const BEST_KEY = 'dsh-minigames:best:racing'

function loadBest(): number {
  try {
    const v = Number(window.localStorage.getItem(BEST_KEY))
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
  } catch { return 0 }
}

function saveBest(v: number): void {
  try { window.localStorage.setItem(BEST_KEY, String(Math.floor(v))) } catch { /* storage unavailable */ }
}

function createRacingGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: racing needs a 2d canvas context')
  const ctx = fit.ctx

  let state: RacingState = createState((Date.now() ^ 0x9e3779b9) >>> 0)
  const input: LaneInput = { left: false, right: false, accel: false, brake: false }
  let running = false
  let raf = 0
  let last = 0
  let best = loadBest()
  let lastScore = -1
  const particles = createParticles()

  const reportScore = (): void => {
    const s = Math.floor(state.score)
    if (s === lastScore) return
    lastScore = s
    options?.onScore?.(s)
    if (s > best) { best = s; saveBest(best) }
  }

  // --- audio (WebAudio synth, initialized on the first start gesture) ---
  let actx: AudioContext | null = null
  let engOsc: OscillatorNode | null = null
  let engGain: GainNode | null = null
  const initAudio = (): void => {
    if (actx !== null) { if (actx.state === 'suspended') void actx.resume(); return }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor === undefined) return
      actx = new Ctor()
      engOsc = actx.createOscillator()
      engOsc.type = 'sawtooth'
      engOsc.frequency.value = 60
      const lp = actx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 500
      engGain = actx.createGain()
      engGain.gain.value = 0
      engOsc.connect(lp)
      lp.connect(engGain)
      engGain.connect(actx.destination)
      engOsc.start()
    } catch { actx = null }
  }
  const beep = (freq: number, dur: number, type: OscillatorType, vol: number): void => {
    if (actx === null) return
    try {
      const o = actx.createOscillator()
      const g = actx.createGain()
      const now = actx.currentTime
      o.type = type
      o.frequency.value = freq
      g.gain.setValueAtTime(vol, now)
      g.gain.exponentialRampToValueAtTime(0.001, now + dur)
      o.connect(g)
      g.connect(actx.destination)
      o.start(now)
      o.stop(now + dur + 0.02)
    } catch { /* audio unavailable */ }
  }
  const noiseBurst = (dur: number, vol: number): void => {
    if (actx === null) return
    try {
      const n = Math.floor(actx.sampleRate * dur)
      const buf = actx.createBuffer(1, n, actx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < n; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / n)
      const src = actx.createBufferSource()
      src.buffer = buf
      const g = actx.createGain()
      g.gain.value = vol
      src.connect(g)
      g.connect(actx.destination)
      src.start()
    } catch { /* audio unavailable */ }
  }
  const updateEngine = (): void => {
    if (actx === null || engOsc === null || engGain === null) return
    const now = actx.currentTime
    const on = state.result === 'playing' && !state.crashed
    engOsc.frequency.setTargetAtTime(55 + state.speed * 2.4, now, 0.15)
    engGain.gain.setTargetAtTime(on ? 0.02 + (state.speed / MAX_SPEED) * 0.035 : 0, now, 0.15)
  }

  const spawnBurst = (x: number, y: number, color: string, n: number, power: number): void => {
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2
      const sp = power * (0.3 + Math.random() * 0.7)
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - power * 0.4,
        life: 1, max: 0.3 + Math.random() * 0.6,
        size: 2 + Math.random() * 4, color, grav: power,
      })
    }
  }

  const handleEvents = (): void => {
    for (const ev of state.events) {
      if (ev.kind === 'lane') beep(520, 0.06, 'square', 0.03)
      else if (ev.kind === 'near-miss') {
        beep(1046, 0.14, 'triangle', 0.14)
        spawnBurst(LOGICAL_W / 2, LOGICAL_H * 0.72, '#ffe066', 10, 220)
      } else if (ev.kind === 'crash') {
        noiseBurst(0.8, 0.5)
        beep(140, 0.5, 'sawtooth', 0.15)
        spawnBurst(LOGICAL_W / 2, LOGICAL_H * 0.72, '#ff8a00', 40, 500)
      } else if (ev.kind === 'pass') {
        // Light feedback only; scoring is visible in the HUD.
      } else if (ev.kind === 'over') reportScore()
    }
  }

  const restart = (): void => {
    startRun(state)
    lastScore = -1
    reportScore()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const k = event.code
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'Space') {
      event.preventDefault()
    }
    switch (k) {
      case 'ArrowLeft': case 'KeyA':
        if (!event.repeat && state.result === 'playing') changeLane(state, -1)
        break
      case 'ArrowRight': case 'KeyD':
        if (!event.repeat && state.result === 'playing') changeLane(state, 1)
        break
      case 'ArrowUp': case 'KeyW': input.accel = true; break
      case 'ArrowDown': case 'KeyS': input.brake = true; break
      case 'Enter': case 'NumpadEnter': case 'Space':
        if (!event.repeat) {
          if (state.result === 'ready' || state.result === 'over') { initAudio(); restart() }
          else if (state.result === 'paused') togglePause(state)
        }
        break
      case 'KeyP': case 'Escape':
        if (!event.repeat && state.result !== 'ready') togglePause(state)
        break
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowUp' || event.code === 'KeyW') input.accel = false
    if (event.code === 'ArrowDown' || event.code === 'KeyS') input.brake = false
  }

  const onPointerDown = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    if (state.result === 'ready' || state.result === 'over') {
      initAudio()
      restart()
      return
    }
    if (state.result === 'paused') { togglePause(state); return }
    changeLane(state, x < LOGICAL_W / 2 ? -1 : 1)
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
    last = now
    step(state, dt, input)
    handleEvents()
    // Particle physics (screen space; the burst sites are HUD-relative).
    for (const p of state.particles) {
      p.vy += p.grav * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt / p.max
    }
    state.particles = state.particles.filter(p => p.life > 0)
    attractStep(state, dt) // no-op unless ready
    if (state.result === 'playing') reportScore()
    renderRacing(ctx, { state, paused: false, best })
    updateEngine()
  }

  const pause = (): void => {
    if (!running) return
    running = false
    renderRacing(ctx, { state, paused: true, best })
  }
  const resume = (): void => {
    if (running) return
    running = true
    last = performance.now()
  }
  const togglePauseLocal = (): void => {
    togglePause(state)
    if (state.result === 'paused') pause()
    else resume()
  }

  // KeyP is handled in onKeyDown via togglePause(state); keep the panel and
  // the hotkey consistent by routing the hotkey through the same helper.
  const keyHandler = (event: KeyboardEvent): void => {
    if (event.code === 'KeyP' || event.code === 'Escape') {
      if (!event.repeat && state.result !== 'ready') togglePauseLocal()
      return
    }
    onKeyDown(event)
  }
  const keyUpHandler = (event: KeyboardEvent): void => onKeyUp(event)

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', keyHandler)
  window.addEventListener('keyup', keyUpHandler)
  focusGameHost(host)
  running = true
  last = performance.now()
  raf = requestAnimationFrame(frame)
  void particles

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', keyHandler)
      window.removeEventListener('keyup', keyUpHandler)
      if (actx !== null) { try { void actx.close() } catch { /* ignore */ } }
      fit.dispose()
    },
  }
}

export const racingGame: MiniGameDefinition = {
  id: 'racing',
  title: '霓虹疾驰',
  icon: '🏎️',
  description: '伪 3D 视角赛车躲避：变道躲开来车，擦身而过触发连击加分，速度越快越刺激。',
  controls: [
    '← → / A D：换道',
    '↑ / W：加速 · ↓ / S：减速',
    'Enter：开始 · P：暂停',
    '触屏点击左右半屏换道',
  ],
  create: createRacingGame,
}
