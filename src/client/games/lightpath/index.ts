/**
 * 镜面光线游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击镜面
 * 在 '/' 与 '\\' 间翻转（hover 旋转预览），H 提示（贪心自动翻转一面能
 * 改善点亮的镜）、R 重开本关、P 暂停、[ ] 切换关卡、过关后 Enter 进入
 * 下一关（进度经 readLevel/saveLevel('lightpath') 持久化）。流光与脉冲
 * 常驻动画 → continuous 帧循环；分数经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  BOARD_X, BOARD_Y, CELL, H, SIZE, W, applyFlip, evaluate, generateLevel, hintFlip, type LightPathState,
} from './logic.ts'
import { hitMirror, renderLightPath } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { createParticles } from '../theme.ts'

/** 初始种子（与关卡号联合决定布局；同关同布局）。 */
const BASE_SEED = 20261115

function createLightPathGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: lightpath needs a 2d canvas context')
  const ctx = fit.ctx

  let level = readLevel('lightpath')
  let state: LightPathState = generateLevel(BASE_SEED, level)
  let running = false
  let paused = false
  let lastScore = -1
  let hover: number | null = null
  /** 过关时刻的粒子庆祝（在点亮水晶位置迸发）。 */
  const particles = createParticles()
  let winCelebrated = false

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    reportScore()
    if (state.won && !winCelebrated) {
      winCelebrated = true
      const result = evaluate(state)
      for (const crystal of state.crystals) {
        if (result.lit.has(crystal.row * SIZE + crystal.col)) {
          const x = BOARD_X + crystal.col * CELL + CELL / 2
          const y = BOARD_Y + crystal.row * CELL + CELL / 2
          particles.burst(x, y, '#e0af68', 12, 140)
        }
      }
    }
    particles.tick(ctx, f.dt * 1000)
    if (f.render) {
      renderLightPath(ctx, state, evaluate(state), {
        nowMs: performance.now(),
        paused,
        hover,
      })
    }
  }
  const loop = createFrameLoop(frame, { mode: 'continuous' })

  /** 重开本关（同关卡同布局，翻转数清零）。 */
  const restartLevel = (): void => {
    state = generateLevel(BASE_SEED, level)
    lastScore = -1
    paused = false
    winCelebrated = false
    reportScore()
    loop.markDirty()
  }

  /** 切到指定关卡（≥1）并持久化进度。 */
  const gotoLevel = (next: number): void => {
    level = Math.max(1, next)
    saveLevel('lightpath', level)
    restartLevel()
  }

  const advanceLevel = (): void => {
    gotoLevel(level + 1)
  }

  const flipAt = (x: number, y: number): void => {
    if (state.won || paused) return
    const idx = hitMirror(state, x, y)
    if (idx < 0) return
    const next = applyFlip(state, state.mirrors[idx]!.row, state.mirrors[idx]!.col)
    if (next === null) return
    state = next
    reportScore()
    loop.markDirty()
  }

  const onPointerMove = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * W
    const y = ((event.clientY - rect.top) / rect.height) * H
    const next = state.won || paused ? -1 : hitMirror(state, x, y)
    if (next !== hover) {
      hover = next < 0 ? null : next
      loop.markDirty()
    }
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    if (state.won) {
      advanceLevel()
      return
    }
    if (paused) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * W
    const y = ((event.clientY - rect.top) / rect.height) * H
    flipAt(x, y)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'KeyR':
        event.preventDefault()
        restartLevel()
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
      case 'KeyH':
        event.preventDefault()
        if (running && !paused && !state.won) {
          const next = hintFlip(state)
          if (next !== null) {
            state = next
            reportScore()
            loop.markDirty()
          }
        }
        break
      case 'Enter': case 'Space':
        if (state.won) {
          event.preventDefault()
          advanceLevel()
        }
        break
      case 'BracketLeft':
        event.preventDefault()
        gotoLevel(level - 1)
        break
      case 'BracketRight':
        event.preventDefault()
        gotoLevel(level + 1)
        break
    }
  }

  const pause = (): void => {
    if (!running) return
    paused = true
    running = false
    loop.pause()
    renderLightPath(ctx, state, evaluate(state), {
      nowMs: performance.now(),
      paused: true,
      hover: null,
    })
  }
  const resume = (): void => {
    if (running) return
    running = true
    paused = false
    loop.start()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderLightPath(ctx, state, evaluate(state), {
    nowMs: performance.now(),
    paused: false,
    hover: null,
  })

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const lightpathGame: MiniGameDefinition = {
  id: 'lightpath',
  title: '镜面光线 LightPath',
  icon: '🪞',
  description: '转动镜面折射激光，点亮所有目标——一束光的全盘连锁。',
  controls: [
    '点击镜面：在 / 与 \\ 间翻转（hover 预览）',
    'H：提示（自动翻转一面） · [ ]：切换关卡',
    'R：重开 · P：暂停',
  ],
  create: createLightPathGame,
}
