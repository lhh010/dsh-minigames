/**
 * 消防救火游戏定义：把纯逻辑接成 {@link MiniGameInstance}——方向键/WASD
 * 移动消防员（按住连续走格），空格按住喷水锥形水柱，R 重开本关，
 * P 暂停，Enter 通关后再来一局。continuous 帧循环驱动；过关进度经
 * level-progress 持久化，得分变化经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createState, movePlayer, restartLevel, step,
  type Direction, type FirefighterState,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, renderFirefighter } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const GAME_ID = 'firefighter'
/** 连续移动：按住方向键每 MOVE_INTERVAL 秒走一格。 */
const MOVE_INTERVAL = 0.16

const KEY_DIR: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
}

function createFirefighterGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: firefighter needs a 2d canvas context')
  const ctx = fit.ctx

  let state: FirefighterState = createState((Date.now() ^ 0x2f6b51e7) >>> 0, readLevel(GAME_ID))
  let running = false
  let paused = false
  let lastScore = -1
  let lastPhase = state.phase
  let heldDir: Direction | null = null
  let moveTimer = 0

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const restart = (): void => {
    restartLevel(state)
    heldDir = null
    moveTimer = 0
    lastScore = -1
    reportScore()
  }

  const togglePause = (): void => {
    if (state.phase === 'won') return
    if (running) {
      running = false
      paused = true
      loop.pause()
      renderFirefighter(ctx, { state, paused: true })
    } else {
      running = true
      paused = false
      loop.resume()
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const k = event.code
    if (k === 'Space' || KEY_DIR[k] !== undefined) event.preventDefault()
    if (event.repeat) return
    const dir = KEY_DIR[k]
    if (dir !== undefined) {
      heldDir = dir
      movePlayer(state, dir)
      return
    }
    switch (k) {
      case 'Space':
        if (state.phase === 'play' && state.cooldown <= 0) state.spraying = true
        break
      case 'KeyR': restart(); break
      case 'KeyP': case 'Escape': togglePause(); break
      case 'Enter': case 'NumpadEnter':
        if (state.phase === 'won') state = createState((Date.now() ^ 0x2f6b51e7) >>> 0, 1)
        break
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    const dir = KEY_DIR[event.code]
    if (dir !== undefined && heldDir === dir) heldDir = null
    if (event.code === 'Space') state.spraying = false
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    // 按住方向连续走格。
    if (heldDir !== null && state.phase === 'play' && state.cooldown <= 0) {
      moveTimer -= f.dt
      if (moveTimer <= 0) {
        moveTimer = MOVE_INTERVAL
        movePlayer(state, heldDir)
      }
    } else {
      moveTimer = 0
    }
    step(state, f.dt)
    // 过关即持久化下一关进度（只在相位切换的那一帧写）。
    if (state.phase !== lastPhase && state.phase === 'clear') {
      saveLevel(GAME_ID, Math.min(state.level + 1, 5))
    }
    lastPhase = state.phase
    reportScore()
    if (f.render) renderFirefighter(ctx, { state, paused })
  }

  const loop = createFrameLoop(frame)

  canvas.addEventListener('pointerdown', () => { focusGameHost(host) })
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  loop.start()

  return {
    start: () => {
      if (!running) {
        running = true
        paused = false
        loop.resume()
      }
    },
    pause: () => {
      if (!running) return
      running = false
      paused = true
      loop.pause()
      renderFirefighter(ctx, { state, paused: true })
    },
    resume: () => {
      if (!running) {
        running = true
        paused = false
        loop.resume()
      }
    },
    destroy: () => {
      running = false
      loop.destroy()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      fit.dispose()
    },
  }
}

export const firefighterGame: MiniGameDefinition = {
  id: 'firefighter',
  title: '消防救火 Firefighter',
  icon: '🚒',
  description: '火苗在蔓延，水管在你手——对准火源根部喷射，别让火海吞没整片街区。',
  controls: [
    '方向键 / WASD：移动消防员（建筑挡路需绕行，朝向随移动）',
    '空格按住：喷射锥形水柱（射程 4 格，火减 3 点）',
    '碰火受伤：回撤起点冷却 3 秒 · 损失建筑越多得分越低',
    'R：重开 · P：暂停 · Enter：通关后再来一局',
  ],
  create: createFirefighterGame,
}
