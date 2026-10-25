/**
 * Match-3 (消消乐) game definition: click a cell to remove its 4-connected
 * same-color group — bigger pops score super-linearly, the rest falls, and
 * reaching the level target wins (the next level raises the bar). Mouse and
 * keyboard input, a clear/fall animation phase, and auto level advancement.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  advanceLevel, createMatch3State, groupAt, planRemoval, removeGroup, restart,
  scoreForGroup, updateResult,
  type Match3State, type Position, type RemovalPlan,
} from './logic.ts'
import { renderMatch3, LOGICAL_W, LOGICAL_H, HUD_H, CELL, type Match3View } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const CLEAR_MS = 280
const WIN_MS = 900

type Phase = 'idle' | 'clear' | 'win' | 'lose'

function createMatch3Game(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: match3 needs a 2d canvas context')
  const ctx = fit.ctx

  let state: Match3State = createMatch3State()
  let running = false
  let lastScore = -1

  let phase: Phase = 'idle'
  let phaseT = 0
  let cursor: Position = { r: 0, c: 0 }
  let clearPlan: RemovalPlan | null = null
  let clearGrid: number[][] = []
  let clearScoreText = ''
  /** The display grid: the pre-removal grid during the clear animation. */
  let displayGrid: number[][] = state.grid

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const cellFromEvent = (event: PointerEvent): Position | null => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const c = Math.floor(x / CELL)
    // The board sits below the HUD strip — the click must be mapped into the
    // board's own rows, or clicks land one row off from the gem the player saw.
    const r = Math.floor((y - HUD_H) / CELL)
    if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return null
    return { r, c }
  }

  /** Remove the group at `pos` with a flash + fall animation. */
  const pop = (pos: Position): void => {
    if (phase !== 'idle') return
    const group = groupAt(state.grid, pos)
    if (group.length === 0) return
    clearPlan = planRemoval(state.grid, group)
    clearGrid = state.grid.map(row => [...row])
    clearScoreText = `+${scoreForGroup(group.length)}`
    removeGroup(state, pos)
    reportScore()
    displayGrid = clearGrid
    phase = 'clear'
    phaseT = 0
    loop.markDirty()
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!running) return // paused: freeze the board
    const cell = cellFromEvent(event)
    if (cell !== null) pop(cell)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const wasCursorKey = event.code.startsWith('Arrow')
    switch (event.code) {
      case 'ArrowUp':
        event.preventDefault()
        cursor = { r: Math.max(0, cursor.r - 1), c: cursor.c }
        break
      case 'ArrowDown':
        event.preventDefault()
        cursor = { r: Math.min(state.rows - 1, cursor.r + 1), c: cursor.c }
        break
      case 'ArrowLeft':
        event.preventDefault()
        cursor = { r: cursor.r, c: Math.max(0, cursor.c - 1) }
        break
      case 'ArrowRight':
        event.preventDefault()
        cursor = { r: cursor.r, c: Math.min(state.cols - 1, cursor.c + 1) }
        break
      case 'Space':
        event.preventDefault()
        if (!running) return // paused: freeze the board
        pop(cursor)
        break
      case 'KeyR':
        event.preventDefault()
        if (phase === 'lose') {
          restart(state)
          displayGrid = state.grid // restart also swaps in a fresh board
          reportScore()
          phase = 'idle'
          phaseT = 0
          loop.markDirty()
        }
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
    }
    if (wasCursorKey) loop.markDirty()
  }

  const advancePhase = (dt: number): void => {
    phaseT += dt * 1000
    if (phase === 'clear' && phaseT >= CLEAR_MS) {
      // The board is now the post-removal grid; check win/lose.
      displayGrid = state.grid
      updateResult(state)
      if (state.result === 'win') {
        phase = 'win'
        phaseT = 0
      } else if (state.result === 'lose') {
        phase = 'lose'
      } else {
        phase = 'idle'
      }
      clearPlan = null
    } else if (phase === 'win' && phaseT >= WIN_MS) {
      advanceLevel(state)
      // advanceLevel swaps in a brand-new grid array — repoint the display so
      // the fresh level board shows immediately instead of after the next pop.
      displayGrid = state.grid
      reportScore()
      phase = 'idle'
      phaseT = 0
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    advancePhase(f.dt)
    // Idle board is static: repaint only when the scheduler is not skipping
    // or an animation phase is running.
    if (!f.render && phase === 'idle') return
    const view: Match3View = {
      cursor,
      clear: phase === 'clear' && clearPlan !== null
        ? {
          removed: clearPlan.removed,
          falls: clearPlan.falls,
          t: Math.min(1, phaseT / CLEAR_MS),
          scoreText: clearScoreText,
        }
        : null,
      result: phase === 'win' || phase === 'lose' ? state.result : 'none',
      paused: false,
    }
    renderMatch3(ctx, state, displayGrid, view)
  }

  const loop = createFrameLoop(frame)
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderMatch3(ctx, state, displayGrid, {
      cursor,
      clear: null,
      result: phase === 'win' || phase === 'lose' ? state.result : 'none',
      paused: true,
    })
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderMatch3(ctx, state, state.grid, {
    cursor, clear: null, result: 'none', paused: false,
  })

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const match3Game: MiniGameDefinition = {
  id: 'match3',
  title: '消消乐',
  icon: '💎',
  description: '点击同色四连通块消除，一次消得越多分越高；达到目标分过关，目标逐关提高。',
  controls: ['点击：消除同色四连通块', '方向键 + 空格：键盘消除', 'R：重开', 'P：暂停'],
  create: createMatch3Game,
}
