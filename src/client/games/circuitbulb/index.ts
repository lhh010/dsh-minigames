/**
 * 电路点灯 CircuitBulb 游戏定义：把纯逻辑（./logic.ts）接入面板生命
 * 周期。点击（或 ←→ + 空格/回车）拨动开关，让全部灯泡亮起；H 消耗提
 * 示指出一个拨错的开关；R 重开本关（seed 确定，电路可复现）；P 暂停。
 * 过关按 PAR 计分并累计总分，1.6s 后自动进入下一关；关卡进度走共享的
 * level-progress 持久化。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  MAX_HINTS, bulbStates, createGame, mulberry32, pickHint, scoreFor, toggleSwitch,
  type GameState, type Hint,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, bulbCenter, renderCircuit, switchAt } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'

const GAME_ID = 'circuitbulb'
/** 对局种子：固定值保证同一关卡号永远生成同一电路（可复现、可测）。 */
const RUN_SEED = 0x51cb
const ADVANCE_MS = 1600
/** 提示在画布上的展示时长（毫秒）。 */
const HINT_SHOW_MS = 2600

/** 生成第 lv 关；PAR=0（开局即全亮）的电路换派生 seed 重试。 */
function makePlayableLevel(lv: number): GameState {
  for (let offset = 0; offset < 24; offset += 1) {
    const g = createGame(RUN_SEED + offset * 7919, lv)
    if (g.levelData.par > 0) return g
  }
  return createGame(RUN_SEED, lv)
}

function createCircuitBulbGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: circuitbulb needs a 2d canvas context')
  const ctx = fit.ctx

  let level = readLevel(GAME_ID)
  let game = makePlayableLevel(level)
  let cursor = 0
  let winText: string | null = null
  let hint: Hint | null = null
  let hintUntil = 0
  let hintRoll = 0
  let totalScore = 0
  let lastScore = -1
  let running = false
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  const particles = createParticles()

  const reportScore = (): void => {
    if (totalScore === lastScore) return
    lastScore = totalScore
    options?.onScore?.(totalScore)
  }

  const startLevel = (next: number): void => {
    level = next
    game = makePlayableLevel(next)
    saveLevel(GAME_ID, next)
    cursor = 0
    winText = null
    hint = null
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      startLevel(level + 1)
    }, delayMs)
  }

  const onWin = (): void => {
    const gained = scoreFor(game)
    totalScore += gained
    winText = '第 ' + level + ' 关 · +' + gained + ' 分（PAR ' + game.levelData.par + '）'
    reportScore()
    for (let i = 0; i < game.levelData.bulbs.length; i += 1) {
      const c = bulbCenter(i, game.levelData.bulbs.length)
      particles.burst(c.x, c.y, i === 0 ? THEME.gold : THEME.good, 8, 130)
    }
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS // 暂停中过关：恢复时再排进下一关
  }

  const applyToggle = (index: number): void => {
    if (winText !== null) return // 过关遮罩期间冻结输入
    const wasWon = game.won
    game = toggleSwitch(game, index)
    hint = null // 开关一拨，旧提示即失效
    loop.markDirty()
    if (!wasWon && game.won) onWin()
  }

  const useHint = (): void => {
    if (winText !== null || game.hintsUsed >= MAX_HINTS) return
    const rng = mulberry32((RUN_SEED ^ (hintRoll += 1)) >>> 0)
    const picked = pickHint(game, rng)
    if (picked === null) return
    game = { ...game, hintsUsed: game.hintsUsed + 1 }
    hint = picked
    hintUntil = performance.now() + HINT_SHOW_MS
    loop.markDirty()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return // 暂停：冻结输入
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const i = switchAt(x, y, game.levelData.config.switches)
    if (i !== null) {
      cursor = i
      applyToggle(i)
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      // 重开本关：seed 确定，电路与初始状态完全一致。
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyH') {
      event.preventDefault()
      if (!running) return
      useHint()
    } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault()
      if (!running) return
      const max = game.levelData.config.switches - 1
      cursor = event.code === 'ArrowLeft' ? Math.max(0, cursor - 1) : Math.min(max, cursor + 1)
      loop.markDirty()
    } else if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      if (!running) return
      applyToggle(cursor)
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    if (hint !== null && performance.now() >= hintUntil) {
      hint = null
      loop.markDirty()
    }
    // 静态电路图：仅在脏帧或粒子未散尽时重绘。
    if (!f.render && particles.size() === 0) return
    renderCircuit(ctx, LOGICAL_W, LOGICAL_H, game, bulbStates(game.levelData, game.states), cursor, hint, false, winText)
    particles.tick(ctx, f.dt * 1000)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    running = false
    // 暂停冻结过关倒计时：停表保留剩余毫秒。
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    renderCircuit(ctx, LOGICAL_W, LOGICAL_H, game, bulbStates(game.levelData, game.states), cursor, hint, true, winText)
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    loop.start()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  reportScore()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const circuitbulbGame: MiniGameDefinition = {
  id: 'circuitbulb',
  title: '电路点灯 CircuitBulb',
  icon: '🔋',
  description: '接通电路点亮所有灯泡——开关、并联、短路，一个都不能错。',
  controls: ['点击 / ←→ + 空格或回车：拨动开关', 'H：提示（每关 2 次）', 'R：重开本关', 'P：暂停'],
  create: createCircuitBulbGame,
}
