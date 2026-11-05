/**
 * 弹球大师 Pinball 游戏定义：把纯物理状态机接入
 * {@link MiniGameInstance} —— A/← 与 D/→ 扳动挡板，空格从台顶发球，
 * P 暂停，R 重开。街机 continuous 帧循环：物理吃 f.dt（自适应子步在
 * logic 内），绘制吃 f.render。得分事件在得分点喷粒子。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createGame2, restart2, serve, setFlipper2, step2, togglePause2,
  type Pinball2State,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, renderPinball2 } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

function createPinball2Game(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (initialFit === null) throw new Error('dsh-minigames: pinball2 needs a 2d canvas context')
  const ctx = initialFit.ctx

  // 每次挂载重播种：同一次运行的轨迹确定，重挂载换一条命运线。
  const runSeed = (Date.now() ^ 0x5d2b1e) >>> 0
  let state: Pinball2State = createGame2(runSeed)

  let running = false
  let lastScore = -1
  const particles = createParticles()

  const reportScore = (): void => {
    const s = Math.floor(state.score)
    if (s === lastScore) return
    lastScore = s
    options?.onScore?.(s)
  }

  const handleEvents = (): void => {
    for (const ev of state.events) {
      if (ev.kind === 'bumper') particles.burst(ev.x, ev.y, THEME.gold, 8, 160)
      else if (ev.kind === 'post') particles.burst(ev.x, ev.y, THEME.textMuted, 5, 110)
      else if (ev.kind === 'flipper') particles.burst(ev.x, ev.y, THEME.accents[0]!, 4, 90)
      else if (ev.kind === 'drain') particles.burst(LOGICAL_W / 2, LOGICAL_H - 40, THEME.bad, 14, 160)
      else if (ev.kind === 'over') particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, THEME.bad, 24, 220)
      else if (ev.kind === 'rescue') particles.burst(ev.x, ev.y, THEME.good, 6, 120)
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    step2(state, f.dt)
    handleEvents()
    reportScore()
    if (f.render) {
      renderPinball2(ctx, { state, paused: false })
      particles.tick(ctx, f.dt * 1000)
    }
  }

  const loop = createFrameLoop(frame)

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const k = event.code
    if (k === 'Space' || k === 'ArrowLeft' || k === 'ArrowRight') event.preventDefault()
    if (event.repeat) return
    switch (k) {
      case 'KeyA': case 'ArrowLeft':
        setFlipper2(state, 'left', true)
        break
      case 'KeyD': case 'ArrowRight':
        setFlipper2(state, 'right', true)
        break
      case 'Space':
        if (state.result === 'serving') serve(state)
        else if (state.result === 'paused') togglePauseLocal()
        break
      case 'KeyR':
        restart2(state)
        lastScore = -1
        reportScore()
        break
      case 'KeyP': case 'Escape':
        togglePauseLocal()
        break
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    const k = event.code
    if (k === 'KeyA' || k === 'ArrowLeft') setFlipper2(state, 'left', false)
    else if (k === 'KeyD' || k === 'ArrowRight') setFlipper2(state, 'right', false)
  }

  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    // 归位被按住的键，避免隐藏期间卡死。
    setFlipper2(state, 'left', false)
    setFlipper2(state, 'right', false)
    if (state.result !== 'paused') togglePause2(state)
    renderPinball2(ctx, { state, paused: true })
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (state.result === 'paused') togglePause2(state)
    loop.resume()
    loop.markDirty()
  }
  const togglePauseLocal = (): void => {
    if (state.result === 'paused') resume()
    else pause()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
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
      window.removeEventListener('keyup', onKeyUp)
      initialFit.dispose()
    },
  }
}

export const pinball2Game: MiniGameDefinition = {
  id: 'pinball2',
  title: '弹球大师 Pinball',
  icon: '🎱',
  description: '经典弹球台：挡板反弹+bumper 得分，别让球掉下去。',
  controls: [
    'A / ← 左挡板 · D / → 右挡板',
    '空格发球 · 连击不落板倍率最高 x5',
    'P 暂停 · R 重开',
  ],
  create: createPinball2Game,
}
