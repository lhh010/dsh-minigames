/**
 * 连连看 Link 游戏定义：把纯逻辑（logic.ts）与渲染（render.ts）接成
 * {@link MiniGameInstance}——点击选牌、同图案 ≤2 拐路径连通即消（连线动画），
 * S 洗牌（每关 3 次）、空格过关进下一关、R 重开（同 seed 确定性重放）、P 暂停，
 * 计时倒扣分并经 onScore 上报。dirty 帧循环：静态时零重绘，秒表跳变或动画
 * 进行时才画。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createLinkState, tapTile, shuffleRemaining, tick, advanceLevel, currentScore,
  type LinkState,
} from './logic.ts'
import {
  renderLink, createLinkView, pathAnimActive, boardLayout,
  LOGICAL_W, LOGICAL_H, SHUFFLE_BTN,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function createLinkGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: link needs a 2d canvas context')
  const ctx = fit.ctx

  // 本局种子固定：R 重开得到完全相同的牌局（确定性重放）。
  const initialSeed = (Date.now() & 0xffffffff) >>> 0
  let state: LinkState = createLinkState(initialSeed)
  const view = createLinkView()
  let running = true
  let lastSecond = -1
  let lastScore = -1

  const reportScore = (): void => {
    const score = currentScore(state)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  /** 事件坐标 → 行优先格索引（仅牌面格返回索引；空格/场外返回 null）。 */
  const tileIndexFromEvent = (x: number, y: number): number | null => {
    const lay = boardLayout(state)
    const c = Math.floor((x - lay.x) / lay.cell)
    const r = Math.floor((y - lay.y) / lay.cell)
    if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return null
    if (state.grid[r]![c] === null) return null
    return r * state.cols + c
  }

  const doShuffle = (): void => {
    if (!running || state.status !== 'playing') return
    shuffleRemaining(state)
    reportScore()
    loop.markDirty()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    if (state.status === 'cleared') {
      advanceLevel(state)
      reportScore()
      loop.markDirty()
      return
    }
    if (state.status !== 'playing') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    if (x >= SHUFFLE_BTN.x && x <= SHUFFLE_BTN.x + SHUFFLE_BTN.w
      && y >= SHUFFLE_BTN.y && y <= SHUFFLE_BTN.y + SHUFFLE_BTN.h) {
      doShuffle()
      return
    }
    const index = tileIndexFromEvent(x, y)
    if (index === null) {
      // 点空处取消选中。
      state.selected = null
      loop.markDirty()
      return
    }
    const result = tapTile(state, index)
    if (result === 'match') view.pathAt = performance.now()
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      state = createLinkState(initialSeed)
      view.pathAt = 0
      lastScore = -1
      lastSecond = -1
      reportScore()
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyS') {
      event.preventDefault()
      doShuffle()
    } else if (event.code === 'Space' || event.code === 'Enter') {
      if (state.status === 'cleared') {
        event.preventDefault()
        advanceLevel(state)
        loop.markDirty()
      }
    }
  }

  const loop = createFrameLoop((f) => {
    if (running && state.status === 'playing') tick(state, f.dt)
    const now = performance.now()
    const second = Math.ceil(state.timeLeft)
    // dirty 模式：仅在脏帧、连线/粒子动画进行中或秒表跳变时重绘。
    if (f.render || second !== lastSecond || pathAnimActive(state, view, now)) {
      lastSecond = second
      const busy = renderLink(ctx, state, view, !running, now, Math.min(50, f.wallMs))
      if (busy) loop.markDirty()
      reportScore()
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
    renderLink(ctx, state, view, true, performance.now(), 16)
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

export const linkGame: MiniGameDefinition = {
  id: 'link',
  title: '连连看 Link',
  icon: '🔗',
  description: '同款图案用不超过两次转弯的路径连通即消除——清空全部牌即胜。',
  controls: ['点击：选牌 / 连消', 'S：洗牌', '空格：下一关', 'R：重开', 'P：暂停'],
  create: createLinkGame,
}
