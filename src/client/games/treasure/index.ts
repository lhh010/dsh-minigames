/**
 * 寻宝猎人游戏定义：把纯逻辑接入 {@link MiniGameInstance} —— 点击盘面
 * 探测 / 指认，A 切换同心圆助手，H 使用排除提示，Enter 提前进入指认，
 * R 整局重开（新种子），P 暂停；dirty 按需帧循环，分数实时上报。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  createTreasureState, enterIdentify, identify, probe, toggleHelper, useHint,
  type TreasureState,
} from './logic.ts'
import { renderTreasure, treasureEffectsActive, CELL, HUD_H, BOARD_W, LOGICAL_W, LOGICAL_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 点击落点 → 盘面格（盘面在预留区内居中，同 render 的 boardOrigin）。 */
function cellAt(state: TreasureState, x: number, y: number): { r: number, c: number } | null {
  const bx = 20 + (BOARD_W - state.cols * CELL) / 2
  const by = HUD_H + (12 * CELL - state.rows * CELL) / 2
  const c = Math.floor((x - bx) / CELL)
  const r = Math.floor((y - by) / CELL)
  if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return null
  return { r, c }
}

function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0
}

function createTreasureGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.cursor = 'pointer'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (initialFit === null) throw new Error('dsh-minigames: treasure needs a 2d canvas context')
  const ctx = initialFit.ctx

  let state: TreasureState = createTreasureState(randomSeed())
  let t = 0
  let paused = false
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const onClick = (event: MouseEvent): void => {
    if (paused) return
    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) * (LOGICAL_W / rect.width)
    const y = (event.clientY - rect.top) * (LOGICAL_H / rect.height)
    const cell = cellAt(state, x, y)
    if (cell === null) return
    if (state.phase === 'probe') probe(state, cell.r, cell.c)
    else if (state.phase === 'identify') identify(state, cell.r, cell.c)
    else return
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      state = createTreasureState(randomSeed())
      lastScore = -1
      reportScore()
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyA') {
      event.preventDefault()
      toggleHelper(state)
      loop.markDirty()
    } else if (event.code === 'KeyH') {
      event.preventDefault()
      if (useHint(state)) loop.markDirty()
    } else if (event.code === 'Enter') {
      event.preventDefault()
      enterIdentify(state)
      loop.markDirty()
    }
  }

  const loop = createFrameLoop((f) => {
    if (f.render || treasureEffectsActive()) {
      if (!paused) t += f.dt
      renderTreasure(ctx, state, t, paused)
    }
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    paused = !paused
    loop.markDirty()
  }
  const pause = (): void => {
    if (paused) return
    paused = true
    loop.markDirty()
  }
  const resume = () => {
    if (!paused) return
    paused = false
    loop.markDirty()
  }

  canvas.addEventListener('click', onClick)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()
  renderTreasure(ctx, state, 0, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      loop.destroy()
      initialFit.dispose()
      canvas.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const treasureGame: MiniGameDefinition = {
  id: 'treasure',
  title: '寻宝猎人 Treasure',
  icon: '🏴‍☠️',
  description: '探测器只说更热还是更冷——用最少的探测次数钉住宝藏的位置。',
  controls: [
    '玩法：每次探测会把这一点与上一次探测点离宝藏的距离作比较——🔥更热=比上一次近，🧊更冷=比上一次远，➖同温=等距。',
    '利用两次探测点与反馈推理范围（例：上次 A 更热 ⇒ 宝藏在以 A 为中心的「近半」区域内），次数用尽后点击一格指认。',
    '第 4 关起有假宝藏：探测反馈按最近的假宝藏算，指认前先排除混淆。',
    '点击盘面：探测/指认 · A：同心圆参考线（计分减半） · H：排除 1/3 错误区域（限 1 次） · Enter：提前指认 · R：重开 · P：暂停',
  ],
  create: createTreasureGame,
}
