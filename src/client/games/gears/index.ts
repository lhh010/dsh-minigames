/**
 * 齿轮谜题游戏定义：把纯逻辑接成 {@link MiniGameInstance} —— 点击空位放
 * 当前槽齿数的齿轮、点击已放齿轮收回、点底部槽或按 1-4/[/] 换齿数；动力
 * 轮恒转驱动传动链动画（受电即逐帧重绘，否则 dirty 按需）；R 重开本关、
 * P 暂停、过关后 N 或自动进入下一关。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  CANDIDATE_TEETH, advanceLevel, checkWin, createGearsState, computeTransmission,
  placeGear, removeGear, restartLevel, type GearsState,
} from './logic.ts'
import { renderGears, LOGICAL_W, LOGICAL_H, CELL, HUD_H, MARGIN } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 过关展示后自动进入下一关的毫秒数。 */
const AUTO_ADVANCE_MS = 1800

function createGearsGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: gears needs a 2d canvas context')
  const ctx = fit.ctx

  let state: GearsState = createGearsState()
  let running = false
  let lastScore = -1
  let wonElapsed = 0

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const restart = (): void => {
    restartLevel(state)
    wonElapsed = 0
    reportScore()
    loop.markDirty()
  }

  /** 放置/收回后立即判定过关。 */
  const applyAt = (r: number, c: number): void => {
    const teeth = CANDIDATE_TEETH[state.selected]!
    if (state.placed[r]![c] === null) placeGear(state, r, c, teeth)
    else removeGear(state, r, c)
    if (checkWin(state)) reportScore()
    loop.markDirty()
  }

  /** 有受电齿轮时逐帧重绘（旋转动画），静止盘面回到 dirty 按需。 */
  const anyPowered = (): boolean => {
    const info = computeTransmission(state.board, state.placed)
    for (const row of info) for (const v of row) if (v !== null) return true
    return false
  }

  const selectSlot = (i: number): void => {
    if (i < 0 || i >= CANDIDATE_TEETH.length || i === state.selected) return
    state.selected = i
    loop.markDirty()
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!running) return // 暂停时冻结输入
    if (state.status !== 'playing') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    // 底部候选槽区域。
    const slotTop = LOGICAL_H - 68
    if (y >= slotTop) {
      const boxW = 92
      const gap = 8
      const total = CANDIDATE_TEETH.length * boxW + (CANDIDATE_TEETH.length - 1) * gap
      const x0 = (LOGICAL_W - total) / 2
      const i = Math.floor((x - x0) / (boxW + gap))
      if (x >= x0 && x < x0 + total && (x - x0) % (boxW + gap) < boxW) selectSlot(i)
      return
    }
    // 盘面区域（与 render 的居中公式一致）。
    const level = state.board
    const ox = MARGIN + ((7 - level.w) * CELL) / 2
    const oy = HUD_H + MARGIN + ((6 - level.h) * CELL) / 2
    if (x < ox || y < oy || x >= ox + level.w * CELL || y >= oy + level.h * CELL) return
    const c = Math.floor((x - ox) / CELL)
    const r = Math.floor((y - oy) / CELL)
    if (level.cells[r]![c] === 'empty') applyAt(r, c)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
      return
    }
    if (event.code === 'KeyN') {
      event.preventDefault()
      if (state.status === 'won') {
        advanceLevel(state)
        wonElapsed = 0
        loop.markDirty()
      }
      return
    }
    if (!running) return // 暂停时冻结输入
    const digit = /^Digit([1-9])$/.exec(event.code)
    if (digit !== null) {
      event.preventDefault()
      selectSlot(Number(digit[1]) - 1)
      return
    }
    if (event.code === 'BracketLeft') {
      event.preventDefault()
      selectSlot((state.selected - 1 + CANDIDATE_TEETH.length) % CANDIDATE_TEETH.length)
      return
    }
    if (event.code === 'BracketRight') {
      event.preventDefault()
      selectSlot((state.selected + 1) % CANDIDATE_TEETH.length)
    }
  }

  const advance = (dt: number): void => {
    if (state.status !== 'won') return
    wonElapsed += dt
    if (wonElapsed >= AUTO_ADVANCE_MS / 1000) {
      advanceLevel(state)
      wonElapsed = 0
      loop.markDirty()
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    advance(f.dt)
    if (anyPowered()) loop.markDirty()
    if (f.render) renderGears(ctx, state, { paused: false })
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    running = false
    loop.pause()
    renderGears(ctx, state, { paused: true })
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
    loop.markDirty()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  loop.markDirty()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const gearsGame: MiniGameDefinition = {
  id: 'gears',
  title: '齿轮谜题 Gears',
  icon: '⚙️',
  description: '搭一条传动链让目标齿轮转起来——相邻必反转、齿数定转速。',
  controls: ['点击空位放置 / 点击已放收回', '1-4 或 [ ]：换齿数 · N：下一关', 'R：重开本关 · P：暂停'],
  create: createGearsGame,
}
