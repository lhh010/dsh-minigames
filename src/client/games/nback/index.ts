/**
 * N-Back 记忆训练游戏定义：把纯逻辑接到 canvas 实例。A/S（或点击两个
 * 匹配按钮）作答，R 重开、P 暂停，空格/点击通过节间小结。渲染走 dirty
 * 调度：trial 点亮脉冲与反馈闪烁期间逐帧重绘，静止时零重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  advanceSession, createNBackState, respond, tickNBack,
  LOGICAL_H, LOGICAL_W, type NBackState,
} from './logic.ts'
import { nbackAudioButton, nbackPositionButton, pointInRect, renderNBack } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 实例阶段（logic 的 running 拆成 playing/ready）。 */
type UiPhase = 'ready' | 'playing' | 'paused' | 'summary' | 'over'

function createNBackGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: nback needs a 2d canvas context')
  const ctx = fit.ctx
  const posBtn = nbackPositionButton()
  const audioBtn = nbackAudioButton()

  let state: NBackState = createNBackState((Date.now() ^ (Math.random() * 0xffff)) >>> 0)
  let phase: UiPhase = 'ready'
  let t = 0
  let lastScore = 0 - 1

  const reportScore = (): void => {
    const score = Math.floor(state.score)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const restart = (): void => {
    state = createNBackState((Date.now() ^ (Math.random() * 0xffff)) >>> 0)
    lastScore = 0 - 1
    phase = 'playing'
    reportScore()
    loop.markDirty()
  }

  /** 逻辑阶段 → 实例阶段同步（trial 结束后可能进入小结/结束）。 */
  const syncPhase = (): void => {
    if (state.phase === 'summary') phase = 'summary'
    else if (state.phase === 'over') phase = 'over'
  }

  const answer = (stream: 'position' | 'audio'): void => {
    if (phase !== 'playing') return
    if (respond(state, stream) !== null) {
      reportScore()
      loop.markDirty()
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      if (phase === 'playing') phase = 'paused'
      else if (phase === 'paused') phase = 'playing'
      loop.markDirty()
      return
    }
    if (phase === 'summary' && (event.code === 'Space' || event.code === 'Enter')) {
      event.preventDefault()
      if (advanceSession(state)) phase = 'playing'
      loop.markDirty()
      return
    }
    if (event.code === 'KeyA') {
      event.preventDefault()
      answer('position')
      return
    }
    if (event.code === 'KeyS') {
      event.preventDefault()
      answer('audio')
    }
  }

  const toLogical = (event: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * LOGICAL_W,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * LOGICAL_H,
    }
  }

  const onClick = (event: MouseEvent): void => {
    if (phase === 'ready' || phase === 'over') {
      restart()
      return
    }
    if (phase === 'summary') {
      if (advanceSession(state)) phase = 'playing'
      loop.markDirty()
      return
    }
    if (phase !== 'playing') return
    const p = toLogical(event)
    if (pointInRect(p.x, p.y, posBtn)) answer('position')
    else if (state.plan.dual && pointInRect(p.x, p.y, audioBtn)) answer('audio')
  }

  const frame = (f: FrameInfo): void => {
    if (phase === 'playing') {
      t += f.dt
      tickNBack(state, f.dt)
      syncPhase()
      reportScore()
      // 点亮脉冲随 trial 计时连续变化：期间逐帧重绘。
      loop.markDirty()
    } else {
      t += f.dt * 0.25
    }
    if (state.flashPosition > 0 || state.flashAudio > 0) loop.markDirty()
    if (f.render) renderNBack(ctx, state, t, phase)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  document.addEventListener('keydown', onKeyDown)
  canvas.addEventListener('click', onClick)
  focusGameHost(host)
  loop.start()
  renderNBack(ctx, state, 0, phase)

  return {
    start: (): void => {
      if (phase === 'ready') phase = 'playing'
      loop.markDirty()
    },
    pause: (): void => {
      if (phase === 'playing') phase = 'paused'
      loop.markDirty()
    },
    resume: (): void => {
      if (phase === 'paused' || phase === 'ready') phase = 'playing'
      loop.markDirty()
    },
    destroy: (): void => {
      loop.destroy()
      fit.dispose()
      document.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('click', onClick)
    },
  }
}

export const nbackGame: MiniGameDefinition = {
  id: 'nback',
  title: 'N-Back 记忆 NBack',
  icon: '🔁',
  description: '这个位置，N 步之前出现过吗？——锻炼工作记忆的科学方法。',
  controls: ['A：位置匹配（与 N 步前相同）', 'S：声音匹配（双流模式）', '空格：节间继续', 'P：暂停', 'R：重开'],
  create: createNBackGame,
}
