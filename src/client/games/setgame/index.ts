/**
 * 疾速集合 SET 游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击选卡
 * （3 张自动判定），成功三卡飞出 + 金色粒子，错误震动 + 扣时，开局 30 秒
 * 教学闪边；R 重开、P 暂停。计时持续流动，走 continuous 帧循环。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { colorOf, createSetGameState, mulberry32, selectCard, tick, tutorActive, tutorSet, type SetGameState } from './logic.ts'
import {
  LOGICAL_H, LOGICAL_W, SET_COLORS, cardAt, cardRect, createSetParticles,
  renderSetGame, type FlyCard, type SetView,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'
import { THEME } from '../theme.ts'

/** 错误震动时长（毫秒）。 */
const SHAKE_MS = 300
/** 成功飞出动画时长（毫秒）。 */
const FLY_MS = 420

function createSetGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: setgame needs a 2d canvas context')
  const ctx = fit.ctx

  let state: SetGameState = createSetGameState(mulberry32((Math.random() * 0xffffffff) >>> 0))
  let running = true
  let lastScore = -1
  let shakeMs = 0
  let fly: { cards: FlyCard[], progress: number } | null = null
  let clockMs = 0
  const particles = createSetParticles()

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const restart = (): void => {
    state = createSetGameState(mulberry32((Math.random() * 0xffffffff) >>> 0))
    lastScore = -1
    shakeMs = 0
    fly = null
    reportScore()
    loop.markDirty()
  }

  const draw = (dtMs: number): void => {
    clockMs += dtMs
    const view: SetView = {
      paused: !running,
      shakeMs,
      fly,
      hint: tutorActive(state) ? tutorSet(state) : null,
      timeMs: clockMs,
      particles,
    }
    renderSetGame(ctx, state, view, dtMs)
  }

  /**
   * 点选入口：凑满 3 张自动判定。判定会立刻移牌，故第三张选中前先快照
   * 三张牌的面值与槽位矩形，供成功飞出动画使用。
   */
  const inputCard = (tableIndex: number): void => {
    if (state.phase !== 'playing') return
    const willJudge = state.selected.length === 2 && !state.selected.includes(tableIndex)
    let snapshot: FlyCard[] | null = null
    if (willJudge) {
      const idxs = [...state.selected, tableIndex].sort((a, b) => a - b)
      const count = state.table.length
      snapshot = idxs.map((i) => {
        const r = cardRect(i, count)
        return { card: state.table[i] ?? 0, x: r.x, y: r.y, w: r.w, h: r.h }
      })
    }
    const result = selectCard(state, tableIndex)
    if (result === 'set' && snapshot !== null) {
      fly = { cards: snapshot, progress: 0 }
      for (const fc of snapshot) {
        particles.burst(fc.x + fc.w / 2, fc.y + fc.h / 2, SET_COLORS[colorOf(fc.card)] ?? THEME.gold, 8, 150)
      }
    } else if (result === 'wrong') {
      shakeMs = SHAKE_MS
    }
    if (result !== 'ignored') reportScore()
    loop.markDirty()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const idx = cardAt(x, y, state.table.length)
    if (idx !== null) inputCard(idx)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const loop = createFrameLoop((f) => {
    if (!running) return
    if (shakeMs > 0) shakeMs = Math.max(0, shakeMs - f.wallMs)
    if (fly !== null) {
      fly.progress = Math.min(1, fly.progress + f.wallMs / FLY_MS)
      if (fly.progress >= 1) fly = null
    }
    if (state.phase === 'playing') tick(state, f.wallMs)
    draw(f.wallMs)
  })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    draw(0)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.resume()
    loop.markDirty()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  reportScore()
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const setgameGame: MiniGameDefinition = {
  id: 'setgame',
  title: '疾速集合 SET',
  icon: '🎴',
  description: '三张卡颜色形状数量全同或全不同才是集合——眼花缭乱中找规律。',
  controls: ['点击卡牌：选 3 张自动判定', 'R：重开', 'P：暂停'],
  create: createSetGame,
}
