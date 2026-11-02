/**
 * 麻将连连看游戏定义：把纯逻辑（logic.ts）与渲染（render.ts）接成
 * {@link MiniGameInstance}——点击选牌配对（同牌 + ≤2 拐路径即消）、H 提示、
 * 死局自动洗牌、R 重开、P 暂停、[ / ] 切换关卡，关卡进度经 level-progress
 * 持久化。使用 dirty 帧循环：静态时零重绘，动画或秒表跳变时才画。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createMahjongState, removePair, canRemove, findHintPair, hasAnyMatch,
  shuffleTiles, tickTime, restartLevel, advanceLevel, pairsRemaining,
  type MahjongState, type Pos,
} from './logic.ts'
import { renderMahjong, createMahjongView, CELL, HUD_H, PAD, LOGICAL_W, LOGICAL_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'
import { readLevel, saveLevel } from '../level-progress.ts'

const GAME_ID = 'mahjong'

function createMahjongGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: mahjong needs a 2d canvas context')
  const ctx = fit.ctx

  const view = createMahjongView()
  let state: MahjongState = createMahjongState(Math.random, readLevel(GAME_ID))
  let running = true
  let lastSecond = -1
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  /** 事件坐标 → 网格坐标（仅接受牌面格，孔洞/场外返回 null）。 */
  const posFromEvent = (event: MouseEvent): Pos | null => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const c = Math.floor((x - PAD) / CELL)
    const r = Math.floor((y - HUD_H - PAD) / CELL)
    if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return null
    if (state.grid[r]![c] === 0) return null
    return { r, c }
  }

  /** 消除后检查：清场过关（win 由逻辑层置位）、死局自动洗牌。 */
  const afterRemoval = (): void => {
    if (state.result === 'none' && pairsRemaining(state.grid) > 0 && !hasAnyMatch(state.grid)) {
      shuffleTiles(state)
      view.playShuffle()
    }
    reportScore()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || state.result !== 'none') return
    const pos = posFromEvent(event)
    if (pos === null) {
      view.select(null)
      loop.markDirty()
      return
    }
    const sel = view.selected
    if (sel !== null && sel.r === pos.r && sel.c === pos.c) {
      // 再点一次取消选中。
      view.select(null)
    } else if (sel !== null && canRemove(state.grid, sel, pos)) {
      const path = removePair(state, sel, pos)
      if (path !== null) {
        view.select(null)
        view.hint = null
        view.playClear(path)
        afterRemoval()
      }
    } else {
      view.select(pos)
    }
    loop.markDirty()
  }

  const rebuildAt = (level: number): void => {
    state = createMahjongState(Math.random, level)
    lastScore = -1
    lastSecond = -1
    view.reset()
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restartLevel(state)
      view.reset()
      lastScore = -1
      reportScore()
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyH') {
      event.preventDefault()
      if (!running || state.result !== 'none') return
      const pair = findHintPair(state.grid)
      if (pair !== null) {
        state.hintUsed = true
        view.showHint(pair)
        loop.markDirty()
      }
    } else if (event.code === 'BracketLeft') {
      event.preventDefault()
      rebuildAt(Math.max(1, state.level - 1))
    } else if (event.code === 'BracketRight') {
      event.preventDefault()
      rebuildAt(state.level + 1)
    } else if (event.code === 'Space' || event.code === 'Enter') {
      if (state.result === 'win') {
        event.preventDefault()
        advanceLevel(state)
        saveLevel(GAME_ID, state.level)
        view.reset()
        loop.markDirty()
      }
    }
  }

  const loop = createFrameLoop((f) => {
    if (running && state.result === 'none') {
      tickTime(state, f.dt)
    }
    const second = Math.ceil(state.timeLeft)
    // dirty 模式：仅在脏帧、动画进行中或秒表跳变时重绘。
    if (f.render || view.active(performance.now()) || second !== lastSecond) {
      lastSecond = second
      renderMahjong(ctx, state, view, !running, Math.min(50, f.wallMs))
    }
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderMahjong(ctx, state, view, true, 16)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.resume()
    loop.markDirty()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  reportScore()
  loop.start()

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

export const mahjongGame: MiniGameDefinition = {
  id: 'mahjong',
  title: '麻将连连看',
  icon: '🀄',
  description: '点选两张同牌，路径不超过两次拐弯即可消除，清光全场过关。',
  controls: ['点击：选牌配对', 'H：提示', 'R：重开', 'P：暂停', '[ / ]：切换关卡'],
  create: createMahjongGame,
}
