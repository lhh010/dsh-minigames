/**
 * 找茬大师游戏定义：把纯逻辑（seed 场景生成 / 命中判定 / 倒计时）接成
 * MiniGameInstance —— 点击右图的修改点即标记一处（两侧同时圈绿），点错
 * 扣 3 秒；5 关递进（元素更多、修改更细微、限时更短），找齐 5 处过关，
 * 时间耗尽失败。R 重开（换新 seed），P 暂停，过关后空格进下一关。倒计时
 * 用 dirty 按需渲染：显示秒变化 / 交互 / 粒子存活期间才重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createPhotoHuntState, computeScore, hasNextLevel, tick, tryClick,
  LEVEL_COUNT, PANEL_H, PANEL_W, type PhotoHuntState,
} from './logic.ts'
import { renderPhotoHunt, LEFT_X, LOGICAL_H, LOGICAL_W, PANEL_Y, RIGHT_X } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 运行时随机种子（逻辑层只吃 seed，保证可确定性测试）。 */
function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

function createPhotoHuntGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: photohunt needs a 2d canvas context')
  const ctx = fit.ctx

  let state: PhotoHuntState = createPhotoHuntState(randomSeed(), 1)
  let totalScore = 0
  let running = false
  let lastScore = -1
  let lastShownSecond = -1
  let particlesUntilMs = 0

  const reportScore = (): void => {
    const score = totalScore + computeScore(state)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  // 点击坐标 → 右图内坐标（只有右图接受判定）。
  const rightPoint = (event: MouseEvent): { x: number; y: number } | null => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    if (y < PANEL_Y || y >= PANEL_Y + PANEL_H) return null
    if (x >= RIGHT_X && x < RIGHT_X + PANEL_W) return { x: x - RIGHT_X, y: y - PANEL_Y }
    return null
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    if (state.status !== 'playing') return
    const point = rightPoint(event)
    if (point === null) return
    const result = tryClick(state, point.x, point.y)
    if (result === 'hit') particlesUntilMs = performance.now() + 700
    reportScore()
    loop.markDirty()
  }

  const startLevel = (level: number): void => {
    // 通关奖励计入总分，再开启新关。
    if (state.status === 'won') totalScore += computeScore(state)
    state = createPhotoHuntState(randomSeed(), level)
    lastShownSecond = -1
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

  // dirty 按需渲染：倒计时显示秒变化、交互、粒子存活期间才重绘。
  const loop = createFrameLoop((f) => {
    if (state.status === 'playing') {
      tick(state, f.dt)
      reportScore()
      const shown = Math.ceil(state.timeLeft)
      if (shown !== lastShownSecond) {
        lastShownSecond = shown
        loop.markDirty()
      }
    }
    if (performance.now() < particlesUntilMs) loop.markDirty()
    if (f.render || state.status !== 'playing') renderPhotoHunt(ctx, state, false)
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderPhotoHunt(ctx, state, true)
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
  renderPhotoHunt(ctx, state, false)

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

export const photohuntGame: MiniGameDefinition = {
  id: 'photohunt',
  title: '找茬大师 PhotoHunt',
  icon: '📷',
  description: '两张几乎一样的图，五处不同——你的眼力就是计时器上最大的敌人。',
  controls: ['点击右图：找不同', '空格：下一关', 'R：重开', 'P：暂停'],
  create: createPhotoHuntGame,
}
