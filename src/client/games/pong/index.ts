/**
 * Pong game definition: wires the pure logic into a
 * {@link MiniGameInstance} — pointer follow as primary control, ←/→ or A/D
 * fallback, R restart, P pause, click/space restart on the match overlay.
 * onScore fires once with the player's points when the match ends.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createState, step, W, H, WIN_SCORE, type PongState } from './logic.ts'
import { renderPong } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

function createPongGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: pong needs a 2d canvas context')
  const ctx = fit.ctx

  let state: PongState = createState()
  let running = false
  let reported = false

  const input = { playerX: undefined as number | undefined, left: false, right: false }

  /** Fire onScore once per match with the player's points (best-score friendly). */
  const reportScore = (): void => {
    if (reported || state.over === null) return
    reported = true
    options?.onScore?.(state.playerScore)
  }

  const restart = (): void => {
    state = createState((Math.random() * 0xffffffff) >>> 0)
    reported = false
    input.left = input.right = false
    loop.markDirty()
  }

  const onPointerMove = (event: PointerEvent): void => {
    // CSS px → logical arena x.
    const rect = canvas.getBoundingClientRect()
    input.playerX = ((event.clientX - rect.left) / rect.width) * W
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // Modifier chords (Ctrl/Cmd+R reload, Alt+letter menus) are browser
    // commands, never game input — swallow-none.
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        input.left = true
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        input.right = true
        break
      case 'KeyR':
        event.preventDefault()
        restart()
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
      case 'Space':
        event.preventDefault()
        if (state.over !== null) restart()
        break
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        input.left = false
        break
      case 'ArrowRight':
      case 'KeyD':
        input.right = false
        break
    }
  }
  const onPointerDown = (): void => {
    if (state.over !== null) restart()
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    state = step(state, f.dt * 1000, input)
    reportScore()
    if (f.render) renderPong(ctx, state)
  }

  const loop = createFrameLoop(frame)

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    running = false
    loop.pause()
    renderPong(ctx, state)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  loop.start()
  renderPong(ctx, state)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const pongGame: MiniGameDefinition = {
  id: 'pong',
  title: '弹球对打',
  icon: '🏓',
  description: `鼠标或 ←/→ 移动挡板，先拿 ${WIN_SCORE} 分获胜，回合越久球越快。`,
  controls: ['鼠标：左右移动', '←/→ / A D：移动', 'R：重开', 'P：暂停'],
  create: createPongGame,
}
