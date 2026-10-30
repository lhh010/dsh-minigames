/**
 * Mini Pool game definition: wires the pure billiards state machine into a
 * {@link MiniGameInstance} — drag from the cue ball to aim (slingshot: power
 * ∝ pull distance) and release to shoot, or ←/→ rotate the aim and hold
 * Space to charge. R restarts the level with the identical rack, P pauses
 * (panel pause works too). Pot events burst particles; level progress
 * persists through the shared level store (gameId 'pool').
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createLevel, nextLevel, restartLevel, shoot, step, togglePause, type PoolState,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, logicalToWorld, renderPool } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const GAME_ID = 'pool'
const BEST_KEY = 'dsh-minigames:best:pool'
/** Pull distance (world units) that maps to full power. */
const FULL_POWER_PULL = 90
/** Keyboard charge rate (power per second while Space is held). */
const CHARGE_RATE = 0.9
/** Aim rotation rate (radians per second while ←/→ is held). */
const AIM_RATE = 1.8
const AIM_STEP = 0.03
/** Minimum power that actually fires (taps do not shoot). */
const MIN_FIRE_POWER = 0.05

function loadBest(): number {
  try {
    const v = Number(window.localStorage.getItem(BEST_KEY))
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
  } catch { return 0 }
}

function saveBest(v: number): void {
  try { window.localStorage.setItem(BEST_KEY, String(Math.floor(v))) } catch { /* storage unavailable */ }
}

function createPoolGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: pool needs a 2d canvas context')
  const ctx = fit.ctx

  // One run seed per mount; levels derive their rack seed from it so a
  // restart replays the identical rack. A fresh mount reseeds.
  const runSeed = (Date.now() ^ 0x51f15e) >>> 0
  let seedState = runSeed
  const nextSeed = (): number => {
    seedState = (Math.imul(seedState ^ 0x9e3779b9, 0x85ebca6b) >>> 0) || 2
    return seedState
  }
  const startSeed = nextSeed()
  let state: PoolState = createLevel(readLevel(GAME_ID), startSeed)

  let running = false
  let best = loadBest()
  let lastScore = -1
  const particles = createParticles()
  const keys = { left: false, right: false, charge: false }
  /** Active drag aim (angle + power) while the pointer is held. */
  let drag: { angle: number; power: number } | null = null

  const reportScore = (): void => {
    const s = Math.floor(state.score)
    if (s === lastScore) return
    lastScore = s
    options?.onScore?.(s)
    if (s > best) { best = s; saveBest(best) }
  }

  const handleEvents = (): void => {
    for (const ev of state.events) {
      if (ev.kind === 'pot') particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, THEME.gold, 10, 140)
      else if (ev.kind === 'win') {
        saveLevel(GAME_ID, state.level + 1)
        particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, THEME.good, 24, 220)
        reportScore()
      } else if (ev.kind === 'foul') particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, THEME.bad, 10, 120)
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const dt = f.dt
    if (state.result === 'aiming' && drag === null) {
      if (keys.left) state.aimAngle -= AIM_RATE * dt
      if (keys.right) state.aimAngle += AIM_RATE * dt
      if (keys.charge) state.power = Math.min(1, state.power + CHARGE_RATE * dt)
    }
    step(state, dt)
    handleEvents()
    if (state.result === 'levelWon' || state.result === 'gameOver') reportScore()
    if (f.render) {
      renderPool(ctx, { state, paused: false, aim: drag, best })
      particles.tick(ctx, dt * 1000)
    }
  }

  const loop = createFrameLoop(frame)

  const pointerWorld = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return logicalToWorld(
      ((event.clientX - rect.left) * LOGICAL_W) / rect.width,
      ((event.clientY - rect.top) * LOGICAL_H) / rect.height,
    )
  }

  const cueBallPos = (): { x: number; y: number } | null => {
    const cue = state.balls.find(b => b.id === 0 && !b.potted)
    return cue === undefined ? null : { x: cue.x, y: cue.y }
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!running || state.result !== 'aiming') return
    const cue = cueBallPos()
    const p = pointerWorld(event)
    if (cue === null) return
    // A drag must start near the cue ball (generous grab radius).
    if (Math.hypot(p.x - cue.x, p.y - cue.y) < 24) {
      drag = { angle: state.aimAngle, power: 0 }
      try { canvas.setPointerCapture(event.pointerId) } catch { /* capture optional */ }
      loop.markDirty()
    }
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (drag === null) return
    const cue = cueBallPos()
    if (cue === null) { drag = null; return }
    const p = pointerWorld(event)
    const dx = cue.x - p.x
    const dy = cue.y - p.y
    const dist = Math.hypot(dx, dy)
    if (dist < 2) return
    // Slingshot: shoot away from the pull, power ∝ pull distance.
    drag = { angle: Math.atan2(dy, dx), power: Math.min(1, dist / FULL_POWER_PULL) }
    loop.markDirty()
  }
  const onPointerUp = (): void => {
    if (drag === null) return
    const { angle, power } = drag
    drag = null
    if (power > MIN_FIRE_POWER) shoot(state, angle, power)
    loop.markDirty()
  }

  const advance = (): void => {
    nextLevel(state, nextSeed())
    lastScore = -1
    reportScore()
    loop.markDirty()
  }

  /** Jump to a level within cleared progress ([ ] navigation). */
  const jumpLevel = (target: number): void => {
    state = createLevel(target, startSeed)
    lastScore = -1
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const k = event.code
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Space' || k === 'ArrowUp' || k === 'ArrowDown') {
      event.preventDefault()
    }
    switch (k) {
      case 'ArrowLeft': case 'KeyA':
        if (state.result === 'aiming' && !event.repeat && !keys.left) state.aimAngle -= AIM_STEP
        keys.left = true
        break
      case 'ArrowRight': case 'KeyD':
        if (state.result === 'aiming' && !event.repeat && !keys.right) state.aimAngle += AIM_STEP
        keys.right = true
        break
      case 'Space':
        if (state.result === 'levelWon' && !event.repeat) advance()
        else if (state.result === 'aiming') keys.charge = true
        break
      case 'Enter': case 'NumpadEnter':
        if (state.result === 'levelWon' && !event.repeat) advance()
        break
      case 'KeyR':
        if (!event.repeat && (state.result === 'aiming' || state.result === 'moving' || state.result === 'gameOver')) {
          restartLevel(state, startSeed)
          lastScore = -1
          reportScore()
          loop.markDirty()
        }
        break
      case 'BracketLeft': case 'BracketRight': {
        // 切换关卡：只在已通关范围内（1..persisted）。
        if (!event.repeat) {
          const max = readLevel(GAME_ID)
          const next = state.level + (event.code === 'BracketRight' ? 1 : -1)
          if (next >= 1 && next <= max) jumpLevel(next)
        }
        break
      }
      case 'KeyP': case 'Escape':
        if (!event.repeat) togglePauseLocal()
        break
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') keys.left = false
    if (event.code === 'ArrowRight' || event.code === 'KeyD') keys.right = false
    if (event.code === 'Space' && keys.charge) {
      keys.charge = false
      if (state.result === 'aiming' && state.power > MIN_FIRE_POWER) {
        shoot(state, state.aimAngle, state.power)
        state.power = 0
        loop.markDirty()
      }
    }
  }

  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    togglePause(state)
    renderPool(ctx, { state, paused: true, aim: drag, best })
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

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
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
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      fit.dispose()
    },
  }
}

export const poolGame: MiniGameDefinition = {
  id: 'pool',
  title: '迷你台球',
  icon: '🎱',
  description: '九球单挑：拖拽白球或 ← → 瞄准、长按空格蓄力击球，在限定杆数内清空全部彩球。',
  controls: [
    '拖拽白球方向松手击球（拉得越远越大力）',
    '← / → 瞄准 · 长按空格蓄力，松开击球',
    'R：重开本关（同一球局）· P：暂停',
    '空格 / 回车：清台后进入下一关',
  ],
  create: createPoolGame,
}
