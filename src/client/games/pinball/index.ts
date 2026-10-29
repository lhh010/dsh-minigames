/**
 * 弹球台 Pinball game definition: wires the pure physics state machine into a
 * {@link MiniGameInstance} — A/← and D/→ flip the flippers, Space charges the
 * plunger and releases to launch, N nudges the table (abuse → TILT), P pauses,
 * R restarts the table. Continuous frame loop: physics on f.dt with substeps,
 * paint on f.render. Level progress persists through the shared level store
 * (gameId 'pinball'); score events burst particles at the scoring spot.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createGame, nudge, plungerRelease, restart, setFlipper, step, togglePause,
  type PinballState,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, renderPinball } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const GAME_ID = 'pinball'
const BEST_KEY = 'dsh-minigames:best:pinball'
/** A fresh launch must clear this much charge (taps should not fire hard). */
const MIN_LAUNCH_POWER = 0.08

function loadBest(): number {
  try {
    const v = Number(window.localStorage.getItem(BEST_KEY))
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
  } catch { return 0 }
}

function saveBest(v: number): void {
  try { window.localStorage.setItem(BEST_KEY, String(Math.floor(v))) } catch { /* storage unavailable */ }
}

function createPinballGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: pinball needs a 2d canvas context')
  const ctx = fit.ctx

  // One run seed per mount; nudges draw their jitter from it, so a run is
  // deterministic given the same inputs. A fresh mount reseeds.
  const runSeed = (Date.now() ^ 0x91d5b1) >>> 0
  let state: PinballState = createGame(readLevel(GAME_ID), runSeed)

  let running = false
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

  const handleEvents = (): void => {
    for (const ev of state.events) {
      if (ev.kind === 'bumper') particles.burst(ev.x, ev.y, THEME.gold, 8, 150)
      else if (ev.kind === 'sling') particles.burst(ev.x, ev.y, THEME.bad, 7, 130)
      else if (ev.kind === 'target') particles.burst(ev.x, ev.y, THEME.good, 6, 110)
      else if (ev.kind === 'bank') particles.burst(ev.x, ev.y, THEME.gold, 20, 220)
      else if (ev.kind === 'levelUp') {
        saveLevel(GAME_ID, ev.level)
        particles.burst(LOGICAL_W / 2, 260, THEME.good, 24, 240)
      } else if (ev.kind === 'drain') particles.burst(LOGICAL_W / 2, LOGICAL_H - 40, THEME.bad, 14, 160)
      else if (ev.kind === 'tilt') particles.burst(LOGICAL_W / 2, 120, THEME.bad, 16, 180)
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    step(state, f.dt)
    handleEvents()
    reportScore()
    if (f.render) {
      renderPinball(ctx, { state, paused: false, best })
      particles.tick(ctx, f.dt * 1000)
    }
  }

  const loop = createFrameLoop(frame)

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const k = event.code
    if (k === 'Space' || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      event.preventDefault()
    }
    if (event.repeat) return
    switch (k) {
      case 'KeyA': case 'ArrowLeft':
        setFlipper(state, 'left', true)
        break
      case 'KeyD': case 'ArrowRight':
        setFlipper(state, 'right', true)
        break
      case 'Space':
        if (state.result === 'paused') togglePauseLocal()
        else if (state.result === 'playing') state.plungerHeld = true
        break
      case 'KeyN':
        nudge(state)
        break
      case 'KeyR':
        if (state.result !== 'paused') {
          restart(state)
          lastScore = -1
          reportScore()
        }
        break
      case 'KeyP': case 'Escape':
        togglePauseLocal()
        break
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    const k = event.code
    if (k === 'KeyA' || k === 'ArrowLeft') setFlipper(state, 'left', false)
    else if (k === 'KeyD' || k === 'ArrowRight') setFlipper(state, 'right', false)
    else if (k === 'Space' && state.plungerHeld) {
      if (state.plunger >= MIN_LAUNCH_POWER) plungerRelease(state)
      else { state.plunger = 0; state.plungerHeld = false }
    }
  }

  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    // Park the held keys so nothing stays wedged while hidden.
    setFlipper(state, 'left', false)
    setFlipper(state, 'right', false)
    state.plungerHeld = false
    togglePause(state)
    renderPinball(ctx, { state, paused: true, best })
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (state.result === 'paused') togglePause(state)
    loop.resume()
    loop.markDirty()
  }
  const togglePauseLocal = (): void => {
    if (state.result === 'paused') resume()
    else pause()
  }

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
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      fit.dispose()
    },
  }
}

export const pinballGame: MiniGameDefinition = {
  id: 'pinball',
  title: '弹球台',
  icon: '🎯',
  description: '真实物理弹球：弹射器发球、挡板击打、缓冲柱与反弹板得分，小心出局通道和 TILT。',
  controls: [
    'A / ← 左挡板 · D / → 右挡板',
    '长按空格蓄力发射 · 松开发球',
    'N 轻推台面（5 秒内 3 次 → TILT）',
    'P 暂停 · R 重开本桌',
  ],
  create: createPinballGame,
}
