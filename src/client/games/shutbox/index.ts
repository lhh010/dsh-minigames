/**
 * 关箱 Shut the Box 游戏定义：把纯逻辑接成 {@link MiniGameInstance} ——
 * 空格/点击掷两骰，点击立着的数字选组合，子和恰等于骰面总和即整组翻下
 * （翻多枚得连击加分）；掷骰后无法凑出点和即本局终了，按剩余和计分；
 * 全部翻下即关箱满分。5 局一赛记总分，终局上报。R 重开、P 暂停。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  TOTAL_ROUNDS, allShut, comboBonus, enumerateMoves, flipTiles, initialUpTiles,
  mulberry32, remainingSum, rollPair, roundScore,
} from './logic.ts'
import { renderShutbox, rollButtonAt, tileAt, LOGICAL_W, LOGICAL_H, type ShutboxView } from './render.ts'
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

function createShutboxGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (initialFit === null) throw new Error('dsh-minigames: shutbox needs a 2d canvas context')
  const ctx = initialFit.ctx

  let up = initialUpTiles()
  let selected: number[] = []
  let dice: number[] | null = null
  let rolling = false
  let rollEndsAt = 0
  let phase: 'needRoll' | 'needMove' | 'roundOver' | 'ended' = 'needRoll'
  let roundNo = 1
  let comboPoints = 0
  let roundScores: number[] = []
  let roundShut = false
  let userPaused = false
  let running = false
  let toast = ''
  let toastMs = 0
  let lastScore = -1
  // 本局所有掷骰共用的种子流（重开换流，保证局内确定、局间不重）。
  let rng = mulberry32(nextSeed())
  const particles = createParticles()

  const total = (): number => roundScores.reduce((a, b) => a + b, 0)

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

  const settleRound = (): void => {
    roundShut = allShut(up)
    roundScores = [...roundScores, roundScore(up, comboPoints)]
    dice = null
    selected = []
    phase = 'roundOver'
    if (roundShut) {
      particles.burst(LOGICAL_W / 2, 200, accent(2), 20, 160)
      show('关箱！奖励 +' + String(50))
    }
    reportScore()
    loop.markDirty()
  }

  const roll = (): void => {
    if (phase !== 'needRoll' || userPaused || rolling) return
    const seed = Math.floor(rng() * 0x7fff_ffff)
    const pair = rollPair(seed)
    dice = [pair[0], pair[1]]
    rolling = true
    rollEndsAt = performance.now() + ROLL_MS
    phase = 'needMove'
    loop.markDirty()
  }

  const finishRoll = (): void => {
    rolling = false
    const target = (dice?.[0] ?? 0) + (dice?.[1] ?? 0)
    if (enumerateMoves(up, target).length === 0) {
      // 无法凑出点和：本局终了（关箱路径的提示由 settleRound 负责）。
      settleRound()
      if (!roundShut) show('剩余和 ' + String(remainingSum(up)) + ' · 本局终了')
    }
    loop.markDirty()
  }

  const nextRound = (): void => {
    if (roundNo >= TOTAL_ROUNDS) {
      phase = 'ended'
    } else {
      roundNo += 1
      up = initialUpTiles()
      selected = []
      dice = null
      comboPoints = 0
      roundShut = false
      phase = 'needRoll'
      rng = mulberry32(nextSeed())
    }
    loop.markDirty()
  }

  const clickTile = (n: number): void => {
    if (phase !== 'needMove' || userPaused || rolling) return
    if (up[n - 1] !== true) {
      show(String(n) + ' 已翻下')
      return
    }
    if (selected.includes(n)) {
      selected = selected.filter(s => s !== n)
      loop.markDirty()
      return
    }
    const target = (dice?.[0] ?? 0) + (dice?.[1] ?? 0)
    const sum = selected.reduce((a, b) => a + b, 0) + n
    if (sum > target) {
      show('超过点和 ' + String(target))
      return
    }
    if (sum < target) {
      selected = [...selected, n]
      loop.markDirty()
      return
    }
    // 恰好凑满：整组翻下并结算连击。
    const tiles = [...selected, n]
    up = flipTiles(up, tiles)
    selected = []
    const bonus = comboBonus(tiles)
    if (bonus > 0) {
      comboPoints += bonus
      show('连击 +' + String(bonus))
      particles.burst(LOGICAL_W / 2, 200, accent(4), Math.min(20, 6 + tiles.length * 3), 150)
    }
    if (allShut(up)) {
      settleRound()
    } else {
      phase = 'needRoll'
    }
    loop.markDirty()
  }

  const restart = (): void => {
    up = initialUpTiles()
    selected = []
    dice = null
    rolling = false
    phase = 'needRoll'
    roundNo = 1
    comboPoints = 0
    roundScores = []
    roundShut = false
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
      if (phase === 'ended') restart()
      else if (phase === 'roundOver') nextRound()
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
      if (phase !== 'ended') {
        userPaused = !userPaused
        loop.markDirty()
      }
      return
    }
    if (!running || userPaused) return
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault()
      clickTile(Number(event.key))
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    if (phase === 'ended') {
      restart()
      return
    }
    if (userPaused) return
    if (phase === 'roundOver') {
      nextRound()
      return
    }
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    if (rollButtonAt(x, y)) {
      roll()
      return
    }
    const n = tileAt(x, y)
    if (n !== null) clickTile(n)
  }

  const view = (): ShutboxView => ({
    up, selected, dice, rolling, phase, roundNo, comboPoints, roundScores,
    total: total(), roundShut, toast, userPaused, paused: !running,
  })

  // 脏标记渲染：静态盘面只在状态或动效变化时重绘（见 frame-scheduler）。
  const loop = createFrameLoop(f => {
    const dtMs = f.dt * 1000
    toastMs = Math.max(0, toastMs - dtMs)
    if (toastMs === 0) toast = ''
    if (rolling && performance.now() >= rollEndsAt) {
      finishRoll()
    }
    const animating = rolling || toastMs > 0 || particles.size() > 0
    if (f.render || animating) {
      renderShutbox(ctx, view(), performance.now())
      particles.tick(ctx, dtMs)
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    running = false
    loop.pause()
    renderShutbox(ctx, view(), performance.now())
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
  renderShutbox(ctx, view(), performance.now())

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

export const shutboxGame: MiniGameDefinition = {
  id: 'shutbox',
  title: '关箱 Shut the Box',
  icon: '🧮',
  description: '掷两骰翻数字板凑和——把 1 到 9 全部翻下就是关箱大胜。',
  controls: ['空格 / 点击按钮：掷两骰', '点击数字 / 数字键 1–9：选组合（凑满点和即翻下）', '空格：下一局', 'R：重开 · P：暂停'],
  create: createShutboxGame,
}
