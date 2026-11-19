/**
 * 对角数独游戏定义：把纯盘面逻辑接成 {@link MiniGameInstance}——点击选
 * 格，数字键填入（笔记模式下记候选数），N 切换笔记，H 提示，X 切换对
 * 角线高亮，R 重开本关，P 暂停；过关后点击进入下一关并上报分数。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  applyHint, createSudokuXState, LEVEL_COUNT, place, tick, toggleNote, winScore,
  type SudokuXState,
} from './logic.ts'
import { cellAt, inNoteButton, LOGICAL_H, LOGICAL_W, renderSudokuX } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function createSudokuXGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (initialFit === null) throw new Error('dsh-minigames: sudokuX 需要 2d canvas 上下文')
  const ctx = initialFit.ctx

  let seed = Math.floor(Math.random() * 0x7fffffff)
  let state: SudokuXState = createSudokuXState(seed, 0)
  let cursor = { r: 0, c: 0 }
  let noteMode = false
  let diagHighlight = false
  let running = false
  let reported = false
  let shownSec = -1

  const restart = (): void => {
    seed = (seed + 1) >>> 0
    state = createSudokuXState(seed, state.level)
    reported = false
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (state.won) {
      state = createSudokuXState((seed + 1) >>> 0, (state.level + 1) % LEVEL_COUNT)
      seed = (seed + 1) >>> 0
      reported = false
      loop.markDirty()
      return
    }
    if (state.failed) {
      restart()
      loop.markDirty()
      return
    }
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    if (inNoteButton(x, y)) {
      noteMode = !noteMode
      loop.markDirty()
      return
    }
    const cell = cellAt(x, y)
    if (cell === null) return
    cursor = cell
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
      loop.markDirty()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (event.code === 'KeyN') {
      event.preventDefault()
      noteMode = !noteMode
      loop.markDirty()
      return
    }
    if (event.code === 'KeyX') {
      event.preventDefault()
      diagHighlight = !diagHighlight
      loop.markDirty()
      return
    }
    if (!running || state.won || state.failed) return
    if (event.code === 'KeyH') {
      event.preventDefault()
      applyHint(state)
      loop.markDirty()
      return
    }
    if (event.code.startsWith('Digit') || event.code.startsWith('Numpad')) {
      event.preventDefault()
      const digits = event.code.startsWith('Digit') ? event.code.slice(5) : event.code.slice(6)
      const n = Number(digits)
      if (Number.isNaN(n)) return
      if (n === 0) place(state, cursor.r, cursor.c, 0)
      else if (noteMode) toggleNote(state, cursor.r, cursor.c, n)
      else place(state, cursor.r, cursor.c, n)
      loop.markDirty()
      return
    }
    if (event.code === 'Backspace' || event.code === 'Delete') {
      event.preventDefault()
      place(state, cursor.r, cursor.c, 0)
      loop.markDirty()
      return
    }
    if (event.code === 'ArrowUp') cursor = { r: Math.max(0, cursor.r - 1), c: cursor.c }
    else if (event.code === 'ArrowDown') cursor = { r: Math.min(8, cursor.r + 1), c: cursor.c }
    else if (event.code === 'ArrowLeft') cursor = { r: cursor.r, c: Math.max(0, cursor.c - 1) }
    else if (event.code === 'ArrowRight') cursor = { r: cursor.r, c: Math.min(8, cursor.c + 1) }
    else return
    event.preventDefault()
    loop.markDirty()
  }

  const loop = createFrameLoop((f) => {
    tick(state, f.dt)
    if (state.won && !reported) {
      reported = true
      options?.onScore?.(winScore(state))
      loop.markDirty()
    }
    const sec = Math.floor(state.elapsed)
    if (sec !== shownSec) {
      shownSec = sec
      loop.markDirty()
    }
    if (f.render) renderSudokuX(ctx, state, cursor, noteMode, !running, diagHighlight)
  }, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderSudokuX(ctx, state, cursor, noteMode, true, diagHighlight)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.resume()
    loop.markDirty()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderSudokuX(ctx, state, cursor, noteMode, false, diagHighlight)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      initialFit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const sudokuXGame: MiniGameDefinition = {
  id: 'sudokuX',
  title: '对角数独 SudokuX',
  icon: '📐',
  description: '标准数独加上两条主对角线也要 1-9——多一点约束，多一分缜密。',
  controls: [
    '点击：选中格子',
    '1-9：填入 · 0/退格：清除',
    'N：笔记开关 · H：提示',
    'X：对角线高亮',
    'R：重开 · P：暂停',
  ],
  create: createSudokuXGame,
}
