/**
 * 开锁达人游戏定义：把纯逻辑接成 {@link MiniGameInstance}——←/→ 按住
 * 施加张力，数字键选弹子，空格按住施力顶起 / 松开判定设定，R 重开、
 * P 暂停，continuous 帧循环推进模拟与渲染，分数经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createLockpick, pressPin, releasePin, selectPin, stepLockpick,
  W, H, type LockpickState,
} from './logic.ts'
import { renderLockpick } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createLockpickGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: lockpick needs a 2d canvas context')
  const ctx = initialFit.ctx

  const seed = dailySeed()
  let round = 0
  let state: LockpickState = createLockpick(seed, round)
  let running = false
  let lastScore = -1
  // 左右张力键各自的按住状态（任一按住即施加张力，方向取最近按下者）。
  let leftHeld = false
  let rightHeld = false

  const applyTensionInput = (): void => {
    const on = leftHeld || rightHeld
    state.tensionInput = on
    if (!on) state.tensionDir = 0
    else if (leftHeld && !rightHeld) state.tensionDir = -1
    else if (rightHeld && !leftHeld) state.tensionDir = 1
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.repeat && event.code !== 'Space') return
    switch (event.code) {
      case 'ArrowLeft':
      case 'ArrowRight':
        event.preventDefault()
        if (event.code === 'ArrowLeft') leftHeld = true
        else rightHeld = true
        applyTensionInput()
        break
      case 'Space':
        event.preventDefault()
        if (!state.over && running && state.unlockMs <= 0) pressPin(state)
        break
      case 'KeyR':
        event.preventDefault()
        reset()
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
      default: {
        // 数字键 1..9 选弹子。
        const digit = event.code.startsWith('Digit') ? Number(event.code.slice(5)) : 0
        if (digit >= 1 && digit <= 9 && !state.over) {
          event.preventDefault()
          selectPin(state, digit - 1)
        }
      }
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowLeft') leftHeld = false
    else if (event.code === 'ArrowRight') rightHeld = false
    else if (event.code === 'Space') {
      releasePin(state)
      return
    }
    applyTensionInput()
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    stepLockpick(state, f.dt * 1000)
    reportScore()
    if (f.render) renderLockpick(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createLockpick(seed, round)
    leftHeld = false
    rightHeld = false
    applyTensionInput()
    lastScore = -1
    loop.markDirty()
    renderLockpick(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    // 暂停时收掉按住状态，防止恢复后幽灵施力。
    state.pressing = false
    state.tensionInput = false
    leftHeld = false
    rightHeld = false
    renderLockpick(ctx, state, true)
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
  renderLockpick(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      initialFit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const lockpickGame: MiniGameDefinition = {
  id: 'lockpick',
  title: '开锁达人 Lockpick',
  icon: '🔓',
  description: '绷住张力转动锁芯，逐颗顶起弹子——手一抖全套崩。',
  controls: [
    '玩法：① 按住 ←/→ 绷住张力（弧需过「最低设定张力」刻度）→ ② 数字键选弹子 → ③ 按住空格顶起 → ④ 暗区窗口内松开即设定',
    '全弹子设定 → 转芯开锁；施力过冲会弹回，且张力越高崩掉的已设定弹子越多（耐久 -1）',
    '无张力过冲无害弹回 · 已设定弹子亮绿 · 窗口暗区仅前两把锁提示 · R：重开 · P：暂停',
  ],
  create: createLockpickGame,
}
