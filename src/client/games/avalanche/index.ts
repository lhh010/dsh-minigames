/**
 * 滑雪大冒险游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous
 * 帧循环推进模拟与渲染；↑/空格/W 起跳（跳台上更高）、空中 ←→/AD 控制
 * 姿态，R 重开、P 暂停，总分经 onScore 上报（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createAvalanche,
  stepAvalanche,
  totalScore,
  W,
  H,
  type AvaState,
} from './logic.ts'
import { renderAvalanche } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createAvalancheGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: avalanche needs a 2d canvas context')
  const ctx = fit.ctx
  // 画布按比例居中后与宿主之间的空隙用天空同系渐变填充——高度受限的
  // 面板里露出的不再是页面底色。
  host.style.background = 'linear-gradient(180deg, #584a7d 0%, #a06a8f 45%, #e8a87c 80%, #d8d3e8 100%)'

  const seed = dailySeed()
  let round = 0
  let state: AvaState = createAvalanche((seed + round) >>> 0)
  let running = false
  let lastScore = -1
  // 跳跃为边沿触发：keydown 置位，帧内消费后清空。
  let jumpQueued = false

  const held = new Set<string>()
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'ArrowUp':
      case 'Space':
      case 'KeyW':
        event.preventDefault()
        if (!event.repeat) jumpQueued = true
        break
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        held.add(event.code)
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        held.add(event.code)
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
    held.delete(event.code)
  }

  /** 每帧向上报最新总分（与逻辑层 totalScore 同口径）。 */
  const reportScore = (): void => {
    const score = totalScore(state)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const left = held.has('ArrowLeft') || held.has('KeyA')
    const right = held.has('ArrowRight') || held.has('KeyD')
    stepAvalanche(state, f.dt * 1000, { jump: jumpQueued, left, right })
    jumpQueued = false
    reportScore()
    // 传真实帧间隔驱动渲染层动画（粒子/相机/过渡），暂停时传 0 冻结。
    if (f.render) renderAvalanche(ctx, state, false, f.dt * 1000)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createAvalanche((seed + round) >>> 0)
    lastScore = -1
    jumpQueued = false
    held.clear()
    loop.markDirty()
    renderAvalanche(ctx, state, false)
    // 结束后按 R：直接回到滑行状态。
    if (!running) {
      running = true
      loop.start()
    }
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderAvalanche(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  // 切走标签页/失焦时自动暂停，避免后台跳帧把雪崩送到脸上。
  const onBlur = (): void => {
    if (running) pause()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  focusGameHost(host)
  running = true
  loop.start()
  renderAvalanche(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      host.style.background = ''
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    },
  }
}

export const avalancheGame: MiniGameDefinition = {
  id: 'avalanche',
  title: '滑雪大冒险 Avalanche',
  icon: '🏂',
  description: '雪崩在身后咆哮！滑降、跳跃、翻滚特技，骑上企鹅或雪人逃出生天。',
  controls: [
    '↑ / 空格 / W：起跳（在跳台上起跳更高）',
    '空中 ←→ / AD：控制姿态，落地保持平衡；长滞空自动翻滚特技 +50',
    '撞树/岩石翻滚减速，雪崩追近；骑企鹅加速+免撞一次，骑雪人免撞两次；金币 +10',
    'R：重开 · P：暂停',
  ],
  create: createAvalancheGame,
}
