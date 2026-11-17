/**
 * 光轮对决游戏定义：把纯逻辑引擎与渲染层接入面板生命周期——
 * 方向键/WASD 转向、R 重开整场、P 暂停，continuous 帧循环驱动
 * 恒速步进与平滑插值，局间自动 1.6 秒后开下一局。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import type { Dir, TronState } from './logic.ts'
import { createTronState, advance, startNextRound, matchOver, playerTurn } from './logic.ts'
import { renderTron, createTronParticles, burstCrash, VIEW_W, VIEW_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 局结束到自动开下一局的等待（毫秒）。 */
const NEXT_ROUND_DELAY = 1600

/** 方向键/WASD 到引擎方向的映射。 */
const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
}

function createTronGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, VIEW_W, VIEW_H)
  if (initialFit === null) throw new Error('dsh-minigames: tron needs a 2d canvas context')
  const ctx = initialFit.ctx
  const particles = createTronParticles()

  let state: TronState = createTronState((Date.now() & 0xffff) | 1)
  let roundEndedAt = 0
  let lastScore = -1

  const reportScore = (): void => {
    const score = state.wins.player * 100 + (state.roundOver ? state.tick : 0)
    if (score !== lastScore) {
      lastScore = score
      options?.onScore?.(score)
    }
  }

  const resetMatch = (): void => {
    state = createTronState((Date.now() & 0xffff) | 1)
    roundEndedAt = 0
    lastScore = -1
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const dir = KEY_DIRS[event.code]
    if (dir !== undefined) {
      event.preventDefault()
      if (!state.roundOver) playerTurn(state, dir)
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      resetMatch()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const loop = createFrameLoop((f) => {
    if (!state.roundOver) {
      advance(state, f.dt * 1000)
      if (state.roundOver) {
        roundEndedAt = performance.now()
        burstCrash(particles, state)
        reportScore()
      }
    } else if (!matchOver(state)) {
      if (performance.now() - roundEndedAt > NEXT_ROUND_DELAY) {
        startNextRound(state)
        roundEndedAt = 0
      }
    }
    if (f.render) {
      renderTron(ctx, state, particles, !loop.running && !state.roundOver)
    }
  })

  const togglePause = (): void => {
    if (state.roundOver) return
    if (loop.running) loop.pause()
    else loop.resume()
  }

  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()
  renderTron(ctx, state, particles, false)

  return {
    start: (): void => { loop.resume() },
    pause: (): void => { loop.pause() },
    resume: (): void => { loop.resume() },
    destroy: (): void => {
      loop.destroy()
      initialFit.dispose()
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const tronGame: MiniGameDefinition = {
  id: 'tron',
  title: '光轮对决 Tron',
  icon: '🏍️',
  description: '车后拖着不灭的光墙——封死对手之前，别撞上任何一条线。',
  controls: ['↑↓←→ / WASD：转向（不能掉头）', 'R：重开 · P：暂停'],
  create: createTronGame,
}
