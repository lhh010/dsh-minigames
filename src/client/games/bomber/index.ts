/**
 * Bomberman game definition: wires the pure world logic into a
 * {@link MiniGameInstance} — an rAF loop (createFrameLoop, continuous mode),
 * WASD/arrows to move, Space to place a bomb, P pause, R restart the current
 * level, Enter restarts after death. Level progress persists via
 * level-progress ('bomber').
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createWorld, startLevel, resetLevel, stepWorld, placeBomb, mulberry32, LEVELS,
  type PlayerInput, type WorldState,
} from './logic.ts'
import { renderBomber, BOARD_W, BOARD_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const GAME_ID = 'bomber'
/** Deterministic per-level seed (same construction as lightsout). */
function levelRng(level: number): () => number {
  return mulberry32((level * 0x9e3779b9) >>> 0)
}

function createBomberGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, BOARD_W, BOARD_H)
  if (fit === null) throw new Error('dsh-minigames: bomber needs a 2d canvas context')
  const ctx = fit.ctx

  let world: WorldState = createWorld(readLevel(GAME_ID), levelRng(readLevel(GAME_ID)))
  let lastScore = -1

  const input: PlayerInput = { up: false, down: false, left: false, right: false }

  const reportScore = (): void => {
    if (world.score === lastScore) return
    lastScore = world.score
    options?.onScore?.(world.score)
  }

  const restartLevel = (): void => {
    // Same seed → the same layout, so a retry is fair; the score restarts
    // at 0 (a fresh attempt must not inherit the aborted run's score).
    const level = world.level
    resetLevel(world, levelRng(level))
    lastScore = -1
    input.up = input.down = input.left = input.right = false
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        event.preventDefault()
        input.up = true
        break
      case 'ArrowDown':
      case 'KeyS':
        event.preventDefault()
        input.down = true
        break
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        input.left = true
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        input.right = true
        break
      case 'Space':
        event.preventDefault()
        if (world.result === 'none') placeBomb(world)
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
      case 'KeyR':
        event.preventDefault()
        restartLevel()
        break
      case 'Enter':
        event.preventDefault()
        if (world.result === 'lose') restartLevel()
        break
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        input.up = false
        break
      case 'ArrowDown':
      case 'KeyS':
        input.down = false
        break
      case 'ArrowLeft':
      case 'KeyA':
        input.left = false
        break
      case 'ArrowRight':
      case 'KeyD':
        input.right = false
        break
    }
  }

  const loop = createFrameLoop((f) => {
    stepWorld(world, f.dt, input)
    // Persist the highest level reached (auto-advance writes level+1).
    if (world.result === 'cleared') saveLevel(GAME_ID, (world.level % LEVELS) + 1)
    reportScore()
    if (f.render) renderBomber(ctx, world, false)
  })

  const togglePause = (): void => {
    if (loop.running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!loop.running) return
    loop.pause()
    renderBomber(ctx, world, true)
  }
  const resume = (): void => {
    loop.resume()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  loop.start()
  renderBomber(ctx, world, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const bomberGame: MiniGameDefinition = {
  id: 'bomber',
  title: '炸弹人',
  icon: '💣',
  description: '经典炸弹人：放置炸弹炸开砖墙、消灭敌人，清空 5 关循环关卡。',
  controls: ['WASD / 方向键：移动', '空格：放炸弹', '回车：失败后重开本关', 'R：重开本关', 'P：暂停'],
  create: createBomberGame,
}
