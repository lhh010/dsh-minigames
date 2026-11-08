/**
 * 节奏打击 game definition：4 轨道下落式节奏游戏——D/F/J/K 或点击
 * 轨道底部打击落到判定线的音符，PERFECT 金 / GOOD 蓝，连击每 50 升
 * 倍率（最高 x4）；MISS 或漏接扣血，3 命打完谱面。R 重开、P 暂停；
 * 判定事件波纹与粒子反馈，onScore 随得分变化上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { LANE_COUNT, W, H, createRhythm, hitRhythm, stepRhythm } from './logic.ts'
import { renderRhythm } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 键位 → 轨道映射。 */
const LANE_KEYS = ['KeyD', 'KeyF', 'KeyJ', 'KeyK']

function createRhythmGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: rhythm needs a 2d canvas context')
  const ctx = initialFit.ctx

  const state = createRhythm()
  let paused = false
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score !== lastScore) {
      lastScore = state.score
      options?.onScore?.(state.score)
    }
  }

  /** 点击轨道底部：按画布相对 x 换算轨道下标。 */
  const laneFromPointer = (event: PointerEvent): number => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * W
    return Math.min(LANE_COUNT - 1, Math.max(0, Math.floor((x / W) * LANE_COUNT)))
  }

  const hit = (lane: number): void => {
    if (paused || state.over || state.finished) return
    hitRhythm(state, lane)
    reportScore()
    loop.markDirty()
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    focusGameHost(host)
    hit(laneFromPointer(event))
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      const fresh = createRhythm((Math.random() * 0x7fffffff) | 0)
      Object.assign(state, fresh)
      lastScore = -1
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else {
      const lane = LANE_KEYS.indexOf(event.code)
      if (lane >= 0) {
        event.preventDefault()
        hit(lane)
      }
    }
  }

  const loop = createFrameLoop(f => {
    if (!paused) {
      stepRhythm(state, f.dt * 1000)
      reportScore()
    }
    renderRhythm(ctx, state, paused)
  })

  const pause = (): void => {
    if (paused) return
    paused = true
    loop.pause()
    renderRhythm(ctx, state, true)
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

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      loop.destroy()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      initialFit.dispose()
    },
  }
}

export const rhythmGame: MiniGameDefinition = {
  id: 'rhythm',
  title: '节奏打击 Rhythm',
  icon: '🎵',
  description: '音符落下按键打击——跟着节奏走，连击不断分数翻倍。',
  controls: [
    'D / F / J / K 或点击轨道底部：打击落到判定线的音符',
    'PERFECT ±30ms 500 分 · GOOD ±80ms 200 分 · 连击每 50 升倍率（最高 x4）',
    'MISS 或漏接扣血（共 3 命）· R：重开 · P：暂停',
  ],
  create: createRhythmGame,
}
