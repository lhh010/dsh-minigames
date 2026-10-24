/**
 * Sokoban game definition: wires the pure push logic into a
 * {@link MiniGameInstance} — arrows/WASD move, Z undo, R restart, N or a
 * timed auto-advance after a particle-burst clear, [ / ] to jump between
 * unlocked levels (progress persists as the highest level reached), and a
 * gold win overlay after the last level. Score (+100 per boxed goal, +500
 * per clear) is reported through onScore. Turn-based: pausing freezes input
 * and the auto-advance only; there are no gameplay timers.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  LEVELS, applyMove, createSokobanState, loadLevel, loadReached, nextReached,
  restartLevel, saveReached, undoMove,
  type SokobanMove, type SokobanState,
} from './logic.ts'
import { renderSokoban, LOGICAL_W, LOGICAL_H, type SokobanView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

const PUSH_MS = 110
const AUTO_ADVANCE_MS = 1500

/** The direction each key maps to. */
const KEY_DIR: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
}

function createSokobanGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: sokoban needs a 2d canvas context')
  const ctx = fit.ctx

  // Highest level reached (1-based); level n is playable when n <= reached.
  let reached = loadReached(LEVELS.length)
  let state: SokobanState = createSokobanState(reached - 1)
  let running = false
  let raf = 0
  let last = 0
  let lastScore = -1
  let won = false // all levels cleared
  let reported = false // report the score once per change

  let pushMove: SokobanMove | null = null
  let pushT = 0
  let autoMs = -1 // ms of running time since the clear; -1 = no clear pending

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const tryMove = (dir: 'up' | 'down' | 'left' | 'right'): void => {
    if (state.cleared || pushMove !== null) return
    const move = applyMove(state, dir)
    if (move === null) return
    pushMove = move
    pushT = 0
    if (move.cleared) {
      autoMs = 0
      reached = nextReached(reached, state.levelIndex + 1)
      saveReached(reached)
    }
  }

  /** Jump to another unlocked level (fresh load; score carries over). */
  const jumpLevel = (target: number): void => {
    if (target < 0 || target > reached - 1 || target >= LEVELS.length) return
    loadLevel(state, target)
    won = false
    pushMove = null
    pushT = 0
    autoMs = -1
    reportScore()
  }

  const nextLevel = (): void => {
    if (!state.cleared) return
    if (state.levelIndex + 1 >= LEVELS.length) {
      won = true
      reportScore()
      return
    }
    loadLevel(state, state.levelIndex + 1)
    pushMove = null
    pushT = 0
    autoMs = -1
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      if (won) {
        state = createSokobanState()
        won = false
      } else {
        restartLevel(state)
      }
      pushMove = null
      pushT = 0
      autoMs = -1
      reportScore()
      return
    }
    // Level select: jump to the previous/next unlocked level at any time
    // (fresh load; the accumulated score carries over like nextLevel).
    if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      jumpLevel(state.levelIndex + (event.code === 'BracketRight' ? 1 : -1))
      return
    }
    if (!running) return // paused: gameplay keys are dead (R/P/[ ] stay alive)
    if (event.code === 'KeyN') {
      event.preventDefault()
      nextLevel()
      return
    }
    if (event.code === 'KeyZ') {
      event.preventDefault()
      if (state.cleared || pushMove !== null) return
      undoMove(state)
      reportScore()
      return
    }
    const dir = KEY_DIR[event.code]
    if (dir === undefined) return
    event.preventDefault()
    tryMove(dir)
  }

  const advance = (dt: number): void => {
    if (pushMove !== null) {
      pushT += dt * 1000
      if (pushT >= PUSH_MS) {
        pushMove = null
        pushT = 0
        reportScore()
      }
    }
    // Auto-advance after the burst (running-time clock, so pause freezes it),
    // unless this was the last level.
    if (state.cleared && !won
      && state.levelIndex + 1 < LEVELS.length
      && autoMs >= 0) {
      autoMs += dt * 1000
      if (autoMs >= AUTO_ADVANCE_MS) nextLevel()
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000))
    last = now
    advance(dt)
    const view: SokobanView = {
      totalLevels: LEVELS.length,
      unlockedThrough: Math.min(reached, LEVELS.length),
      won,
      paused: false,
      push: pushMove !== null
        ? { playerTo: pushMove.playerTo, boxTo: pushMove.boxTo, t: Math.min(1, pushT / PUSH_MS) }
        : null,
    }
    renderSokoban(ctx, state, view)
  }

  const startLoop = (): void => {
    if (raf !== 0) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  const stopLoop = (): void => {
    cancelAnimationFrame(raf)
    raf = 0
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    stopLoop()
    renderSokoban(ctx, state, {
      totalLevels: LEVELS.length, unlockedThrough: Math.min(reached, LEVELS.length), won, paused: true, push: null,
    })
  }
  const resume = (): void => {
    if (running) return
    running = true
    startLoop()
  }

  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startLoop()
  renderSokoban(ctx, state, { totalLevels: LEVELS.length, unlockedThrough: Math.min(reached, LEVELS.length), won, paused: false, push: null })

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const sokobanGame: MiniGameDefinition = {
  id: 'sokoban',
  title: '推箱子',
  icon: '📦',
  description: '经典推箱子（Sokoban）：把所有箱子推到目标点上，30 个关卡，支持撤销。',
  controls: ['方向键 / WASD：移动推箱', 'Z：撤销 · R：重开', 'N：下一关 · [ / ]：跳关（已解锁范围内）', 'P：暂停'],
  create: createSokobanGame,
}
