/**
 * Zuma game definition: wires the pure state machine into a
 * {@link MiniGameInstance} — ← → fine-aim (2.2 rad/s) or mouse aim,
 * Space/click fires, R restarts the CURRENT level (same per-level seed, so
 * the chain replays identically), [ / ] jump between unlocked levels
 * (bounded to the persisted highest reached), P pauses (panel pause works too, lightsout
 * stored-remainder pattern: the final paused frame stays on canvas). WebAudio
 * plops/explosion sounds are synthesized (no assets), initialized on the
 * first start gesture.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createState, fire, setAim, startLevel, startRun, step, togglePause,
  type ZumaInput, type ZumaState,
} from './logic.ts'
import { renderZuma, LOGICAL_W, LOGICAL_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createParticles, type ParticleSystem } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { readLevel, saveLevel } from '../level-progress.ts'

const GAME_ID = 'zuma'

function createZumaGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: zuma needs a 2d canvas context')
  const ctx = fit.ctx

  // Level memory: the highest level reached persists (level-progress), so
  // re-entering the game resumes where the player left off.
  const state: ZumaState = createState((Date.now() ^ 0x2545f491) >>> 0)
  state.level = readLevel(GAME_ID)
  startLevel(state, state.level)
  state.result = 'ready'

  const input: ZumaInput = { left: false, right: false }
  let running = false
  let lastScore = -1
  const particles: ParticleSystem = createParticles()

  const reportScore = (): void => {
    const s = Math.floor(state.score)
    if (s === lastScore) return
    lastScore = s
    options?.onScore?.(s)
  }

  // --- audio (WebAudio synth, initialized on the first start gesture) ---
  let actx: AudioContext | null = null
  const initAudio = (): void => {
    if (actx !== null) { if (actx.state === 'suspended') void actx.resume(); return }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor === undefined) return
      actx = new Ctor()
    } catch { actx = null }
  }
  const beep = (freq: number, dur: number, type: OscillatorType, vol: number): void => {
    if (actx === null) return
    try {
      const o = actx.createOscillator()
      const g = actx.createGain()
      const now = actx.currentTime
      o.type = type
      o.frequency.setValueAtTime(freq, now)
      o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.6), now + dur)
      g.gain.setValueAtTime(vol, now)
      g.gain.exponentialRampToValueAtTime(0.001, now + dur)
      o.connect(g)
      g.connect(actx.destination)
      o.start(now)
      o.stop(now + dur + 0.02)
    } catch { /* audio unavailable */ }
  }

  const handleEvents = (): void => {
    for (const ev of state.events) {
      if (ev.kind === 'insert') beep(300, 0.07, 'square', 0.05)
      else if (ev.kind === 'match') {
        beep(520 + ev.depth * 160, 0.16, 'triangle', 0.12)
        particles.burst(ev.x, ev.y, '#ffe066', 8 + ev.count * 3, 180)
      } else if (ev.kind === 'merge') {
        beep(420, 0.1, 'sine', 0.08)
        particles.burst(ev.x, ev.y, '#7dcfff', 6, 120)
      } else if (ev.kind === 'fire') beep(760, 0.05, 'square', 0.03)
      else if (ev.kind === 'over') {
        beep(160, 0.5, 'sawtooth', 0.12)
        reportScore()
      } else if (ev.kind === 'level') {
        beep(880, 0.2, 'triangle', 0.1)
        saveLevel(GAME_ID, ev.level)
      }
    }
  }

  const restartLevel = (): void => {
    // Same base seed + same level → the identical deterministic chain.
    startLevel(state, state.level)
    state.result = 'playing'
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const k = event.code
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Space' || k === 'Enter' || k === 'BracketLeft' || k === 'BracketRight') event.preventDefault()
    switch (k) {
      case 'ArrowLeft': input.left = true; break
      case 'ArrowRight': input.right = true; break
      case 'Space': case 'Enter':
        if (!event.repeat) {
          if (state.result === 'ready' || state.result === 'over') { initAudio(); startRun(state) }
          else if (state.result === 'playing') fire(state)
        }
        break
      case 'KeyR':
        if (!event.repeat && state.result !== 'ready') { initAudio(); restartLevel() }
        break
      case 'BracketLeft': case 'BracketRight': {
        // 切换关卡：同一关卡种子全新开局；暂停中跳关后保持暂停。
        if (!event.repeat && state.result !== 'ready') {
          initAudio()
          const max = readLevel(GAME_ID)
          const next = state.level + (k === 'BracketRight' ? 1 : -1)
          if (next >= 1 && next <= max) {
            const wasPaused = state.result === 'paused'
            startLevel(state, next)
            state.result = wasPaused ? 'paused' : 'playing'
            loop.markDirty()
          }
        }
        break
      }
      case 'KeyP':
        if (!event.repeat && state.result !== 'ready') togglePauseLocal()
        break
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowLeft') input.left = false
    if (event.code === 'ArrowRight') input.right = false
  }

  const toLogical = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * LOGICAL_W) / rect.width,
      y: ((event.clientY - rect.top) * LOGICAL_H) / rect.height,
    }
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (state.result !== 'playing') return
    const p = toLogical(event)
    setAim(state, p.x, p.y)
  }

  const onPointerDown = (event: PointerEvent): void => {
    const p = toLogical(event)
    setAim(state, p.x, p.y)
    if (state.result === 'ready' || state.result === 'over') { initAudio(); startRun(state); return }
    if (state.result === 'paused') { togglePauseLocal(); return }
    fire(state)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    step(state, f.dt, input)
    handleEvents()
    if (state.result === 'playing') reportScore()
    if (f.render) {
      renderZuma(ctx, { state, paused: false })
      particles.tick(ctx, f.dt * 1000)
    }
  }

  const loop = createFrameLoop(frame)

  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderZuma(ctx, { state, paused: true })
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.resume()
    loop.markDirty()
  }
  const togglePauseLocal = (): void => {
    togglePause(state)
    if (state.result === 'paused') pause()
    else resume()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
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
      canvas.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (actx !== null) { try { void actx.close() } catch { /* ignore */ } }
      fit.dispose()
    },
  }
}

export const zumaGame: MiniGameDefinition = {
  id: 'zuma',
  title: '祖玛',
  icon: '🔮',
  description: '祖玛连珠：转动发射器射出彩球，三颗同色相连即爆裂，小心彩珠滚进终点的黑洞。',
  controls: [
    '← →：瞄准 · 空格：发射',
    '鼠标移动瞄准 · 点击发射',
    'R：重开本关 · [ ]：切换关卡（已通关范围） · P：暂停',
  ],
  create: createZumaGame,
}
