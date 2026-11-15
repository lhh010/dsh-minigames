/**
 * 逻辑网格 Einstein 游戏装配：把纯逻辑接进面板生命周期。
 *
 * 交互：点击格子 ✓ → ✗ → 空 循环（✓ 自动推演补 ✗）；数字键 1-9 高亮
 * 对应线索卡及相关值列；H 标出一个必为 ✓ 的格（限 3 次）；R 以同种子重开
 * 本题；P 暂停。过关后点击进入下一关（5 关循环：4×4 → 5×5）。
 * dirty 模式渲染：只有状态变化与秒表跳秒才重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  MAX_HINTS, cellIndex, computeScore, createPlayerState, cycleCell, generateLevel,
  requestHint, type PlayerState, type Puzzle,
} from './logic.ts'
import {
  LOGICAL_H, LOGICAL_W, cellAtPoint, getLayout, renderLogigrid,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function createLogigridGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: logigrid needs a 2d canvas context')
  const ctx = fit.ctx

  let level = 1
  const baseSeed = ((Date.now() % 900000) + 1) >>> 0
  const seedFor = (lvl: number): number => (baseSeed + lvl * 1013) >>> 0
  let puzzle: Puzzle = generateLevel(level, seedFor(level))
  let state: PlayerState = createPlayerState(puzzle)

  let running = false
  let elapsed = 0
  let reported = false
  let shownSec = -1
  let selectedClue = -1
  let hintFlash: { index: number; until: number } | null = null
  /** 推演格淡入：cellIndex -> 起始 ms。 */
  const fade = new Map<number, number>()

  const loadLevel = (lvl: number): void => {
    level = lvl
    puzzle = generateLevel(level, seedFor(level))
    resetBoard()
  }

  const resetBoard = (): void => {
    state = createPlayerState(puzzle)
    elapsed = 0
    reported = false
    shownSec = -1
    selectedClue = -1
    hintFlash = null
    fade.clear()
  }

  const onMouseDown = (event: MouseEvent): void => {
    focusGameHost(host)
    if (state.won) {
      loadLevel((level % 5) + 1)
      loop.markDirty()
      return
    }
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const cell = cellAtPoint(getLayout(state.n), x, y)
    if (cell === null) return
    const res = cycleCell(state, cell.cat, cell.p, cell.v)
    const now = performance.now()
    for (const d of res.deduced) fade.set(cellIndex(state.n, d.cat, d.p, d.v), now)
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      resetBoard()
      loop.markDirty()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (event.code === 'KeyH') {
      event.preventDefault()
      if (running && !state.won) {
        const hint = requestHint(state)
        if (hint !== null) {
          hintFlash = { index: cellIndex(state.n, hint.cat, hint.p, hint.v), until: performance.now() + 2500 }
        }
        loop.markDirty()
      }
      return
    }
    if (event.code.startsWith('Digit')) {
      const i = Number(event.code.slice(5)) - 1
      if (i >= 0 && i < puzzle.clues.length) {
        event.preventDefault()
        selectedClue = selectedClue === i ? -1 : i
        loop.markDirty()
      }
    }
  }

  const loop = createFrameLoop((f) => {
    if (running && !state.won) elapsed += f.dt
    if (state.won && !reported) {
      reported = true
      options?.onScore?.(computeScore(level, elapsed, MAX_HINTS - state.hintsLeft))
      loop.markDirty()
    }
    const sec = Math.floor(elapsed)
    if (sec !== shownSec) {
      shownSec = sec
      loop.markDirty()
    }
    if (f.render) {
      renderLogigrid(ctx, state, {
        level,
        elapsed,
        paused: !running,
        selectedClue,
        fade,
        hintFlash,
      })
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderLogigrid(ctx, state, { level, elapsed, paused: true, selectedClue, fade, hintFlash })
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
  renderLogigrid(ctx, state, { level, elapsed: 0, paused: false, selectedClue: -1, fade, hintFlash: null })

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const logigridGame: MiniGameDefinition = {
  id: 'logigrid',
  title: '逻辑网格 Einstein',
  icon: '🕵️',
  description: '谁养鱼？五条线索推一张网格——演绎推理的纯粹乐趣。',
  controls: ['点击：✓ / ✗ / 清空 循环', '1-9：高亮对应线索', 'H：提示（限 3 次）', 'R：重开 · P：暂停'],
  create: createLogigridGame,
}
