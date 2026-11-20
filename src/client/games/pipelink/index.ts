/**
 * 「管道连连 Pipelink」游戏装配：把纯逻辑与渲染接成
 * {@link MiniGameInstance}——点击（或悬停+回车）旋转管件 90°，H 提示，
 * P 暂停，R 重开本关，过关 N 下一关；连通即进入放水动画，灌满出口桶
 * 结算得分并触发水花粒子。棋盘类按需重绘（dirty 模式），放水与粒子
 * 活跃期间逐帧驱动。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  advanceLevel, applyHint, createPipelinkState, restartLevel,
  rotateCell, tickFlow, validateNow, type PipelinkState, type Pos,
} from './logic.ts'
import {
  renderPipelink, createParticles, LOGICAL_W, LOGICAL_H, CELL, HUD_H, FOOT_H, type PipelinkViewOptions,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 过关水花粒子的目标格（出口桶中心）。 */
function drainCenter(state: PipelinkState): { x: number; y: number } {
  const boardPx = state.size * CELL
  const ox = (LOGICAL_W - boardPx) / 2
  const oy = HUD_H + (LOGICAL_H - HUD_H - FOOT_H - boardPx) / 2
  return { x: ox + state.drain.c * CELL + CELL / 2, y: oy + state.drain.r * CELL + CELL / 2 }
}

/** 屏幕逻辑坐标 → 网格坐标（盘面外返回 null）。 */
function cellAt(state: PipelinkState, x: number, y: number): Pos | null {
  const boardPx = state.size * CELL
  const ox = (LOGICAL_W - boardPx) / 2
  const oy = HUD_H + (LOGICAL_H - HUD_H - FOOT_H - boardPx) / 2
  if (x < ox || y < oy || x >= ox + boardPx || y >= oy + boardPx) return null
  return { r: Math.floor((y - oy) / CELL), c: Math.floor((x - ox) / CELL) }
}

function createPipelinkGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: pipelink needs a 2d canvas context')
  const ctx = fit.ctx
  const particles = createParticles()

  let state: PipelinkState = createPipelinkState((Date.now() & 0x7fffffff) >>> 0)
  let running = false
  let lastScore = -1
  let hover: Pos | null = null

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const draw = (paused: boolean): void => {
    const opts: PipelinkViewOptions = { paused, hover, particles }
    renderPipelink(ctx, state, opts)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    let dirty = false
    if (state.status === 'flowing') {
      if (tickFlow(state, f.dt)) {
        // 刚通关：出口桶中心来一泼水花。
        const p = drainCenter(state)
        particles.burst(p.x, p.y, '#7dcfff', 26, 170)
        reportScore()
      }
      dirty = true
    }
    if (particles.size() > 0) dirty = true
    if (f.render || dirty) draw(false)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const pause = (): void => {
    running = false
    loop.pause()
    draw(true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
    loop.markDirty()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  const restart = (): void => {
    if (state.status === 'won' || state.status === 'lost') reportScore()
    restartLevel(state)
    hover = null
    loop.markDirty()
  }

  const nextLevel = (): void => {
    if (state.status !== 'won') return
    advanceLevel(state)
    hover = null
    loop.markDirty()
  }

  const tryRotate = (r: number, c: number): void => {
    if (state.status !== 'playing') return
    if (rotateCell(state, r, c)) loop.markDirty()
  }

  const onPointerMove = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const cell = cellAt(state, x, y)
    if ((cell === null) !== (hover === null) ||
        (cell !== null && hover !== null && (cell.r !== hover.r || cell.c !== hover.c))) {
      hover = cell
      loop.markDirty()
    }
  }

  const onPointerLeave = (): void => {
    if (hover !== null) {
      hover = null
      loop.markDirty()
    }
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const cell = cellAt(state, x, y)
    if (cell === null) return
    event.preventDefault()
    tryRotate(cell.r, cell.c)
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
      restart()
      return
    }
    if (event.code === 'KeyN') {
      event.preventDefault()
      nextLevel()
      return
    }
    if (!running) return
    if (event.code === 'KeyH') {
      event.preventDefault()
      const p = applyHint(state)
      if (p !== null) loop.markDirty()
      return
    }
    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault()
      if (hover !== null) tryRotate(hover.r, hover.c)
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  draw(false)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const pipelinkGame: MiniGameDefinition = {
  id: 'pipelink',
  title: '管道连连 Pipelink',
  icon: '🚿',
  description: '旋转管件让水从源头流到出口——每一节都对，水才通。',
  controls: ['点击 / 悬停+空格：旋转管件 90°', 'H：提示 · N：下一关（过关后）', 'P：暂停 · R：重开本关'],
  create: createPipelinkGame,
}
