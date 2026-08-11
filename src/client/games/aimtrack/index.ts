/**
 * FPS aim-tracking game definition: wires the pure tracking logic into a
 * {@link MiniGameInstance}. The mouse is captured via the Pointer Lock API —
 * the crosshair stays fixed at the screen centre and raw mouse movement
 * rotates the view; the left button shoots with recoil and shake. Clicking
 * the canvas enters the lock; Esc or P exits to a paused overlay.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createFpsTrackState, shoot, tickFpsTrack, turn, LOGICAL_W, LOGICAL_H, type FpsTrackState } from './logic.ts'
import { renderAimTrack } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

/** Ready = click to capture the mouse; playing = locked and ticking. */
type Phase = 'ready' | 'playing' | 'paused' | 'over'

function createAimTrackGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: aimtrack needs a 2d canvas context')
  const ctx = fit.ctx

  let state: FpsTrackState = createFpsTrackState()
  let phase: Phase = 'ready'
  let raf = 0
  let last = 0
  let t = 0
  let lastScore = -1

  const reportScore = (): void => {
    const score = Math.floor(state.score)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const lockMouse = (): void => {
    try {
      const result = canvas.requestPointerLock() as unknown as Promise<void> | undefined
      result?.catch(() => { /* e.g. Esc-pressed during the request */ })
    } catch {
      // Pointer Lock unavailable (rare): fall back to raw mouse deltas.
    }
  }

  const onPointerLockChange = (): void => {
    const locked = document.pointerLockElement === canvas
    if (locked) {
      // Captured: start or resume the round.
      last = performance.now()
      if (phase !== 'playing') phase = 'playing'
    } else if (phase === 'playing') {
      // Esc or browser release: park on the pause overlay.
      phase = 'paused'
    }
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (phase !== 'playing') return
    // Pointer Lock reports raw deltas; without it, fall back to last-position.
    if (document.pointerLockElement === canvas) {
      turn(state, event.movementX, event.movementY)
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (phase === 'playing' && event.button === 0) {
      shoot(state)
      reportScore()
    }
  }

  const onClick = (): void => {
    // Enter (or re-enter) the mouse lock from the ready / paused / over views.
    if (phase === 'over') {
      state = createFpsTrackState()
      lastScore = -1
    }
    if (phase !== 'playing') lockMouse()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      state = createFpsTrackState()
      lastScore = -1
      if (phase === 'over') phase = 'ready'
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      if (phase === 'playing') {
        phase = 'paused'
        if (document.pointerLockElement === canvas) document.exitPointerLock()
      } else if (phase === 'paused') {
        lockMouse() // re-capture via the click-free key (allowed in most browsers)
      }
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (phase === 'playing') {
      const dt = Math.min(0.033, Math.max(0, (now - last) / 1000))
      last = now
      t += dt
      tickFpsTrack(state, dt)
      reportScore()
      if (state.over && phase === 'playing') {
        phase = 'over'
        if (document.pointerLockElement === canvas) document.exitPointerLock()
      }
    }
    renderAimTrack(ctx, state, t, phase)
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
  const pause = (): void => {
    if (phase === 'playing') {
      phase = 'paused'
      if (document.pointerLockElement === canvas) document.exitPointerLock()
    }
  }
  const resume = (): void => {
    // The panel asks us to resume; we need a click to re-capture the mouse.
    if (phase === 'paused' || phase === 'ready') phase = 'ready'
  }

  document.addEventListener('pointerlockchange', onPointerLockChange)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('click', onClick)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  startLoop()
  renderAimTrack(ctx, state, 0, phase)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      stopLoop()
      fit.dispose()
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const aimTrackGame: MiniGameDefinition = {
  id: 'aimtrack',
  title: '跟枪练习',
  icon: '🎯',
  description: 'FPS 跟枪：点击锁定鼠标，准星固定屏幕中央，转动视角压住上下左右漂移的靶子，左键射击。',
  controls: ['点击：锁定鼠标开始', '鼠标：转动视角', '左键：射击', 'P：暂停（Esc 释放鼠标）', 'R：重开'],
  create: createAimTrackGame,
}
