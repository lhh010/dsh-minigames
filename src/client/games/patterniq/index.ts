/**
 * 找规律 PatternIQ 游戏定义：把纯逻辑接成 {@link MiniGameInstance}——
 * 点击选项卡或按 1-4 作答（答错扣 5 秒可重试），空格下一题/继续下一节，
 * R 重开、P 暂停。dirty 模式：作答阶段倒计时环逐帧重绘，反馈/小结
 * 静止时零重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  answer as logicAnswer, createPatterniqState, nextQuestion, tick,
  type PatterniqState,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, optionCardAt, renderPatterniq } from './render.ts'
import { createParticles } from '../theme.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 答对粒子闪烁时长（毫秒）。 */
const FLASH_MS = 300

function createPatterniqGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: patterniq needs a 2d canvas context')
  const ctx = fit.ctx

  let state: PatterniqState = createPatterniqState((Math.random() * 0xffffffff) >>> 0)
  let running = true
  let flashTimer = 0
  let lastScore = -1
  const particles = createParticles()

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const draw = (dtMs: number): void => {
    renderPatterniq(ctx, state, particles, !running, dtMs)
  }

  /** 作答入口：判定对错；答对爆发粒子并进入反馈。 */
  const inputOption = (optionIndex: number): void => {
    if (state.phase !== 'question') return
    const result = logicAnswer(state, optionIndex)
    if (result === 'correct') {
      particles.burst(
        28 + optionIndex * 150 + 67, 262 + 28,
        result === 'correct' ? '#9ece6a' : '#f7768e', 12, 150,
      )
      clearTimeout(flashTimer)
      flashTimer = window.setTimeout(() => loop.markDirty(), FLASH_MS)
    }
    reportScore()
    loop.markDirty()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const optionIndex = optionCardAt(x, y)
    if (optionIndex !== null) inputOption(optionIndex)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      state = createPatterniqState((Math.random() * 0xffffffff) >>> 0)
      lastScore = -1
      reportScore()
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'Space') {
      event.preventDefault()
      if (running && (state.phase === 'feedback' || state.phase === 'summary')) {
        nextQuestion(state)
        loop.markDirty()
      }
    } else {
      const digit = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(event.code)
      if (digit !== -1) {
        event.preventDefault()
        if (running) inputOption(digit)
      }
    }
  }

  const loop = createFrameLoop((f) => {
    if (!running) return
    if (state.phase === 'question') {
      tick(state, f.wallMs)
      reportScore()
    }
    if (f.render || particles.size() > 0 || state.phase === 'question') draw(f.wallMs)
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    clearTimeout(flashTimer)
    draw(0)
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
      clearTimeout(flashTimer)
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const patterniqGame: MiniGameDefinition = {
  id: 'patterniq',
  title: '找规律 PatternIQ',
  icon: '📈',
  description: '2 4 8 16 下一个是几？数列、图形、交错——规律就藏在眼皮底下。',
  controls: [
    '1-4 键 / 点击选项卡：选下一项；答错扣 5 秒可重试，越快答对分越高（满分 100）',
    '空格：答后下一题 / 节末进入下一节',
    '每节 10 题、共 5 节：难度 L1→L4 递进，限时 20s 收紧到 12s',
    '答后展示规律解释（如「等比数列，公比 3」），节末回顾错题',
    'R：重开一局 · P：暂停',
  ],
  create: createPatterniqGame,
}
