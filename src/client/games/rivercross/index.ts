/**
 * 过河 River Crossing 游戏定义：把纯逻辑状态机接成 {@link MiniGameInstance}。
 * 点击角色上 / 下船（只作用于船停靠的一岸），点击「开船」或空格 / 回车
 * 渡河；靠岸后判定：无人看管的岸出现捕食对 → 失败红闪后自动复位本关，
 * 全员到右岸 → 过关并上报 onScore，1.7s 后进入下一关。R 重开本关、
 * P 暂停。渲染走 dirty 按需模式：只有渡河 / 失败 / 过关动画和粒子活动
 * 时逐帧重绘，静止棋盘零重绘（见 frame-scheduler）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  LEVELS,
  board,
  createInitialState,
  cross,
  disembark,
  evaluate,
  levelFor,
  minCrossings,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, hitChar, hitSail, renderRiver, type RiverView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 渡河一趟的动画时长。 */
const CROSS_MS = 700
/** 失败红闪到自动复位的时长。 */
const FAIL_MS = 1300
/** 过关后进入下一关的停顿。 */
const ADVANCE_MS = 1700

function createRiverCrossGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: rivercross needs a 2d canvas context')
  const ctx = fit.ctx

  // 关卡记忆：从到达过的最高关继续（与 hanoi 相同的进度持久化）。
  let level = Math.min(readLevel('rivercross'), LEVELS.length)
  let state = createInitialState(level - 1)
  let crossings = 0
  let phase: 'play' | 'cross' | 'won' | 'fail' = 'play'
  let paused = false
  let running = false
  let crossT = 0
  let failT = 0
  let wonT = 0
  let animT = 0
  let allClear = false
  let lastScore = -1
  const particles = createParticles()

  const levelIndex = (): number => Math.min(level, LEVELS.length) - 1
  const par = (): number => minCrossings(levelIndex())

  const reportScore = (): void => {
    if (level === lastScore) return
    lastScore = level
    options?.onScore?.(level)
  }

  const startLevel = (next: number): void => {
    level = Math.min(Math.max(next, 1), LEVELS.length)
    saveLevel('rivercross', level)
    state = createInitialState(level - 1)
    crossings = 0
    phase = 'play'
    crossT = 0
    failT = 0
    wonT = 0
    allClear = false
    loop.markDirty()
  }

  /** 靠岸结算：翻面卸客 → 判定胜负 / 冲突。 */
  const arrive = (): void => {
    state = cross(state)
    crossings += 1
    const verdict = evaluate(state, levelFor(level - 1))
    if (verdict.phase === 'won') {
      phase = 'won'
      wonT = 0
      allClear = level >= LEVELS.length
      reportScore()
      particles.burst(LOGICAL_W - 85, 120, THEME.gold, 16, 150)
      particles.burst(LOGICAL_W - 85, 170, THEME.good, 10, 110)
    } else if (verdict.phase === 'failed') {
      phase = 'fail'
      failT = 0
      const bankX = verdict.bank === 'left' ? 85 : LOGICAL_W - 85
      particles.burst(bankX, 180, THEME.bad, 14, 130)
    } else {
      phase = 'play'
    }
  }

  const beginCross = (): void => {
    if (phase !== 'play') return
    phase = 'cross'
    crossT = 0
    loop.markDirty()
  }

  const view = (): RiverView => ({
    state,
    level: levelFor(level - 1),
    levelIndex: levelIndex(),
    crossings,
    par: par(),
    phase: paused ? 'paused' : phase,
    crossProgress: Math.min(1, crossT / CROSS_MS),
    animT,
    fail: phase === 'fail'
      ? (() => {
          const verdict = evaluate(state, levelFor(level - 1))
          return verdict.phase === 'failed' ? { bank: verdict.bank, pair: verdict.pair } : null
        })()
      : null,
    allClear,
  })

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || paused || phase !== 'play') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    if (hitSail(x, y)) {
      beginCross()
      return
    }
    const hit = hitChar(x, y, state, levelFor(level - 1))
    if (hit === null) return
    if (hit.where === 'boat') {
      const next = disembark(state, hit.id)
      if (next !== null) state = next
    } else if (hit.where === state.boatSide) {
      const next = board(state, levelFor(level - 1), hit.id)
      if (next !== null) state = next
    }
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      startLevel(level)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      if (paused) resumeGame()
      else pauseGame()
    } else if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      if (!running || paused) return
      beginCross()
    }
  }

  // dirty 按需渲染：动画 / 粒子活动期间逐帧，静止时零重绘。
  const loop = createFrameLoop(f => {
    let animating = false
    if (!paused) {
      if (phase === 'cross') {
        crossT += f.dt * 1000
        animT += f.dt * 1000
        animating = true
        if (crossT >= CROSS_MS) arrive()
      } else if (phase === 'fail') {
        failT += f.dt * 1000
        animT += f.dt * 1000
        animating = true
        if (failT >= FAIL_MS) startLevel(level)
      } else if (phase === 'won' && !allClear) {
        wonT += f.dt * 1000
        animT += f.dt * 1000
        animating = true
        if (wonT >= ADVANCE_MS) startLevel(level + 1)
      } else if (phase === 'won') {
        // 全部通关：庆祝粒子跑完即静止。
        animating = particles.size() > 0
      }
    }
    const alive = animating || particles.size() > 0
    if (f.render || alive) {
      renderRiver(ctx, view())
      particles.tick(ctx, f.dt * 1000)
      if (alive) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pauseGame = (): void => {
    if (!running) return
    paused = true
    loop.pause()
    renderRiver(ctx, view())
  }
  const resumeGame = (): void => {
    paused = false
    if (running) {
      loop.markDirty()
      loop.resume()
    }
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()

  return {
    start: resumeGame,
    pause: pauseGame,
    resume: resumeGame,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const rivercrossGame: MiniGameDefinition = {
  id: 'rivercross',
  title: '过河 River Crossing',
  icon: '🐺',
  description: '船小载不动——狼吃羊、羊吃菜，怎么把他们都平安运过河？',
  controls: [
    '点击角色：上船 / 下船 · 点击开船或空格：渡河',
    'R：重开本关 · P：暂停',
  ],
  create: createRiverCrossGame,
}
