/**
 * 找不同游戏定义：把纯逻辑（seed 谜题生成 / 命中判定 / 倒计时）接成
 * MiniGameInstance —— 点击任一面板的差异位置即标记一处（两侧同时圈红），
 * 点错扣 1 秒；5 关递进（形状更多、差异更多、容差更紧），全找齐过关，
 * 时间耗尽失败。R 重开本关（换新 seed），P 暂停，过关后空格进下一关。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createSpotDiffState, computeScore, hasNextLevel, tick, tryClick,
  LEVEL_COUNT, PANEL_H, PANEL_W, type SpotDiffState,
} from './logic.ts'
import { renderSpotDiff, LEFT_X, LOGICAL_H, LOGICAL_W, PANEL_Y, RIGHT_X } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 运行时随机种子（逻辑层只吃 seed，保证可确定性测试）。 */
function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

function createSpotDiffGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: spotdiff needs a 2d canvas context')
  const ctx = fit.ctx

  let state: SpotDiffState = createSpotDiffState(randomSeed(), 1)
  let totalScore = 0
  let running = false
  let lastScore = -1

  const reportScore = (): void => {
    const score = totalScore + computeScore(state)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  // 点击坐标 → 面板内坐标（两侧共用差异坐标，点哪边都行）。
  const panelPoint = (event: MouseEvent): { x: number; y: number } | null => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    if (y < PANEL_Y || y >= PANEL_Y + PANEL_H) return null
    if (x >= LEFT_X && x < LEFT_X + PANEL_W) return { x: x - LEFT_X, y: y - PANEL_Y }
    if (x >= RIGHT_X && x < RIGHT_X + PANEL_W) return { x: x - RIGHT_X, y: y - PANEL_Y }
    return null
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    if (state.status !== 'playing') return
    const point = panelPoint(event)
    if (point === null) return
    tryClick(state, point.x, point.y)
    reportScore()
    loop.markDirty()
  }

  const startLevel = (level: number): void => {
    // 通关奖励计入总分，再开启新关。
    if (state.status === 'won') totalScore += computeScore(state)
    state = createSpotDiffState(randomSeed(), level)
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      totalScore = 0
      startLevel(1)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'Space' && state.status === 'won' && hasNextLevel(state)) {
      event.preventDefault()
      startLevel(Math.min(state.level + 1, LEVEL_COUNT))
    }
  }

  // 倒计时需要持续渲染（时间条每帧变化），用 continuous 模式。
  const loop = createFrameLoop((f) => {
    if (state.status === 'playing') {
      tick(state, f.dt)
      reportScore()
    }
    if (f.render || state.status !== 'playing') renderSpotDiff(ctx, state, false)
  })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderSpotDiff(ctx, state, true)
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
  running = true
  loop.start()
  renderSpotDiff(ctx, state, false)

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

export const spotdiffGame: MiniGameDefinition = {
  id: 'spotdiff',
  title: '找不同 Spot Diff',
  icon: '🔍',
  description: '两幅近乎相同的图案，找出全部差异点——眼力与耐心的考验。',
  controls: ['点击：标记差异', '空格：下一关', 'R：重开', 'P：暂停'],
  create: createSpotDiffGame,
}
