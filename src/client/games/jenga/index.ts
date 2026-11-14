/**
 * 叠叠乐 game definition：把纯静力学 logic 接成 MiniGameInstance——
 * 点击木块抽出（顶层满 3 块不可抽，非法点击忽略）；抽出成功播放抽块
 * 飞出动画 + 得分上报，抽出导致应力超限则塔倒：坍塌粒子 + 屏幕抖动
 * + 结束 overlay；无块可抽为收手通关，关卡 5 层 → 8 层递进。
 * R 重开当前关，P 暂停；dirty 渲染，动画期间标记脏帧。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { canPull, createTower, levelCount, pull, type JengaState } from './logic.ts'
import { blockHitTest, logicalH, logicalW, renderJenga } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 抽块飞出动画时长（秒）。 */
const PULL_ANIM_S = 0.35
/** 塔倒抖动衰减（每秒振幅乘数）。 */
const SHAKE_DECAY = 2.2

function createJengaGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)

  const particles = createParticles()
  let stage = 1
  let state: JengaState = createTower(0x51a3f1 * stage, levelCount(stage))
  let running = false
  let hover: string | null = null
  let shake = 0
  let pullAnim = 0
  let pullText: string | null = null
  let endText: string | null = null
  let lastScore = -1

  const initialFit = fitCanvas(host, canvas, logicalW, logicalH)
  if (initialFit === null) throw new Error('dsh-minigames: jenga needs a 2d canvas context')
  const fit = initialFit
  const ctx = fit.ctx

  /** 上报分数（仅变化时）。 */
  const reportScore = (): void => {
    if (state.score !== lastScore) {
      lastScore = state.score
      options?.onScore?.(state.score)
    }
  }

  const startStage = (next: number): void => {
    stage = next
    state = createTower(0x51a3f1 * stage + 0x2f9e, levelCount(stage))
    hover = null
    shake = 0
    pullAnim = 0
    pullText = null
    endText = null
    lastScore = -1
    reportScore()
    loop.markDirty()
  }

  const restart = (): void => {
    startStage(stage)
  }

  /** 点击抽出：非法点击忽略；合法则结算并触发动画 / 塔倒。 */
  const tryPull = (level: number, slot: number): void => {
    if (!running || state.status !== 'playing') return
    if (!canPull(state, level, slot)) return
    const result = pull(state, level, slot)
    if (!result.ok) return
    if (result.collapsed) {
      shake = 18
      for (let i = 0; i < 4; i += 1) {
        particles.burst(320 + (i - 1.5) * 60, 320 + i * 30, i % 2 === 0 ? '#a87f4e' : THEME.bad, 12, 190)
      }
      endText = '抽出第 ' + (state.pulled + 1) + ' 块时塔倒了 · 得分 ' + state.score
    } else {
      pullAnim = PULL_ANIM_S
      pullText = '+' + result.gained
      reportScore()
      const clearedNow = (): boolean => state.status === 'cleared' // 闭包内重读，绕开外层 playing 窄化
      if (clearedNow()) {
        endText = '已无安全块可抽 · 得分 ' + state.score
        setTimeout(() => { if (clearedNow()) startStage(stage + 1) }, 1800)
      }
    }
    loop.markDirty()
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW) / rect.width
    const y = ((event.clientY - rect.top) * logicalH) / rect.height
    const hit = blockHitTest(state, x, y)
    const next = hit !== null && state.status === 'playing' ? hit : null
    if (next !== hover) {
      hover = next
      loop.markDirty()
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW) / rect.width
    const y = ((event.clientY - rect.top) * logicalH) / rect.height
    const hit = blockHitTest(state, x, y)
    if (hit !== null) {
      const parts = hit.split(':')
      tryPull(Number(parts[0]), Number(parts[1]))
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const loop = createFrameLoop(f => {
    let animating = false
    if (shake > 0.2) {
      shake *= Math.max(0, 1 - SHAKE_DECAY * f.dt)
      animating = true
    } else shake = 0
    if (pullAnim > 0) {
      pullAnim = Math.max(0, pullAnim - f.dt)
      animating = true
    }
    if (particles.size() > 0) {
      particles.tick(ctx, f.dt * 1000)
      animating = true
    }
    if (f.render || animating) {
      renderJenga(ctx, state, hover, shake, !running && endText === null, endText)
      if (pullAnim > 0 && pullText !== null) {
        ctx.font = 'bold 20px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = THEME.gold
        ctx.fillText(pullText, 320, 150 - (PULL_ANIM_S - pullAnim) * 60)
      }
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderJenga(ctx, state, hover, 0, true, null)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.markDirty()
    loop.resume()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  reportScore()
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const jengaGame: MiniGameDefinition = {
  id: 'jenga',
  title: '叠叠乐 Jenga',
  icon: '🪵',
  description: '从摇摇欲坠的塔里抽出木块——塔倒之前收手才是赢家。',
  controls: ['点击木块：抽出（顶层满 3 块时不可抽）', '越低层分越高也越危险，红光块一抽就倒', 'R：重开 · P：暂停'],
  create: createJengaGame,
}
