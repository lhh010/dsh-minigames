/**
 * 泡泡龙 game definition: wires the pure hex-grid logic into a
 * {@link MiniGameInstance} — ← → fine-aim (or mouse move), Space/click fires
 * the loaded bubble, P pauses (panel pause works too), R restarts the
 * CURRENT level (same seed → the same initial board). Clearing the field
 * auto-advances 1.5s later (stored-remainder pattern keeps the advance
 * timer frozen across pauses); level progress persists via level-progress.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  adjustAim, aimAt, advanceLevel, createState, fire, restartLevel, step, togglePause,
  cellCenter, type BubbleState,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, renderBubble } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, accent, createParticles } from '../theme.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500
/** Held-key aim rotation speed (rad/s). */
const AIM_RATE = 1.8
const GAME_ID = 'bubble'

function createBubbleGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: bubble needs a 2d canvas context')
  const ctx = fit.ctx

  // Level memory: the highest level reached persists, so re-entering the
  // game resumes where the player left off (per-level boards stay seeded).
  let state: BubbleState = createState((Date.now() ^ 0x5bf03635) >>> 0, readLevel(GAME_ID))
  let running = false
  let lastScore = -1
  let aimLeft = false
  let aimRight = false
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  const particles = createParticles()

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const burstCells = (cells: { r: number; c: number }[], color: number | null, count: number): void => {
    for (const cell of cells) {
      const p = cellCenter(cell.r, cell.c)
      particles.burst(p.x, p.y, color === null ? THEME.gold : accent(color), count)
    }
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      advanceLevel(state)
      saveLevel(GAME_ID, state.level)
    }, delayMs)
  }

  const handleEvents = (): void => {
    for (const ev of state.events) {
      if (ev.kind === 'pop') burstCells(ev.cells, ev.color, 6)
      else if (ev.kind === 'fall') burstCells(ev.cells, null, 4)
      else if (ev.kind === 'clear') {
        reportScore()
        // Won: schedule the auto-advance, or arm it for resume if paused
        // mid-celebration (stored-remainder pattern).
        if (running) scheduleAdvance(ADVANCE_MS)
        else advanceRemaining = ADVANCE_MS
      } else if (ev.kind === 'over') reportScore()
    }
  }

  const restart = (): void => {
    clearTimeout(advanceTimer)
    advanceTimer = 0
    advanceRemaining = 0
    restartLevel(state)
    lastScore = -1
    reportScore()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight' || event.code === 'Space') {
      event.preventDefault()
    }
    if (event.repeat && event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') return
    switch (event.code) {
      case 'ArrowLeft': aimLeft = true; break
      case 'ArrowRight': aimRight = true; break
      case 'Space': case 'Enter':
        if (state.result === 'over') restart()
        else fire(state)
        break
      case 'KeyR': restart(); break
      case 'KeyP': case 'Escape':
        if (!event.repeat) togglePauseLocal()
        break
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowLeft') aimLeft = false
    if (event.code === 'ArrowRight') aimRight = false
  }

  const toLogical = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * LOGICAL_W) / rect.width,
      y: ((event.clientY - rect.top) * LOGICAL_H) / rect.height,
    }
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!running || state.result !== 'playing') return
    const p = toLogical(event)
    aimAt(state, p.x, p.y)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (state.result === 'over') { restart(); return }
    if (state.result === 'paused') { togglePauseLocal(); return }
    if (!running) return
    const p = toLogical(event)
    aimAt(state, p.x, p.y)
    fire(state)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    if (state.result === 'playing') {
      if (aimLeft) adjustAim(state, AIM_RATE * f.dt)
      if (aimRight) adjustAim(state, -AIM_RATE * f.dt)
      step(state, f.dt)
      handleEvents()
    }
    reportScore()
    if (!f.render && particles.size() === 0) return
    renderBubble(ctx, LOGICAL_W, LOGICAL_H, state, false)
    particles.tick(ctx, f.dt * 1000)
  }

  const loop = createFrameLoop(frame) // continuous physics → default mode

  const pause = (): void => {
    if (!running) return
    running = false
    aimLeft = false
    aimRight = false
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    renderBubble(ctx, LOGICAL_W, LOGICAL_H, state, true) // final frame with 已暂停
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    loop.start()
  }
  const togglePauseLocal = (): void => {
    if (state.result === 'playing' || state.result === 'paused') togglePause(state)
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
  reportScore()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const bubbleGame: MiniGameDefinition = {
  id: 'bubble',
  title: '泡泡龙',
  icon: '🫧',
  description: '经典泡泡龙：瞄准发射同色泡泡，三颗相连即消除，切断的泡泡会坠落加分，清空全场进入下一关。',
  controls: [
    '← →：微调瞄准 · 鼠标移动：指向',
    'Space / 点击：发射',
    'R：重开本关 · P：暂停',
  ],
  create: createBubbleGame,
}
