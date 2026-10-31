/**
 * Mini Bowling game definition: wires the pure lane physics into a
 * {@link MiniGameInstance} — ←/→ aim (±25°), hold Space to charge the power
 * meter and release to throw, A/D set the hook spin while charging, P pauses
 * (panel pause works too), R restarts the current level with the identical
 * rack sequence, [ / ] jump between unlocked levels (same run seed).
 * Strike/spare/pin events burst particles; level progress
 * persists through the shared level store (gameId 'bowling').
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  BALL_RADIUS, FOUL_Y, LANE_W, MAX_AIM, MIN_THROW_POWER, createLevel, currentScore, nextLevel, restartLevel,
  throwBall, step, togglePause, type BowlingState,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, laneFromLogical, renderBowling } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, accent, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const GAME_ID = 'bowling'
/** Keyboard charge rate (power per second while Space is held). */
const CHARGE_RATE = 0.85
/** Aim tap nudge (radians per keydown — fine-grained stepping). */
const AIM_NUDGE = (0.2 * Math.PI) / 180
/** Aim rotation rate while the key is HELD (radians per second — slow sweep). */
const AIM_RATE = 0.35
/** Spin adjustment rate (spin units per second while A/D is held). */
const SPIN_RATE = 1.6

function createBowlingGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: bowling needs a 2d canvas context')
  const ctx = fit.ctx

  // One run seed per mount; the level derives its rack seed from it so a
  // restart replays the identical rack sequence. A fresh mount reseeds.
  const runSeed = (Date.now() ^ 0xb0811e5) >>> 0
  let state: BowlingState = createLevel(readLevel(GAME_ID), runSeed)
  /** Banked score of completed levels (the panel score is cumulative). */
  let banked = 0

  let running = false
  let lastScore = -1
  const particles = createParticles()
  const keys = { left: false, right: false, charge: false, spinL: false, spinR: false }

  const reportScore = (): void => {
    const s = Math.floor(banked + currentScore(state))
    if (s === lastScore) return
    lastScore = s
    options?.onScore?.(s)
  }

  const handleEvents = (): void => {
    for (const ev of state.events) {
      if (ev.kind === 'pin') {
        particles.burst(
          LOGICAL_W / 2 + (ev.x - 100) * 0.9, LOGICAL_H * 0.72 - ev.y * 0.9,
          THEME.gold, 8, 130,
        )
      } else if (ev.kind === 'strike') {
        particles.burst(LOGICAL_W / 2, LOGICAL_H * 0.3, THEME.good, 26, 220)
      } else if (ev.kind === 'spare') {
        particles.burst(LOGICAL_W / 2, LOGICAL_H * 0.3, accent(1), 18, 180)
      } else if (ev.kind === 'levelWon') {
        saveLevel(GAME_ID, state.level + 1)
        banked += ev.score
        particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, THEME.good, 30, 240)
      } else if (ev.kind === 'gameOver') {
        particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, THEME.bad, 20, 180)
      }
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const dt = f.dt
    if (state.phase === 'aiming') {
      if (keys.left) state.aimAngle = Math.max(-MAX_AIM, state.aimAngle - AIM_RATE * dt)
      if (keys.right) state.aimAngle = Math.min(MAX_AIM, state.aimAngle + AIM_RATE * dt)
      if (keys.charge) state.power = Math.min(1, state.power + CHARGE_RATE * dt)
      if (keys.spinL) state.spin = Math.max(-1, state.spin - SPIN_RATE * dt)
      if (keys.spinR) state.spin = Math.min(1, state.spin + SPIN_RATE * dt)
    }
    step(state, dt)
    handleEvents()
    if (state.phase === 'levelWon' || state.phase === 'gameOver') reportScore()
    // Continuous while anything moves/animates; otherwise repaint on change.
    if (state.phase === 'rolling' || keys.left || keys.right || keys.charge || keys.spinL
      || keys.spinR || state.msgTimer > 0 || particles.size() > 0) loop.markDirty()
    if (f.render) {
      renderBowling(ctx, { state, paused: false, best: 0 })
      particles.tick(ctx, dt * 1000)
    }
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyP') {
      event.preventDefault()
      if (state.phase !== 'levelWon' && state.phase !== 'gameOver') togglePause(state)
      loop.markDirty()
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      restartLevel(state)
      reportScore()
      loop.markDirty()
      return
    }
    // 跳关：在已解锁范围内上一关 / 下一关（同 R 语义，同一 run seed）。
    if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      const target = state.level + (event.code === 'BracketRight' ? 1 : -1)
      const max = readLevel(GAME_ID)
      if (target >= 1 && target <= max) {
        Object.assign(state, createLevel(target, state.seed))
        reportScore()
        loop.markDirty()
      }
      return
    }
    if (event.code === 'Space') {
      event.preventDefault()
      if (state.phase === 'levelWon') {
        nextLevel(state)
        loop.markDirty()
      } else if (state.phase === 'gameOver') {
        restartLevel(state)
        reportScore()
        loop.markDirty()
      } else if (state.phase === 'aiming') {
        keys.charge = true
        loop.markDirty()
      }
      return
    }
    if (state.phase === 'paused' || state.phase === 'levelWon' || state.phase === 'gameOver') return
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault()
      // 点按=精细步进（1.5°），按住=慢速连续旋转——两种粒度。
      if (!event.repeat) {
        const nudge = event.code === 'ArrowLeft' ? -AIM_NUDGE : AIM_NUDGE
        state.aimAngle = Math.min(MAX_AIM, Math.max(-MAX_AIM, state.aimAngle + nudge))
        loop.markDirty()
      }
      if (event.code === 'ArrowLeft') keys.left = true
      else keys.right = true
    } else if (event.code === 'KeyA') { event.preventDefault(); keys.spinL = true }
    else if (event.code === 'KeyD') { event.preventDefault(); keys.spinR = true }
    loop.markDirty()
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowLeft') keys.left = false
    else if (event.code === 'ArrowRight') keys.right = false
    else if (event.code === 'KeyA') keys.spinL = false
    else if (event.code === 'KeyD') keys.spinR = false
    else if (event.code === 'Space') {
      if (keys.charge && state.phase === 'aiming') {
        if (state.power >= MIN_THROW_POWER) throwBall(state)
        else state.power = 0 // too weak: no launch, recharge
      }
      keys.charge = false
      loop.markDirty()
    }
  }

  const pause = (): void => {
    if (!running) return
    running = false
    keys.left = keys.right = keys.charge = keys.spinL = keys.spinR = false
    if (state.phase === 'aiming' || state.phase === 'rolling') togglePause(state)
    loop.pause()
    renderBowling(ctx, { state, paused: true, best: 0 })
  }

  const resume = (): void => {
    if (running) return
    running = true
    if (state.phase === 'paused') togglePause(state)
    loop.start()
    loop.markDirty()
  }

  // Pointer aiming: click (or drag) on the lane to point the throw at the
  // pointer — the same interaction the pool game taught. Only while aiming.
  let aiming = false
  const aimAtPointer = (event: PointerEvent): boolean => {
    if (state.phase !== 'aiming') return false
    const rect = canvas.getBoundingClientRect()
    const lx = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const ly = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const lane = laneFromLogical(lx, ly)
    // Angle from the ball toward the pointer; 0 = straight up the lane.
    const bx = LANE_W / 2
    const by = FOUL_Y - BALL_RADIUS - 4
    const angle = Math.atan2(lane.x - bx, by - lane.y)
    state.aimAngle = Math.min(MAX_AIM, Math.max(-MAX_AIM, angle))
    loop.markDirty()
    return true
  }
  const onPointerDown = (event: PointerEvent): void => {
    if (state.phase === 'levelWon' || state.phase === 'gameOver') return
    if (aimAtPointer(event)) {
      aiming = true
      canvas.setPointerCapture(event.pointerId)
    }
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (aiming) aimAtPointer(event)
  }
  const onPointerUp = (event: PointerEvent): void => {
    if (!aiming) return
    aiming = false
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
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
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
    },
  }
}

export const bowlingGame: MiniGameDefinition = {
  id: 'bowling',
  title: '迷你保龄球 Bowling',
  icon: '🎳',
  description: '瞄准蓄力掷球，勾球旋转一击全倒，真实十瓶计分冲满分。',
  controls: ['← → 点按=0.2°微调 / 按住=慢转（或点击拖拽球道）', '空格：按住蓄力，松开掷球', 'A / D：蓄力时设置勾球方向', 'P：暂停 · R：重开本关', '[ / ]：切换关卡（已解锁范围内）'],
  create: createBowlingGame,
}
