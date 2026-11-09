/**
 * 吹气球 game definition：按住（空格 / 指针）充气，松手存分换新
 * 气球；10 只一轮，爆掉本局清零。R 重开（新 seed）、P 暂停；存入与
 * 爆裂事件粒子反馈。充气需要连续动画，使用 continuous 帧循环。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { W, H, createBalloon, release, startHold, stepBalloon } from './logic.ts'
import { renderBalloon } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 挂载计数：与时间戳混合派生每局互不相同的 seed。 */
let mountCounter = 0

function createBalloonGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: balloon needs a 2d canvas context')
  const ctx = initialFit.ctx

  mountCounter += 1
  const seed = (Date.now() ^ Math.imul(mountCounter, 2654435761)) >>> 0
  const state = createBalloon(seed)
  let paused = false
  let lastScore = -1

  const reportScore = (score: number): void => {
    if (score !== lastScore) {
      lastScore = score
      options?.onScore?.(score)
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'Space') {
      event.preventDefault()
      if (!event.repeat && !paused) startHold(state)
    } else if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code !== 'Space' || !gameHasFocus(host)) return
    if (!paused) release(state)
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    if (!paused) startHold(state)
  }
  const onPointerUp = (): void => {
    if (!paused) release(state)
  }

  const loop = createFrameLoop(f => {
    if (!paused) {
      stepBalloon(state, f.dt * 1000)
      for (const ev of state.events) {
        if (ev.type === 'bank') reportScore(state.runScore)
        else if (ev.type === 'complete') reportScore(ev.score)
      }
    }
    renderBalloon(ctx, state, paused)
  })

  const restart = (): void => {
    Object.assign(state, createBalloon((seed + Math.imul(mountCounter, 40503)) >>> 0))
    lastScore = -1
    paused = false
    loop.markDirty()
    loop.resume()
  }

  const pause = (): void => {
    if (paused) return
    paused = true
    loop.pause()
    renderBalloon(ctx, state, true)
  }
  const resume = (): void => {
    if (!paused) return
    paused = false
    loop.markDirty()
    loop.resume()
  }
  const togglePause = (): void => {
    if (paused) resume()
    else pause()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  focusGameHost(host)
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      loop.destroy()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      initialFit.dispose()
    },
  }
}

export const balloonGame: MiniGameDefinition = {
  id: 'balloon',
  title: '吹气球 Balloon',
  icon: '🎈',
  description: '按住充气越大分越高——但没人知道它什么时候爆，及时收手是唯一的智慧。',
  controls: [
    '按住空格或鼠标：充气（潜在分随大小增长）',
    '松开：把当前大小存入本局总分，换新气球',
    'R：重开 · P：暂停 · 共 10 只，爆掉本局清零',
  ],
  create: createBalloonGame,
}
