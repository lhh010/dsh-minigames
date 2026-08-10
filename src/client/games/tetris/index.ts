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
  createTetrisState, gravityInterval, hardDrop, holdPiece, move, rotate,
  type TetrisState,
} from './board.ts'
import { renderTetris, BOARD_W, BOARD_H } from './render.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

function createTetrisGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.width = BOARD_W + 16 + 4 * 22 + 8
  canvas.height = BOARD_H + 8
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('dsh-minigames: tetris needs a 2d canvas context')

  let state: TetrisState = createTetrisState()
  let running = false
  let raf = 0
  let last = 0
  let gravityAcc = 0
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        move(state, -1, 0)
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        move(state, 1, 0)
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
        reportScore()
        break
      case 'ArrowUp':
      case 'KeyX':
      case 'KeyW':
        event.preventDefault()
        rotate(state, 1)
        break
      case 'KeyZ':
        event.preventDefault()
        rotate(state, -1)
        break
      case 'KeyC':
        event.preventDefault()
        holdPiece(state)
        gravityAcc = 0
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
