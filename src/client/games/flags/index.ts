/**
 * 旗帜竞猜游戏定义：把纯逻辑接成 {@link MiniGameInstance}——dirty 帧循环
 * （答题期逐帧推进倒计时与进度环，反馈/回顾静止时零重绘），点击或数字
 * 键 1-4 作答、空格下一题 / 下一节、R 重开、P 暂停；答对触发火花粒子，
 * onScore 按规范在分数变化时上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { answer, createFlagsState, mulberry32, next, tick } from './logic.ts'
import { LOGICAL_H, LOGICAL_W, createFlagsParticles, optionAt, renderFlags } from './render.ts'
import { THEME } from '../theme.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 答题键：主键盘 1-4。 */
const ANSWER_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'] as const

function createFlagsGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: flags needs a 2d canvas context')
  const ctx = fit.ctx

  let state = createFlagsState(mulberry32((Math.random() * 0xffffffff) >>> 0))
  let running = true
  let lastScore = -1
  const particles = createFlagsParticles()

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const draw = (dtMs: number): void => {
    renderFlags(ctx, state, particles, !running, dtMs)
  }

  /** 作答入口：位次判定 + 答对火花。 */
  const inputOption = (pos: number): void => {
    if (state.phase !== 'question') return
    const result = answer(state, pos)
    if (result === 'correct' && state.combo >= 2) {
      particles.burst(LOGICAL_W / 2, 150, THEME.gold, 10 + state.combo * 2, 150)
    } else if (result === 'correct') {
      particles.burst(LOGICAL_W / 2, 150, THEME.good, 6, 120)
    }
    reportScore()
    loop.markDirty()
  }

  /** 推进：feedback→下一题，review→下一节 / 结束。 */
  const advance = (): void => {
    if (state.phase !== 'feedback' && state.phase !== 'review') return
    next(state)
    reportScore()
    loop.markDirty()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const pos = optionAt(x, y)
    if (pos !== null) inputOption(pos)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      state = createFlagsState(mulberry32((Math.random() * 0xffffffff) >>> 0))
      lastScore = -1
      reportScore()
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'Space') {
      event.preventDefault()
      if (running) advance()
    } else {
      const pos = ANSWER_KEYS.indexOf(event.code as (typeof ANSWER_KEYS)[number])
      if (pos !== -1) {
        event.preventDefault()
        if (running) inputOption(pos)
      }
    }
  }

  const loop = createFrameLoop((f) => {
    if (!running) return
    if (state.phase === 'question') {
      tick(state, f.wallMs)
    }
    // 答题期进度环每帧变化须重绘；粒子活跃或反馈闪烁期同样强制重绘。
    if (f.render || state.phase === 'question' || particles.size() > 0) {
      draw(f.wallMs)
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
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const flagsGame: MiniGameDefinition = {
  id: 'flags',
  title: '旗帜竞猜 Flags',
  icon: '🏳️',
  description: '这面旗是哪个国家？——从 emoji 旗帜里认出世界，答得越快分越高。',
  controls: ['点击 / 1-4 键：选择答案', '空格：下一题 / 下一节', 'R：重开', 'P：暂停'],
  create: createFlagsGame,
}
