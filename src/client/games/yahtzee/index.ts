/**
 * 五骰 Yahtzee 游戏定义：把纯计分逻辑接成 {@link MiniGameInstance} ——
 * 空格/点击掷骰（每回合最多 3 次）、点击骰子或数字键 1-5 锁定、点击面板
 * 或 A-M 键填分（已填格不可重复）；快艇格已填后掷出五同自动 +50 快速艇
 * 奖励；13 格填满即终局上报总分。R 重开、P 暂停。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  CATEGORIES, isYahtzee, mulberry32, rollDice, scoreCategory, totalScore,
  type Category, type Scores,
} from './logic.ts'
import { renderYahtzee, dieAt, rollButtonAt, categoryAt, LOGICAL_W, LOGICAL_H, type YahtzeeView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { accent, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ROLL_MS = 520
const TOAST_MS = 1300

/** 每局新种子的来源：时间戳异或递增计数器。 */
let restartCounter = 0
function nextSeed(): number {
  restartCounter = (restartCounter + 1) >>> 0
  return (Date.now() ^ Math.imul(restartCounter, 0x9e3779b9)) >>> 0
}

function createYahtzeeGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (initialFit === null) throw new Error('dsh-minigames: yahtzee needs a 2d canvas context')
  const ctx = initialFit.ctx

  let dice = [1, 1, 1, 1, 1]
  let held = [false, false, false, false, false]
  let scores: Scores = {}
  let rollsUsed = 0
  let yahtzeeBonus = 0
  let rolling = false
  let rollEndsAt = 0
  let status: 'playing' | 'ended' = 'playing'
  let userPaused = false
  let running = false
  let toast = ''
  let toastMs = 0
  let lastScore = -1
  // 本局所有掷骰共用的种子流（重开换流，保证局内确定、局间不重）。
  let rng = mulberry32(nextSeed())
  const particles = createParticles()

  const filledCount = (): number => CATEGORIES.filter(c => scores[c] !== undefined).length
  const total = (): number => totalScore(scores, yahtzeeBonus)

  const reportScore = (): void => {
    const t = total()
    if (t === lastScore) return
    lastScore = t
    options?.onScore?.(t)
  }

  const show = (text: string): void => {
    toast = text
    toastMs = TOAST_MS
    loop.markDirty()
  }

  const roll = (): void => {
    if (status !== 'playing' || userPaused || rolling) return
    if (rollsUsed >= 3) {
      show('本回合已掷 3 次，请填分')
      return
    }
    const seed = Math.floor(rng() * 0x7fff_ffff)
    dice = rollDice(seed, dice, held)
    rollsUsed += 1
    rolling = true
    rollEndsAt = performance.now() + ROLL_MS
    // 快速艇奖励：快艇格已填（无论当年填了多少）后再掷出五同，+50。
    if (isYahtzee(dice) && scores.yahtzee !== undefined) {
      yahtzeeBonus += 1
      show('快速艇奖励 +50')
      particles.burst(LOGICAL_W / 2, 90, accent(4), 18, 150)
    }
    loop.markDirty()
  }

  const toggleHold = (i: number): void => {
    if (status !== 'playing' || userPaused || rolling) return
    if (rollsUsed === 0) {
      show('先掷一次骰再锁定')
      return
    }
    held = held.map((h, j) => (j === i ? !h : h))
    loop.markDirty()
  }

  const assign = (category: Category): void => {
    if (status !== 'playing' || userPaused || rolling) return
    if (rollsUsed === 0) {
      show('先掷一次骰再填分')
      return
    }
    if (scores[category] !== undefined) {
      show('该格已填')
      return
    }
    const value = scoreCategory(category, dice)
    scores = { ...scores, [category]: value }
    if (value >= 40) particles.burst(LOGICAL_W / 2, 90, accent(2), 16, 140)
    rollsUsed = 0
    held = [false, false, false, false, false]
    reportScore()
    if (filledCount() === CATEGORIES.length) status = 'ended'
    loop.markDirty()
  }

  const restart = (): void => {
    dice = [1, 1, 1, 1, 1]
    held = [false, false, false, false, false]
    scores = {}
    rollsUsed = 0
    yahtzeeBonus = 0
    rolling = false
    status = 'playing'
    userPaused = false
    toast = ''
    toastMs = 0
    rng = mulberry32(nextSeed())
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 浏览器快捷键（Ctrl/Cmd+R 等）不拦截。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'Space') {
      event.preventDefault()
      if (status === 'ended') restart()
      else if (!userPaused) roll()
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      if (status === 'playing') {
        userPaused = !userPaused
        loop.markDirty()
      }
      return
    }
    if (!running || userPaused) return
    if (/^[1-5]$/.test(event.key)) {
      event.preventDefault()
      toggleHold(Number(event.key) - 1)
      return
    }
    // A-M 依次对应面板 13 格。
    const letterIdx = event.key.toLowerCase().charCodeAt(0) - 97
    if (event.key.length === 1 && letterIdx >= 0 && letterIdx < CATEGORIES.length) {
      event.preventDefault()
      assign(CATEGORIES[letterIdx]!)
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    if (status === 'ended') {
      restart()
      return
    }
    if (userPaused) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const die = dieAt(x, y)
    if (die !== null) {
      toggleHold(die)
      return
    }
    if (rollButtonAt(x, y)) {
      roll()
      return
    }
    const cat = categoryAt(x, y)
    if (cat !== null) assign(cat)
  }

  const view = (): YahtzeeView => ({
    dice, held, rollsUsed, filledCount: filledCount(), scores, yahtzeeBonus,
    total: total(), rolling, estimate: (c: Category) => scoreCategory(c, dice),
    toast, status, userPaused, paused: !running,
  })

  // 脏标记渲染：静态盘面只在状态或动效变化时重绘（见 frame-scheduler）。
  const loop = createFrameLoop(f => {
    const dtMs = f.dt * 1000
    toastMs = Math.max(0, toastMs - dtMs)
    if (toastMs === 0) toast = ''
    if (rolling && performance.now() >= rollEndsAt) {
      rolling = false
      loop.markDirty()
    }
    const animating = rolling || toastMs > 0 || particles.size() > 0
    if (f.render || animating) {
      renderYahtzee(ctx, view(), performance.now())
      particles.tick(ctx, dtMs)
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    running = false
    loop.pause()
    renderYahtzee(ctx, view(), performance.now())
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.markDirty()
    loop.resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderYahtzee(ctx, view(), performance.now())

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      initialFit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const yahtzeeGame: MiniGameDefinition = {
  id: 'yahtzee',
  title: '五骰 Yahtzee',
  icon: '🎲',
  description: '骰子扑克：三次机会重掷，填满十三个计分格——全库唯一骰子策略游戏。',
  controls: ['空格 / 点击：掷骰（每回合最多 3 次）', '点击骰子 / 数字键 1–5：锁定', '点击格子 / A–M：填分', 'R：重开 · P：暂停'],
  create: createYahtzeeGame,
}
