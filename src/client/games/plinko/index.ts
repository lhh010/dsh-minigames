/**
 * 弹珠瀑布 Plinko 游戏定义：确定性物理逻辑接成 {@link MiniGameInstance}。
 * ←/→ 移动瞄准列，空格或点击投放区投放；H 切换直方图预览（第 1 轮后
 * 解锁）；R 重开一局（新种子），P 暂停。continuous 帧循环：logic.step
 * 按 f.dt 推进（内部固定子步），落槽事件触发粒子火花与浮字，分数变化
 * 时经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  DROP_COLS, SLOT_Y, WALL_L, WALL_R, createGame, dropBall,
  dropColX, moveAim, step,
} from './logic.ts'
import type { PlinkoEvent, PlinkoState } from './logic.ts'
import { LOGICAL_H, LOGICAL_W, createFloaters, renderPlinko } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

function createPlinkoGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: plinko needs a 2d canvas context')
  const ctx = fit.ctx

  // 每局一个种子：弹珠子 seed 由它派生，重开换一局新种子。
  let runCounter = 0
  let state: PlinkoState = createGame((Date.now() ^ 0x9111c0) >>> 0)
  let running = false
  let paused = false
  let preview = false
  let lastScore = -1
  let timeMs = 0
  const particles = createParticles()
  const floaters = createFloaters()

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const handleEvent = (ev: PlinkoEvent): void => {
    if (ev.kind === 'land') {
      const color = ev.mult >= 5 ? THEME.gold : ev.mult >= 1 ? THEME.text : THEME.textMuted
      particles.burst(ev.x, SLOT_Y - 6, color, ev.mult >= 5 ? 14 : 7, 150)
      floaters.add(ev.x, SLOT_Y - 18, '+' + ev.points, color)
    } else if (ev.kind === 'roundEnd') {
      floaters.add(LOGICAL_W / 2, 200, '第 ' + ev.round + ' 轮 +' + ev.roundScore, THEME.gold)
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    timeMs += f.dt * 1000
    step(state, f.dt)
    for (const ev of state.events) handleEvent(ev)
    state.events.length = 0
    reportScore()
    floaters.tick(f.dt * 1000)
    if (f.render) {
      renderPlinko(ctx, { state, paused, preview, timeMs, floaters })
      particles.tick(ctx, f.dt * 1000)
    }
  }
  const loop = createFrameLoop(frame)

  const restart = (): void => {
    runCounter += 1
    state = createGame(((Date.now() ^ 0x9111c0) + runCounter * 0x9e3779b9) >>> 0)
    preview = false
    lastScore = -1
    reportScore()
    loop.markDirty()
  }

  const tryDrop = (): void => {
    if (paused || state.phase !== 'playing') return
    dropBall(state)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const k = event.code
    if (k === 'Space' || k === 'ArrowLeft' || k === 'ArrowRight') event.preventDefault()
    if (event.repeat) return
    if (k === 'ArrowLeft') moveAim(state, -1)
    else if (k === 'ArrowRight') moveAim(state, 1)
    else if (k === 'Space') tryDrop()
    else if (k === 'KeyH') preview = !preview
    else if (k === 'KeyR') restart()
    else if (k === 'KeyP' || k === 'Escape') togglePauseLocal()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (paused || state.phase !== 'playing') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    if (x < WALL_L || x > WALL_R) return
    if (event.clientY - rect.top >= 0 && x >= 0) {
      // 点击投放区（上半区）选择列并投放；点直方图/槽区仅改瞄准列
      const inDropZone = ((event.clientY - rect.top) / rect.height) * LOGICAL_H < SLOT_Y - 20
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < DROP_COLS; c += 1) {
        const d = Math.abs(dropColX(c) - x)
        if (d < bestD) { bestD = d, best = c }
      }
      state.aimCol = best
      if (inDropZone) dropBall(state)
    }
  }

  const pause = (): void => {
    if (!running) return
    running = false
    paused = true
    loop.pause()
    renderPlinko(ctx, { state, paused: true, preview, timeMs, floaters })
  }
  const resume = (): void => {
    if (running) return
    running = true
    paused = false
    loop.resume()
    loop.markDirty()
  }
  const togglePauseLocal = (): void => {
    if (running) pause()
    else resume()
  }

  window.addEventListener('keydown', onKeyDown)
  canvas.addEventListener('mousedown', onMouseDown)
  focusGameHost(host)
  running = true
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      window.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('mousedown', onMouseDown)
      fit.dispose()
    },
  }
}

export const plinkoGame: MiniGameDefinition = {
  id: 'plinko',
  title: '弹珠瀑布 Plinko',
  icon: '🎰',
  description: '选个投放点松手——弹珠在钉阵里左碰右撞，倍率槽决定命运。',
  controls: [
    '← → 瞄准 · 空格 / 点击顶部投放',
    '落槽结算 = 底注 10 × 倍率（×0.2 … ×10）· 3 轮 × 5 珠',
    'H：直方图预览（第 1 轮后解锁）· R：重开 · P：暂停',
  ],
  create: createPlinkoGame,
}
