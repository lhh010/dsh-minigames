/**
 * Tetris game definition: wires the pure board logic into a
 * {@link MiniGameInstance} — a gravity-driven rAF loop, keyboard input
 * (arrows/WASD, space hard drop, up/X/Z rotate, C hold, P pause), and restart
 * on game over.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createTetrisState, gravityInterval, hardDrop, holdPiece, isLanded, lock, move, rotate,
  type TetrisState,
} from './board.ts'
import { renderTetris, BOARD_W, BOARD_H, LOGICAL_W } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

/** Controllable window between landing and locking (standard Tetris lock delay). */
const LOCK_DELAY_MS = 400
/** Max slide/rotate refreshes of the lock window per piece (anti-stall bound). */
const LOCK_RESETS_PER_PIECE = 15

function createTetrisGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, BOARD_H + 8)
  if (fit === null) throw new Error('dsh-minigames: tetris needs a 2d canvas context')
  const ctx = fit.ctx

  let state: TetrisState = createTetrisState()
  let running = false
  let raf = 0
  let last = 0
  let gravityAcc = 0
  let lastScore = -1
  // Lock delay: when the piece lands it stays controllable for a short window
  // (slide/rotate) before locking; sliding or rotating refreshes the window,
  // bounded by LOCK_RESETS_PER_PIECE so a piece cannot be stalled forever.
  let landedAt: number | null = null
  let lockResets = 0

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  /** Refresh the lock-delay window after a successful slide/rotate of a landed piece. */
  const touchLanded = (): void => {
    if (landedAt !== null && lockResets < LOCK_RESETS_PER_PIECE) {
      landedAt = performance.now()
      lockResets += 1
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        if (move(state, -1, 0)) touchLanded()
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        if (move(state, 1, 0)) touchLanded()
        break
      case 'ArrowDown':
      case 'KeyS':
        event.preventDefault()
        if (move(state, 0, 1)) state.score += 1
        reportScore()
        break
      case 'Space':
        event.preventDefault()
        state.score += hardDrop(state) * 2
        gravityAcc = 0
        landedAt = null
        lockResets = 0
        reportScore()
        break
      case 'ArrowUp':
      case 'KeyX':
      case 'KeyW':
        event.preventDefault()
        if (rotate(state, 1)) touchLanded()
        break
      case 'KeyZ':
        event.preventDefault()
        if (rotate(state, -1)) touchLanded()
        break
      case 'KeyC':
        event.preventDefault()
        holdPiece(state)
        gravityAcc = 0
        landedAt = null
        lockResets = 0
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
      case 'KeyR':
        if (state.over) reset()
        break
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000))
    last = now
    if (!state.over && state.current !== null && isLanded(state)) {
      // Landed: hold the piece in place for the lock-delay window, then lock.
      // Gravity accumulation pauses so the next piece starts fresh.
      if (landedAt === null) landedAt = now
      if (now - landedAt >= LOCK_DELAY_MS) {
        lock(state)
        landedAt = null
        lockResets = 0
        gravityAcc = 0
        reportScore()
      }
      renderTetris(ctx, state)
      return
    }
    landedAt = null
    lockResets = 0
    gravityAcc += dt * 1000
    const interval = gravityInterval(state.level)
    while (gravityAcc >= interval && !state.over) {
      gravityAcc -= interval
      if (!move(state, 0, 1)) {
        gravityAcc = 0
        reportScore()
        if (state.over) break
      }
    }
    renderTetris(ctx, state)
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

  const reset = (): void => {
    state = createTetrisState()
    gravityAcc = 0
    landedAt = null
    lockResets = 0
    lastScore = -1
    reportScore()
    if (running) startLoop()
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    running = false
    stopLoop()
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
  renderTetris(ctx, state)

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

export const tetrisGame: MiniGameDefinition = {
  id: 'tetris',
  title: '俄罗斯方块',
  icon: '🧱',
  description: '经典下落消除：←→ 移动，↑/X 旋转，空格硬降，C 暂存，P 暂停。',
  controls: ['← →：左右移动', '↑ / X：旋转', '空格：硬降', 'C：暂存', 'P：暂停'],
  create: createTetrisGame,
}
