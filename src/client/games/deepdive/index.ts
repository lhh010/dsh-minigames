/**
 * 深海潜水游戏定义：把纯逻辑接入 {@link MiniGameInstance} —— 方向键移动、
 * 空格上浮（船上则出发），商店按钮点击购买升级，R 整局重开（新种子）、
 * P 暂停；continuous 帧循环，净值（资产 + 本趟收获）实时上报。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  buyUpgrade, createDeepDiveState, setInputX, setInputY, startAscend, startDive, stepDeepDive,
  type DeepDiveState,
} from './logic.ts'
import { renderDeepDive, LOGICAL_W, LOGICAL_H, SHOP_BTNS, DIVE_BTN, UPGRADE_KEYS } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0
}

function createDeepDiveGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (initialFit === null) throw new Error('dsh-minigames: deepdive needs a 2d canvas context')
  const ctx = initialFit.ctx

  let state: DeepDiveState = createDeepDiveState(randomSeed())
  let t = 0
  let lastScore = -1

  const reportScore = (): void => {
    const score = state.assets + state.haul
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const code = event.code
    if (code === 'ArrowLeft' || code === 'KeyA') {
      event.preventDefault()
      setInputX(state, -1)
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      event.preventDefault()
      setInputX(state, 1)
    } else if (code === 'ArrowUp' || code === 'KeyW') {
      event.preventDefault()
      setInputY(state, -1)
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      event.preventDefault()
      setInputY(state, 1)
    } else if (code === 'Space') {
      event.preventDefault()
      if (state.phase === 'boat') startDive(state)
      else startAscend(state)
    } else if (code === 'KeyR') {
      event.preventDefault()
      state = createDeepDiveState(randomSeed())
      lastScore = -1
    } else if (code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const code = event.code
    if (code === 'ArrowLeft' || code === 'KeyA') {
      if (state.inputX < 0) setInputX(state, 0)
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      if (state.inputX > 0) setInputX(state, 0)
    } else if (code === 'ArrowUp' || code === 'KeyW') {
      if (state.inputY < 0) setInputY(state, 0)
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      if (state.inputY > 0) setInputY(state, 0)
    }
  }

  /** 商店点击：CSS 坐标换回逻辑坐标后命中按钮矩形（潜水阶段无按钮）。 */
  const onPointerDown = (event: PointerEvent): void => {
    if (state.phase !== 'boat' || state.won) return
    const rect = canvas.getBoundingClientRect()
    const lx = ((event.clientX - rect.left) / Math.max(1, rect.width)) * LOGICAL_W
    const ly = ((event.clientY - rect.top) / Math.max(1, rect.height)) * LOGICAL_H
    for (const key of UPGRADE_KEYS) {
      const r = SHOP_BTNS[key]
      if (lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) {
        buyUpgrade(state, key)
        return
      }
    }
    const d = DIVE_BTN
    if (lx >= d.x && lx <= d.x + d.w && ly >= d.y && ly <= d.y + d.h) startDive(state)
  }

  const loop = createFrameLoop((f) => {
    t += f.dt
    if (state.phase === 'dive') stepDeepDive(state, f.dt)
    reportScore()
    if (f.render) renderDeepDive(ctx, state, t, false)
  })

  const togglePause = (): void => {
    if (loop.running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!loop.running) return
    loop.pause()
    renderDeepDive(ctx, state, t, true)
  }
  const resume = (): void => {
    loop.resume()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('pointerdown', onPointerDown)
  focusGameHost(host)
  loop.start()
  renderDeepDive(ctx, state, 0, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      loop.destroy()
      initialFit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('pointerdown', onPointerDown)
    },
  }
}

export const deepdiveGame: MiniGameDefinition = {
  id: 'deepdive',
  title: '深海潜水 DeepDive',
  icon: '🤿',
  description: '一罐氧气，越深宝越贵——下到多深才回头，是勇气也是算术。',
  controls: ['方向键 / WASD：移动 · 空格：上浮（船上=出发）', '船上点击按钮购买升级 · 越深耗氧越快', 'R：重开', 'P：暂停'],
  create: createDeepDiveGame,
}
