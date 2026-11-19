/**
 * 诺诺旋转游戏接线：把纯逻辑与渲染装进 MiniGameInstance。左键填黑（再点取消）、
 * 右键打叉、空格或按钮执行校验（有错则盘面顺时针旋转 90° 并消耗一次校验）、
 * 过关后空格进入下一关；R 重开本关，P 暂停。dirty 按需重绘。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  LEVEL_COUNT,
  checkBoard,
  createLevelState,
  createNonospinState,
  levelScore,
  restartLevel,
  setCell,
  type Cell,
  type NonospinState,
} from './logic.ts'
import { LOGICAL_W, LOGICAL_H, cellAt, renderNonospin, verifyButtonRect } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

function createNonospinGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: nonospin needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = (Date.now() ^ 0x5eed) >>> 0
  let state: NonospinState = createNonospinState(seed)
  let paused = false
  let allClear = false
  let score = 0
  let lastScore = -1
  let hover: { r: number, c: number } | null = null

  const reportScore = (): void => {
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  /** 鼠标事件坐标 → 逻辑坐标（canvas 以 CSS 尺寸缩放绘制）。 */
  const logicalPoint = (event: MouseEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (LOGICAL_W / rect.width),
      y: (event.clientY - rect.top) * (LOGICAL_H / rect.height),
    }
  }

  /** 空格 / 按钮：校验（或过关后进入下一关）。 */
  const doCheck = (): void => {
    if (paused || allClear) return
    if (state.phase === 'won') { advanceLevel(); return }
    if (state.phase !== 'playing' || state.checksLeft <= 0) return
    const result = checkBoard(state)
    if (result.won) {
      const rotations = state.checksTotal - state.checksLeft
      score += levelScore(state.checksLeft, rotations)
      reportScore()
    }
    loop.markDirty()
  }

  /** 过关后推进：最后一关则全通关。 */
  const advanceLevel = (): void => {
    if (state.level + 1 >= LEVEL_COUNT) {
      allClear = true
    } else {
      state = createLevelState(state.seed, state.level + 1)
    }
    loop.markDirty()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (paused || allClear || state.phase !== 'playing') return
    const point = logicalPoint(event)
    const btn = verifyButtonRect()
    if (point.x >= btn.x && point.x <= btn.x + btn.w && point.y >= btn.y && point.y <= btn.y + btn.h) {
      doCheck()
      return
    }
    const cell = cellAt(point.x, point.y, state.size)
    if (cell === null) return
    if (event.button === 0) {
      const next: Cell = state.cells[cell.r]![cell.c]! === 1 ? 0 : 1
      setCell(state, cell.r, cell.c, next)
    } else if (event.button === 2) {
      const next: Cell = state.cells[cell.r]![cell.c]! === 2 ? 0 : 2
      setCell(state, cell.r, cell.c, next)
    }
    loop.markDirty()
  }

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
  }

  const onMouseMove = (event: MouseEvent): void => {
    const point = logicalPoint(event)
    const cell = cellAt(point.x, point.y, state.size)
    const changed = (cell === null) !== (hover === null)
      || (cell !== null && hover !== null && (cell.r !== hover.r || cell.c !== hover.c))
    if (!changed) return
    hover = cell
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'Space') {
      event.preventDefault()
      doCheck()
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      if (allClear) {
        allClear = false
        score = 0
        reportScore()
        state = createNonospinState((Date.now() ^ 0x5eed) >>> 0)
      } else {
        restartLevel(state)
      }
      loop.markDirty()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      paused = !paused
      loop.markDirty()
    }
  }

  const frame = (f: FrameInfo): void => {
    if (f.render) {
      renderNonospin(ctx, state, { hover, paused, allClear, score })
    }
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const pause = (): void => {
    paused = true
    loop.pause()
  }
  const resume = (): void => {
    paused = false
    loop.resume()
    loop.markDirty()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.addEventListener('mousemove', onMouseMove)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()
  renderNonospin(ctx, state, { hover: null, paused: false, allClear: false, score })

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const nonospinGame: MiniGameDefinition = {
  id: 'nonospin',
  title: '诺诺旋转 NonogramSpin',
  icon: '🔃',
  description: '非ograms 但线索会旋转——盘面每次顺时针转 90°，逻辑也要跟着转。',
  controls: ['左键：填黑 / 取消', '右键：打叉排除', '空格：校验并旋转', 'R：重开', 'P：暂停'],
  create: createNonospinGame,
}
