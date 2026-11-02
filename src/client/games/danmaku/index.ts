/**
 * 弹幕决战游戏定义：把纯逻辑接成 {@link MiniGameInstance}——方向键 / WASD
 * 四向移动，Z / J 射击（按住连发，冷却由逻辑层节流），Shift 按住进入精确
 * 模式（减速 + 缩小判定点 + 显示擦弹圈），R 重开、P 暂停，continuous 帧循
 * 环推进模拟与渲染，分数经 onScore 上报累计分（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createDanmaku, stepDanmaku, W, H, type DanmakuState } from './logic.ts'
import { renderDanmaku } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createDanmakuGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: danmaku needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: DanmakuState = createDanmaku(seed, round)
  let running = false
  let lastScore = -1

  // 按住的键集合（仅移动 / 射击 / 精确键；R/P 在 keydown 即时处理）。
  const held = new Set<string>()
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        held.add('left')
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        held.add('right')
        break
      case 'ArrowUp':
      case 'KeyW':
        event.preventDefault()
        held.add('up')
        break
      case 'ArrowDown':
      case 'KeyS':
        event.preventDefault()
        held.add('down')
        break
      case 'KeyZ':
      case 'KeyJ':
        event.preventDefault()
        held.add('fire')
        break
      case 'ShiftLeft':
      case 'ShiftRight':
        event.preventDefault()
        held.add('focus')
        break
      case 'KeyR':
        event.preventDefault()
        reset()
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        held.delete('left')
        break
      case 'ArrowRight':
      case 'KeyD':
        held.delete('right')
        break
      case 'ArrowUp':
      case 'KeyW':
        held.delete('up')
        break
      case 'ArrowDown':
      case 'KeyS':
        held.delete('down')
        break
      case 'KeyZ':
      case 'KeyJ':
        held.delete('fire')
        break
      case 'ShiftLeft':
      case 'ShiftRight':
        held.delete('focus')
        break
    }
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const focus = (): boolean => held.has('focus')

  const frame = (f: FrameInfo): void => {
    if (!running) return
    stepDanmaku(state, f.dt * 1000, {
      left: held.has('left'),
      right: held.has('right'),
      up: held.has('up'),
      down: held.has('down'),
      fire: held.has('fire'),
      focus: focus(),
    })
    reportScore()
    if (f.render || state.bannerMs > 0) renderDanmaku(ctx, state, focus(), false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createDanmaku(seed, round)
    lastScore = -1
    loop.markDirty()
    renderDanmaku(ctx, state, false, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderDanmaku(ctx, state, focus(), true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  loop.start()
  renderDanmaku(ctx, state, false, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const danmakuGame: MiniGameDefinition = {
  id: 'danmaku',
  title: '弹幕决战 Danmaku',
  icon: '🌸',
  description: '纵向卷轴弹幕射击：多波 Boss 战，扇形/螺旋/花瓣弹幕，擦弹得分更刺激。',
  controls: [
    '←↑↓→ / WASD：移动 · Z / J：射击（按住连发）',
    '按住 Shift：精确模式（减速 + 缩小判定点）· 贴身擦弹 +10 分',
    '3 条命 · 被弹短暂无敌并全屏消弹 · 3 个 Boss 各 3 阶段 · R：重开 · P：暂停',
  ],
  create: createDanmakuGame,
}
